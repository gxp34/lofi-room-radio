'use client'

import * as React from 'react'

import { GameShell } from '@/components/games/game-shell'
import { Button } from '@/components/ui/button'
import type { GameProps } from '@/lib/games/types'
import { cn } from '@/lib/utils'

/* ============================================================
 * 类型与常量
 * ============================================================ */

/** 四个可移动的方向 */
type Direction = 'left' | 'right' | 'up' | 'down'

/**
 * 棋盘状态。
 *
 * board 是一维数组，长度固定 16，下标 = 行 * 4 + 列，0 表示空格。
 * 之所以用一维数组而不是二维数组：四个方向的移动可以共用同一套算法——
 * 只要提前给出「每个方向按什么顺序去读格子」，后面的合并逻辑就完全一致。
 */
interface GameState {
  board: number[]
  score: number
  /** 动画计数器，只增不减；拿来当 React key，保证每次移动 / 重开都能重放动画 */
  turn: number
  /** 这一步合并出来的格子下标（用于播放合并动画） */
  merged: number[]
  /** 这一步新生成的格子下标（用于播放出现动画） */
  spawned: number[]
  /** 是否已经合出过 2048 */
  reached2048: boolean
  /** 是否已经无路可走 */
  over: boolean
}

/** 移动一次的结果 */
interface MoveResult {
  /** 移动 + 合并之后的新棋盘（新数组，不改动传入的棋盘） */
  board: number[]
  /** 这一步累计合并出来的分数 */
  gained: number
  /** 合并后方块落在哪些格子上（棋盘下标），用于播放合并动画 */
  merged: number[]
  /** 棋盘是否真的发生了变化（没变化就不该生成新方块） */
  moved: boolean
}

/** 16 个空格的棋盘模板（0 = 空格） */
const EMPTY_BOARD: readonly number[] = Array.from({ length: 16 }, () => 0)

/** 手指滑动超过这个像素才算一次有效滑动，避免轻微抖动就乱走 */
const SWIPE_THRESHOLD = 24

/**
 * 四个方向的读取顺序：每条线 4 个棋盘下标，从「最靠近移动方向的那一端」开始数。
 * 例如向左手移动时，第一行要按 0 → 1 → 2 → 3 的顺序读；
 * 向右手移动时反过来读 3 → 2 → 1 → 0，这样「贴到最前面」就等于「贴到右边」。
 */
const LINES: Record<Direction, readonly number[][]> = {
  left: [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [8, 9, 10, 11],
    [12, 13, 14, 15],
  ],
  right: [
    [3, 2, 1, 0],
    [7, 6, 5, 4],
    [11, 10, 9, 8],
    [15, 14, 13, 12],
  ],
  up: [
    [0, 4, 8, 12],
    [1, 5, 9, 13],
    [2, 6, 10, 14],
    [3, 7, 11, 15],
  ],
  down: [
    [12, 8, 4, 0],
    [13, 9, 5, 1],
    [14, 10, 6, 2],
    [15, 11, 7, 3],
  ],
}

/** 键盘映射：方向键和 WASD 都支持（event.key 统一转成小写再查表） */
const KEY_DIRECTIONS: Record<string, Direction> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
}

/** 说明书文案 */
const INSTRUCTIONS = [
  '方向键或 WASD 移动方块；手机直接在棋盘上滑动即可',
  '两个相同的数字撞在一起会合并成一个，合并后的数值加进总分',
  '同一次移动里每个方块只合并一次：2 2 2 2 向左会得到 4 4，而不是 8',
  '合出 2048 会提示「你到了 2048」，但可以继续玩下去',
  '棋盘填满且四个方向都动不了时游戏结束，此时上报本局分数',
]

/* ============================================================
 * 纯函数：初始状态、合并算法、结束判定
 * ============================================================ */

/** 空棋盘状态（服务端渲染和客户端首次渲染都必须是这个，避免 hydration 不一致） */
function createEmptyState(): GameState {
  return {
    board: [...EMPTY_BOARD],
    score: 0,
    turn: 0,
    merged: [],
    spawned: [],
    reached2048: false,
    over: false,
  }
}

