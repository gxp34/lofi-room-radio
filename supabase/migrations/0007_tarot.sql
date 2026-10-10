-- ============================================================================
-- Lo-fi 房间电台 · 0007 塔罗牌
-- ----------------------------------------------------------------------------
-- 往 games 表加一盘新卡带。牌面和牌义都在代码里（src/lib/tarot.ts 与
-- src/components/games/tarot-cards.tsx），数据库这边只需要一行记录 ——
-- 这样后台能用「启用/停用」控制它出不出现，和其它三个游戏一致。
--
-- 可重复执行：用 on conflict (slug) do update，重跑会把名称和描述改回这里写的值。
-- 用 do update 而不是 do nothing，是因为描述里那句「别连抽三次」属于产品文案，
-- 改了以后希望重跑迁移就能生效。
-- ============================================================================

insert into public.games (slug, name, description, enabled, config, sort)
values (
  'tarot',
  '塔罗',
  '大阿卡纳 22 张。想好问题再抽，别连抽三次。',
  true,
  '{"deck":"major","allowReverse":true,"reverseRate":3}'::jsonb,
  40
)
on conflict (slug) do update
  set name        = excluded.name,
      description = excluded.description,
      config      = excluded.config,
      sort        = excluded.sort;
      -- 注意：这里**不动 enabled** —— 你在后台手动关掉它之后，
      -- 重跑迁移不该又把它打开。
