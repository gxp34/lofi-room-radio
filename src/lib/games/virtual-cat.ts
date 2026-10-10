'use client'

import type { CatPose } from '@/lib/cat'

/**
 * 电子猫的纯逻辑。
 *
 * 这是一只**独立**的猫：不读房间的状态、不读成就、不读手帐和音乐。
 * 它只有自己那几个数字，和一台掌机里的时间。
 * （姿势的**图画**复用了房间猫的 SVG —— 那只是复用素材，不是共享状态。）
 *
 * 核心是三件事：
 *   1. **随时间衰减** —— 不回来看它，饱食度和心情都会掉
 *   2. **互动有冷却** —— 不然会变成连点按钮刷数值
 *   3. **到访有连续性** —— 连续几天来看它，经验拿得更多
 *
 * 所有函数都是纯的：给一份状态和一个时间，结果确定。
 */

export const MAX_LEVEL = 10

/** 一次离线最多按多久结算衰减 —— 出差一个月回来不至于看到一具尸体 */
export const MAX_DECAY_HOURS = 72

export interface VirtualCatState {
  /** 饱食度 0–100 */
  fullness: number
  /** 心情 0–100 */
  mood: number
  /** 亲密度 0–100（只涨不掉） */
  affinity: number
  /** 累计经验 */
  exp: number
  /** 上次结算衰减的时间（ISO） */
  lastTickAt: string
  /** 来过的日期（本地 YYYY-MM-DD，去重） */
  visitDays: string[]
  /** 连续到访天数 */
  streak: number
  /** 每个动作上次做的时间（ISO） */
  lastAction: Partial<Record<CatActionId, string>>
  /** 累计互动次数 */
  totalActions: number
  /** 睡着的起始时间；null = 醒着 */
  sleepingSince: string | null
}

export function createInitialCat(now = new Date()): VirtualCatState {
  return {
    fullness: 70,
    mood: 70,
    affinity: 0,
    exp: 0,
    lastTickAt: now.toISOString(),
    visitDays: [localDateKey(now)],
    streak: 1,
    lastAction: {},
    totalActions: 0,
    sleepingSince: null,
  }
}

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))

/** 本地日期键。用本地时间而不是 UTC —— "今天"是玩家那边的一天 */
export function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function hoursBetween(fromIso: string, to: Date): number {
  const from = Date.parse(fromIso)
  if (Number.isNaN(from)) return 0
  return Math.max(0, (to.getTime() - from) / 3_600_000)
}

/* --------------------------------------------------------------------------
   等级
   -------------------------------------------------------------------------- */

/** 从 level 升到 level+1 需要多少经验 */
export function expForLevel(level: number): number {
  return 60 + (level - 1) * 40
}

/** 累计经验 → 等级（1–MAX_LEVEL） */
export function levelFromExp(exp: number): number {
  let level = 1
  let remaining = exp
  while (level < MAX_LEVEL && remaining >= expForLevel(level)) {
    remaining -= expForLevel(level)
    level += 1
  }
  return level
}

/** 当前等级里的进度，给经验条用 */
export function levelProgress(exp: number): { level: number; current: number; need: number } {
  const level = levelFromExp(exp)
  let remaining = exp
  for (let i = 1; i < level; i++) remaining -= expForLevel(i)

  if (level >= MAX_LEVEL) return { level, current: remaining, need: remaining }
  return { level, current: remaining, need: expForLevel(level) }
}

/* --------------------------------------------------------------------------
   衰减
   -------------------------------------------------------------------------- */

/** 每个小时掉多少（和 0011 迁移里写的 config 对齐） */
const DECAY_PER_HOUR = { fullness: 4, mood: 3 }

/**
 * 按离线时间结算一次。
 *
 * 睡着的时候掉得慢一半，而且心情会回一点 —— 睡觉是有意义的，
 * 不只是把按钮按一遍。
 */
