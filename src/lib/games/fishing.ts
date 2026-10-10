'use client'

/**
 * 钓鱼的纯逻辑。
 *
 * 一竿分成四拍，每一拍都有自己的判定：
 *
 *   抛竿 → 等鱼影（随机 1.2–6 秒）→ **咬钩**（一个很短的反应窗口，点早了惊鱼、
 *   点晚了鱼走）→ **提竿**（一条来回扫的力度条，要在绿区里停住，停偏了跑鱼）
 *
 * 做成两拍而不是一拍：只有"力度条"的话就变成纯手速游戏；
 * 只有"咬钩"的话又太靠反应。两拍叠起来才有钓鱼那种"等 + 抓"的节奏。
 *
 * 这里的函数都是纯的：给一份状态和随机数，答案确定，方便单测。
 */

export type FishRarity = 'common' | 'uncommon' | 'rare' | 'legendary'

export const RARITY_LABEL: Record<FishRarity, string> = {
  common: '常见',
  uncommon: '少见',
  rare: '稀有',
  legendary: '传说',
}

/** 稀有度从低到高，用来判断"这条是不是新纪录" */
export const RARITY_ORDER: FishRarity[] = ['common', 'uncommon', 'rare', 'legendary']

export interface FishSpecies {
  id: string
  name: string
  emoji: string
  rarity: FishRarity
  /** 基础权重（下雨 / 时段会在它上面乘系数） */
  weight: number
  /**
   * 提竿判定窗口，占力度条的比例（0–1）。
   * 越稀有的鱼窗口越窄 —— 这是"稀有"唯一的手感来源，
   * 不能只靠抽卡概率，不然稀有鱼和常见鱼玩起来一模一样。
   */
  tolerance: number
  /** 咬钩前的等待范围（毫秒） */
  biteDelay: [number, number]
  /** 力度条上标记的扫描速度（每秒来回几趟） */
  sweepSpeed: number
  /** 只在这个时段（0:00–5:00）出现 */
  deepNightOnly?: boolean
  /** 下雨时权重翻倍 */
  likesRain?: boolean
  /** 图鉴里的说明 */
  note: string
}

/**
 * 六种渔获。
 *
 * 「小鱼干」和「猫罐头」严格说不是钓上来的东西，但这是房间里的池塘 ——
 * 钓上一罐猫罐头比钓上一条更合这个地方的性子。
 * 旧靴子承担"空竿但不至于一无所获"的角色。
 */
export const FISH_SPECIES: FishSpecies[] = [
  {
    id: 'small-fish',
    name: '小鱼干',
    emoji: '🐟',
    rarity: 'common',
    weight: 30,
    tolerance: 0.30,
    biteDelay: [1200, 3200],
    sweepSpeed: 0.75,
    note: '晒干了能放很久。包里总是有一把。',
  },
  {
    id: 'crucian',
    name: '鲫鱼',
    emoji: '🐠',
    rarity: 'common',
    weight: 26,
    tolerance: 0.26,
    biteDelay: [1500, 3800],
    sweepSpeed: 0.85,
    likesRain: true,
    note: '下雨天最活跃。汤是奶白色的。',
  },
  {
    id: 'boot',
    name: '旧靴子',
    emoji: '🥾',
    rarity: 'common',
    weight: 18,
    tolerance: 0.34,
    biteDelay: [1800, 4200],
    sweepSpeed: 0.65,
    note: '左脚的。右脚那只不知道去哪了。',
  },
  {
    id: 'canned',
    name: '猫罐头',
    emoji: '🥫',
    rarity: 'uncommon',
    weight: 12,
    tolerance: 0.22,
    biteDelay: [2000, 4600],
    sweepSpeed: 1.0,
    note: '还没过期，标签写着「金枪鱼味」。谁扔的？',
  },
  {
    id: 'koi',
    name: '锦鲤',
    emoji: '🎏',
    rarity: 'rare',
    weight: 6,
    tolerance: 0.15,
    biteDelay: [2600, 5200],
    sweepSpeed: 1.2,
    likesRain: true,
    note: '池塘里最贵的一条。它自己知道。',
  },
  {
    id: 'starfish',
    name: '星光鱼',
    emoji: '✨',
    rarity: 'legendary',
    weight: 2,
    tolerance: 0.09,
    biteDelay: [3200, 6000],
    sweepSpeed: 1.45,
    deepNightOnly: true,
    note: '只在凌晨出现。捞上来的时候，鳞还在发光。',
  },
]

/**
 * 雨势。
 *
 * 四档，包含 'none'（雨停了）——房间那边接上实时天气之后，
 * 晴天真的会让雨停，钓鱼也就跟着变成"不下雨的池塘"。
 * 拿不到天气时房间会退回 'normal'，所以这个站默认的样子还是雨夜。
 */
export type FishingRain = 'none' | 'light' | 'normal' | 'heavy'

