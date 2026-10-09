-- ============================================================================
-- Lo-fi 房间电台 · 0001 Schema（表结构 / 索引 / 触发器 / 工具函数）
-- ----------------------------------------------------------------------------
-- 执行位置：Supabase 控制台 → SQL Editor → 新建查询 → 粘贴 → Run
-- 执行顺序：0001_schema.sql → 0002_rls.sql → 0003_storage.sql → 0004_seed.sql
-- 本脚本可重复执行（幂等），不会删除任何已有数据。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. 扩展
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto; -- 提供 gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 0.1 关掉「创建函数时校验函数体」
-- ---------------------------------------------------------------------------
-- 为什么必须关：
--   下面 is_admin() 是 LANGUAGE sql 的函数，函数体里要查 public.profiles，
--   而 profiles 表在**本文件后面**才创建。
--   Postgres 默认 check_function_bodies = on，会在 CREATE FUNCTION 的那一刻
--   就去解析 sql 函数体，表还不存在 → 直接报
--     ERROR: 42P01: relation "public.profiles" does not exist
--   关掉之后函数照常建好，等第一次真正调用（0002 里建 RLS 策略时）再解析，
--   那时候表已经在了。
--
--   注：LANGUAGE plpgsql 的函数本来就不做这个校验，所以只有 sql 函数受影响。
--   这个设置只作用于当前会话（SQL Editor 每次 Run 是一个新会话）。
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. 通用工具函数
-- ---------------------------------------------------------------------------

-- 判断「当前登录用户是不是站长」
-- 用 security definer 是为了绕开 profiles 自身的 RLS，否则策略里查 profiles 会无限递归
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

comment on function public.is_admin() is '当前会话是否为站长（profiles.role = admin）';

-- 自动维护 updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 新用户注册时自动建 profile（角色默认 visitor，站长稍后手动提权）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(coalesce(new.email, '访客'), '@', 1)
    ),
    'visitor'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. 表结构
-- ---------------------------------------------------------------------------

-- 2.1 站长 / 用户档案 -------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'visitor' check (role in ('admin', 'visitor')),
  created_at   timestamptz not null default now()
);

comment on table public.profiles is '用户档案；只有 role = admin 的账号能进后台';

-- 2.2 音乐（唱片架） --------------------------------------------------------
create table if not exists public.tracks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  artist      text check (char_length(artist) <= 120),
  cover_path  text,                                        -- covers 桶内的对象路径
  audio_path  text not null,                               -- public-music / private-music 桶内路径
  duration    integer check (duration is null or duration >= 0), -- 秒
  tags        text[] not null default '{}',                -- 深夜 / 雨 / 通勤 / 开心 / 难过 / 随便听听
  note        text,                                        -- 深夜笔记
  visibility  text not null default 'private' check (visibility in ('public', 'private')),
  sort        integer not null default 0,
  play_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.tracks is '唱片架；visibility = public 的访客可听，private 只有站长能听（signed URL）';

-- 2.3 日记（书桌手记） ------------------------------------------------------
create table if not exists public.diaries (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(title) between 1 and 120),
  content      text not null,
  mood         text,                                       -- 心情
  weather      text,                                       -- 天气
  tags         text[] not null default '{}',
  cover_path   text,                                       -- diary-images 桶内路径
  visibility   text not null default 'draft' check (visibility in ('draft', 'public', 'private')),
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.diaries is '日记；draft 草稿 / public 公开 / private 仅站长可见';

-- 2.4 树洞（深夜抽屉） ------------------------------------------------------
create table if not exists public.treehole_messages (
  id           uuid primary key default gen_random_uuid(),
  nickname     text not null default '匿名' check (char_length(nickname) between 1 and 24),
  content      text not null check (char_length(content) between 1 and 2000),
  mood         text,
  -- public：审核通过后上「树洞墙」；admin：只有站长看得到；private：私密保存，永不上墙
  visibility   text not null default 'admin' check (visibility in ('public', 'admin', 'private')),
  is_approved  boolean not null default false,   -- 站长审核通过
  is_hidden    boolean not null default false,   -- 站长手动隐藏
  is_flagged   boolean not null default false,   -- 命中敏感词或被多人举报
  report_count integer not null default 0,
  ip_hash      text,                             -- 访客 IP 的哈希，仅用于限流，不存明文
  created_at   timestamptz not null default now()
);

