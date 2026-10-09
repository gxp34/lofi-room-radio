'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { STORAGE_BUCKETS } from '@/lib/constants'
import { createSupabaseServerClient, type TypedSupabaseServerClient } from '@/lib/supabase/server'
import { mimeFromName } from '@/lib/upload'
import type { ActionResult } from '@/types'

import { describeError, guardAdmin } from './guard'

/**
 * 媒体库的写操作。
 *
 * 媒体库有两个数据来源，必须合起来看：
 *   1. `media` 表 —— 业务上的「登记簿」：谁在什么时候传了什么；
 *   2. Supabase Storage 四个桶里的真实文件 —— 真正占空间的东西。
 * 两边天生会不一致：文件传上去了但写库失败、在控制台手工删过文件、老数据没登记过……
 * 所以下面每个 action 都要说清楚「我到底动了哪一边」。
 */

/** 媒体库管辖的四个桶（与 0003_storage.sql 一致） */
const MEDIA_BUCKETS = [
  STORAGE_BUCKETS.publicMusic,
  STORAGE_BUCKETS.privateMusic,
  STORAGE_BUCKETS.covers,
  STORAGE_BUCKETS.diaryImages,
  STORAGE_BUCKETS.journalPhotos,
  STORAGE_BUCKETS.privateJournalPhotos,
] as const

export type MediaBucket = (typeof MEDIA_BUCKETS)[number]

/** 一个 Storage 文件与 media 表合并后的一行 */
export interface MediaFileItem {
  /** 文件在桶里的完整路径，例如 audio/20240611-a3f9-歌名.mp3 */
  path: string
  /** 字节数；Storage 没给出时退回表里的记录，都没有就是 null */
  size: number | null
  /** MIME 类型（或 audio / image 这种粗分类） */
  type: string | null
  /** 创建时间（ISO 字符串），交给客户端自己格式化 */
  createdAt: string | null
  /** media 表里对应记录的 id；null 表示「Storage 里有、表里没登记」 */
  recordId: string | null
}

/** media 表里有、Storage 里却找不到的记录（文件已经丢了，只能删记录） */
export interface MediaOrphanRecord {
  id: string
  path: string
  size: number | null
  type: string | null
  createdAt: string | null
}

/** 一个桶的完整快照，由服务端页面查好后交给客户端组件 */
export interface MediaBucketSnapshot {
  bucket: MediaBucket
  /** Storage 里真实存在的文件 */
  files: MediaFileItem[]
  /** 只有登记、没有文件的记录 */
  orphans: MediaOrphanRecord[]
  /** 这个桶读失败时的中文原因；成功时为 null（单桶失败不影响其它桶） */
  error: string | null
}

/** 删除一个文件的结果：两边各自成功与否 */
export interface MediaDeleteOutcome {
  /** Storage 里的文件删掉了没有 */
  storageDeleted: boolean
  /** media 表里的记录删掉了没有 */
  recordDeleted: boolean
  /** 给用户看的一句话说明 */
  message: string
}

/** 扫描 Storage 的结果 */
export interface SyncMediaResult {
  /** 这次补登记了几个文件 */
  added: number
}

/* ==========================================================================
   校验
   ========================================================================== */

const deleteFileSchema = z.object({
  bucket: z.enum(MEDIA_BUCKETS, { errorMap: () => ({ message: '这个桶不属于媒体库。' }) }),
  path: z.string().min(1, '文件路径不能是空的').max(400, '文件路径太长了'),
})

const idSchema = z.string().uuid('记录 id 不对。')

/* ==========================================================================
   1. 删文件：Storage 和 media 表都要动
   ========================================================================== */

/**
 * 删除一个文件：Storage 里的文件和 media 表的记录**都尽力删**。
 *
 * 为什么不像 deleteTrack 那样讲究顺序：
 *   那边删的是「一首歌」，先删数据库行才不会出现「歌在架上但文件没了」；
 *   这边删的就是文件本身，两边都是独立可重试的，所以谁失败也不拦着另一个，
 *   最后把「各自成没成」一起告诉用户。
 *
 * 返回值约定（配合 ActionButton 的 toast）：
 *   两边都成功 → ok: true，data.message 说明结果；
 *   有任何一边失败 → ok: false，error 里写清楚哪边没成、为什么。
 */
export async function deleteMediaFile(
  bucket: string,
  path: string,
): Promise<ActionResult<MediaDeleteOutcome>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = deleteFileSchema.safeParse({ bucket, path })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '参数不对。' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  const target = parsed.data

  /* ---- 1/2 Storage：删文件（RLS 会再验证一次站长身份） ---- */
  let storageDeleted = false
  let storageError: string | null = null
  try {
    const { error } = await supabase.storage.from(target.bucket).remove([target.path])
    if (error) throw error
    storageDeleted = true
  } catch (error) {
    storageError = describeError(error, '未知原因')
  }

  /* ---- 2/2 数据库：删记录（文件留着也没意义，但失败了也要说） ---- */
  let recordDeleted = false
  let recordError: string | null = null
  try {
    const { error } = await supabase
      .from('media')
      .delete()
      .eq('bucket', target.bucket)
      .eq('path', target.path)

    if (error) throw error
    recordDeleted = true
  } catch (error) {
    recordError = describeError(error, '未知原因')
  }

  revalidatePath('/admin/media')
  revalidatePath('/admin/music')

  const message = describeDeleteOutcome(storageDeleted, recordDeleted, storageError, recordError)

  if (!storageDeleted || !recordDeleted) {
    return { ok: false, error: message }
  }

  return { ok: true, data: { storageDeleted, recordDeleted, message } }
}

