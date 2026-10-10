import { getSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * 服务端缓存：两级。
 *
 *   1. **内存**（每个实例一份）—— 命中就走，最快；
 *      但 Vercel 的 Serverless 实例随时会冷掉，所以它只是快路径。
 *   2. **site_settings**（共享、持久）—— 实例重启之后还在，
 *      多个实例之间也一致。写它需要 service_role（RLS 里 site_settings
 *      只有站长能写，而这里没有用户会话）。
 *
 * 为什么不用 Next 的 `fetch(..., { next: { revalidate } })`：
 *   那样只能缓存 fetch 的原始响应，而我们需要缓存**算完的结果**
 *   （天气还要拼上日出日落和月相），并且要能被后台的「今天这句」覆盖。
 *   自己管缓存更直接。
 *
 * 所有写入失败都静默忽略：缓存写不进去只是慢一点，
 * 绝不能让"缓存坏了"变成"页面打不开"。
 */

interface Envelope<T> {
  value: T
  /** 写入时间（ISO） */
  at: string
}

const memory = new Map<string, Envelope<unknown>>()

/** 从内存里读；过期返回 null */
export function readMemory<T>(key: string, maxAgeMs: number): T | null {
  const hit = memory.get(key)
  if (!hit) return null

  const age = Date.now() - Date.parse(hit.at)
  if (Number.isNaN(age) || age > maxAgeMs) return null

  return hit.value as T
}

export function writeMemory<T>(key: string, value: T): void {
  memory.set(key, { value, at: new Date().toISOString() })
}

/**
 * 从 site_settings 里读一个缓存条目。
 * 没配 Supabase（本地演示模式）时返回 null，调用方自然会去取真数据。
 */
export async function readCachedSetting<T>(key: string, maxAgeMs: number): Promise<T | null> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value, updated_at')
      .eq('key', key)
      .maybeSingle()

    if (error || !data) return null

    const age = Date.now() - Date.parse(data.updated_at)
    if (Number.isNaN(age) || age > maxAgeMs) return null

    // 约定：缓存条目的形状是 { value, at }，这样就算 updated_at 被人动过，
    // 也能用里面的 at 再判一次
    const raw = data.value as unknown
    if (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
      return (raw as unknown as Envelope<T>).value
    }
    return raw as T
  } catch {
    return null
  }
}

/** 写一个缓存条目到 site_settings */
export async function writeCachedSetting<T>(key: string, value: T): Promise<void> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return

  try {
    await supabase.from('site_settings').upsert(
      {
        key,
        value: { value, at: new Date().toISOString() } as never,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
  } catch {
    // 缓存写失败不是错误，下次再写
  }
}

/** 简单地读一个 site_settings 的值（不做时效判断） */
export async function readSetting<T>(key: string): Promise<T | null> {
  const supabase = getSupabaseAdminClient()
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()

    if (error || !data) return null
    return data.value as T
  } catch {
    return null
  }
}

/** 带超时的 fetch：外部服务卡住时不能把整个页面拖死 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' })
  } finally {
    clearTimeout(timer)
  }
}
