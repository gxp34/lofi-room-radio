-- ============================================================================
-- Lo-fi 房间电台 · 0002 RLS（行级安全策略）
-- ----------------------------------------------------------------------------
-- 设计原则：
--   1. 访客（anon）：只能读「公开」内容、只能写树洞投稿、只能记访问日志。
--   2. 站长（profiles.role = 'admin'）：所有表全权。
--   3. 默认拒绝：没写策略的操作一律禁止。
--   4. 私密音频不靠 RLS，靠 Storage 的 signed URL（见 0003）。
-- 可重复执行。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. 打开行级安全 + 基础权限
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.tracks              enable row level security;
alter table public.diaries             enable row level security;
alter table public.treehole_messages   enable row level security;
alter table public.treehole_replies    enable row level security;
alter table public.games               enable row level security;
alter table public.game_scores         enable row level security;
alter table public.events              enable row level security;
alter table public.achievements        enable row level security;
alter table public.user_achievements   enable row level security;
alter table public.site_settings       enable row level security;
alter table public.media               enable row level security;
alter table public.event_logs          enable row level security;

grant usage on schema public to anon, authenticated;

-- 读权限按表授予（写权限全部交给 RLS 策略把关）
grant select on public.tracks            to anon, authenticated;
grant select on public.diaries           to anon, authenticated;
grant select on public.treehole_messages to anon, authenticated;
grant select on public.treehole_replies  to anon, authenticated;
grant select on public.games             to anon, authenticated;
grant select on public.game_scores       to anon, authenticated;
grant select on public.events            to anon, authenticated;
grant select on public.achievements      to anon, authenticated;
grant select on public.site_settings     to anon, authenticated;

grant insert on public.treehole_messages to anon, authenticated;
grant insert on public.event_logs        to anon, authenticated;
grant insert on public.game_scores       to anon, authenticated;

grant select, insert, update, delete on public.tracks            to authenticated;
grant select, insert, update, delete on public.diaries           to authenticated;
grant select, insert, update, delete on public.treehole_messages to authenticated;
grant select, insert, update, delete on public.treehole_replies  to authenticated;
grant select, insert, update, delete on public.games             to authenticated;
grant select, insert, update, delete on public.game_scores       to authenticated;
grant select, insert, update, delete on public.events            to authenticated;
grant select, insert, update, delete on public.achievements      to authenticated;
grant select, insert, update, delete on public.user_achievements to authenticated;
grant select, insert, update, delete on public.site_settings     to authenticated;
grant select, insert, update, delete on public.media             to authenticated;
grant select, insert, update, delete on public.event_logs        to authenticated;
grant select, update                 on public.profiles          to authenticated;

-- ---------------------------------------------------------------------------
-- 1. profiles —— 只能看自己；写入只有站长
-- ---------------------------------------------------------------------------
drop policy if exists "profiles: 读自己" on public.profiles;
create policy "profiles: 读自己"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles: 站长全权写" on public.profiles;
create policy "profiles: 站长全权写"
  on public.profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. tracks —— 公开歌曲人人可听，私密歌曲只有站长
-- ---------------------------------------------------------------------------
drop policy if exists "tracks: 读公开或站长" on public.tracks;
create policy "tracks: 读公开或站长"
  on public.tracks for select
  to anon, authenticated
  using (visibility = 'public' or public.is_admin());

drop policy if exists "tracks: 站长全权写" on public.tracks;
create policy "tracks: 站长全权写"
  on public.tracks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. diaries —— 只有已公开的日记能被读
-- ---------------------------------------------------------------------------
drop policy if exists "diaries: 读公开或站长" on public.diaries;
create policy "diaries: 读公开或站长"
  on public.diaries for select
  to anon, authenticated
  using (visibility = 'public' or public.is_admin());

drop policy if exists "diaries: 站长全权写" on public.diaries;
create policy "diaries: 站长全权写"
  on public.diaries for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. treehole_messages —— 匿名可投，但必须「未审核 + 未隐藏」，防刷字段由服务端写
-- ---------------------------------------------------------------------------
drop policy if exists "treehole: 匿名可投递" on public.treehole_messages;
create policy "treehole: 匿名可投递"
  on public.treehole_messages for insert
  to anon, authenticated
  with check (
    char_length(content) between 1 and 2000
    and char_length(nickname) between 1 and 24
    and visibility in ('public', 'admin', 'private')
    and is_approved = false      -- 访客无法自己给自己盖章通过
    and is_hidden = false
    and report_count = 0
  );

drop policy if exists "treehole: 读上墙内容或站长" on public.treehole_messages;
create policy "treehole: 读上墙内容或站长"
  on public.treehole_messages for select
  to anon, authenticated
  using (
    public.is_admin()
    or (visibility = 'public' and is_approved = true and is_hidden = false and is_flagged = false)
  );

