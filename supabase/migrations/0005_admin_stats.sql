-- ============================================================================
-- Lo-fi 房间电台 · 0005 后台统计
-- ----------------------------------------------------------------------------
-- 后台仪表盘要的十几个数字，如果在前端一条一条查，
-- 光是「去重会话数」就做不到（Supabase JS 没有 count distinct）。
-- 所以收敛成一个函数，一次请求拿全。
--
-- 安全：security invoker + 显式 is_admin() 检查。
--   invoker 意味着 RLS 照常生效，函数不会变成越权后门。
-- 可重复执行。
-- ============================================================================

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    -- 访问
    'visits_today',   (select count(*) from public.event_logs
                        where event_key = 'page_view' and created_at >= date_trunc('day', now())),
    'visits_7d',      (select count(*) from public.event_logs
                        where event_key = 'page_view' and created_at >= now() - interval '7 days'),
    'visits_total',   (select count(*) from public.event_logs where event_key = 'page_view'),
    'sessions_total', (select count(distinct session_id) from public.event_logs where event_key = 'page_view'),

    -- 树洞
    'treehole_pending', (select count(*) from public.treehole_messages
                          where is_approved = false and is_hidden = false),
    'treehole_total',   (select count(*) from public.treehole_messages),
    'treehole_flagged', (select count(*) from public.treehole_messages where is_flagged = true),

    -- 日记
    'diaries_total',  (select count(*) from public.diaries),
    'diaries_public', (select count(*) from public.diaries where visibility = 'public'),

    -- 音乐
    'tracks_total',   (select count(*) from public.tracks),
    'tracks_public',  (select count(*) from public.tracks where visibility = 'public'),
    'play_total',     (select coalesce(sum(play_count), 0) from public.tracks),
    'top_tracks',     (select coalesce(jsonb_agg(item), '[]'::jsonb) from (
                          select id, title, play_count
                            from public.tracks
                           order by play_count desc, created_at desc
                           limit 5
                       ) item),

    -- 内容池
    'events_total',       (select count(*) from public.events),
    'achievements_total', (select count(*) from public.achievements),
    'media_total',        (select count(*) from public.media)
  ) into result;

  return result;
end;
$$;

comment on function public.admin_overview() is '后台仪表盘用的聚合统计，一次请求拿全';

grant execute on function public.admin_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- 导出辅助：按类型取全部数据（后台「数据导出」用）
-- ---------------------------------------------------------------------------
create or replace function public.admin_export(p_kind text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  case p_kind
    when 'diaries' then
      select coalesce(jsonb_agg(item order by item->>'created_at' desc), '[]'::jsonb)
        into result
        from (select to_jsonb(d) as item from public.diaries d) t;

    when 'treehole' then
      select coalesce(jsonb_agg(item order by item->>'created_at' desc), '[]'::jsonb)
        into result
        from (select to_jsonb(m) as item from public.treehole_messages m) t;

    when 'tracks' then
      select coalesce(jsonb_agg(item order by item->>'sort'), '[]'::jsonb)
        into result
        from (select to_jsonb(tr) as item from public.tracks tr) t;

    when 'events' then
      select coalesce(jsonb_agg(item order by item->>'sort'), '[]'::jsonb)
        into result
        from (select to_jsonb(e) as item from public.events e) t;

    when 'achievements' then
      select coalesce(jsonb_agg(item order by item->>'sort'), '[]'::jsonb)
        into result
        from (select to_jsonb(a) as item from public.achievements a) t;

    when 'settings' then
      select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
        into result
        from public.site_settings;

    else
      raise exception 'UNKNOWN_KIND' using errcode = 'P0001';
  end case;

  return result;
end;
$$;

comment on function public.admin_export(text) is '后台导出：diaries / treehole / tracks / events / achievements / settings';

grant execute on function public.admin_export(text) to authenticated;
