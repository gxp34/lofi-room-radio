'use client'

import * as React from 'react'

import { GameShell } from '@/components/games/game-shell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GameProps } from '@/lib/games/types'

/* ==========================================================================
 * 贪吃蛇 · 房间里的小蛇
 * 棋盘是 17×17 的 CSS Grid（不用 canvas，DOM 更好调样式、也更方便做无障碍）。
 * 蛇吃的是台灯洒下来的光点，所以食物用的是 bg-lamp + 呼吸动画。
 * ========================================================================== */

/** 棋盘边长（格） */
const BOARD_SIZE = 17
/** 初始速度：每步 180ms */
const BASE_SPEED = 180
/** 每吃到 1 个光点加多少分 */
const SCORE_PER_FOOD = 10
/** 每吃 5 个光点提一次速 */
const FOOD_PER_LEVEL = 5
/** 每次提速幅度 */
const SPEED_STEP = 15
/** 速度下限，再快就没法玩了 */
const MIN_SPEED = 70
/** 初始蛇长 */
const INITIAL_LENGTH = 3
/** 触屏滑动多少像素才算一次有效方向 */
const SWIPE_THRESHOLD = 24

/** 网格坐标 */
interface Cell {
  x: number
  y: number
}

/** 四个方向 */
type Direction = 'up' | 'down' | 'left' | 'right'

/** 一局游戏的全部状态 */
interface GameState {
  /** 蛇身数组，索引 0 是蛇头 */
  snake: Cell[]
  /** 台灯光点的位置 */
  food: Cell
  score: number
  /** 本局已吃到的光点数，用来算提速 */
  eaten: number
  /** 下一次移动的方向 */
  direction: Direction
  /** 待生效方向队列（只存最后一个），避免快速连按把自己撞死 */
  pendingDirection: Direction
  /** 是否结束 */
  over: boolean
}

/** 方向 → 坐标增量 */
const DIRECTION_VECTOR: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

/** 相反方向，用来禁止 180° 掉头 */
const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

/** 速度随分数提升而加快：初始 180ms，每吃 5 个减 15ms，最低 70ms */
function speedForEaten(eaten: number): number {
  const level = Math.floor(eaten / FOOD_PER_LEVEL)
  return Math.max(MIN_SPEED, BASE_SPEED - level * SPEED_STEP)
}

/** 两个格子是不是同一个位置 */
function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y
}

/** 把坐标编码成一个整数，方便用 Set 做 O(1) 碰撞检测 */
function cellKey(x: number, y: number): number {
  return y * BOARD_SIZE + x
}

/**
 * 随机挑一个空格子放光点。
 * 蛇占满了整块棋盘时返回 null（理论上不可能，但类型上得处理）。
 */
function spawnFood(snake: Cell[]): Cell | null {
  const occupied = new Set(snake.map((part) => cellKey(part.x, part.y)))
  const free: Cell[] = []
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (!occupied.has(cellKey(x, y))) free.push({ x, y })
    }
  }
  if (free.length === 0) return null
  const index = Math.floor(Math.random() * free.length)
  return free[index] ?? null
}

/** 开局的蛇：横躺在棋盘正中间，蛇头朝右 */
function createSnake(): Cell[] {
  const middle = Math.floor(BOARD_SIZE / 2)
  const snake: Cell[] = []
  for (let i = 0; i < INITIAL_LENGTH; i += 1) {
    snake.push({ x: middle - i, y: middle })
  }
  return snake
}

/** 开一局新的（光点随机），只能在客户端调用 */
function createInitialState(): GameState {
  const snake = createSnake()
  return {
    snake,
    food: spawnFood(snake) ?? { x: 0, y: 0 },
    score: 0,
    eaten: 0,
    direction: 'right',
    pendingDirection: 'right',
    over: false,
  }
}

/**
 * 首屏（SSR / hydration）用的确定状态：光点固定放在一个空位上。
 * 随机数在服务端和客户端不可能一致，如果首屏就用随机位置，
 * 会触发 hydration mismatch 警告，所以等挂载后再随机化。
 */
function createReadyState(): GameState {
  const snake = createSnake()
  // 初始蛇横躺在中间一行，左上角和右下角一定是空的；保险起见还是检查一遍
  const isFree = (cell: Cell): boolean => !snake.some((part) => sameCell(part, cell))
  const food = isFree({ x: 0, y: 0 }) ? { x: 0, y: 0 } : { x: BOARD_SIZE - 1, y: BOARD_SIZE - 1 }
  return {
    snake,
    food,
    score: 0,
    eaten: 0,
    direction: 'right',
    pendingDirection: 'right',
    over: false,
  }
}