/** 在随机一个空格里生成新方块：90% 是 2，10% 是 4；棋盘满了返回 -1 */
function addRandomTile(board: number[]): number {
  const empties: number[] = []
  for (let index = 0; index < board.length; index++) {
    if (board[index] === 0) empties.push(index)
  }
  if (empties.length === 0) return -1

  const index = empties[Math.floor(Math.random() * empties.length)]
  board[index] = Math.random() < 0.9 ? 2 : 4
  return index
}

/** 开局棋盘：随机放两个方块，同时返回它们的位置用于播放出现动画 */
function createStartBoard(): { board: number[]; spawned: number[] } {
  const board = [...EMPTY_BOARD]
  const spawned: number[] = []
  for (let i = 0; i < 2; i++) {
    const index = addRandomTile(board)
    if (index >= 0) spawned.push(index)
  }
  return { board, spawned }
}

/**
 * 走一步：把每条线朝移动方向压实，然后合并相邻的相同数字。
 *
 * 合并的关键（保证同一次移动里每个方块最多只合并一次）：
 *   压掉 0 之后从头扫；相邻两个相同就合成一个值、然后 i += 2，
 *   直接把「被吃掉的那一块」跳过。这样 2 2 2 2 会得到 4 4（而不是 8），
 *   刚合出来的 4 也不会在同一次移动里再和后面的 4 合并。
 *   最后剩下的位置补 0，再按同一条线的顺序写回棋盘。
 */
function applyMove(board: readonly number[], direction: Direction): MoveResult {
  const next = [...board]
  const merged: number[] = []
  let gained = 0
  let moved = false

  for (const line of LINES[direction]) {
    // 1) 按移动方向读出这一条线上的非空方块（0 直接丢掉，等价于全部贴向一侧）
    const values: number[] = []
    for (const index of line) {
      const value = board[index]
      if (value !== 0) values.push(value)
    }

    // 2) 相邻且相同就合并，用 i += 2 保证每个方块只参与一次合并
    const packed: number[] = []
    let i = 0
    while (i < values.length) {
      const current = values[i]
      if (i + 1 < values.length && values[i + 1] === current) {
        const sum = current * 2
        // 合并后的方块落在这一条线的第 packed.length 个位置上，记下来做动画
        merged.push(line[packed.length])
        packed.push(sum)
        gained += sum
        i += 2
      } else {
        packed.push(current)
        i += 1
      }
    }

    // 3) 补 0 到 4 个，再写回棋盘；顺便判断棋盘有没有真的动过
    while (packed.length < 4) packed.push(0)
    for (let position = 0; position < 4; position++) {
      const target = line[position]
      const value = packed[position]
      if (next[target] !== value) moved = true
      next[target] = value
    }
  }

  return { board: next, gained, merged, moved }
}

/**
 * 游戏结束判定：还有空格，或者任意相邻（右 / 下）有相同数字，就还能走。
 * 四个方向都能动等价于「存在空格或存在相邻相同」——因为任意一次有效移动
 * 都必须依赖空格或一次合并。
 */
function hasMoves(board: readonly number[]): boolean {
  for (let index = 0; index < 16; index++) {
    const value = board[index]
    if (value === 0) return true

    const row = Math.floor(index / 4)
    const col = index % 4
    if (col < 3 && board[index + 1] === value) return true
    if (row < 3 && board[index + 4] === value) return true
  }
  return false
}

/* ============================================================
 * 视觉：数字 → 底色阶
 * ============================================================ */

/** 2 → 2048+ 的底色阶：数字越大越亮，2 / 4 用暗色，2048 用三色渐变收尾 */
function tileClasses(value: number): string {
  if (value <= 2) return 'bg-white/[0.07] text-paper/80'
  if (value <= 4) return 'bg-dust/30 text-paper'
  if (value <= 8) return 'bg-rain/35 text-paper'
  if (value <= 16) return 'bg-rain/55 text-night'
  if (value <= 32) return 'bg-rain/80 text-night'
  if (value <= 64) return 'bg-lamp/40 text-night'
  if (value <= 128) return 'bg-lamp/65 text-night'
  if (value <= 256) return 'bg-lamp text-night'
  if (value <= 512) return 'bg-neon/70 text-night'
  if (value <= 1024) return 'bg-neon text-night'
  return 'bg-gradient-to-br from-lamp via-neon to-rain text-night shadow-[0_0_16px_-4px_rgba(247,200,115,0.85)]'
}