comment on table public.treehole_messages is '树洞投稿；匿名可写，站长审核后才公开';
comment on column public.treehole_messages.ip_hash is 'SHA-256(盐 + IP)，无法反推真实 IP';

-- 2.5 树洞回复 --------------------------------------------------------------
create table if not exists public.treehole_replies (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.treehole_messages (id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 1000),
  is_admin   boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2.6 小游戏 -----------------------------------------------------------------
create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  enabled     boolean not null default true,
  config      jsonb not null default '{}'::jsonb,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 2.7 游戏分数 ---------------------------------------------------------------
create table if not exists public.game_scores (
  id          uuid primary key default gen_random_uuid(),
  game_slug   text not null,
  player_name text not null default '匿名' check (char_length(player_name) between 1 and 16),
  score       integer not null check (score >= 0 and score <= 100000000),
  session_id  text,
  created_at  timestamptz not null default now()
);

-- 2.8 房间事件池 -------------------------------------------------------------
create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  object_type      text not null,          -- lamp / cat / record / window / door ...（见 ROOM_OBJECTS）
  event_key        text not null,          -- 事件唯一键，如 lamp.first_on
  text             text not null,          -- 显示给访客的文案
  action           text,                   -- 副作用标识：toggle_lamp / next_track / open_drawer ...
  trigger          text not null default 'click'
                   check (trigger in ('click', 'dblclick', 'longpress', 'combo', 'night', 'first', 'random', 'global')),
  rarity           text not null default 'common' check (rarity in ('common', 'rare', 'hidden')),
  weight           integer not null default 1 check (weight >= 0),
  cooldown_seconds integer not null default 0 check (cooldown_seconds >= 0),
  once             boolean not null default false,   -- 一辈子只触发一次
  conditions       jsonb not null default '{}'::jsonb,
  deep_night_only  boolean not null default false,   -- 仅 0:00–5:00
  consecutive_days integer,                          -- 需要连续访问天数（如猫的小钥匙 = 3）
  enabled          boolean not null default true,
  sort             integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.events.conditions is
  '条件对象，例：{"combo":3} / {"visited_days":1} / {"hour_range":[0,5]} / {"requires_lamp_on":true}';

-- 2.9 成就 -------------------------------------------------------------------
create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text,
  icon        text,                                 -- lucide 图标名
  secret      boolean not null default false,       -- 隐藏成就，未解锁不显示
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);

-- 2.10 用户成就 --------------------------------------------------------------
create table if not exists public.user_achievements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  achievement_key text not null references public.achievements (key) on delete cascade,
  unlocked_at     timestamptz not null default now(),
  unique (user_id, achievement_key)
);

-- 2.11 站点设置 --------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.site_settings is '站点设置；对访客公开可读，因此不要在这里放任何密钥';

-- 2.12 媒体库 ----------------------------------------------------------------
create table if not exists public.media (
  id          uuid primary key default gen_random_uuid(),
  bucket      text not null,
  path        text not null,
  type        text,                                 -- mime type
  size        bigint check (size is null or size >= 0),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (bucket, path)
);

