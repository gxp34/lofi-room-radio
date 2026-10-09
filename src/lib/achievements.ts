import { CAT_PATIENCE_CLICKS, VINYL_TRAVELER_TRACKS } from '@/lib/constants'
import { isDeepNight } from '@/lib/utils'
import type { AchievementDef, EventAction, Rarity, VisitRecord } from '@/types'

/**
 * 成就判定。
 *
 * 设计成**纯函数**：给它一份当前状态，它告诉你「现在满足哪些成就」，
 * 至于哪些已经解锁过、要不要弹提示，交给 store 处理。
 * 这样逻辑可以单独测试，也不会和 React 纠缠。
 */

export interface AchievementContext {
  /** 触发这次判定的事件 key（如果是事件带出来的） */
  eventKey?: string | null
  /** 事件的副作用标识 */
  action?: EventAction | null
  /** 事件稀有度 */
  rarity?: Rarity | null
  /** 事件所属物件 */
  objectType?: string | null
  /** 各物件累计点击次数，例如 { cat: 100 } */
  clickCount: Record<string, number>
  /** 一共听过多少首歌（去重后的数量） */
  tracksPlayed: number
  /** 各小游戏的历史最高分，例如 { '2048': 2096 } */
  bestScores: Record<string, number>
  /** 访问记录 */
  visits: VisitRecord
  /** 连续访问天数 */
  streak: number
  /** 往树洞投过几次 */
  treeholeCount: number
  /** 方便测试的时间覆盖 */
  now?: Date
}

/** 当前满足条件的成就 key 列表（不区分是否已解锁） */
export function evaluateAchievements(ctx: AchievementContext): string[] {
  const now = ctx.now ?? new Date()
  const unlocked: string[] = []

  // 晚安开灯人：第一次拨动台灯开关
  if (ctx.action === 'toggle_lamp' || ctx.action === 'lamp_on' || ctx.action === 'lamp_off') {
    unlocked.push('lamp_keeper')
  }

  // 把心事放进抽屉：投过一次树洞
  if (ctx.treeholeCount >= 1) {
    unlocked.push('drawer_heart')
  }

  // 黑胶旅人：听满 10 首
  if (ctx.tracksPlayed >= VINYL_TRAVELER_TRACKS) {
    unlocked.push('vinyl_traveler')
  }

  // 摸鱼大师：任意小游戏有分数记录
  if (Object.values(ctx.bestScores).some((score) => score > 0)) {
    unlocked.push('slack_master')
  }

  // 常客：累计第 3 天推开这扇门
  if (ctx.visits.days.length >= 3) {
    unlocked.push('regular_guest')
  }

  // 房间的秘密：触发过一次稀有或隐藏事件
  if (ctx.rarity === 'rare' || ctx.rarity === 'hidden') {
    unlocked.push('room_secret')
  }

  // 猫的耐心是有限的：点猫 100 次
  if ((ctx.clickCount.cat ?? 0) >= CAT_PATIENCE_CLICKS) {
    unlocked.push('cat_patience')
  }

  // 夜猫子：深夜来过（0:00–5:00）
  if (isDeepNight(now)) {
    unlocked.push('midnight_owl')
  }

  // 外星电台：听到过那段外星广播
  if (ctx.eventKey === 'record.rare.alien') {
    unlocked.push('alien_radio')
  }

  // 隐藏抽屉的钥匙：连续三天点猫，猫给的
  if (
    ctx.eventKey === 'cat.streak.key' ||
    (ctx.streak >= 3 && (ctx.clickCount.cat ?? 0) >= 3)
  ) {
    unlocked.push('hidden_drawer')
  }

  return Array.from(new Set(unlocked))
}

/** 把成就列表按「已解锁 / 未解锁」分组，未解锁的隐藏成就会被打码 */
export interface AchievementView extends AchievementDef {
  unlocked: boolean
  unlockedAt: string | null
  /** 隐藏成就且未解锁 → 名字和描述都要打码 */
  masked: boolean
}

export function buildAchievementView(
  defs: AchievementDef[],
  unlockedMap: Record<string, string>,
): AchievementView[] {
  return [...defs]
    .sort((a, b) => a.sort - b.sort)
    .map((def) => {
      const unlockedAt = unlockedMap[def.key] ?? null
      const unlocked = Boolean(unlockedAt)
      return {
        ...def,
        unlocked,
        unlockedAt,
        masked: def.secret && !unlocked,
      }
    })
}

/** 进度文案，例如「3 / 10」 */
export function achievementProgress(view: AchievementView[]): { done: number; total: number } {
  return {
    done: view.filter((item) => item.unlocked).length,
    total: view.length,
  }
}