/** 把两边的结果拼成一句人话 */
function describeDeleteOutcome(
  storageDeleted: boolean,
  recordDeleted: boolean,
  storageError: string | null,
  recordError: string | null,
): string {
  const parts = [
    storageDeleted ? '文件删掉了' : `文件没删掉（${storageError ?? '未知原因'}）`,
    recordDeleted ? '登记记录也清了' : `登记记录没清掉（${recordError ?? '未知原因'}）`,
  ]
  return `${parts.join('，')}。`
}

/* ==========================================================================
   2. 只删记录：文件留在 Storage 里
   ========================================================================== */

/**
 * 只删 media 表的记录，Storage 里的文件留着。
 *
 * 用在两种场合：
 *   1. 记录是脏数据（文件其实早就手工删了，只剩一行记录）；
 *   2. 想把某个文件从媒体库里「除名」，但暂时不想删文件本体。
 */
export async function deleteMediaRecord(id: string): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = idSchema.safeParse(id)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '记录 id 不对。' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase.from('media').delete().eq('id', parsed.data)
    if (error) throw error

    revalidatePath('/admin/media')
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '记录没删掉。') }
  }
}

/* ==========================================================================
   3. 扫描 Storage：把没登记的文件补进 media 表
   ========================================================================== */

/**
 * 遍历四个桶，把「Storage 里有、media 表里没有」的文件补登记进 media 表。
 *
 * 只增不改不删 —— 扫描是「补登记」，不是「以 Storage 为准重建」，
 * 免得误删掉别人手工维护的备注数据。
 * 某个桶读不出来（没建好 / RLS 不让读）只跳过它，不打断整次扫描。
 */
export async function syncMediaFromStorage(): Promise<ActionResult<SyncMediaResult>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    /* ---- 1. 先读出现在登记了哪些 (bucket, path) ---- */
    const { data: existingRows, error: readError } = await supabase
      .from('media')
      .select('bucket, path')
      .in('bucket', [...MEDIA_BUCKETS])

    if (readError) throw readError

    // 用不可见字符拼键，免得 bucket 与 path 里的分隔符撞车
    const known = new Set((existingRows ?? []).map((row) => `${row.bucket}\u0000${row.path}`))

    /* ---- 2. 逐个桶列目录，挑出没登记的文件 ---- */
    const missing: {
      bucket: MediaBucket
      path: string
      type: string | null
      size: number | null
    }[] = []

    for (const bucket of MEDIA_BUCKETS) {
      try {
        const objects = await listBucketObjects(supabase, bucket)

        for (const object of objects) {
          const key = `${bucket}\u0000${object.path}`
          if (known.has(key)) continue
          // 同一次扫描里也别重复插（虽然桶内路径本来就不会重）
          known.add(key)
          missing.push({ bucket, path: object.path, type: object.type, size: object.size })
        }
      } catch (error) {
        console.warn(`[admin/media] 扫描 ${bucket} 失败，跳过这个桶：`, describeError(error))
      }
    }

    /* ---- 3. 一次性补登记 ---- */
    if (missing.length > 0) {
      /**
       * 用 upsert + ignoreDuplicates 而不是 insert：
       * 上面读「已登记清单」时最多只能读到 1000 行（PostgREST 的默认上限），
       * 媒体库真攒到上千个文件时，多出来的记录会被当成「还没登记」再去插一次。
       * 让它撞上 (bucket, path) 唯一约束就跳过，扫描才是幂等的（可反复点）。
       */
      const { error: insertError } = await supabase.from('media').upsert(
        missing.map((item) => ({
          bucket: item.bucket,
          path: item.path,
          type: item.type,
          size: item.size,
          uploaded_by: guard.user.id,
        })),
        { onConflict: 'bucket,path', ignoreDuplicates: true },
      )

      if (insertError) throw insertError
    }

    revalidatePath('/admin/media')
    return { ok: true, data: { added: missing.length } }
  } catch (error) {
    return { ok: false, error: describeError(error, '扫描 Storage 失败了。') }
  }
}

/* ==========================================================================
   内部工具
   ========================================================================== */

interface StorageObjectInfo {
  path: string
  type: string | null
  size: number | null
}

/**
 * 递归列出一个桶里的所有文件。
 *
 * 为什么要递归：上传时路径是 `audio/xxx.mp3` / `covers/xxx.jpg` 这种带目录的，
 * `list()` 只列一层，直接列根目录只能看到目录名，看不到文件。
 *
 * 说明：服务端页面 `src/app/admin/(panel)/media/page.tsx` 里有一份同样的实现。
 * 因为本文件是 'use server' 模块，只允许导出 async 函数，
 * 没法把这段纯工具函数共享出去，只能各自留一份（改动时请一起改）。
 */
async function listBucketObjects(
  supabase: TypedSupabaseServerClient,
  bucket: MediaBucket,
  prefix = '',
  depth = 0,
): Promise<StorageObjectInfo[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  })

  if (error) throw error

  const files: StorageObjectInfo[] = []
  const folders: string[] = []

  for (const item of data ?? []) {
    // Storage 会把子目录也当成条目返回，目录的 id / metadata 是空的
    if (item.id === null || item.metadata === null) {
      folders.push(item.name)
      continue
    }

    files.push({
      path: prefix ? `${prefix}/${item.name}` : item.name,
      type: item.metadata.mimetype || mimeFromName(item.name),
      size: typeof item.metadata.size === 'number' ? item.metadata.size : null,
    })
  }

  // 最多往下翻三层：桶里不该有更深的目录，真有也不至于让递归失控
  if (depth >= 2) return files

  for (const folder of folders) {
    const nested = prefix ? `${prefix}/${folder}` : folder
    files.push(...(await listBucketObjects(supabase, bucket, nested, depth + 1)))
  }

  return files
}