-- 2.13 事件日志（含访问统计） ------------------------------------------------
create table if not exists public.event_logs (
  id         bigint generated always as identity primary key,
  session_id text not null check (char_length(session_id) between 1 and 64),
  event_key  text not null check (char_length(event_key) between 1 and 64),
  object_type text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.event_logs is '事件与访问日志；event_key = page_view 时用于统计访问量';

-- ---------------------------------------------------------------------------
-- 3. 索引
-- ---------------------------------------------------------------------------
create index if not exists tracks_visibility_sort_idx   on public.tracks (visibility, sort, created_at desc);
create index if not exists tracks_tags_idx              on public.tracks using gin (tags);

create index if not exists diaries_visibility_time_idx  on public.diaries (visibility, published_at desc nulls last, created_at desc);
create index if not exists diaries_tags_idx             on public.diaries using gin (tags);

create index if not exists treehole_wall_idx            on public.treehole_messages (is_approved, is_hidden, created_at desc);
create index if not exists treehole_rate_idx            on public.treehole_messages (ip_hash, created_at desc);
create index if not exists treehole_replies_msg_idx     on public.treehole_replies (message_id, created_at);

create index if not exists game_scores_rank_idx         on public.game_scores (game_slug, score desc, created_at desc);

create index if not exists events_lookup_idx            on public.events (object_type, trigger, enabled);
create index if not exists events_key_idx               on public.events (event_key);
-- event_key 必须全局唯一：后台「导入内置事件池」和手动新建都靠它去重，
-- 没有这个约束的话，点两次导入就会在事件池里留下两份一模一样的文案。
create unique index if not exists events_key_unique_idx on public.events (event_key);

create index if not exists event_logs_time_idx          on public.event_logs (created_at desc);
create index if not exists event_logs_session_idx       on public.event_logs (session_id, created_at desc);
create index if not exists event_logs_key_idx           on public.event_logs (event_key, created_at desc);

create index if not exists media_bucket_idx             on public.media (bucket, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. updated_at 触发器
-- ---------------------------------------------------------------------------
drop trigger if exists trg_tracks_updated_at on public.tracks;
create trigger trg_tracks_updated_at
  before update on public.tracks
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_diaries_updated_at on public.diaries;
create trigger trg_diaries_updated_at
  before update on public.diaries
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_site_settings_updated_at on public.site_settings;
create trigger trg_site_settings_updated_at
  before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- 日记发布时间：从草稿切成公开时自动补 published_at
create or replace function public.fill_published_at()
returns trigger
language plpgsql
as $$
begin
  if new.visibility = 'public' and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_diaries_published_at on public.diaries;
create trigger trg_diaries_published_at
  before insert or update on public.diaries
  for each row execute function public.fill_published_at();

-- 新用户 → 自动建 profile
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. 业务函数
-- ---------------------------------------------------------------------------

-- 5.1 树洞限流：同一个人 10 分钟内最多 5 条、24 小时最多 20 条
create or replace function public.enforce_treehole_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent integer;
  v_today  integer;
begin
  if new.ip_hash is null then
    return new; -- 服务端没算出 IP 哈希时不拦（例如站长在后台手动补录）
  end if;

  select count(*) into v_recent
    from public.treehole_messages
   where ip_hash = new.ip_hash
     and created_at > now() - interval '10 minutes';

  if v_recent >= 5 then
    raise exception 'TOO_FAST' using errcode = 'P0001';
  end if;

  select count(*) into v_today
    from public.treehole_messages
   where ip_hash = new.ip_hash
     and created_at > now() - interval '24 hours';

  if v_today >= 20 then
    raise exception 'DAILY_LIMIT' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_treehole_rate_limit on public.treehole_messages;
create trigger trg_treehole_rate_limit
  before insert on public.treehole_messages
  for each row execute function public.enforce_treehole_rate_limit();

-- 5.2 举报：任何人可调用，累计 3 次自动标记待审
create or replace function public.report_treehole_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.treehole_messages
     set report_count = report_count + 1,
         is_flagged   = (report_count + 1) >= 3
   where id = p_id
     and is_approved = true
     and is_hidden = false;

  if not found then
    raise exception 'MESSAGE_NOT_REPORTABLE';
  end if;
end;
$$;

-- 5.3 播放计数：只对公开歌曲或站长生效
create or replace function public.increment_play_count(p_track_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tracks
     set play_count = play_count + 1
   where id = p_track_id
     and (visibility = 'public' or public.is_admin());
end;
$$;

-- 5.4 访问打点：一次页面浏览记一条日志（匿名可调用）
create or replace function public.log_visit(p_session_id text, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_id is null or char_length(p_session_id) not between 1 and 64 then
    return;
  end if;

  insert into public.event_logs (session_id, event_key, meta)
  values (p_session_id, 'page_view', jsonb_build_object('path', left(coalesce(p_path, '/'), 200)));
end;
$$;

grant execute on function public.report_treehole_message(uuid) to anon, authenticated;
grant execute on function public.increment_play_count(uuid)    to anon, authenticated;
grant execute on function public.log_visit(text, text)         to anon, authenticated;
