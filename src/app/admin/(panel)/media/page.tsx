import { AdminPage, EmptyState } from '@/components/admin/ui'
import { MediaManager } from '@/components/admin/media-manager'
import { describeError } from '@/lib/admin/guard'
import type {
  MediaBucket,
  MediaBucketSnapshot,
  MediaFileItem,
  MediaOrphanRecord,
} from '@/lib/admin/media'
import { STORAGE_BUCKETS } from '@/lib/constants'
import { isSupabaseConfigured } from '@/lib/env'
import { createSupabaseServerClient, type TypedSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * 媒体库。
 *
 * 页面上要同时看到两种事实：
 *   1. Storage 里真实存在的文件（占空间的是它们）；
 *   2. media 表里的登记记录（业务上「谁传的」）。
 * 两者对不上的地方（有文件没记录、有记录没文件）才是有信息量的地方，
 * 所以这里把两边合并好，再整包交给客户端组件渲染。
 *
 * 这里刻意不做「先查全部再在客户端过滤」：四个桶的目录结构只有服务端能读
 * （private-music / diary-images 的 RLS 只放站长），浏览器里读不到。
 */

/** 展示顺序：音乐在前，图片在后 */
const BUCKETS: readonly MediaBucket[] = [
  STORAGE_BUCKETS.publicMusic,
  STORAGE_BUCKETS.privateMusic,
  STORAGE_BUCKETS.covers,
  STORAGE_BUCKETS.diaryImages,
]

/** media 表里真正用得上的几列 */
interface MediaRecordLite {
  id: string
  type: string | null
  size: number | null
  createdAt: string | null
}

/** Storage 列目录得到的一行 */
interface StorageObjectLite {
  path: string
  type: string | null
  size: number | null
  createdAt: string | null
}

export default async function AdminMediaPage() {
  if (!isSupabaseConfigured) {
    return (
      <AdminPage title="媒体库" description="四个存储桶里到底躺着些什么。">
        <EmptyState
          title="还没连上数据库"
          description="请在 .env.local 里填好 NEXT_PUBLIC_SUPABASE_URL 与 ANON KEY，并执行 0001–0005 的 SQL。"
        />
      </AdminPage>
    )
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) {
    return (
      <AdminPage title="媒体库">
        <EmptyState
          title="读不到数据库连接"
          description="环境变量可能只在构建时生效，重启一下开发服务器。"
        />
      </AdminPage>
    )
  }

  /* ---------------- 1. media 表：登记簿 ----------------
     注意：PostgREST 单次最多返回 1000 行。媒体库真攒到上千个文件时，
     排在后面的记录读不到，页面上会显示成「表里没有登记」——
     扫描（syncMediaFromStorage）是幂等的，不会因此插重复。 */
  const { data: rows, error: rowsError } = await supabase
    .from('media')
    .select('id, bucket, path, type, size, created_at')
    .order('created_at', { ascending: false })

  // 读不到表也要把 Storage 的部分渲染出来，只是没有「已登记」标记
  const notice = rowsError
    ? `读 media 表失败了（${rowsError.message}），下面只显示 Storage 里的文件，登记状态一律按「未登记」算。`
    : null

  const recordsByBucket = new Map<MediaBucket, Map<string, MediaRecordLite>>()
  for (const bucket of BUCKETS) recordsByBucket.set(bucket, new Map())

  for (const row of rows ?? []) {
    if (!isMediaBucket(row.bucket)) continue
    recordsByBucket.get(row.bucket)?.set(row.path, {
      id: row.id,
      type: row.type,
      size: row.size,
      createdAt: row.created_at,
    })
  }

  /* ---------------- 2. Storage：四个桶的真实文件 ---------------- */
  const buckets = await Promise.all(
    BUCKETS.map((bucket) =>
      loadBucket(supabase, bucket, recordsByBucket.get(bucket) ?? new Map<string, MediaRecordLite>()),
    ),
  )

  return (
    <AdminPage
      title="媒体库"
      description="四个存储桶里真实躺着的东西，加上 media 表的登记记录。文件本体在 Supabase Storage 里，删了就找不回来。"
    >
      <MediaManager buckets={buckets} notice={notice} />
    </AdminPage>
  )
}

/* ==========================================================================
   数据装载
   ========================================================================== */

function isMediaBucket(value: string): value is MediaBucket {
  return (BUCKETS as readonly string[]).includes(value)
}

/**
 * 读一个桶，并把 Storage 的文件与 media 表的记录合并成快照。
 *
 * 单个桶失败（桶没建好、RLS 不让读、网络抽风）只把这个桶标成错误，
 * 其它桶照常渲染 —— 媒体库页不该因为一个桶就整页崩掉。
 */
async function loadBucket(
  supabase: TypedSupabaseServerClient,
  bucket: MediaBucket,
  records: Map<string, MediaRecordLite>,
): Promise<MediaBucketSnapshot> {
  try {
    const objects = await listBucketObjects(supabase, bucket)
    const seen = new Set<string>()

    const files: MediaFileItem[] = objects.map((object) => {
      const record = records.get(object.path)
      seen.add(object.path)

      return {
        path: object.path,
        // 大小和类型以 Storage 的真实数据为准，它没给才退回登记记录
        size: object.size ?? record?.size ?? null,
        type: object.type ?? record?.type ?? null,
        createdAt: object.createdAt ?? record?.createdAt ?? null,
        recordId: record?.id ?? null,
      }
    })

    // 新传的排前面；时间一样就按路径，保证渲染顺序稳定
    files.sort(
      (a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.path.localeCompare(b.path),
    )

    // 表里有、Storage 里找不到的记录：文件可能早就没了，只能删记录
    const orphans: MediaOrphanRecord[] = []
    for (const [path, record] of records) {
      if (seen.has(path)) continue
      orphans.push({
        id: record.id,
        path,
        size: record.size,
        type: record.type,
        createdAt: record.createdAt,
      })
    }

    return { bucket, files, orphans, error: null }
  } catch (error) {
    console.warn(`[admin/media] 读取 ${bucket} 失败：`, error)
    return {
      bucket,
      files: [],
      orphans: [],
      error: `这个桶读不出来（可能还没建好，或者权限不够）：${describeError(error)}`,
    }
  }
}

/**
 * 递归列出桶里的所有文件。
 *
 * 上传时路径都是 `audio/xxx.mp3` 这种带目录的，`list()` 一次只列一层，
 * 所以得往下翻：目录条目的 id / metadata 是空的，靠这个把它和文件区分开。
 *
 * 说明：`src/lib/admin/media.ts` 里有一份同样的实现，因为那个文件是
 * 'use server' 模块、只能导出 async 函数，纯工具函数共享不出来（改的时候请一起改）。
 */
async function listBucketObjects(
  supabase: TypedSupabaseServerClient,
  bucket: MediaBucket,
  prefix = '',
  depth = 0,
): Promise<StorageObjectLite[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  })

  if (error) throw error

  const files: StorageObjectLite[] = []
  const folders: string[] = []

  for (const item of data ?? []) {
    // 目录：没有 id、没有 metadata，只有名字
    if (item.id === null || item.metadata === null) {
      folders.push(item.name)
      continue
    }

    files.push({
      path: prefix ? `${prefix}/${item.name}` : item.name,
      type: item.metadata.mimetype || null,
      size: typeof item.metadata.size === 'number' ? item.metadata.size : null,
      createdAt: item.created_at ?? null,
    })
  }

  // 最多往下翻三层，够覆盖 audio/ 这类一层目录，也不至于递归失控
  if (depth >= 2) return files

  for (const folder of folders) {
    const nested = prefix ? `${prefix}/${folder}` : folder
    files.push(...(await listBucketObjects(supabase, bucket, nested, depth + 1)))
  }

  return files
}