drop policy if exists "treehole: 站长全权写" on public.treehole_messages;
create policy "treehole: 站长全权写"
  on public.treehole_messages for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "treehole: 站长可删" on public.treehole_messages;
create policy "treehole: 站长可删"
  on public.treehole_messages for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. treehole_replies —— 公开留言的回音人人可见，写只有站长
-- ---------------------------------------------------------------------------
drop policy if exists "treehole_replies: 读公开留言的回音" on public.treehole_replies;
create policy "treehole_replies: 读公开留言的回音"
  on public.treehole_replies for select
  to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.treehole_messages m
      where m.id = treehole_replies.message_id
        and m.visibility = 'public'
        and m.is_approved = true
        and m.is_hidden = false
    )
  );

drop policy if exists "treehole_replies: 站长全权写" on public.treehole_replies;
create policy "treehole_replies: 站长全权写"
  on public.treehole_replies for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. games —— 关掉的游戏对访客隐身
-- ---------------------------------------------------------------------------
drop policy if exists "games: 读已开启或站长" on public.games;
create policy "games: 读已开启或站长"
  on public.games for select
  to anon, authenticated
  using (enabled = true or public.is_admin());

drop policy if exists "games: 站长全权写" on public.games;
create policy "games: 站长全权写"
  on public.games for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. game_scores —— 排行榜公开可读，任何人可提交自己的分数
-- ---------------------------------------------------------------------------
drop policy if exists "game_scores: 公开读" on public.game_scores;
create policy "game_scores: 公开读"
  on public.game_scores for select
  to anon, authenticated
  using (true);

drop policy if exists "game_scores: 任何人可提交" on public.game_scores;
create policy "game_scores: 任何人可提交"
  on public.game_scores for insert
  to anon, authenticated
  with check (
    score between 0 and 100000000
    and char_length(player_name) between 1 and 16
    and char_length(game_slug) between 1 and 32
  );

drop policy if exists "game_scores: 站长可删" on public.game_scores;
create policy "game_scores: 站长可删"
  on public.game_scores for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. events —— 前台要读事件池；改动只有站长
-- ---------------------------------------------------------------------------
drop policy if exists "events: 读已启用或站长" on public.events;
create policy "events: 读已启用或站长"
  on public.events for select
  to anon, authenticated
  using (enabled = true or public.is_admin());

drop policy if exists "events: 站长全权写" on public.events;
create policy "events: 站长全权写"
  on public.events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 9. achievements —— 成就定义对所有人可见（隐藏成就靠前端不展示描述）
-- ---------------------------------------------------------------------------
drop policy if exists "achievements: 公开读" on public.achievements;
create policy "achievements: 公开读"
  on public.achievements for select
  to anon, authenticated
  using (true);

drop policy if exists "achievements: 站长全权写" on public.achievements;
create policy "achievements: 站长全权写"
  on public.achievements for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 10. user_achievements —— 登录后把 localStorage 里的成就同步上来
-- ---------------------------------------------------------------------------
drop policy if exists "user_achievements: 读自己的或站长" on public.user_achievements;
create policy "user_achievements: 读自己的或站长"
  on public.user_achievements for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_achievements: 写自己的" on public.user_achievements;
create policy "user_achievements: 写自己的"
  on public.user_achievements for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_achievements: 站长可删" on public.user_achievements;
create policy "user_achievements: 站长可删"
  on public.user_achievements for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 11. site_settings —— 全站可读（前台要拿房间名、社交链接等）
--     再次强调：这里绝不放密钥，密钥一律走环境变量
-- ---------------------------------------------------------------------------
drop policy if exists "site_settings: 公开读" on public.site_settings;
create policy "site_settings: 公开读"
  on public.site_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "site_settings: 站长全权写" on public.site_settings;
create policy "site_settings: 站长全权写"
  on public.site_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 12. media —— 媒体库只有站长可见（文件本身的公开性由 Storage 决定）
-- ---------------------------------------------------------------------------
drop policy if exists "media: 站长全权" on public.media;
create policy "media: 站长全权"
  on public.media for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 13. event_logs —— 匿名可打点（只允许写，不允许读）；站长可读可删
-- ---------------------------------------------------------------------------
drop policy if exists "event_logs: 匿名可打点" on public.event_logs;
create policy "event_logs: 匿名可打点"
  on public.event_logs for insert
  to anon, authenticated
  with check (
    char_length(session_id) between 1 and 64
    and char_length(event_key) between 1 and 64
    and pg_column_size(meta) < 2048
  );

drop policy if exists "event_logs: 站长可读" on public.event_logs;
create policy "event_logs: 站长可读"
  on public.event_logs for select
  to authenticated
  using (public.is_admin());

drop policy if exists "event_logs: 站长可删" on public.event_logs;
create policy "event_logs: 站长可删"
  on public.event_logs for delete
  to authenticated
  using (public.is_admin());