/** 位数越多字号越小，保证 320px 窄屏下 4 位数也不会撑破格子 */
function tileTextClasses(value: number): string {
  if (value < 100) return 'text-xl sm:text-2xl'
  if (value < 1000) return 'text-lg sm:text-xl'
  if (value < 10000) return 'text-base sm:text-lg'
  return 'text-sm sm:text-base'
}

/* ============================================================
 * 屏幕外的方向键（手机 / 鼠标也能操作）
 * ============================================================ */

function DirectionPad({ onMove }: { onMove: (direction: Direction) => void }) {
  return (
    <div
      role="group"
      aria-label="方向键"
      className="mx-auto grid w-[104px] grid-cols-3 grid-rows-3 gap-1"
    >
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        aria-label="向上移动"
        className="col-start-2 row-start-1"
        onClick={() => onMove('up')}
      >
        ↑
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        aria-label="向左移动"
        className="col-start-1 row-start-2"
        onClick={() => onMove('left')}
      >
        ←
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        aria-label="向右移动"
        className="col-start-3 row-start-2"
        onClick={() => onMove('right')}
      >
        →
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        aria-label="向下移动"
        className="col-start-2 row-start-3"
        onClick={() => onMove('down')}
      >
        ↓
      </Button>
    </div>
  )
}

/* ============================================================
 * 2048 本体
 * ============================================================ */