export function applyDecay(state: VirtualCatState, now = new Date()): VirtualCatState {
  const hours = Math.min(hoursBetween(state.lastTickAt, now), MAX_DECAY_HOURS)
  if (hours <= 0) return state

  const sleeping = state.sleepingSince !== null
  const rate = sleeping ? 0.5 : 1

  return {
    ...state,
    fullness: clamp(state.fullness - DECAY_PER_HOUR.fullness * hours * rate),
    mood: clamp(
      sleeping
        ? state.mood + 2 * hours // 睡着的在回心情
        : state.mood - DECAY_PER_HOUR.mood * hours * rate,
    ),
    lastTickAt: now.toISOString(),
  }
}

/* --------------------------------------------------------------------------
   到访
   -------------------------------------------------------------------------- */

/**
 * 记一次到访。
 * 今天已经记过就不动；昨天来过 → 连续 +1；断了 → 从 1 重新数。
 */
export function noteVisit(state: VirtualCatState, now = new Date()): VirtualCatState {
  const today = localDateKey(now)
  if (state.visitDays.includes(today)) return state

  const yesterday = localDateKey(new Date(now.getTime() - 86_400_000))
  const continued = state.visitDays.includes(yesterday)

  return {
    ...state,
    visitDays: [...state.visitDays, today].slice(-60),
    streak: continued ? state.streak + 1 : 1,
  }
}

/* --------------------------------------------------------------------------
   动作
   -------------------------------------------------------------------------- */

export type CatActionId = 'feed' | 'pet' | 'play' | 'sleep'

export interface CatAction {
  id: CatActionId
  label: string
  hint: string
  /** 冷却（分钟）；0 = 不限 */
  cooldownMinutes: number
  /** 图标名（lucide） */
  icon: string
  /** 效果 */
  fullness?: number
  mood?: number
  affinity?: number
  exp?: number
}

export const CAT_ACTIONS: CatAction[] = [
  {
    id: 'feed',
    label: '喂食',
    hint: '碗是空的它不会说，但会一直看着你。',
    cooldownMinutes: 25,
    icon: 'BowlFood',
    fullness: 26,
    mood: 3,
    exp: 8,
  },
  {
    id: 'pet',
    label: '抚摸',
    hint: '摸下巴。别摸尾巴，会被打。',
    cooldownMinutes: 4,
    icon: 'Hand',
    mood: 13,
    affinity: 4,
    exp: 6,
  },
  {
    id: 'play',
    label: '玩耍',
    hint: '逗猫棒。它会假装不在意三秒钟。',
    cooldownMinutes: 30,
    icon: 'Sparkles',
    mood: 18,
    fullness: -9,
    affinity: 6,
    exp: 13,
  },
  {
    id: 'sleep',
    label: '睡觉',
    hint: '睡着的猫掉状态慢一半，心情还会回。',
    cooldownMinutes: 0,
    icon: 'Moon',
    mood: 4,
    exp: 6,
  },
]

export function getAction(id: CatActionId): CatAction {
  const found = CAT_ACTIONS.find((action) => action.id === id)
  if (!found) throw new Error(`未知动作：${id}`)
  return found
}

/** 冷却还剩多少毫秒（0 = 可以用了） */
export function cooldownLeft(
  state: VirtualCatState,
  id: CatActionId,
  now = new Date(),
): number {
  const action = getAction(id)
  if (action.cooldownMinutes <= 0) return 0

  const last = state.lastAction[id]
  if (!last) return 0

  const elapsed = now.getTime() - Date.parse(last)
  if (Number.isNaN(elapsed)) return 0

  const total = action.cooldownMinutes * 60_000
  return Math.max(0, total - elapsed)
}

/** 现在能不能做这个动作 */
export function canDoAction(
  state: VirtualCatState,
  id: CatActionId,
  now = new Date(),
): boolean {
  if (id === 'sleep') return true // 睡觉/叫醒随时可以
  return cooldownLeft(state, id, now) === 0
}

/**
 * 做一个动作。
 *
 * 睡觉是个开关：醒着点一下去睡，睡着点一下叫醒。
 * 睡满 20 分钟再叫醒才有额外奖励 —— 不然"睡觉"会变成刷经验最快的按钮。
 */
export const SLEEP_BONUS_MINUTES = 20