/**
 * 推进一帧（走一步）。
 *
 * 游戏循环只认这一个纯函数：
 *   1. 把方向队列里待生效的方向落地（不允许 180° 掉头）；
 *   2. 算新蛇头，撞墙就结束；
 *   3. 撞到自己就结束（尾巴那一格例外：不吃东西时尾巴会同步让开）；
 *   4. 吃到光点就加分、加长、重新放光点并提速，否则照常前进一步。
 */
function advanceGame(state: GameState): GameState {
  // 已经结束的局不再推进，等玩家重新开始
  if (state.over) return state

  // ---- 1. 生效方向队列（180° 掉头直接忽略） ----
  const direction =
    state.pendingDirection === OPPOSITE[state.direction]
      ? state.direction
      : state.pendingDirection

  // ---- 2. 算新蛇头 ----
  const head = state.snake[0]
  if (!head) return state
  const vector = DIRECTION_VECTOR[direction]
  const nextHead: Cell = { x: head.x + vector.x, y: head.y + vector.y }

  // 撞墙
  if (
    nextHead.x < 0 ||
    nextHead.x >= BOARD_SIZE ||
    nextHead.y < 0 ||
    nextHead.y >= BOARD_SIZE
  ) {
    return { ...state, direction, over: true }
  }

  const willEat = sameCell(nextHead, state.food)

  // ---- 3. 撞自己：不吃东西时尾巴会让开，所以尾格不算身体 ----
  const body = willEat ? state.snake : state.snake.slice(0, -1)
  if (body.some((part) => sameCell(part, nextHead))) {
    return { ...state, direction, over: true }
  }

  // ---- 4. 移动 / 吃 ----
  if (!willEat) {
    return {
      ...state,
      direction,
      // 蛇头进队首、尾巴出队尾，长度不变
      snake: [nextHead, ...body],
    }
  }

  const nextFood = spawnFood([nextHead, ...state.snake])
  if (!nextFood) {
    // 棋盘被蛇占满，视为通关
    return { ...state, direction, snake: [nextHead, ...state.snake], over: true }
  }

  const eaten = state.eaten + 1
  return {
    ...state,
    direction,
    snake: [nextHead, ...state.snake],
    food: nextFood,
    score: state.score + SCORE_PER_FOOD,
    eaten,
  }
}

