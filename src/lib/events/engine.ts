import { DEEP_NIGHT_RANGE } from '@/lib/constants'
import { isDeepNight, weightedPick } from '@/lib/utils'
import type { EventContext, EventResolution, Rarity, RoomEvent } from '@/types'

import { DEFAULT_EVENT_POOL } from './pool'

/**
 * 事件引擎（纯函数，不碰 React、不碰 localStorage）。
 *
 * 职责很单一：给我「谁被点了、怎么点的、现在什么状态」，
 * 我告诉你「这次该说哪句话、要不要做点什么」。
 * 状态的读写交给 store，这样引擎可以被单独测试。
 */

/**
 * 概率表：
 *   隐藏 1% ／ 稀有 5% ／ 普通 70% ／ 剩下 24% 什么都不发生。
 * 对点击类触发，落进那 24% 时会兜底成一条普通事件（你点了，房间得回话）；
 * 对随机 / 全局事件，允许真的什么都不发生 —— 安静本身也是氛围。
 */
export const RARITY_CHANCE: Record<Rarity, number> = {
  hidden: 0.01,
  rare: 0.05,
  common: 0.7,
}

/** 稀有度判定顺序：从最罕见往最常见滚 */
const RARITY_ORDER: Rarity[] = ['hidden', 'rare', 'common']

/** 事件运行账本：记录触发过什么、什么时候能再触发 */
export interface EventLedger {
  /** eventKey → 上次触发的时间戳（毫秒） */
  fired: Record<string, number>
  /** eventKey → 冷却结束的时间戳（毫秒） */
  cooldowns: Record<string, number>
}

export interface ResolveOptions {
  /**
   * 允许「什么都不发生」吗？
   * 点击类传 false（保证有反馈），随机 / 全局类传 true。
   */
  allowSilence?: boolean
  /** 自定义事件池（数据库里读到的事件会从这里传进来） */
  pool?: RoomEvent[]
}

/* --------------------------------------------------------------------------
   条件判定
   -------------------------------------------------------------------------- */

/** 这条事件现在能不能触发 */
export function isEventAvailable(
  event: RoomEvent,
  ctx: EventContext,
  ledger: EventLedger,
): boolean {
  if (!event.enabled) return false
  if (event.trigger !== ctx.trigger) return false
  if (event.objectType !== ctx.objectType) return false

  const now = ctx.now ?? new Date()
  const nowMs = now.getTime()

  // 一次性事件：触发过就永远不再出现
  if (event.once && ledger.fired[event.eventKey] !== undefined) return false

  // 冷却中
  const cooldownUntil = ledger.cooldowns[event.eventKey]
  if (typeof cooldownUntil === 'number' && cooldownUntil > nowMs) return false

  // 深夜限定
  if (event.deepNightOnly && !isDeepNight(now)) return false

  // 连续访问天数（字段和 conditions 两种写法都支持）
  const needConsecutive = event.consecutiveDays ?? event.conditions.consecutiveDays
  if (typeof needConsecutive === 'number' && ctx.consecutiveDays < needConsecutive) return false

  const { conditions } = event

  // 连点次数
  if (typeof conditions.combo === 'number' && (ctx.combo ?? 0) < conditions.combo) return false

  // 累计访问天数
  if (typeof conditions.visitedDays === 'number' && ctx.visitedDays < conditions.visitedDays) {
    return false
  }

  // 小时区间（左闭右开）
  if (conditions.hourRange) {
    const [start, end] = conditions.hourRange
    const hour = now.getHours()
    const inRange = start <= end ? hour >= start && hour < end : hour >= start || hour < end
    if (!inRange) return false
  }

  // 台灯状态
  if (conditions.requiresLampOn && ctx.lampOn !== true) return false
  if (conditions.requiresLampOff && ctx.lampOn !== false) return false

  // 某个物件至少被点过多少次
  if (typeof conditions.minClicks === 'number') {
    const clicks = ctx.clickCount[event.objectType] ?? 0
    if (clicks < conditions.minClicks) return false
  }

  // 需要已解锁的成就
  if (conditions.requiresAchievements?.length) {
    const missing = conditions.requiresAchievements.some(
      (key) => !ctx.unlockedAchievements.includes(key),
    )
    if (missing) return false
  }

  // 回头客 / 第一次来
  if (conditions.requiresReturning && ctx.visits <= 1) return false
  if (conditions.firstVisitOnly && ctx.visits > 1) return false

  return true
}