export function doAction(
  state: VirtualCatState,
  id: CatActionId,
  now = new Date(),
): { next: VirtualCatState; message: string } {
  const action = getAction(id)
  const stamp = now.toISOString()

  if (!canDoAction(state, id, now)) {
    return { next: state, message: `${action.label}还要再等一会儿。` }
  }

  // ---- 睡觉 / 叫醒 ----
  if (id === 'sleep') {
    if (state.sleepingSince === null) {
      return {
        next: {
          ...state,
          sleepingSince: stamp,
          mood: clamp(state.mood + (action.mood ?? 0)),
          exp: state.exp + (action.exp ?? 0),
          lastAction: { ...state.lastAction, sleep: stamp },
          totalActions: state.totalActions + 1,
        },
        message: '它蜷起来了。呼噜声很轻。',
      }
    }

    const sleptMinutes = (now.getTime() - Date.parse(state.sleepingSince)) / 60_000
    const rested = sleptMinutes >= SLEEP_BONUS_MINUTES

    return {
      next: {
        ...state,
        sleepingSince: null,
        mood: clamp(state.mood + (rested ? 14 : 4)),
        fullness: clamp(state.fullness - (rested ? 6 : 2)),
        exp: state.exp + (rested ? 16 : 6),
        lastAction: { ...state.lastAction, sleep: stamp },
        totalActions: state.totalActions + 1,
      },
      message: rested ? '睡饱了。它伸了个懒腰，过来蹭你的手。' : '它被吵醒了，有点不高兴。',
    }
  }

  // ---- 其它三个 ----
  return {
    next: {
      ...state,
      fullness: clamp(state.fullness + (action.fullness ?? 0)),
      mood: clamp(state.mood + (action.mood ?? 0)),
      affinity: clamp(state.affinity + (action.affinity ?? 0)),
      exp: state.exp + (action.exp ?? 0),
      lastAction: { ...state.lastAction, [id]: stamp },
      totalActions: state.totalActions + 1,
    },
    message: ACTION_MESSAGES[id],
  }
}

const ACTION_MESSAGES: Record<Exclude<CatActionId, 'sleep'>, string> = {
  feed: '它把头埋进碗里。吃完了抬头看你一眼。',
  pet: '它眯起眼睛，喉咙里开始震动。',
  play: '它扑了一下，然后假装什么都没发生。',
}

/* --------------------------------------------------------------------------
   解锁：姿势 / 台词
   -------------------------------------------------------------------------- */

/** 亲密度门槛 → 解锁的姿势 */
export const POSE_UNLOCKS: Array<{ affinity: number; pose: CatPose; label: string }> = [
  { affinity: 30, pose: 'alert', label: '竖着耳朵' },
  { affinity: 60, pose: 'bellyUp', label: '翻肚皮' },
  { affinity: 100, pose: 'withKey', label: '叼来一把小钥匙' },
]

/** 已经解锁的姿势 */
export function unlockedPoses(state: VirtualCatState): CatPose[] {
  const poses: CatPose[] = ['sitting', 'curled', 'stretch', 'glowing']
  for (const unlock of POSE_UNLOCKS) {
    if (state.affinity >= unlock.affinity) poses.push(unlock.pose)
  }
  return poses
}

export interface CatPoseChoice {
  pose: CatPose
  reason: string
}

/**
 * 现在该画哪个姿势。优先级从高到低。
 *
 * 「亲密度满 → 叼钥匙」故意压过深夜的蜷睡：
 * 那是养到最后的标志，被"现在是凌晨"盖掉就永远看不见了。
 * 反过来「心情很低 → 只剩两只眼睛」排在最前面：玩家要**看得见**自己冷落了它。
 */
export function pickVirtualCatPose(state: VirtualCatState, now = new Date()): CatPoseChoice {
  const asleep = state.sleepingSince !== null

  // 睡姿本身就是一种解锁：亲密度够了才肯翻肚皮睡
  if (asleep) {
    return state.affinity >= 60
      ? { pose: 'bellyUp', reason: '睡熟了，肚皮朝上' }
      : { pose: 'curled', reason: '蜷着睡了' }
  }

  if (state.mood < 20) {
    return { pose: 'glowing', reason: '闹脾气，躲在暗处只看得见眼睛' }
  }

  if (state.affinity >= 100) {
    return { pose: 'withKey', reason: '它把藏起来的小钥匙叼来了' }
  }

  if (state.affinity >= 60) {
    return { pose: 'bellyUp', reason: '它在你面前翻了个身' }
  }

  const hour = now.getHours()
  if (hour >= 0 && hour < 5) {
    return { pose: 'curled', reason: '凌晨了，它撑不住' }
  }

  if (state.affinity >= 30) {
    return { pose: 'alert', reason: '听见你来了，耳朵先竖起来' }
  }

  if (state.mood >= 75) {
    return { pose: 'stretch', reason: '心情不错，伸个懒腰' }
  }

  return { pose: 'sitting', reason: '它就坐在那儿看你' }
}