export function GameSnake({ highScore, reportScore }: GameProps) {
  const [game, setGame] = React.useState<GameState>(createReadyState)
  /** 是否已经按过开始（没开始时蛇不动） */
  const [hasStarted, setHasStarted] = React.useState(false)
  const [paused, setPaused] = React.useState(false)

  /** 游戏循环句柄，卸载时必须清掉，否则内存泄漏 + 后台偷偷跑 */
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  /** 待生效方向队列：快速连按方向键时先攒着，等下一帧再落地 */
  const pendingDirectionRef = React.useRef<Direction>('right')
  /** 用 ref 存最新的走一步函数，这样游戏循环的 useEffect 不用频繁重建 */
  const stepRef = React.useRef<() => void>(() => undefined)
  /** 触屏起点 */
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null)
  /** 本局分数有没有上报过，保证只在结束时上报一次 */
  const reportedRef = React.useRef(false)
  /** 是否已经排了一次「重开」，防止连按方向键排队重开两次 */
  const restartingRef = React.useRef(false)

  // 键位监听挂在 window 上，所以走 ref 取最新状态，避免反复解绑/绑定
  const gameRef = React.useRef(game)
  gameRef.current = game
  const startedRef = React.useRef(hasStarted)
  startedRef.current = hasStarted
  // reportScore 由上层传入，身份可能每次都变；用 ref 保证「只上报一次」的副作用稳定
  const reportScoreRef = React.useRef(reportScore)
  reportScoreRef.current = reportScore

  const isRunning = hasStarted && !paused && !game.over

  // 挂载后把首屏那个确定的光点换成真正的随机位置（见 createReadyState 的说明）
  React.useEffect(() => {
    setGame(createInitialState())
  }, [])

  // ---- 走一步 + 判断结束 ----
  const step = React.useCallback(() => {
    setGame((prev) => {
      // 收到新状态说明上一轮的重开已经落地，解除重开锁
      restartingRef.current = false
      const next = advanceGame({ ...prev, pendingDirection: pendingDirectionRef.current })
      if (next.over && !prev.over && !reportedRef.current) {
        // 撞墙或撞到自己：整局只在结束这一刻上报一次分数
        reportedRef.current = true
        reportScoreRef.current(next.score)
      }
      return next
    })
  }, [])

  stepRef.current = step

  /** 重新开始：清空方向队列、复位状态、清掉「已上报」标记 */
  const restart = React.useCallback(() => {
    pendingDirectionRef.current = 'right'
    reportedRef.current = false
    restartingRef.current = false
    setGame(createInitialState())
    setPaused(false)
    setHasStarted(true)
  }, [])

  /**
   * 按下方向键 / 滑动：把方向放进队列，必要时顺手开局。
   * 结束后按方向键是「重开 + 立刻朝这个方向走」，
   * 所以这里显式重置一局，而不是拿已经结束的旧状态去 advance。
   */
  const queueDirection = React.useCallback((direction: Direction) => {
    pendingDirectionRef.current = direction
    const current = gameRef.current

    if (current.over) {
      if (restartingRef.current) return
      restartingRef.current = true
      reportedRef.current = false
      setGame(createInitialState())
    } else {
      // 立即走一步，让按键手感跟手；后续交给 setInterval
      void stepRef.current()
    }

    setPaused(false)
    setHasStarted(true)
  }, [])

  /** 空格：开始 / 暂停 / 继续 */
  const togglePause = React.useCallback(() => {
    // 状态 setter 的更新函数必须是纯函数（StrictMode 下会被调用两次），
    // 所以这里先按 ref 里的最新状态判断，再决定调用哪个 setter。
    const current = gameRef.current

    // 已经结束：空格 = 直接开一局新的
    if (current.over) {
      pendingDirectionRef.current = 'right'
      reportedRef.current = false
      restartingRef.current = false
      setGame(createInitialState())
      setPaused(false)
      setHasStarted(true)
      return
    }

    // 还没开始：空格 = 开局
    if (!startedRef.current) {
      pendingDirectionRef.current = current.direction
      setHasStarted(true)
      setPaused(false)
      return
    }

    // 正常对局：在暂停 / 继续之间切换
    setPaused((prevPaused) => !prevPaused)
  }, [])

  // ---- 游戏循环：按当前速度跑 setInterval，速度变了就重建 ----
  const speed = speedForEaten(game.eaten)
  React.useEffect(() => {
    if (!isRunning) return undefined
    const timer = setInterval(() => {
      void stepRef.current()
    }, speed)
    timerRef.current = timer
    return () => {
      clearInterval(timer)
      timerRef.current = null
    }
  }, [isRunning, speed])

  // ---- 键盘：方向键 / WASD / 空格 ----
  React.useEffect(() => {
    const KEY_DIRECTION: Record<string, Direction> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
      w: 'up',
      a: 'left',
      s: 'down',
      d: 'right',
      W: 'up',
      A: 'left',
      S: 'down',
      D: 'right',
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // 焦点在输入框里时不抢键，别影响别人打字
      const target = event.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return
        }
      }

      // 方向键和空格会滚动页面，一律拦掉
      if (event.key.startsWith('Arrow') || event.key === ' ' || event.code === 'Space') {
        event.preventDefault()
      }
      if (event.repeat) return

      const direction = KEY_DIRECTION[event.key]
      if (direction) {
        queueDirection(direction)
        return
      }
      if (event.key === ' ' || event.code === 'Space') {
        togglePause()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [queueDirection, togglePause])

  // ---- 触屏滑动 ----
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0]
    if (!touch) return
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current
    const touch = event.changedTouches[0]
    touchStartRef.current = null
    if (!start || !touch) return

    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    // 滑动太短当成误触
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return

    if (Math.abs(dx) > Math.abs(dy)) {
      queueDirection(dx > 0 ? 'right' : 'left')
    } else {
      queueDirection(dy > 0 ? 'down' : 'up')
    }
  }

  // ---- 派生展示数据 ----
  const statusText = game.over
    ? '游戏结束'
    : paused
      ? '已暂停'
      : hasStarted
        ? '摸鱼中'
        : '按空格开始'

  // 蛇身位置 → 身体序号（0 是蛇头），碰撞/上色都靠它
  const bodyIndex = new Map<number, number>()
  game.snake.forEach((part, index) => bodyIndex.set(cellKey(part.x, part.y), index))

  // 蛇身越靠尾巴越淡
  const bodyTone = (index: number): string => {
    if (index % 3 === 0) return 'bg-lamp/50'
    if (index % 3 === 1) return 'bg-lamp/35'
    return 'bg-lamp/25'
  }

  const foodKey = cellKey(game.food.x, game.food.y)
  const cells: React.ReactNode[] = []
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const key = cellKey(x, y)
      const index = bodyIndex.get(key)

      if (index === 0) {
        // 蛇头：亮黄 + 一小撮光晕
        cells.push(
          <span
            key={key}
            className="rounded-[3px] bg-lamp shadow-[0_0_10px_rgba(247,200,115,0.75)]"
          />,
        )
      } else if (typeof index === 'number') {
        cells.push(<span key={key} className={cn('rounded-[3px]', bodyTone(index))} />)
      } else if (key === foodKey) {
        // 食物：台灯的光点，带呼吸动画和光晕
        cells.push(
          <span key={key} className="flex items-center justify-center">
            <span className="h-3/4 w-3/4 animate-breathe rounded-full bg-lamp shadow-[0_0_12px_4px_rgba(247,200,115,0.55)]" />
          </span>,
        )
      } else {
        cells.push(<span key={key} className="rounded-[2px] bg-white/[0.025]" />)
      }
    }
  }

  return (
    <GameShell
      name="贪吃蛇 · ROOM SNAKE"
      tagline="追着台灯的光点跑"
      highScore={highScore}
      score={game.score}
      status={statusText}
      onRestart={restart}
      instructions={[
        '方向键或 W A S D 控制小蛇移动，手机上直接在棋盘上滑动。',
        '空格键暂停 / 继续，暂停时画面会变暗并给出提示。',
        '吃掉一盏台灯洒下的光点加 10 分，蛇身加长，每吃 5 个光点速度提升一档。',
        '撞到墙或者咬到自己就结束了，本局分数会在结束的那一刻上传。',
        '小蛇不能 180° 掉头，想回头得先拐个弯。',
      ]}
      controls={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={togglePause}>
            {paused ? '继续' : '暂停'}
          </Button>
          <span className="font-display text-[11px] text-dust">
            速度 {speed}ms · 长度 {game.snake.length}
          </span>
        </div>
      }
    >
      <div className="flex min-h-full flex-col items-center justify-center gap-3">
        {/* 分数播报：无障碍读屏用 */}
        <p className="sr-only" aria-live="polite">
          当前分数 {game.score} 分，最高分 {highScore} 分，蛇身长度 {game.snake.length} 节。
        </p>

        {/* 棋盘外层处理触屏滑动，内层是 17×17 的 CSS Grid */}
        <div
          className="relative w-full max-w-[min(100%,22rem)] touch-none select-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="aspect-square w-full overflow-hidden rounded-xl border border-white/[0.08] bg-roomDeep/80 p-1.5 shadow-[inset_0_0_30px_rgba(0,0,0,0.8)]"
            role="grid"
            aria-label="贪吃蛇棋盘，17 乘 17 格"
          >
            <div
              className="grid h-full w-full gap-[2px]"
              style={{
                gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`,
              }}
            >
              {cells}
            </div>
          </div>

          {/* 暂停提示：整块压暗 + 大字，够明显 */}
          {paused && !game.over && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-xl bg-night/75 backdrop-blur-[2px]">
              <p className="animate-breathe font-display text-lg tracking-[0.3em] text-lamp">
                已暂停
              </p>
              <p className="text-[11px] text-dust">按空格键或下面的「继续」回到房间</p>
            </div>
          )}

          {/* 结束提示 */}
          {game.over && (
            <div className="absolute inset-0 z-10 flex animate-rise-in flex-col items-center justify-center gap-1 rounded-xl bg-night/80 backdrop-blur-[2px]">
              <p className="font-display text-lg tracking-[0.2em] text-neon">游戏结束</p>
              <p className="font-display text-sm text-paper">本局 {game.score} 分</p>
              <p className="text-[11px] text-dust">
                {game.score > highScore ? '刷新纪录了，灯还亮着' : '按空格或点「重新开始」再摸一局'}
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] leading-relaxed text-dust">
          方向键 / WASD 移动 · 空格暂停 · 手机在棋盘上滑动
        </p>
      </div>
    </GameShell>
  )
}
