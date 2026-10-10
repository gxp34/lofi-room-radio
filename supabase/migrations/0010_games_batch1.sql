-- ============================================================================
-- Lo-fi 房间电台 · 0010 第一批小游戏（照片拼图 / 调频）
-- ----------------------------------------------------------------------------
-- 两件事：
--   1. 往 games 表加两盘新卡带
--   2. 加两个成就（拼图完成 / 找到隐藏频道）
--
-- 可重复执行：games 用 on conflict (slug) do update（但不动 enabled），
-- achievements 用 on conflict (key) do nothing（不动你已经改过的文案）。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 新卡带
-- ---------------------------------------------------------------------------
insert into public.games (slug, name, description, enabled, config, sort)
values
  (
    'puzzle',
    '照片拼图',
    '把一张手帐照片拼回去。拼完能看见它背后的那句话。',
    true,
    '{"sizes":[4,5,8],"source":"journal"}'::jsonb,
    50
  ),
  (
    'radio',
    '调频',
    '80 到 108 之间，噪音里找信号。有些台只在深夜才有。',
    true,
    '{"min":80,"max":108,"step":0.1}'::jsonb,
    60
  )
on conflict (slug) do update
  set name        = excluded.name,
      description = excluded.description,
      config      = excluded.config,
      sort        = excluded.sort;
      -- 和 0007 一样：不动 enabled，免得你在后台关掉之后重跑迁移又给打开

-- ---------------------------------------------------------------------------
-- 2. 新成就
-- ---------------------------------------------------------------------------
insert into public.achievements (key, name, description, icon, secret, sort)
values
  (
    'photo_restored',
    '照片复原了',
    '把手帐里的一张照片拼回原样。',
    'Puzzle',
    false,
    110
  ),
  (
    'hidden_frequency',
    '107.9',
    '在调频里找到了那个不该存在的频道。',
    'Radio',
    true,
    120
  )
on conflict (key) do nothing;
