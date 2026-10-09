'use server'

import { revalidatePath } from 'next/cache'

import { journalBucket } from '@/lib/journal-data'
import { STORAGE_BUCKETS } from '@/lib/constants'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { journalPhotoSchema, journalSchema, type JournalInput } from '@/lib/validators'
import type { ActionResult, DiaryVisibility } from '@/types'

import { describeError, guardAdmin } from './guard'

/**
 * 图文手帐的写操作。
 *
 * 照片的分工和音乐一样：**文件由浏览器直传 Storage**（Vercel 的函数有 4.5MB 上限），
 * 这里只负责写数据库、以及可见性变化时把文件在「公开桶 ↔ 私有桶」之间搬家。
 *
 * 为什么要搬家：公开桶是 `public: true` 的，任何拿到地址的人都能看。
 * 一篇手帐从 public 改成 private 时，如果照片还留在公开桶里，
 * 那它其实并没有私密 —— 地址早就可能被爬走了。所以这里会真的把文件移走。
 */

/** 重新验证前台与后台 */
function revalidateJournal() {
  revalidatePath('/admin/journal')
  revalidatePath('/journal')
  revalidatePath('/')
}

/* --------------------------------------------------------------------------
   手帐本体
   -------------------------------------------------------------------------- */

export async function createJournalEntry(
  input: JournalInput,
): Promise<ActionResult<{ id: string }>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = journalSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '表单内容不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  const data = parsed.data

  try {
    const { data: row, error } = await supabase
      .from('diaries')
      .insert({
        title: data.title,
        content: data.content,
        mood: data.mood || null,
        weather: data.weather || null,
        tags: data.tags,
        // 口令手帐先按 draft 存，等口令设置成功再改成 password ——
        // 避免出现「标记成口令但还没有口令」这种谁也打不开的状态
        visibility: data.visibility === 'password' ? 'draft' : data.visibility,
        sort: data.sort,
        is_pinned: data.isPinned,
        cover_photo: data.coverPhoto ?? null,
      })
      .select('id')
      .single()

    if (error) throw error

    if (data.visibility === 'password' && data.password) {
      const { error: passwordError } = await supabase.rpc('journal_set_password', {
        p_id: row.id,
        p_password: data.password,
      })
      if (passwordError) throw passwordError
    }

    revalidateJournal()
    return { ok: true, data: { id: row.id } }
  } catch (error) {
    return { ok: false, error: describeError(error, '这篇手帐没写进去。') }
  }
}

export async function updateJournalEntry(
  id: string,
  input: JournalInput,
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = journalSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '表单内容不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  const data = parsed.data

  try {
    const { data: before, error: readError } = await supabase
      .from('diaries')
      .select('visibility')
      .eq('id', id)
      .maybeSingle()

    if (readError) throw readError
    if (!before) return { ok: false, error: '这篇手帐已经不在了。' }

    const wasPublic = before.visibility === 'public'
    const willBePublic = data.visibility === 'public'

    const { error } = await supabase
      .from('diaries')
      .update({
        title: data.title,
        content: data.content,
        mood: data.mood || null,
        weather: data.weather || null,
        tags: data.tags,
        visibility: data.visibility === 'password' ? before.visibility : data.visibility,
        sort: data.sort,
        is_pinned: data.isPinned,
        cover_photo: data.coverPhoto ?? null,
        password_hash: data.visibility === 'password' ? undefined : null,
      })
      .eq('id', id)

    if (error) throw error

    // 口令
    if (data.visibility === 'password' && data.password) {
      const { error: passwordError } = await supabase.rpc('journal_set_password', {
        p_id: id,
        p_password: data.password,
      })
      if (passwordError) throw passwordError
    }

    // 可见性跨过「公开 ↔ 非公开」这条线时，把照片搬到对的桶里
    if (wasPublic !== willBePublic) {
      await moveEntryPhotos(id, wasPublic, willBePublic)
    }

    revalidateJournal()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '改动没保存上。') }
  }
}

export async function deleteJournalEntry(id: string): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { data: entry } = await supabase
      .from('diaries')
      .select('visibility, cover_photo')
      .eq('id', id)
      .maybeSingle()

    const { data: photos } = await supabase
      .from('journal_photos')
      .select('storage_path, thumb_path')
      .eq('entry_id', id)

    const { error } = await supabase.from('diaries').delete().eq('id', id)
    if (error) throw error

    // 文件尽力删，删不掉也不影响数据库结果
    if (entry) {
      const bucket = journalBucket(entry.visibility)
      const paths = [
        ...(photos ?? []).flatMap((photo) => [photo.storage_path, photo.thumb_path]),
        entry.cover_photo,
      ].filter(Boolean) as string[]

      if (paths.length > 0) {
        await supabase.storage.from(bucket).remove(paths).catch(() => undefined)
      }
    }

    revalidateJournal()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '没能删掉这篇。') }
  }
}

export async function setJournalPinned(
  id: string,
  pinned: boolean,
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase.from('diaries').update({ is_pinned: pinned }).eq('id', id)
    if (error) throw error
    revalidateJournal()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '置顶没改成。') }
  }
}

/** 上移 / 下移：改 sort，数字小的在前 */
export async function moveJournalEntry(
  id: string,
  direction: 'up' | 'down',
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { data: row, error: readError } = await supabase
      .from('diaries')
      .select('sort')
      .eq('id', id)
      .maybeSingle()

    if (readError) throw readError
    if (!row) return { ok: false, error: '这篇手帐已经不在了。' }

    const next = direction === 'up' ? row.sort - 10 : row.sort + 10
    const { error } = await supabase.from('diaries').update({ sort: next }).eq('id', id)
    if (error) throw error

    revalidateJournal()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '排序没改成。') }
  }
}

