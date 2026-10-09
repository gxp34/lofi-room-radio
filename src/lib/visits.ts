import { STORAGE_KEYS } from '@/lib/constants'
import { readJSON, writeJSON } from '@/lib/storage'
import type { VisitRecord } from '@/types'
import { dayStamp, daysBetween } from '@/lib/utils'

/**
 * 访问记录。
 * 用来支撑「常客」「连续三天来看猫」这类事件与成就。
 */

const EMPTY: VisitRecord = {
  days: [],
  visits: 0,
  firstSeen: '',
  lastSeen: '',
}

/** 读取访问记录（容错：脏数据会被规整成合法结构） */
export function readVisits(): VisitRecord {
  const raw = readJSON<Partial<VisitRecord>>(STORAGE_KEYS.visits, {})
  return {
    days: Array.isArray(raw.days) ? raw.days.filter((d) => typeof d === 'string') : [],
    visits: typeof raw.visits === 'number' && raw.visits >= 0 ? raw.visits : 0,
    firstSeen: typeof raw.firstSeen === 'string' ? raw.firstSeen : '',
    lastSeen: typeof raw.lastSeen === 'string' ? raw.lastSeen : '',
  }
}

/**
 * 记一次访问：把今天加进 days（去重），visits +1。
 * 返回更新后的记录。
 */
export function touchVisit(now: Date = new Date()): VisitRecord {
  const current = readVisits()
  const today = dayStamp(now)
  const iso = now.toISOString()

  const days = current.days.includes(today) ? current.days : [...current.days, today].slice(-400)

  const next: VisitRecord = {
    days,
    visits: current.visits + 1,
    firstSeen: current.firstSeen || iso,
    lastSeen: iso,
  }

  writeJSON(STORAGE_KEYS.visits, next)
  return next
}

/**
 * 连续访问天数：从今天（或昨天）往前数，断掉就停。
 *
 * 为什么允许从昨天起算：如果访客是前天来、昨天来，今天还没来，
 * 那他的「连续」不应该因为今天没打卡就归零 —— 事件判定用的是他来的时候的状态。
 */
export function consecutiveDays(days: string[], now: Date = new Date()): number {
  if (days.length === 0) return 0

  const unique = Array.from(new Set(days)).sort()
  const today = dayStamp(now)
  const last = unique[unique.length - 1]
  if (!last) return 0

  const gap = daysBetween(last, today)
  if (gap > 1) return 0 // 上次来已经是两天前，连续记录断了

  let streak = 1
  for (let i = unique.length - 1; i > 0; i--) {
    const currentDay = unique[i]
    const previousDay = unique[i - 1]
    if (!currentDay || !previousDay) break
    if (daysBetween(previousDay, currentDay) === 1) streak++
    else break
  }
  return streak
}

/**
 * 相邻两次访问是不是同一天。
 * 用来做「今天第一次进房间」的判断（比如只在那时说一次欢迎）。
 */
export function isSameDay(a: string, b: string): boolean {
  if (!a || !b) return false
  return a.slice(0, 10) === b.slice(0, 10)
}

export { EMPTY as EMPTY_VISITS }