export interface CatLine {
  id: string
  text: string
  /** 满足条件的才会被抽到 */
  when: (state: VirtualCatState, level: number) => boolean
}

/**
 * 台词池。
 *
 * 顺序就是优先级：饿 / 不高兴的排在前面 —— 它得先表达需求，
 * 玩家才知道该按哪个按钮。养到后面才轮到"关系好"的那些话。
 */
export const CAT_LINES: CatLine[] = [
  {
    id: 'hungry',
    text: '（它盯着空碗看了很久，然后看你一眼。）',
    when: (state) => state.fullness < 30,
  },
  {
    id: 'sulky',
    text: '（它背对着你坐着，尾巴尖一动一动。）',
    when: (state) => state.mood < 30,
  },
  {
    id: 'sleepy',
    text: '（它在打哈欠，一下接一下。）',
    when: (state) => state.fullness >= 30 && state.mood < 55,
  },
  {
    id: 'full',
    text: '（吃太饱了，它翻了个身，摊成一张饼。）',
    when: (state) => state.fullness > 90,
  },
  {
    id: 'bond1',
    text: '（你坐下的时候，它自己走过来，坐在你腿边。）',
    when: (state) => state.affinity >= 30,
  },
  {
    id: 'bond2',
    text: '（它把下巴搁在你手背上，闭上眼。）',
    when: (state) => state.affinity >= 60,
  },
  {
    id: 'bond3',
    text: '（它把一样东西放在你脚边，然后退开两步看你。）',
    when: (state) => state.affinity >= 100,
  },
  {
    id: 'streak',
    text: '（你连着来了几天，它好像记住时间了。）',
    when: (state) => state.streak >= 3,
  },
  {
    id: 'level',
    text: '（它比刚来的时候大了一圈。也可能只是毛蓬了。）',
    when: (_state, level) => level >= 5,
  },
  {
    id: 'idle1',
    text: '（房间里只有雨声。它睡在你旁边。）',
    when: () => true,
  },
  {
    id: 'idle2',
    text: '（它舔了舔爪子，当作刚才什么都没发生。）',
    when: () => true,
  },
]

/** 按优先级抽一句（前面满足条件的里随机挑一条） */
export function pickCatLine(
  state: VirtualCatState,
  random: () => number = Math.random,
): CatLine {
  const level = levelFromExp(state.exp)
  const eligible = CAT_LINES.filter((line) => line.when(state, level))
  const pool = eligible.length > 0 ? eligible : CAT_LINES.slice(-1)
  return pool[Math.floor(random() * pool.length)] ?? CAT_LINES[CAT_LINES.length - 1]
}

/* --------------------------------------------------------------------------
   汇总（界面上一眼能看懂的几句）
   -------------------------------------------------------------------------- */

export function catStatusLabel(state: VirtualCatState, now = new Date()): string {
  if (state.sleepingSince !== null) return '睡着了'
  if (state.fullness < 25) return '饿了'
  if (state.mood < 25) return '不高兴'
  if (state.affinity >= 100) return '黏着你'
  if (state.mood > 80) return '精神很好'
  return '在发呆'
}

/** 连续访问的成长奖励：每天第一次进来给一点经验 */
export function visitBonus(state: VirtualCatState, now = new Date()): { next: VirtualCatState; gained: number } {
  const visited = noteVisit(state, now)
  if (visited === state) return { next: state, gained: 0 }

  // 来得越连续给得越多，封顶 20
  const gained = Math.min(6 + visited.streak * 2, 20)
  return { next: { ...visited, exp: visited.exp + gained }, gained }
}