export function Game2048({ highScore, reportScore }: GameProps) {
  // 首次渲染用空棋盘（服务端 / 客户端一致），挂载后再在 effect 里发牌
  const [state, setState] = React.useState<GameState>(createEmptyState)
  /** 与 state 同步的最新棋盘：连续快速按键时用它读，避免读到旧状态 */
  const stateRef = React.useRef<GameState>(state)
  /** 一整局只上报一次分数 */
  const reportedRef = React.useRef(false)
  /** 触摸起点 */
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null)

  /** 统一的提交入口：ref 立刻同步，state 交给 React 渲染 */
  const commit = React.useCallback((next: GameState) => {
    stateRef.current = next
    setState(next)
  }, [])

  /** 重新开始：清空棋盘、随机放两个方块、分数归零 */
  const restart = React.useCallback(() => {
    const start = createStartBoard()
    reportedRef.current = false
    touchStartRef.current = null
    commit({
      board: start.board,
      score: 0,
      turn: stateRef.current.turn + 1,
      merged: [],
      spawned: start.spawned,
      reached2048: false,
      over: false,
    })
  }, [commit])

  /** 走一步：算合并 → 补新方块 → 判胜负 → 该结束就上报分数 */
  const move = React.useCallback(
    (direction: Direction) => {
      const prev = stateRef.current
      if (prev.over) return

      const result = applyMove(prev.board, direction)
      // 这一步没有任何方块移动或合并：不生成新方块，也不加分
      if (!result.moved) return

      const board = result.board
      const spawnedIndex = addRandomTile(board)
      const score = prev.score + result.gained
      const over = !hasMoves(board)

      commit({
        board,
        score,
        turn: prev.turn + 1,
        merged: result.merged,
        spawned: spawnedIndex >= 0 ? [spawnedIndex] : [],
        // 合出 2048 只提示、不拦人，可以继续玩
        reached2048: prev.reached2048 || board.some((value) => value >= 2048),
        over,
      })

      // 无路可走 = 游戏结束，这时候才上报本局最终分数（reportedRef 保证只报一次）
      if (over && !reportedRef.current) {
        reportedRef.current = true
        reportScore(score)
      }
    },
    [commit, reportScore],
  )

  // 开局发牌
  React.useEffect(() => {
    restart()
  }, [restart])

  // 键盘：方向键 + WASD；preventDefault 防止方向键把页面滚下去
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return
        }
      }

      const direction = KEY_DIRECTIONS[event.key.toLowerCase()]
      if (!direction) return
      event.preventDefault()
      move(direction)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [move])

  /** 记录手指按下的位置 */
  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  /** 抬起手指时用位移方向决定往哪边走（棋盘上的 touch-action: none 负责不让页面滚动） */
  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return

    const touch = event.changedTouches[0]
    if (!touch) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return

    let direction: Direction
    if (Math.abs(dx) > Math.abs(dy)) {
      direction = dx > 0 ? 'right' : 'left'
    } else {
      direction = dy > 0 ? 'down' : 'up'
    }
    move(direction)
  }

  const { board, score, merged, spawned, over, reached2048, turn } = state

  return (
    <GameShell
      name="2048"
      tagline="合并相同数字，别把格子塞满"
      highScore={highScore}
      score={score}
      status={over ? '游戏结束 · 无路可走' : reached2048 ? '你到了 2048 · 还能继续' : undefined}
      onRestart={restart}
      instructions={INSTRUCTIONS}
      controls={<DirectionPad onMove={move} />}
    >
      <div className="flex flex-col items-center gap-2">
        {/* 提示条：高度固定，避免文案切换时棋盘跳一下 */}
        <div className="flex min-h-[24px] w-full items-center justify-center">
          {reached2048 && !over ? (
            <p className="animate-rise-in rounded-md border border-lamp/30 bg-lamp/10 px-2 py-0.5 text-center font-display text-[11px] text-lamp">
              你到了 2048！还能继续合下去
            </p>
          ) : (
            <p className="text-center font-display text-[11px] text-dust">
              {over ? '没有可走的方向了' : '方向键 / WASD / 手机滑动'}
            </p>
          )}
        </div>

        {/* ===== 棋盘 =====
            aspect-square + w-full 让它自己适应屏幕宽度（320px 窄屏也不会溢出）；
            touch-action: none（touch-none）负责阻止滑动时页面跟着滚。 */}
        <div
          role="application"
          aria-label="2048 棋盘：用方向键、WASD 或滑动屏幕来移动方块"
          tabIndex={0}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="relative mx-auto aspect-square w-full max-w-[22rem] touch-none select-none rounded-xl border border-white/10 bg-roomDeep/70 p-2 outline-none focus-visible:ring-2 focus-visible:ring-lamp/50"
        >
          <div className="grid h-full w-full grid-cols-4 grid-rows-4 gap-1.5">
            {board.map((value, index) => {
              const isMerged = merged.includes(index)
              const isSpawned = spawned.includes(index)
              // key 只在「这一步发生了合并 / 生成」时变化，
              // 变化会让 React 重新挂载这个方块，从而重放出现动画。
              const tileKey = isMerged
                ? `merged-${turn}`
                : isSpawned
                  ? `spawned-${turn}`
                  : 'stable'

              return (
                <div key={index} className="relative rounded-lg bg-white/[0.03]">
                  {value > 0 && (
                    <div
                      key={tileKey}
                      className={cn(
                        'absolute inset-0 flex items-center justify-center rounded-lg font-display font-bold tabular-nums transition-colors duration-200',
                        tileClasses(value),
                        tileTextClasses(value),
                        (isMerged || isSpawned) && 'animate-rise-in',
                        isMerged && 'ring-2 ring-paper/70',
                      )}
                    >
                      {value}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 游戏结束：遮住棋盘并给一个再来一局的入口 */}
          {over && (
            <div className="animate-rise-in absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-night/85 px-4 text-center backdrop-blur-sm">
              <p className="font-display text-sm text-neon">无路可走，游戏结束</p>
              <p className="font-display text-xs text-dust">本局得分 {score}</p>
              <Button type="button" size="sm" variant="default" onClick={restart}>
                再来一局
              </Button>
            </div>
          )}
        </div>

        {/* 分数 / 结束状态用屏幕阅读器播报 */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {over ? `游戏结束，本局得分 ${score}` : `当前分数 ${score}`}
        </p>
      </div>
    </GameShell>
  )
}
