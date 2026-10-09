/**
 * localStorage 的安全封装。
 *
 * 为什么需要它：
 *   1. 服务端渲染时 window 不存在，直接访问会崩；
 *   2. 隐私模式 / 存储写满时 setItem 会抛异常；
 *   3. localStorage 里可能存着上个版本留下的脏数据，JSON.parse 会抛异常。
 * 三种情况统一在这里兜住，返回 fallback，绝不让页面白屏。
 */

export const isBrowser = (): boolean => typeof window !== 'undefined'

/** 读 JSON；任何异常都返回 fallback */
export function readJSON<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 写 JSON；写不进去（隐私模式、配额满）就静默失败 */
export function writeJSON(key: string, value: unknown): boolean {
  if (!isBrowser()) return false
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** 读纯字符串 */
export function readString(key: string, fallback: string | null = null): string | null {
  if (!isBrowser()) return fallback
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

/** 写纯字符串 */
export function writeString(key: string, value: string): boolean {
  if (!isBrowser()) return false
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** 删除一个键 */
export function removeKey(key: string): void {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // 忽略
  }
}

/**
 * 只读一次：用于 Zustand 的 hydration。
 * 服务端返回 fallback，客户端第一次调用返回真实值，之后走缓存。
 */
export function oncePerClient<T>(factory: () => T, fallback: T): () => T {
  let cached: T | null = null
  return () => {
    if (!isBrowser()) return fallback
    if (cached === null) cached = factory()
    return cached
  }
}