/* --------------------------------------------------------------------------
   抽取
   -------------------------------------------------------------------------- */

function pickFrom(pool: RoomEvent[]): RoomEvent | null {
  return weightedPick(pool.map((event) => ({ ...event, weight: Math.max(event.weight, 0) })))
}

/**
 * 决定这一次触发什么。
 */
export function resolveEvent(
  ctx: EventContext,
  ledger: EventLedger,
  options: ResolveOptions = {},
): EventResolution {
  const { allowSilence = true, pool = DEFAULT_EVENT_POOL } = options

  const candidates = pool.filter((event) => isEventAvailable(event, ctx, ledger))

  if (candidates.length === 0) {
    return { event: null, text: null, action: null, rarity: null, silent: true }
  }

  // 连点类：要求次数最高的优先（点 7 次时应该说跳闸，而不是「别玩开关啦」）
  if (ctx.trigger === 'combo') {
    const sorted = [...candidates].sort(
      (a, b) => (b.conditions.combo ?? 0) - (a.conditions.combo ?? 0),
    )
    const best = sorted[0]
    if (best) {
      return {
        event: best,
        text: best.text,
        action: best.action,
        rarity: best.rarity,
        silent: false,
      }
    }
  }

  // 按稀有度分组
  const byRarity: Record<Rarity, RoomEvent[]> = { common: [], rare: [], hidden: [] }
  for (const event of candidates) {
    byRarity[event.rarity].push(event)
  }

  const roll = Math.random()
  let cumulative = 0

  for (const rarity of RARITY_ORDER) {
    cumulative += RARITY_CHANCE[rarity]
    if (roll < cumulative) {
      const picked = pickFrom(byRarity[rarity])
      if (picked) {
        return {
          event: picked,
          text: picked.text,
          action: picked.action,
          rarity: picked.rarity,
          silent: false,
        }
      }
      // 这一档没有可用事件，继续往下一档滚（不重新掷骰子）
    }
  }

  // 落进「什么都不发生」的 24%
  if (!allowSilence) {
    const fallback = pickFrom(byRarity.common)
    if (fallback) {
      return {
        event: fallback,
        text: fallback.text,
        action: fallback.action,
        rarity: fallback.rarity,
        silent: false,
      }
    }
  }

  return { event: null, text: null, action: null, rarity: null, silent: true }
}

/* --------------------------------------------------------------------------
   账本更新
   -------------------------------------------------------------------------- */

/** 触发之后，把账本推进一格（记录时间 + 计算冷却） */
export function applyEventToLedger(
  ledger: EventLedger,
  event: RoomEvent,
  now: Date = new Date(),
): EventLedger {
  const nowMs = now.getTime()

  const fired = { ...ledger.fired, [event.eventKey]: nowMs }
  const cooldowns = { ...ledger.cooldowns }

  if (event.cooldownSeconds > 0) {
    cooldowns[event.eventKey] = nowMs + event.cooldownSeconds * 1000
  }

  return { fired, cooldowns }
}

/** 冷却中的事件还剩几秒（后台调试 / 提示用） */
export function cooldownRemaining(
  ledger: EventLedger,
  eventKey: string,
  now: Date = new Date(),
): number {
  const until = ledger.cooldowns[eventKey]
  if (!until) return 0
  return Math.max(0, Math.ceil((until - now.getTime()) / 1000))
}

/** 当前是不是深夜时段（房间的很多内容依赖它） */
export function isNightHour(now: Date = new Date()): boolean {
  const [start, end] = DEEP_NIGHT_RANGE
  return now.getHours() >= start && now.getHours() < end
}
