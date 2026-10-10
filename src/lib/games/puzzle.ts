'use client'

/**
 * 照片拼图的纯逻辑。
 *
 * 为什么是「交换」而不是「华容道那种滑块」：
 *   滑块的每一局都要检查可解性（逆序数），而且最后两格的死局很烦人。
 *   交换式任何排列都是可解的，手机上点两下就能换，不用想"空格在哪"。
 *
 * 不在这儿放任何 React 的东西 —— 打乱、判定、切图坐标都是纯函数，
 * 单独能测，也方便以后换渲染方式。
 */

/** 可选难度 */
export const PUZZLE_SIZES = [4, 5, 8] as const
export type PuzzleSize = (typeof PUZZLE_SIZES)[number]

/** 每个难度一行说明 */
export const PUZZLE_SIZE_LABEL: Record<PuzzleSize, string> = {
  4: '4 × 4 · 16 块 · 先熟悉一下',
  5: '5 × 5 · 25 块 · 要花点时间',
  8: '8 × 8 · 64 块 · 拼完眼睛会酸',
}

export interface PuzzleBest {
  moves: number
  seconds: number
  /** 达成时间（ISO） */
  at: string
}

export interface PuzzleSave {
  /** `${size}` → 最佳记录。按「步数少优先，步数一样比时间」判定更优 */
  best: Record<string, PuzzleBest>
  /** 一共拼成功过几张 */
  solved: number
}

export const EMPTY_PUZZLE_SAVE: PuzzleSave = { best: {}, solved: 0 }

/** 是否比旧记录更好：先看步数，步数一样再看时间 */
export function isBetterPuzzleRun(next: PuzzleBest, previous?: PuzzleBest): boolean {
  if (!previous) return true
  if (next.moves !== previous.moves) return next.moves < previous.moves
  return next.seconds < previous.seconds
}

/** 把通关记录并进存档，返回新存档（不改原对象） */
export function mergePuzzleResult(save: PuzzleSave, size: PuzzleSize, run: PuzzleBest): PuzzleSave {
  const key = String(size)
  const previous = save.best[key]

  return {
    solved: save.solved + 1,
    best: isBetterPuzzleRun(run, previous) ? { ...save.best, [key]: run } : save.best,
  }
}

/* --------------------------------------------------------------------------
   洗牌
   -------------------------------------------------------------------------- */

/** [0, max) 的随机整数；塔罗那边也有一份，但那边要真随机，这边 Math.random 够用 */
function randomInt(max: number): number {
  return Math.floor(Math.random() * max)
}

/**
 * 生成一个打乱后的排列（Fisher–Yates）。
 * `order[i] = k` 表示「第 i 个格子里放的是第 k 块」。
 *
 * 会重摇到「不是已经拼好的状态」为止 —— 4×4 有 16! 种排列，
 * 摇到原样的概率可以忽略，但万一呢。
 */
export function createShuffledOrder(size: number): number[] {
  const total = size * size

  for (let attempt = 0; attempt < 12; attempt++) {
    const order = Array.from({ length: total }, (_, index) => index)
    for (let i = total - 1; i > 0; i--) {
      const j = randomInt(i + 1)
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    if (!isSolved(order)) return order
  }

  // 极端情况：手动破一下，交换前两块
  const fallback = Array.from({ length: total }, (_, index) => index)
  ;[fallback[0], fallback[1]] = [fallback[1], fallback[0]]
  return fallback
}

/** order[i] === i 全成立才算拼好 */
export function isSolved(order: number[]): boolean {
  return order.every((tile, index) => tile === index)
}

/** 交换两个格子里的块，返回新数组 */
export function swapTiles(order: number[], a: number, b: number): number[] {
  if (a === b) return order
  const next = [...order]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

/** 已经归位的块数，用来显示进度 */
export function countPlaced(order: number[]): number {
  return order.reduce((sum, tile, index) => (tile === index ? sum + 1 : sum), 0)
}

/* --------------------------------------------------------------------------
   切图坐标
   -------------------------------------------------------------------------- */

/**
 * 第 index 块在 n×n 网里的 background-position。
 *
 * 做法是把整张图放大到 n 倍铺在棋盘上，每格露出对应的那一块 ——
 * 所以不需要真的把图片切成 n² 个文件，一张原图就够。
 * 用 (n-1) 当分母：background-position 的百分比是
 * 「图片多出来的部分里，取百分之几」，边界正好落在 0% 和 100%。
 */
export function tileBackgroundPosition(tileIndex: number, size: number): string {
  const row = Math.floor(tileIndex / size)
  const col = tileIndex % size
  const denominator = size <= 1 ? 1 : size - 1

  const x = (col / denominator) * 100
  const y = (row / denominator) * 100
  return `${x}% ${y}%`
}

/* --------------------------------------------------------------------------
   计时 / 展示
   -------------------------------------------------------------------------- */

/** 秒 → mm:ss */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/* --------------------------------------------------------------------------
   没有照片时的默认像素图
   -------------------------------------------------------------------------- */

/**
 * 一张 16×16 的像素画：窗、月亮、台灯、猫、地毯。
 *
 * 直接内联成 data URL，不走网络也不进 public/ ——
 * 它只是个兜底，不值得占一个请求。shape-rendering 设成 crispEdges 保住像素感。
 */
const FALLBACK_PIXELS: Array<[number, number, number, number, string]> = [
  // 墙
  [0, 0, 16, 10, '#2f2440'],
  [0, 0, 16, 1, '#3a2f52'],
  // 地板
  [0, 10, 16, 6, '#241d33'],
  [0, 10, 16, 1, '#4a3628'],
  // 窗框
  [1, 2, 6, 6, '#3a2b23'],
  [2, 3, 4, 4, '#0f1520'],
  // 窗里的月亮
  [4, 4, 1, 1, '#f4eee7'],
  // 窗格
  [3, 3, 1, 4, '#3a2b23'],
  [4, 5, 4, 1, '#3a2b23'],
  // 台灯：灯罩 + 光
  [12, 4, 2, 1, '#f7c873'],
  [12, 5, 1, 1, '#e0a03f'],
  [11, 6, 3, 1, '#f7c873'],
  // 桌子
  [9, 8, 7, 1, '#5a4630'],
  [9, 9, 1, 2, '#3a2b23'],
  [15, 9, 1, 2, '#3a2b23'],
  // 桌面上的唱片机
  [10, 7, 2, 1, '#c8a077'],
  // 猫：身子 + 头 + 耳朵 + 尾巴
  [5, 9, 3, 1, '#e0a03f'],
  [5, 8, 1, 1, '#f0b455'],
  [5, 7, 1, 1, '#e0a03f'],
  [7, 7, 1, 1, '#e0a03f'],
  [8, 9, 1, 1, '#e0a03f'],
  // 地毯
  [2, 12, 9, 2, '#3a2b23'],
  [3, 12, 7, 1, '#4a3628'],
  // 星点
  [9, 1, 1, 1, '#f4eee7'],
  [14, 2, 1, 1, '#f4eee7'],
]

const FALLBACK_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">',
  FALLBACK_PIXELS.map(
    ([x, y, w, h, fill]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`,
  ).join(''),
  '</svg>',
].join('')

export const PUZZLE_FALLBACK_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(FALLBACK_SVG)}`

/** 一张可以拿来拼的照片 */
export interface PuzzlePhoto {
  /** 原图地址 */
  url: string
  /** 照片说明（拼完显示这句） */
  caption: string | null
  /** 属于哪一篇手帐 */
  entryTitle: string
}
