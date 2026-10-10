-- ============================================================================
-- Lo-fi 房间电台 · 0011 第二批小游戏（钓鱼 / 电子猫）
-- ----------------------------------------------------------------------------
-- 和 0010 一样的结构：两盘卡带 + 两个成就。
--
-- 可重复执行：games 用 on conflict (slug) do update（但不动 enabled），
-- achievements 用 on conflict (key) do nothing。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 新卡带
-- ---------------------------------------------------------------------------
insert into public.games (slug, name, description, enabled, config, sort)
values
  (
    'fishing',
    '钓鱼',
    '雨夜的池塘边。抛竿，等鱼影，咬钩的时候提竿。',
    true,
    '{"species":6,"weatherAffects":true}'::jsonb,
    70
  ),
  (
    'virtual-cat',
    '电子猫',
    '掌机里养一只。会饿，会不高兴，也会长大。',
    true,
    '{"decayPerHour":{"fullness":4,"mood":3},"maxLevel":10}'::jsonb,
    80
  )
on conflict (slug) do update
  set name        = excluded.name,
      description = excluded.description,
      config      = excluded.config,
      sort        = excluded.sort;
      -- 仍然不动 enabled

-- ---------------------------------------------------------------------------
-- 2. 新成就
-- ---------------------------------------------------------------------------
insert into public.achievements (key, name, description, icon, secret, sort)
values
  (
    'rare_catch',
    '钓到了星光',
    '在池塘里钓上那条只在凌晨出现的鱼。',
    'Fish',
    true,
    130
  ),
  (
    'cat_bond',
    '它认你了',
    '把电子猫的亲密度养满。',
    'Heart',
    false,
    140
  )
on conflict (key) do nothing;