/** 时间 / 天气对权重的影响，写在图鉴里给玩家看 */
export interface FishingConditions {
  rain: FishingRain
  /** 现在是不是凌晨 0–5 点 */
  deepNight: boolean
}

/** 这个时刻能钓到哪些鱼、各自多大概率 */
export function availableFish(
  conditions: FishingConditions,
  species: FishSpecies[] = FISH_SPECIES,
): Array<{ fish: FishSpecies; weight: number }> {
  const rows: Array<{ fish: FishSpecies; weight: number }> = []

  // 雨越大，喜欢雨的越活跃、其它的越难开口；雨停了就反过来
  const boost =
    conditions.rain === 'heavy'
      ? 3
      : conditions.rain === 'light'
        ? 1.4
        : conditions.rain === 'normal'
          ? 1
          : 0.7
  const damp =
    conditions.rain === 'heavy'
      ? 0.6
      : conditions.rain === 'light'
        ? 0.85
        : conditions.rain === 'normal'
          ? 1
          : 1.15

  for (const fish of species) {
    // 星光鱼只在凌晨；别的鱼全天都有
    if (fish.deepNightOnly && !conditions.deepNight) continue

    let weight = fish.weight * (fish.likesRain ? boost : damp)

    // 凌晨：常见鱼少一些，稀有的相对更容易碰上
    if (conditions.deepNight) {
      weight *= fish.rarity === 'common' ? 0.7 : 1.6
    }

    if (weight > 0) rows.push({ fish, weight })
  }

  // 极端情况（理论上不会发生）：至少有旧靴子兜底
  if (rows.length === 0) {
    const boot = FISH_SPECIES.find((fish) => fish.id === 'boot')
    if (boot) rows.push({ fish: boot, weight: 1 })
  }

  return rows
}

/** 按权重抽一条 */
export function rollFish(
  conditions: FishingConditions,
  random: () => number = Math.random,
): FishSpecies {
  const rows = availableFish(conditions)
  const total = rows.reduce((sum, row) => sum + row.weight, 0)
  let point = random() * total

  for (const row of rows) {
    point -= row.weight
    if (point <= 0) return row.fish
  }

  return rows[rows.length - 1].fish
}

/** 咬钩前等多久 */
export function rollBiteDelay(fish: FishSpecies, random: () => number = Math.random): number {
  const [min, max] = fish.biteDelay
  return Math.round(min + random() * (max - min))
}

/** 反应窗口：咬钩之后多久之内必须提竿（毫秒） */
export function biteWindow(fish: FishSpecies): number {
  // 常见鱼给得宽松，稀有的要快
  switch (fish.rarity) {
    case 'legendary':
      return 900
    case 'rare':
      return 1150
    case 'uncommon':
      return 1400
    default:
      return 1700
  }
}

/** 绿区的中心（0–1），每次随机，别让人记位置 */
export function rollTargetCenter(random: () => number = Math.random): number {
  // 留在 0.22–0.78 之间，两边要留出"跑鱼"的余地
  return 0.22 + random() * 0.56
}

/** 标记当前在不在绿区里 */
export function isInTarget(value: number, center: number, tolerance: number): boolean {
  return Math.abs(value - center) <= tolerance / 2
}

/* --------------------------------------------------------------------------
   存档
   -------------------------------------------------------------------------- */

export interface FishingSave {
  /** 图鉴：id → 钓到过几次 + 第一次的时间 */
  caught: Record<string, { count: number; firstAt: string }>
  /** 一共抛了几竿 */
  casts: number
  /** 跑掉几条 */
  escapes: number
  /** 钓到过最稀有的那条（用来当"最佳记录"） */
  record: string | null
}

export const EMPTY_FISHING_SAVE: FishingSave = {
  caught: {},
  casts: 0,
  escapes: 0,
  record: null,
}

/** 记一条渔获，返回新存档 */
export function noteCatch(save: FishingSave, fish: FishSpecies, at = new Date()): FishingSave {
  const previous = save.caught[fish.id]
  const caught = {
    ...save.caught,
    [fish.id]: {
      count: (previous?.count ?? 0) + 1,
      firstAt: previous?.firstAt ?? at.toISOString(),
    },
  }

  // 新纪录：稀有度更高才换
  const currentRecord = save.record ? FISH_SPECIES.find((item) => item.id === save.record) : undefined
  const better =
    !currentRecord ||
    RARITY_ORDER.indexOf(fish.rarity) > RARITY_ORDER.indexOf(currentRecord.rarity)

  return { ...save, caught, record: better ? fish.id : save.record }
}

/** 空竿 / 跑鱼 */
export function noteEscape(save: FishingSave): FishingSave {
  return { ...save, escapes: save.escapes + 1 }
}

/** 图鉴进度 */
export function collectionProgress(save: FishingSave): { done: number; total: number } {
  return { done: Object.keys(save.caught).length, total: FISH_SPECIES.length }
}
