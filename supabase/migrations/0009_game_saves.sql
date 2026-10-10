-- ============================================================================
-- Lo-fi 房间电台 · 0009 游戏存档
-- ----------------------------------------------------------------------------
-- 小游戏的进度存在两个地方：
--   1. localStorage —— 没登录也能玩，刷新不丢（前端 src/lib/games/save.ts）
--   2. 这张表 —— 登录之后同步上来，换设备能接着玩
--
-- 为什么用一张表 + state_json 而不是给每个游戏建表：
--   每个游戏的存档形状差别很大（拼图是每个难度的最佳记录、钓鱼是图鉴、
--   电子猫是一堆随时间衰减的数值），一个游戏一张表的话，加游戏就要加表和迁移。
--   用 jsonb 存一个不透明的状态，加游戏只需要加一个 slug。
--   代价是数据库看不懂存档内容 —— 这里能接受，因为存档本来就只有游戏自己读。
--
-- 可重复执行。
-- ============================================================================

create table if not exists public.game_saves (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  game_slug  text not null check (char_length(game_slug) between 1 and 40),
  state_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- 一个用户一个游戏只有一行，前端才能直接 upsert
  unique (user_id, game_slug)
);

comment on table public.game_saves is
  '小游戏存档。state_json 是不透明状态，只有游戏自己解析；一个用户一个游戏一行。';

create index if not exists game_saves_user_idx on public.game_saves (user_id);

-- updated_at 自动维护（复用 0001 里的触发器函数）
drop trigger if exists trg_game_saves_updated_at on public.game_saves;
create trigger trg_game_saves_updated_at
  before update on public.game_saves
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 权限 + RLS
-- ---------------------------------------------------------------------------
alter table public.game_saves enable row level security;

grant select, insert, update, delete on public.game_saves to authenticated;

do $$
declare
  p record;
begin
  for p in
    select * from (values
      -- 用户：只能读写自己的
      ('游戏存档: 本人可读',
       $ddl$create policy "游戏存档: 本人可读" on public.game_saves
             for select to authenticated
             using (user_id = auth.uid())$ddl$),
      ('游戏存档: 本人可写',
       $ddl$create policy "游戏存档: 本人可写" on public.game_saves
             for insert to authenticated
             with check (user_id = auth.uid())$ddl$),
      ('游戏存档: 本人可改',
       $ddl$create policy "游戏存档: 本人可改" on public.game_saves
             for update to authenticated
             using (user_id = auth.uid())
             with check (user_id = auth.uid())$ddl$),
      ('游戏存档: 本人可删',
       $ddl$create policy "游戏存档: 本人可删" on public.game_saves
             for delete to authenticated
             using (user_id = auth.uid())$ddl$),
      -- 站长：全部（后台统计、排查问题要用）
      ('游戏存档: 站长全权',
       $ddl$create policy "游戏存档: 站长全权" on public.game_saves
             for all to authenticated
             using (public.is_admin())
             with check (public.is_admin())$ddl$)
    ) as t(name, ddl)
  loop
    begin
      execute format('drop policy if exists %I on public.game_saves', p.name);
    exception when others then
      raise notice '跳过删除旧策略（可能无权限，忽略）：%', p.name;
    end;

    begin
      execute p.ddl;
    exception when duplicate_object then
      raise notice '策略已存在，跳过：%', p.name;
    end;
  end loop;
end $$;