/* --------------------------------------------------------------------------
   照片
   -------------------------------------------------------------------------- */

/** 批量登记已经传到 Storage 的照片 */
export async function addJournalPhotos(
  entryId: string,
  photos: Array<{
    storagePath: string
    thumbPath?: string | null
    caption?: string | null
    width?: number | null
    height?: number | null
  }>,
): Promise<ActionResult<{ ids: string[] }>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    // 接着现有的最大 sort 往后排
    const { data: existing } = await supabase
      .from('journal_photos')
      .select('sort')
      .eq('entry_id', entryId)
      .order('sort', { ascending: false })
      .limit(1)

    let nextSort = (existing?.[0]?.sort ?? 0) + 10

    const rows = photos.map((photo) => {
      const parsed = journalPhotoSchema.safeParse({ ...photo, sort: nextSort })
      nextSort += 10
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? '照片信息不对')
      }
      return {
        entry_id: entryId,
        storage_path: parsed.data.storagePath,
        thumb_path: parsed.data.thumbPath ?? null,
        caption: parsed.data.caption ?? null,
        sort: parsed.data.sort,
        width: parsed.data.width ?? null,
        height: parsed.data.height ?? null,
      }
    })

    const { data, error } = await supabase.from('journal_photos').insert(rows).select('id')
    if (error) throw error

    revalidateJournal()
    return { ok: true, data: { ids: (data ?? []).map((row) => row.id) } }
  } catch (error) {
    return { ok: false, error: describeError(error, '照片没登记上。') }
  }
}

export async function updateJournalPhoto(
  id: string,
  input: { caption?: string | null; sort?: number },
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const patch: { caption?: string | null; sort?: number } = {}
    if (input.caption !== undefined) patch.caption = input.caption || null
    if (input.sort !== undefined) patch.sort = input.sort

    const { error } = await supabase.from('journal_photos').update(patch).eq('id', id)
    if (error) throw error

    revalidateJournal()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '照片信息没改成。') }
  }
}

export async function deleteJournalPhoto(id: string): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { data: photo, error: readError } = await supabase
      .from('journal_photos')
      .select('storage_path, thumb_path, entry_id')
      .eq('id', id)
      .maybeSingle()

    if (readError) throw readError
    if (!photo) return { ok: false, error: '这张照片已经不在了。' }

    const { data: entry } = await supabase
      .from('diaries')
      .select('visibility')
      .eq('id', photo.entry_id)
      .maybeSingle()

    const { error } = await supabase.from('journal_photos').delete().eq('id', id)
    if (error) throw error

    if (entry) {
      const paths = [photo.storage_path, photo.thumb_path].filter(Boolean) as string[]
      if (paths.length > 0) {
        await supabase
          .storage.from(journalBucket(entry.visibility))
          .remove(paths)
          .catch(() => undefined)
      }
    }

    revalidateJournal()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '照片没删掉。') }
  }
}

/** 拖拽排序：按传入的顺序重写 sort */
export async function reorderJournalPhotos(
  entryId: string,
  orderedIds: string[],
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    await Promise.all(
      orderedIds.map((id, index) =>
        supabase
          .from('journal_photos')
          .update({ sort: (index + 1) * 10 })
          .eq('id', id)
          .eq('entry_id', entryId),
      ),
    )

    revalidateJournal()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '顺序没存上。') }
  }
}

export async function setJournalCover(
  entryId: string,
  storagePath: string | null,
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase
      .from('diaries')
      .update({ cover_photo: storagePath })
      .eq('id', entryId)
    if (error) throw error

    revalidateJournal()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '封面没改成。') }
  }
}

/* --------------------------------------------------------------------------
   可见性变化时搬照片
   -------------------------------------------------------------------------- */

/**
 * 把一篇手帐的所有照片（含缩略图）在公开桶和私有桶之间搬家。
 *
 * Supabase 的 move/copy 只在同一个桶内生效，跨桶只能
 * 「下载 → 上传到目标桶 → 删掉原文件」。手帐照片不多，这个代价可以接受；
 * 而且这一步只在可见性跨越公开线时才跑。
 */
async function moveEntryPhotos(
  entryId: string,
  wasPublic: boolean,
  willBePublic: boolean,
): Promise<void> {
  const supabase = createSupabaseServerClient()
  if (!supabase) return

  const from = wasPublic ? STORAGE_BUCKETS.journalPhotos : STORAGE_BUCKETS.privateJournalPhotos
  const to = willBePublic ? STORAGE_BUCKETS.journalPhotos : STORAGE_BUCKETS.privateJournalPhotos

  const { data: photos } = await supabase
    .from('journal_photos')
    .select('id, storage_path, thumb_path')
    .eq('entry_id', entryId)

  for (const photo of photos ?? []) {
    for (const field of ['storage_path', 'thumb_path'] as const) {
      const path = photo[field]
      if (!path) continue

      try {
        const { data: blob, error: downloadError } = await supabase.storage.from(from).download(path)
        if (downloadError || !blob) continue

        const { error: uploadError } = await supabase.storage
          .from(to)
          .upload(path, blob, { upsert: true, contentType: blob.type || 'image/webp' })
        if (uploadError) continue

        await supabase.storage.from(from).remove([path])
      } catch (error) {
        console.warn('[journal] 搬照片失败（跳过这一张）：', path, error)
      }
    }
  }
}
