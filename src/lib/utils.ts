import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** 合并 Tailwind 类名，后写的覆盖先写的（shadcn/ui 的约定） */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 秒 → 03:24 这样的时长 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '--:--'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 把中文/特殊字符安全地变成存储路径片段（保留扩展名） */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot > -1 ? name.slice(dot).toLowerCase() : ''
  const base = (dot > -1 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  return `${base || 'file'}${ext}`
}

/** 生成 "2024-06-11-a3f9" 这种既按时间排序又不会重名的对象名 */
export function storageObjectName(originalName: string): string {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const rand = Math.random().toString(36).slice(2, 8)
  return `${stamp}-${rand}-${safeFileName(originalName)}`
}

/** 字节数 → 人类可读 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/** 现在是不是深夜（0:00–5:00），房间的很多事件依赖它 */
export function isDeepNight(date: Date = new Date()): boolean {
  const h = date.getHours()
  return h >= 0 && h < 5
}

/** 现在是不是傍晚之后（18:00 以后算「晚上」） */
export function isEvening(date: Date = new Date()): boolean {
  return date.getHours() >= 18 || date.getHours() < 5
}

/** 用当天的日期算一个「今天是第几天」的整数，用来做连续访问判断 */
export function dayStamp(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/** 两个 YYYY-MM-DD 之间差几天 */
export function daysBetween(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00`).getTime()
  const tb = new Date(`${b}T00:00:00`).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY
  return Math.round((tb - ta) / 86400000)
}

/** 从数组里按权重随机取一个元素 */
export function weightedPick<T extends { weight: number }>(items: T[]): T | null {
  const usable = items.filter((i) => i.weight > 0)
  if (usable.length === 0) return null
  const total = usable.reduce((sum, i) => sum + i.weight, 0)
  let r = Math.random() * total
  for (const item of usable) {
    r -= item.weight
    if (r <= 0) return item
  }
  return usable[usable.length - 1] ?? null
}

/** 数组随机洗牌（不改原数组） */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = copy[i]
    const b = copy[j]
    if (a === undefined || b === undefined) continue
    copy[i] = b
    copy[j] = a
  }
  return copy
}

/** 限幅 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 生成一个稳定的会话 id（localStorage 打点用） */
export function createSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** 截断长文本，避免卡片被撑破 */
export function truncate(text: string, max = 80): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
