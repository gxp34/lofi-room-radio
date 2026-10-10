-- ============================================================================
-- Lo-fi 房间电台 · 0012 外部数据源（天气 / 每日一句）
-- ----------------------------------------------------------------------------
-- 只做一件事：往 site_settings 里补上这几个开关和参数。
--
-- 为什么不用新表：
--   这些都是「一行一个值」的站点配置，site_settings 本来就是干这个的，
--   后台「站点设置」页也是按 key 读写的。再加一张表反而要改后台的读写逻辑。
--
-- 运行时的缓存（weather_cache / daily_quote）**不在这里**：
--   它们由 lib/external/cache.ts 在跑的时候自己 upsert，
--   所以这里不预先建行（建了反而会让第一次请求以为"缓存命中但值是空的"）。
--
-- 可重复执行：on conflict do nothing —— 你在后台改过的值不会被重跑覆盖。
-- ============================================================================

insert into public.site_settings (key, value)
values
  -- 天气：默认开。关掉之后房间固定是雨夜，且不发任何外部请求
  ('weather_enabled', 'true'::jsonb),
  -- 城市只用于显示
  ('weather_city', '""'::jsonb),
  -- 经纬度留空 → 用环境变量 WEATHER_LAT / WEATHER_LON 的兜底值
  ('weather_lat', 'null'::jsonb),
  ('weather_lon', 'null'::jsonb),
  -- 每日一句：默认开
  ('daily_quote_enabled', 'true'::jsonb),
  -- 手动覆盖：留空 = 自动抓
  ('daily_quote_override', '""'::jsonb)
on conflict (key) do nothing;
