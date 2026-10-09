import { SIGNED_URL_TTL_SECONDS, STORAGE_BUCKETS } from '@/lib/constants'
import { rowToJournalEntry, rowToJournalPhoto } from '@/lib/mappers'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { DiaryVisibility, JournalEntry, JournalPhoto, LockedJournalEntry } from '@/types'
import type { Json, Tables } from '@/types/database'

/**
 * 手帐的读取逻辑。
 *
 * 三个入口，共用同一套「照片地址怎么来」的规则：
 *   · 公开手帐  → 公开桶的 publicUrl，访客直接能看
 *   · 私密手帐  → 站长登录后，用他的会话给私有桶签地址
 *   · 口令手帐  → 校验通过之后，用 service_role 签地址（访客没有会话）
 *
 * 排序规则：置顶 → 手动 sort → 发布时间倒序。
 */

/** 手帐的照片放哪个桶：公开的进公开桶，其余都进私有桶 */
export function journalBucket(visibility: DiaryVisibility): string {
  return visibility === 'public' ? STORAGE_BUCKETS.journalPhotos : STORAGE_BUCKETS.privateJournalPhotos
}

/** 列表排序：置顶在前，然后按 sort，最后按发布时间 */
function sortEntries(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    if (a.sort !== b.sort) return a.sort - b.sort
    const at = new Date(a.publishedAt ?? a.createdAt).getTime()
    const bt = new Date(b.publishedAt ?? b.createdAt).getTime()
    return bt - at
  })
}

/**
 * 给私有桶的照片签一批临时地址。
 * `preferAdmin` 为 true 时优先用站长的会话签（少用一次超级权限）；
 * 拿不到会话（访客输口令解锁）才动用 service_role。
 */
async function signPrivatePaths(
  paths: string[],
  preferAdmin: boolean,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {}

  const unique = Array.from(new Set(paths.filter(Boolean)))

  const sign = async (
    client: ReturnType<typeof createSupabaseServerClient> | ReturnType<typeof getSupabaseAdminClient>,
  ) => {
    if (!client) return null
    const { data, error } = await client.storage
      .from(STORAGE_BUCKETS.privateJournalPhotos)
      .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS)

    if (error || !data) return null

    const map: Record<string, string> = {}
    for (const item of data) {
      if (item.path && item.signedUrl) map[item.path] = item.signedUrl
    }
    return map
  }

  if (preferAdmin) {
    const map = await sign(createSupabaseServerClient())
    if (map) return map
  }

  const map = await sign(getSupabaseAdminClient())
  return map ?? {}
}

interface BuildOptions {
  /** 这批手帐是站长在看吗（决定私密照片用谁的权限签） */
  asAdmin: boolean
}

/** 把 entries 和 photos 两个查询结果拼成 JournalEntry[]，并补好照片地址 */
async function buildEntries(
  entries: Tables<'diaries'>[],
  photos: Tables<'journal_photos'>[],
  options: BuildOptions,
): Promise<JournalEntry[]> {
  const supabase = createSupabaseServerClient()

  // 需要签名的私有桶路径
  const privatePaths = photos
    .filter((photo) => {
      const parent = entries.find((entry) => entry.id === photo.entry_id)
      return parent ? parent.visibility !== 'public' : false
    })
    .flatMap((photo) => [photo.storage_path, photo.thumb_path].filter(Boolean) as string[])

  const signed = await signPrivatePaths(privatePaths, options.asAdmin)

  const photosByEntry = new Map<string, JournalPhoto[]>()
  for (const row of photos) {
    const parent = entries.find((entry) => entry.id === row.entry_id)
    if (!parent) continue

    let url: string
    let thumbUrl: string

    if (parent.visibility === 'public') {
      url = supabase
        ? supabase.storage.from(STORAGE_BUCKETS.journalPhotos).getPublicUrl(row.storage_path).data
            .publicUrl
        : ''
      thumbUrl = row.thumb_path
        ? (supabase?.storage.from(STORAGE_BUCKETS.journalPhotos).getPublicUrl(row.thumb_path).data
            .publicUrl ?? url)
        : url
    } else {
      url = signed[row.storage_path] ?? ''
      thumbUrl = (row.thumb_path ? signed[row.thumb_path] : undefined) ?? url
    }

    const list = photosByEntry.get(row.entry_id) ?? []
    list.push(rowToJournalPhoto(row, { url, thumbUrl }))
    photosByEntry.set(row.entry_id, list)
  }

  return sortEntries(
    entries.map((row) =>
      rowToJournalEntry(
        row,
        (photosByEntry.get(row.id) ?? []).sort((a, b) => a.sort - b.sort),
        { isLocked: false },
      ),
    ),
  )
}

/**
 * 前台手帐列表。
 * 公开的手帐人人可见；站长登录后顺带把自己的私密手帐也拿出来（RLS 放行）。
 * 口令手帐**不会**出现在这里 —— 它们走 loadLockedEntries()。
 */
