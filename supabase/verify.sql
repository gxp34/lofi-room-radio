-- ============================================================================
-- Lo-fi 房间电台 · 数据库验收
-- ----------------------------------------------------------------------------
-- 用途：六个迁移文件跑完之后，执行这个脚本一次性核对结果。
--
-- 特点：
--   · **只读** —— 全是 select，不改任何数据，随便跑多少遍。
--   · **只输出一个结果表** —— 全部 union all 成一张表，
--     Supabase 的结果面板里一屏就能看完（多写几个 select 只会显示最后一个）。
--
-- 怎么看结果：
--   最后一列「期望」写成什么样就该是什么样。对不上就是有问题。
-- ============================================================================

with
-- 期望存在的表（0001 建 13 张 + 0006 建 1 张）
expected_tables(name) as (
  values ('profiles'), ('tracks'), ('diaries'), ('treehole_messages'),
         ('treehole_replies'), ('games'), ('game_scores'), ('events'),
         ('achievements'), ('user_achievements'), ('site_settings'),
         ('media'), ('event_logs'), ('journal_photos')
),
-- 期望存在的桶（0003 建 4 个 + 0006 建 2 个）
expected_buckets(id, public) as (
  values ('public-music', true), ('private-music', false),
         ('covers', true), ('diary-images', false),
         ('journal-photos', true), ('private-journal-photos', false)
),
-- 期望存在且开了 RLS 的表（0002 负责 13 张）
expected_rls(name) as (
  values ('profiles'), ('tracks'), ('diaries'), ('treehole_messages'),
         ('treehole_replies'), ('games'), ('game_scores'), ('events'),
         ('achievements'), ('user_achievements'), ('site_settings'),
         ('media'), ('event_logs')
),
-- 期望存在的函数（0001 / 0005 / 0006）
expected_functions(name) as (
  values ('is_admin'), ('touch_updated_at'), ('handle_new_user'),
         ('fill_published_at'), ('enforce_treehole_rate_limit'),
         ('report_treehole_message'), ('increment_play_count'), ('log_visit'),
         ('admin_overview'), ('admin_export'),
         ('journal_check_password'), ('journal_set_password'),
         ('journal_locked_entries')
)

-- ---------------------------------------------------------------- 表
select
  '表' as 类别,
  e.name as 项目,
  case when t.oid is null then '✗ 不存在' else '✓' end as 结果,
  '存在' as 期望
from expected_tables e
left join pg_class t
  on t.relname = e.name
 and t.relnamespace = 'public'::regnamespace
 and t.relkind = 'r'

union all

-- ---------------------------------------------------------------- 行级安全
select
  '行级安全' as 类别,
  e.name || ' 的 RLS' as 项目,
  case
    when c.oid is null then '✗ 表不存在'
    when c.relrowsecurity then '✓ 已开启'
    else '✗ 未开启（0002 没跑成功）'
  end as 结果,
  '已开启' as 期望
from expected_rls e
left join pg_class c
  on c.relname = e.name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind = 'r'

union all

-- ---------------------------------------------------------------- 策略总数
select
  '策略' as 类别,
  'public 与 storage 上的策略总数' as 项目,
  (select count(*)::text from pg_policies
    where schemaname in ('public', 'storage')) as 结果,
  '≥ 48（0002 的 30 + 0003 的 10 + 0006 的 8）' as 期望

union all

-- ---------------------------------------------------------------- 存储桶
select
  '存储桶' as 类别,
  e.id as 项目,
  case
    when b.id is null then '✗ 不存在'
    when b.public = e.public then '✓ 公开=' || b.public::text
    else '✗ 公开属性不对（实际 ' || b.public::text || '）'
  end as 结果,
  '存在，公开=' || e.public::text as 期望
from expected_buckets e
left join storage.buckets b on b.id = e.id

union all

-- ---------------------------------------------------------------- 桶的大小限制
select
  '存储桶限制' as 类别,
  b.id || ' 的大小上限' as 项目,
  round(b.file_size_limit / 1024.0 / 1024.0)::text || ' MB' as 结果,
  case when b.id like '%journal%' then '10 MB' else '25 MB（音频）/ 5 MB（图片）' end as 期望
from storage.buckets b
where b.id in (select id from expected_buckets)

union all

-- ---------------------------------------------------------------- 函数
select
  '函数' as 类别,
  e.name || '()' as 项目,
  case when p.oid is null then '✗ 不存在' else '✓' end as 结果,
  '存在' as 期望
from expected_functions e
left join pg_proc p
  on p.proname = e.name
 and p.pronamespace = 'public'::regnamespace
 and p.prokind = 'f'

union all

-- ---------------------------------------------------------------- 种子数据
select '种子数据' as 类别, '小游戏' as 项目,
       (select count(*)::text from public.games) as 结果, '3' as 期望

union all
select '种子数据', '成就',
       (select count(*)::text from public.achievements), '10'

union all
select '种子数据', '站点设置项',
       (select count(*)::text from public.site_settings), '≥ 15'

union all
-- 热线功能已整个移除，这两条都应该是 0 / 无
select '已移除的功能', '占位的 treehole_hotlines 设置',
       (select count(*)::text from public.site_settings where key = 'treehole_hotlines'), '0'

union all
select '已移除的功能', '说明文案里残留的「热线」字样',
       (select count(*)::text from public.site_settings
         where key = 'treehole_notice' and value::text like '%热线%'), '0'
