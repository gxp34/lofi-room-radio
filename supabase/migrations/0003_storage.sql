-- ============================================================================
-- Lo-fi 房间电台 · 0003 Storage（存储桶 + 访问策略）
-- ----------------------------------------------------------------------------
-- 四个桶：
--   public-music  公开音乐（public 桶，访客直接读 public URL）
--   private-music 私密音乐（private 桶，只发 signed URL，有效期 1 小时）
--   covers        封面图（public 桶）
--   diary-images  日记配图（private 桶，用 signed URL 展示）
-- 桶级限制：音频 25MB / 图片 5MB，且限定 MIME 类型，防止被当图床滥用。
-- 可重复执行。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 创建 / 更新桶（含大小与类型限制）
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-music', 'public-music', true, 26214400,
  array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/webm','audio/flac']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-music', 'private-music', false, 26214400,
  array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/x-wav','audio/webm','audio/flac']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'covers', 'covers', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/avif','image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'diary-images', 'diary-images', false, 5242880,
  array['image/jpeg','image/png','image/webp','image/avif','image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. 访问策略（storage.objects 上的 RLS）
--    用一个 DO 块批量创建，兼容「策略已存在 / 无权限删除」两种情况，可重复执行。
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select * from (values
      -- 公开桶：任何人可读
      ('lofi: 公开读取 public-music',
       $ddl$create policy "lofi: 公开读取 public-music" on storage.objects
              for select to anon, authenticated
              using (bucket_id = 'public-music')$ddl$),

      ('lofi: 公开读取 covers',
       $ddl$create policy "lofi: 公开读取 covers" on storage.objects
              for select to anon, authenticated
              using (bucket_id = 'covers')$ddl$),

      -- 私密桶：只有站长能直接读（前台展示走服务端签发的 signed URL）
      ('lofi: 站长读取 private-music',
       $ddl$create policy "lofi: 站长读取 private-music" on storage.objects
              for select to authenticated
              using (bucket_id = 'private-music' and public.is_admin())$ddl$),

      ('lofi: 站长读取 diary-images',
       $ddl$create policy "lofi: 站长读取 diary-images" on storage.objects
              for select to authenticated
              using (bucket_id = 'diary-images' and public.is_admin())$ddl$),

      -- 写入：站长可增删改四个桶
      ('lofi: 站长上传 public-music',
       $ddl$create policy "lofi: 站长上传 public-music" on storage.objects
              for insert to authenticated
              with check (bucket_id = 'public-music' and public.is_admin())$ddl$),

      ('lofi: 站长上传 private-music',
       $ddl$create policy "lofi: 站长上传 private-music" on storage.objects
              for insert to authenticated
              with check (bucket_id = 'private-music' and public.is_admin())$ddl$),

      ('lofi: 站长上传 covers',
       $ddl$create policy "lofi: 站长上传 covers" on storage.objects
              for insert to authenticated
              with check (bucket_id = 'covers' and public.is_admin())$ddl$),

      ('lofi: 站长上传 diary-images',
       $ddl$create policy "lofi: 站长上传 diary-images" on storage.objects
              for insert to authenticated
              with check (bucket_id = 'diary-images' and public.is_admin())$ddl$),

      ('lofi: 站长覆盖文件',
       $ddl$create policy "lofi: 站长覆盖文件" on storage.objects
              for update to authenticated
              using (bucket_id in ('public-music','private-music','covers','diary-images') and public.is_admin())
              with check (bucket_id in ('public-music','private-music','covers','diary-images') and public.is_admin())$ddl$),

      ('lofi: 站长删除文件',
       $ddl$create policy "lofi: 站长删除文件" on storage.objects
              for delete to authenticated
              using (bucket_id in ('public-music','private-music','covers','diary-images') and public.is_admin())$ddl$)
    ) as t(name, ddl)
  loop
    begin
      execute format('drop policy if exists %I on storage.objects', p.name);
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

-- ---------------------------------------------------------------------------
-- 3. 使用说明（写给自己看的备忘）
-- ---------------------------------------------------------------------------
-- 公开音乐：  supabase.storage.from('public-music').getPublicUrl(path).data.publicUrl
-- 私密音乐：  await supabaseAdmin.storage.from('private-music').createSignedUrl(path, 3600)
-- 封面：      covers 桶同样是 public，可直接用 publicUrl 交给 next/image
-- 日记配图：  diary-images 是 private 桶，列表接口要批量 createSignedUrls(..., 3600)
