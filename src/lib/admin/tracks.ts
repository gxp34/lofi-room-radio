'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { STORAGE_BUCKETS } from '@/lib/constants'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { trackMetaSchema } from '@/lib/validators'
import type { ActionResult } from '@/types'

import { describeError, guardAdmin } from './guard'

/**
 * 音乐管理的写操作。
 *
 * 关于上传的分工（很重要）：
 *   文件**不经过 Server Action / Route Handler**，而是浏览器拿着站长的登录态
 *   直接传到 Supabase Storage（RLS 会验证「你是不是站长」）。
 *   这么做有两个原因：
 *     1. Vercel 的 Serverless 函数有 4.5MB 的请求体上限，25MB 的音频根本传不上去；
 *     2. 直传少一跳，上传速度更接近真实带宽。
 *   传到 Storage 之后，再把「路径」交给下面这些 action 写数据库。
 */

const uploadSchema = z.object({
  audioPath: z.string().min(1, '音频还没上传成功').max(400),
  coverPath: z.string().max(400).nullable().optional(),
  duration: z.coerce.number().int().min(0).max(60 * 60 * 6).nullable().optional(),
})

const createTrackSchema = trackMetaSchema.merge(uploadSchema)

export type CreateTrackInput = z.infer<typeof createTrackSchema>
export type UpdateTrackInput = z.infer<typeof trackMetaSchema>

/** 新建一首歌（元数据 + 已上传的文件路径） */
export async function createTrack(input: CreateTrackInput): Promise<ActionResult<{ id: string }>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = createTrackSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '表单内容不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  const data = parsed.data

  try {
    const { data: row, error } = await supabase
      .from('tracks')
      .insert({
        title: data.title,
        artist: data.artist ?? null,
        tags: data.tags,
        note: data.note ?? null,
        visibility: data.visibility,
        sort: data.sort,
        audio_path: data.audioPath,
        cover_path: data.coverPath ?? null,
        duration: data.duration ?? null,
      })
      .select('id')
      .single()

    if (error) throw error

    // 顺手登记到媒体库，方便以后在「媒体库」页里清理
    await supabase.from('media').insert([
      {
        bucket: data.visibility === 'public' ? STORAGE_BUCKETS.publicMusic : STORAGE_BUCKETS.privateMusic,
        path: data.audioPath,
        type: 'audio',
        uploaded_by: guard.user.id,
      },
      ...(data.coverPath
        ? [
            {
              bucket: STORAGE_BUCKETS.covers,
              path: data.coverPath,
              type: 'image',
              uploaded_by: guard.user.id,
            },
          ]
        : []),
    ])

    revalidatePath('/admin/music')
    revalidatePath('/music')

    return { ok: true, data: { id: row.id } }
  } catch (error) {
    return { ok: false, error: describeError(error, '这首歌没能上架。') }
  }
}

/** 改元数据（不动文件） */
export async function updateTrack(
  id: string,
  input: UpdateTrackInput,
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = trackMetaSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '表单内容不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase
      .from('tracks')
      .update({
        title: parsed.data.title,
        artist: parsed.data.artist ?? null,
        tags: parsed.data.tags,
        note: parsed.data.note ?? null,
        visibility: parsed.data.visibility,
        sort: parsed.data.sort,
      })
      .eq('id', id)

    if (error) throw error

    revalidatePath('/admin/music')
    revalidatePath('/music')
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '改动没保存上。') }
  }
}

/**
 * 删除一首歌：先删数据库行，再尽力删 Storage 里的文件。
 * 顺序是刻意的 —— 万一文件删失败，数据库里已经没有引用，不会出现「歌在架上但文件没了」。
 */
export async function deleteTrack(id: string): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { data: row, error: readError } = await supabase
      .from('tracks')
      .select('audio_path, cover_path, visibility')
      .eq('id', id)
      .maybeSingle()

    if (readError) throw readError
    if (!row) return { ok: false, error: '这首歌已经不在了。' }

    const { error } = await supabase.from('tracks').delete().eq('id', id)
    if (error) throw error

    const audioBucket =
      row.visibility === 'public' ? STORAGE_BUCKETS.publicMusic : STORAGE_BUCKETS.privateMusic

    // 删文件失败不影响结果（RLS 会验证站长身份），只记一条警告
    const removals: Promise<unknown>[] = [
      supabase.storage.from(audioBucket).remove([row.audio_path]),
    ]
    if (row.cover_path) {
      removals.push(supabase.storage.from(STORAGE_BUCKETS.covers).remove([row.cover_path]))
    }
    await Promise.allSettled(removals)

    await supabase
      .from('media')
      .delete()
      .in('path', [row.audio_path, ...(row.cover_path ? [row.cover_path] : [])])

    revalidatePath('/admin/music')
    revalidatePath('/music')
    revalidatePath('/admin/media')
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '没能删掉这首歌。') }
  }
}

/** 上移 / 下移：直接改 sort，值越大越靠前（前台按 sort 正序、再按创建时间倒序） */
export async function moveTrack(
  id: string,
  direction: 'up' | 'down',
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { data: row, error: readError } = await supabase
      .from('tracks')
      .select('sort')
      .eq('id', id)
      .maybeSingle()

    if (readError) throw readError
    if (!row) return { ok: false, error: '这首歌已经不在了。' }

    const nextSort = direction === 'up' ? row.sort - 10 : row.sort + 10

    const { error } = await supabase.from('tracks').update({ sort: nextSort }).eq('id', id)
    if (error) throw error

    revalidatePath('/admin/music')
    revalidatePath('/music')
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '排序没改成。') }
  }
}

/** 登记一个上传到媒体库的文件（封面单独上传时用） */
export async function registerMedia(input: {
  bucket: string
  path: string
  type: string
  size?: number
}): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase.from('media').upsert(
      {
        bucket: input.bucket,
        path: input.path,
        type: input.type,
        size: input.size ?? null,
        uploaded_by: guard.user.id,
      },
      { onConflict: 'bucket,path' },
    )

    if (error) throw error

    revalidatePath('/admin/media')
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '媒体记录没写上。') }
  }
}