export async function loadJournalEntries(
  options: { includePassword?: boolean } = {},
): Promise<JournalEntry[]> {
  const supabase = createSupabaseServerClient()
  if (!supabase) return []

  try {
    let query = supabase
      .from('diaries')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('sort', { ascending: true })
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200)

    // 前台不展示口令手帐（它们走 loadLockedEntries），后台要全都能看到
    if (!options.includePassword) {
      query = query.neq('visibility', 'password')
    }

    const { data: entries, error } = await query

    if (error) {
      console.warn('[journal] 读取手帐失败：', error.message)
      return []
    }
    if (!entries || entries.length === 0) return []

    const { data: photos } = await supabase
      .from('journal_photos')
      .select('*')
      .in(
        'entry_id',
        entries.map((entry) => entry.id),
      )
      .order('sort', { ascending: true })

    return await buildEntries(entries, photos ?? [], { asAdmin: true })
  } catch (error) {
    console.warn('[journal] 读取手帐异常：', error)
    return []
  }
}

/** 把 jsonb 里的一项规整成对象；不是对象就返回 null */
function asRecord(value: Json | undefined): Record<string, Json | undefined> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, Json | undefined>
}

function readString(source: Record<string, Json | undefined>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value : ''
}

function readStringOrNull(source: Record<string, Json | undefined>, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readStringArray(source: Record<string, Json | undefined>, key: string): string[] {
  const value = source[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/** 口令手帐的清单：只有标题和日期，没有正文、没有照片 */
export async function loadLockedEntries(): Promise<LockedJournalEntry[]> {
  const supabase = createSupabaseServerClient()
  if (!supabase) return []

  try {
    const { data, error } = await supabase.rpc('journal_locked_entries')
    if (error) {
      console.warn('[journal] 读取上锁清单失败：', error.message)
      return []
    }
    if (!Array.isArray(data)) return []

    return data
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, Json | undefined> => item !== null)
      .map((item) => ({
        id: readString(item, 'id'),
        title: readString(item, 'title') || '没有标题',
        mood: readStringOrNull(item, 'mood'),
        weather: readStringOrNull(item, 'weather'),
        tags: readStringArray(item, 'tags'),
        createdAt: readString(item, 'created_at'),
        publishedAt: readStringOrNull(item, 'published_at'),
      }))
      .filter((item) => item.id.length > 0)
  } catch (error) {
    console.warn('[journal] 读取上锁清单异常：', error)
    return []
  }
}

/**
 * 按 id 取一条手帐（含照片）。
 * `withServiceRole` 只在「口令校验通过」之后才该传 true ——
 * 那是唯一需要绕过 RLS 的场景。
 */
export async function loadJournalEntryById(
  id: string,
  withServiceRole = false,
): Promise<JournalEntry | null> {
  const client = withServiceRole ? getSupabaseAdminClient() : createSupabaseServerClient()
  if (!client) return null

  try {
    const { data: entry, error } = await client.from('diaries').select('*').eq('id', id).maybeSingle()
    if (error) {
      console.warn('[journal] 读取单条手帐失败：', error.message)
      return null
    }
    if (!entry) return null

    const { data: photos } = await client
      .from('journal_photos')
      .select('*')
      .eq('entry_id', id)
      .order('sort', { ascending: true })

    const rows = photos ?? []

    // 私有桶：withServiceRole 时直接用超级权限签
    const signed =
      entry.visibility === 'public'
        ? {}
        : Object.fromEntries(
            (
              await (async () => {
                const target = withServiceRole ? getSupabaseAdminClient() : client
                if (!target) return []
                const paths = rows
                  .flatMap((row) => [row.storage_path, row.thumb_path])
                  .filter(Boolean) as string[]
                if (paths.length === 0) return []
                const { data } = await target.storage
                  .from(STORAGE_BUCKETS.privateJournalPhotos)
                  .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
                return (data ?? []).map((item) => [item.path, item.signedUrl] as const)
              })()
            ).filter((pair): pair is readonly [string, string] => Boolean(pair[1])),
          )

    const mapped = rows.map((row) => {
      if (entry.visibility === 'public') {
        const url = client.storage
          .from(STORAGE_BUCKETS.journalPhotos)
          .getPublicUrl(row.storage_path).data.publicUrl
        const thumbUrl = row.thumb_path
          ? client.storage.from(STORAGE_BUCKETS.journalPhotos).getPublicUrl(row.thumb_path).data
              .publicUrl
          : url
        return rowToJournalPhoto(row, { url, thumbUrl })
      }
      const url = signed[row.storage_path] ?? ''
      return rowToJournalPhoto(row, {
        url,
        thumbUrl: (row.thumb_path ? signed[row.thumb_path] : undefined) ?? url,
      })
    })

    return rowToJournalEntry(entry, mapped.sort((a, b) => a.sort - b.sort), { isLocked: false })
  } catch (error) {
    console.warn('[journal] 读取单条手帐异常：', error)
    return null
  }
}
