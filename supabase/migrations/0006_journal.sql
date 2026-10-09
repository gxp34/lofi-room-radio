-- ============================================================================
-- Lo-fi 房间电台 · 0006 图文手帐
-- ----------------------------------------------------------------------------
-- 这一版把「日记」升级成「图文手帐」：
--   · diaries 直接扩展（不另起一张表），加封面、置顶、排序、口令
--   · 新增 journal_photos：一条手帐可以挂多张照片
--   · 新增两个存储桶：journal-photos（公开）/ private-journal-photos（私有）
--   · 口令手帐：正文不进 RLS 的可见范围，只有校验通过后由服务端用
--     service_role 取回来，所以「加了口令的手帐」在数据库层面就是读不到的
-- 可重复执行。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 扩展 diaries
-- ---------------------------------------------------------------------------
alter table public.diaries add column if not exists cover_photo   text;
alter table public.diaries add column if not exists sort          integer not null default 0;
alter table public.diaries add column if not exists is_pinned     boolean not null default false;
alter table public.diaries add column if not exists password_hash text;

comment on column public.diaries.cover_photo is '封面照片在存储桶里的路径';
comment on column public.diaries.is_pinned is '置顶：前台排在最前面';
comment on column public.diaries.password_hash is '口令手帐的 bcrypt 哈希；明文不落库';

-- 放开 visibility 的取值，加上 password
alter table public.diaries drop constraint if exists diaries_visibility_check;
alter table public.diaries add constraint diaries_visibility_check
  check (visibility in ('draft', 'public', 'private', 'password'));

create index if not exists diaries_feed_idx
  on public.diaries (is_pinned desc, sort asc, published_at desc nulls last, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. journal_photos
-- ---------------------------------------------------------------------------
create table if not exists public.journal_photos (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references public.diaries (id) on delete cascade,
  storage_path text not null,
  thumb_path   text,
  caption      text check (caption is null or char_length(caption) <= 300),
  sort         integer not null default 0,
  width        integer check (width is null or width > 0),
  height       integer check (height is null or height > 0),
  created_at   timestamptz not null default now()
);

comment on table public.journal_photos is
  '手帐照片。桶由所属手帐的可见性决定：public → journal-photos，其余 → private-journal-photos';

create index if not exists journal_photos_entry_idx on public.journal_photos (entry_id, sort, created_at);

-- ---------------------------------------------------------------------------
-- 3. 存储桶
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal-photos', 'journal-photos', true, 10485760,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-journal-photos', 'private-journal-photos', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
alter table public.journal_photos enable row level security;

grant select on public.journal_photos to anon, authenticated;
grant select, insert, update, delete on public.journal_photos to authenticated;

-- 照片跟着手帐走：只有公开手帐的照片对访客可见
drop policy if exists "journal_photos: 公开手帐的照片可见" on public.journal_photos;
create policy "journal_photos: 公开手帐的照片可见"
  on public.journal_photos for select
  to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.diaries d
      where d.id = journal_photos.entry_id
        and d.visibility = 'public'
    )
  );

drop policy if exists "journal_photos: 站长全权" on public.journal_photos;
create policy "journal_photos: 站长全权"
  on public.journal_photos for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. 存储策略
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('手帐: 公开读取 journal-photos',
       $ddl$create policy "手帐: 公开读取 journal-photos" on storage.objects
              for select to anon, authenticated
              using (bucket_id = 'journal-photos')$ddl$),

      ('手帐: 站长读取 private-journal-photos',
       $ddl$create policy "手帐: 站长读取 private-journal-photos" on storage.objects
              for select to authenticated
              using (bucket_id = 'private-journal-photos' and public.is_admin())$ddl$),

      ('手帐: 站长上传 journal-photos',
       $ddl$create policy "手帐: 站长上传 journal-photos" on storage.objects
              for insert to authenticated
              with check (bucket_id = 'journal-photos' and public.is_admin())$ddl$),

      ('手帐: 站长上传 private-journal-photos',
       $ddl$create policy "手帐: 站长上传 private-journal-photos" on storage.objects
              for insert to authenticated
              with check (bucket_id = 'private-journal-photos' and public.is_admin())$ddl$),

      ('手帐: 站长覆盖照片',
       $ddl$create policy "手帐: 站长覆盖照片" on storage.objects
              for update to authenticated
              using (bucket_id in ('journal-photos','private-journal-photos') and public.is_admin())
              with check (bucket_id in ('journal-photos','private-journal-photos') and public.is_admin())$ddl$),

      ('手帐: 站长删除照片',
       $ddl$create policy "手帐: 站长删除照片" on storage.objects
              for delete to authenticated
              using (bucket_id in ('journal-photos','private-journal-photos') and public.is_admin())$ddl$)
    ) as t(name, ddl)
  loop
    begin
      execute format('drop policy if exists %I on storage.objects', p.name);
    exception when others then
      raise notice '跳过删除旧策略：%', p.name;
    end;
    begin
      execute p.ddl;
    exception when duplicate_object then
      raise notice '策略已存在：%', p.name;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. 口令手帐
-- ---------------------------------------------------------------------------

-- 6.1 校验口令。SECURITY DEFINER：匿名访客要能调，但不能读到哈希本身。
create or replace function public.journal_check_password(p_id uuid, p_password text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
      from public.diaries d
     where d.id = p_id
       and d.visibility = 'password'
       and d.password_hash is not null
       and d.password_hash = crypt(p_password, d.password_hash)
  );
$$;

comment on function public.journal_check_password(uuid, text) is '校验口令手帐的口令；只返回 true/false，不泄漏哈希';

grant execute on function public.journal_check_password(uuid, text) to anon, authenticated;

-- 6.2 设置 / 清除口令（仅站长）
create or replace function public.journal_set_password(p_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  update public.diaries
     set visibility = 'password',
         password_hash = case
           when p_password is null or length(trim(p_password)) = 0 then null
           else crypt(trim(p_password), gen_salt('bf'))
         end
   where id = p_id;
end;
$$;

grant execute on function public.journal_set_password(uuid, text) to authenticated;

-- 6.3 上锁手帐的清单：只给标题、日期、心情，**不给正文和照片**
create or replace function public.journal_locked_entries()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(item order by item->>'created_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', d.id,
        'title', d.title,
        'mood', d.mood,
        'weather', d.weather,
        'tags', to_jsonb(d.tags),
        'created_at', d.created_at,
        'published_at', d.published_at
      ) as item
        from public.diaries d
       where d.visibility = 'password'
    ) t;
$$;

grant execute on function public.journal_locked_entries() to anon, authenticated;
