'use client'

import * as React from 'react'

import { GameShell } from '@/components/games/game-shell'
import { Button } from '@/components/ui/button'
import type { GameProps } from '@/lib/games/types'
import { cn } from '@/lib/utils'

/* ============================ 游戏配置 ============================ */

/** 房间里的 8 件小物件，每件做成一对牌（emoji + 中文小标签，标签同时给肉眼和读屏用） */
const ROOM_OBJECTS: ReadonlyArray<{ emoji: string; label: string }> = [
  { emoji: '💡', label: '台灯' },
  { emoji: '🐈', label: '猫' },
  { emoji: '🎵', label: '唱片机' },
  { emoji: '📓', label: '日记本' },
  { emoji: '🎧', label: '耳机' },
  { emoji: '☂️', label: '雨伞' },
  { emoji: '🎮', label: '掌机' },
  { emoji: '🍵', label: '热茶' },
]

/** 配对数（8）与总牌数（16），16 张正好铺成 4×4 */
const PAIR_COUNT = ROOM_OBJECTS.length
const CARD_COUNT = PAIR_COUNT * 2

/** 配对成功一次的得分 */
const MATCH_SCORE = 100
/** 翻错一次扣的分（分数最低扣到 0，不会变负数） */
const MISMATCH_PENALTY = 10
/** 全部配对完成后，每剩下 1 秒追加的奖励分 */
const TIME_BONUS_PER_SECOND = 5
/** 总时限（秒），超时即结束本局 */
const TIME_LIMIT_SECONDS = 120
/** 翻错后自动合上的等待时间（毫秒），这段时间内锁住牌桌，防止点出第三张 */
const MISMATCH_DELAY_MS = 800

/** 掌机说明书 */
const INSTRUCTIONS: string[] = [
  '点击两张牌把它们翻开，牌面是同一件小物件就配对成功。',
  `配对成功 +${MATCH_SCORE} 分；翻错 -${MISMATCH_PENALTY} 分（最低 0 分）。`,
  `8 对全部配对完成后，按剩余秒数 ×${TIME_BONUS_PER_SECOND} 追加时间奖励。`,
  `总时限 ${TIME_LIMIT_SECONDS} 秒，翻错的两张牌会在 ${MISMATCH_DELAY_MS / 1000} 秒后自动合上。`,
  '键盘也能玩：Tab 移动到牌上，回车 / 空格翻开。',
]

/** 一局的状态：进行中 / 全部配对 / 超时结束 */
type GamePhase = 'playing' | 'won' | 'lost'

interface Card {
  /** 稳定唯一的 key（洗牌后 DOM 复用不错位） */
  id: string
  /** 同一对牌共用的编号，配对判断只看它 */
  pairId: number
  /** 牌面 emoji */
  emoji: string
  /** 牌面中文小标签 */
  label: string
}

/**
 * 生成一副「按顺序」排列的牌（还没洗）。
 * 刻意不在首次渲染里直接洗牌：客户端组件在 App Router 下也会先跑一遍服务端渲染，
 * 如果首屏就用 Math.random 洗牌，服务端和客户端的牌序会不一样，
 * 16 个带 key 的子节点顺序对不上，React 会报 hydration 不一致。
 * 首屏顺序固定 → HTML 完全一致；挂载后（见下面的 useEffect）再真正洗一次，
 * 而这时所有牌都是背面朝上，玩家看不到任何区别。
 */
function createOrderedDeck(): Card[] {
  return ROOM_OBJECTS.flatMap((object, pairId) => [
    { id: `${pairId}-a`, pairId, emoji: object.emoji, label: object.label },
    { id: `${pairId}-b`, pairId, emoji: object.emoji, label: object.label },
  ])
}

/** Fisher-Yates 洗牌：从后往前，每次和前面（含自己）的随机一张交换，返回新数组 */
function shuffleCards(cards: readonly Card[]): Card[] {
  const next = [...cards]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = next[i]
    const b = next[j]
    if (a === undefined || b === undefined) continue
    next[i] = b
    next[j] = a
  }
  return next
}

/* ============================ 组件 ============================ */

/**
 * 翻牌记忆。
 *
 * 计分规则：
 * - 每配对成功一对 +100 分；
 * - 每翻错一次 -10 分，但底分不会低于 0；
 * - 8 对全部配对完成时，追加「剩余秒数 × 5」的时间奖励；
 * - 超时结束不额外扣分，用当时的分数上报。
 * 最终分数只在「全部配对完成」或「超时」这两件事发生的那一刻上报一次。
 */
export function GameMemory({ highScore, reportScore }: GameProps) {
  /** 牌堆。惰性初始化，只在首次渲染算一次；真正的洗牌在挂载后的 effect 里做 */
  const [deck, setDeck] = React.useState<Card[]>(createOrderedDeck)
  /** 第一张翻开的牌的下标（null = 还没翻） */
  const [firstIndex, setFirstIndex] = React.useState<number | null>(null)
  /** 第二张翻开的牌的下标 */
  const [secondIndex, setSecondIndex] = React.useState<number | null>(null)
  /** 配错后的锁定：这段时间内任何点击都直接忽略，防止翻出第三张打乱判定 */
  const [locked, setLocked] = React.useState(false)
  /** 已经配对成功的牌的 id（配对的牌永久保持翻开） */
  const [matchedIds, setMatchedIds] = React.useState<string[]>([])
  /** 步数：每翻开一张牌算一步 */
  const [moves, setMoves] = React.useState(0)
  /** 已用秒数，由 setInterval 每秒 +1 */
  const [seconds, setSeconds] = React.useState(0)
  /** 当前分数 */
  const [score, setScore] = React.useState(0)
  /** 胜利时的时间奖励，只在结算面板里展示 */
  const [timeBonus, setTimeBonus] = React.useState(0)
  const [phase, setPhase] = React.useState<GamePhase>('playing')
  /** 给 aria-live 播报的文案 */
  const [liveMessage, setLiveMessage] = React.useState('')
  /** 播报序号：用来强制刷新 live 区域的节点，保证连续相同的文案也能被读出来 */
  const [liveSeq, setLiveSeq] = React.useState(0)

  /** 配错后回翻的定时器 id，重开 / 卸载时要清掉 */
  const mismatchTimerRef = React.useRef<number | null>(null)
  /** 本局是否已经上报过分数，保证 reportScore 一局只调一次 */
  const reportedRef = React.useRef(false)

  const matchedCount = matchedIds.length / 2
  const remaining = Math.max(0, TIME_LIMIT_SECONDS - seconds)

  /** 清掉配错回翻的定时器（重开、结束、卸载都会用到） */
  const clearMismatchTimer = React.useCallback(() => {
    if (mismatchTimerRef.current !== null) {
      window.clearTimeout(mismatchTimerRef.current)
      mismatchTimerRef.current = null
    }
  }, [])

  /** 播报一句话（步数、配对、翻错、胜负都走这里） */
  const announce = React.useCallback((message: string) => {
    setLiveMessage(message)
    setLiveSeq((seq) => seq + 1)
  }, [])

  /**
   * 结束本局：锁住牌桌、记录胜负，并把最终分数上报给上层（一局只报一次）。
   * reportedRef 兜底，避免 StrictMode 双跑 effect 或重复触发时重复上报。
   */
  const finishGame = React.useCallback(
    (finalScore: number, result: 'won' | 'lost') => {
      clearMismatchTimer()
      setLocked(true)
      setPhase(result)
      if (reportedRef.current) return
      reportedRef.current = true
      reportScore(finalScore)
    },
    [clearMismatchTimer, reportScore],
  )

  /* ============ 挂载后洗一次牌 ============ */
  React.useEffect(() => {
    // 首屏用固定顺序保证 hydration 一致，挂载后立刻洗牌。
    // 此刻所有牌都是背面朝上，玩家看不出任何差别。
    setDeck((prev) => shuffleCards(prev))
  }, [])

  /* ============ 计时器：每秒走一格，结束后自动停 ============ */
  React.useEffect(() => {
    // 只在进行中走秒；打完或超时后 phase 变化，effect 重新执行并把 interval 清掉
    if (phase !== 'playing') return
    const timer = window.setInterval(() => {
      setSeconds((prev) => (prev >= TIME_LIMIT_SECONDS ? prev : prev + 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  /* ============ 超时判定：秒数走到上限就把本局判负 ============ */
  React.useEffect(() => {
    if (phase !== 'playing') return
    if (seconds < TIME_LIMIT_SECONDS) return
    announce(`时间到，本局得分 ${score} 分`)
    finishGame(score, 'lost')
  }, [announce, finishGame, phase, score, seconds])

  /* ============ 卸载清理：清掉配错回翻的 setTimeout ============ */
  React.useEffect(() => {
    // interval 由上面那个 effect 的 cleanup 负责，这里只管 setTimeout
    return () => clearMismatchTimer()
  }, [clearMismatchTimer])

  /** 重开一局：清定时器、重新洗牌、所有统计归零 */
  function restart() {
    clearMismatchTimer()
    reportedRef.current = false
    setDeck(shuffleCards(createOrderedDeck()))
    setFirstIndex(null)
    setSecondIndex(null)
    setLocked(false)
    setMatchedIds([])
    setMoves(0)
    setSeconds(0)
    setScore(0)
    setTimeBonus(0)
    setPhase('playing')
    setLiveMessage('')
  }

  /**
   * 翻牌主逻辑。
   * 用 firstIndex / secondIndex / locked 表达流程：
   * - firstIndex === null：这是本回合第一张，只翻开、不判定；
   * - 已经有 firstIndex：这是第二张，立刻判定——同 pairId 就配对成功，
   *   否则锁住牌桌，800ms 后把两张一起合上。
   */
  function handleFlip(index: number): void {
    const card = deck[index]
    if (card === undefined) return
    // 结束、锁定、已开、重复点同一张，统统忽略
    if (phase !== 'playing' || locked) return
    if (matchedIds.includes(card.id)) return
    if (index === firstIndex) return

    // 不管配对与否，翻开一张就算一步
    setMoves((prev) => prev + 1)

    if (firstIndex === null) {
      setFirstIndex(index)
      announce(`翻开了${card.label}`)
      return
    }

    const firstCard = deck[firstIndex]
    if (firstCard === undefined) return
    setSecondIndex(index)

    if (firstCard.pairId === card.pairId) {
      // —— 配对成功：两张都记进 matchedIds，永久翻开 ——
      const nextMatched = [...matchedIds, firstCard.id, card.id]
      const matchedScore = score + MATCH_SCORE
      setMatchedIds(nextMatched)
      setFirstIndex(null)
      setSecondIndex(null)

      if (nextMatched.length >= CARD_COUNT) {
        // —— 全部配对完成：结算时间奖励并上报 ——
        const bonus = remaining * TIME_BONUS_PER_SECOND
        const finalScore = matchedScore + bonus
        setScore(finalScore)
        setTimeBonus(bonus)
        announce(
          `最后一张${card.label}配对成功，时间奖励 ${bonus} 分，本局得分 ${finalScore} 分`,
        )
        finishGame(finalScore, 'won')
      } else {
        setScore(matchedScore)
        announce(`${card.label}配对成功，加 ${MATCH_SCORE} 分`)
      }
      return
    }

    // —— 翻错了：立刻扣分并锁住牌桌，800ms 后自动合上 ——
    setScore((prev) => Math.max(0, prev - MISMATCH_PENALTY))
    setLocked(true)
    announce(`不是一对，扣 ${MISMATCH_PENALTY} 分`)
    mismatchTimerRef.current = window.setTimeout(() => {
      mismatchTimerRef.current = null
      setFirstIndex(null)
      setSecondIndex(null)
      setLocked(false)
    }, MISMATCH_DELAY_MS)
  }

  /** 右上角状态：进行中显示倒计时，结束后显示结果 */
  const statusText =
    phase === 'won'
      ? '全部配对！'
      : phase === 'lost'
        ? '时间到'
        : `剩余 ${remaining} 秒`

  return (
    <GameShell
      name="翻牌记忆"
      tagline="翻开两张一样的牌"
      highScore={highScore}
      score={score}
      status={statusText}
      onRestart={restart}
      instructions={INSTRUCTIONS}
    >
      {/* ============ 统计 ============ */}
      <div className="mb-2 grid grid-cols-3 gap-1.5 font-display text-[10px] sm:gap-2 sm:text-[11px]">
        <div className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1">
          <p className="text-dust">步数</p>
          <p className="text-paper">{moves}</p>
        </div>
        <div className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1">
          <p className="text-dust">已配对</p>
          <p className="text-paper">
            {matchedCount}/{PAIR_COUNT}
          </p>
        </div>
        <div className="rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1">
          <p className="text-dust">用时</p>
          <p className="text-paper">{seconds} 秒</p>
        </div>
      </div>

      {/* 状态播报：视觉上隐藏，只给读屏用 */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        <span key={liveSeq}>{liveMessage}</span>
      </p>

      {/* ============ 牌桌 ============ */}
      <div className="relative mx-auto w-full max-w-[19rem]">
        <div
          role="group"
          aria-label={`牌桌，4 行 4 列共 ${CARD_COUNT} 张牌，已配对 ${matchedCount} 对`}
          className="grid grid-cols-4 grid-rows-4 gap-1.5 sm:gap-2"
        >
          {deck.map((card, index) => {
            const isMatched = matchedIds.includes(card.id)
            const isFlipped = isMatched || firstIndex === index || secondIndex === index

            // aria-label 说明状态；背面朝上时不报物件名，避免读屏用户被剧透
            const cardLabel = isMatched
              ? `${card.label}，已配对`
              : isFlipped
                ? `${card.label}，已翻开`
                : `第 ${index + 1} 张牌，未翻开`

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => handleFlip(index)}
                disabled={isMatched || phase !== 'playing'}
                aria-label={cardLabel}
                className={cn(
                  'relative block aspect-square w-full rounded-lg',
                  '[perspective:700px]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lamp/70',
                  'disabled:cursor-default',
                )}
              >
                {/* 会翻转的那一层：preserve-3d 让正反两面在 3D 空间里各占一面 */}
                <span
                  className={cn(
                    'absolute inset-0 rounded-lg transition-transform duration-500 ease-out',
                    '[transform-style:preserve-3d]',
                    isFlipped ? '[transform:rotateY(180deg)]' : '[transform:rotateY(0deg)]',
                  )}
                >
                  {/* 背面朝上时看到的牌背 */}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-0 flex items-center justify-center rounded-lg border',
                      'border-white/10 bg-gradient-to-br from-room to-roomDeep',
                      'font-display text-sm text-dust/70 sm:text-base',
                      'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
                      '[backface-visibility:hidden]',
                      !isMatched && phase === 'playing' && 'hover:border-lamp/40',
                    )}
                  >
                    ?
                  </span>

                  {/* 翻开后看到的牌面（预先转了 180°，所以翻过来正好朝前） */}
                  <span
                    className={cn(
                      'absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-lg border',
                      'px-0.5 [backface-visibility:hidden] [transform:rotateY(180deg)]',
                      isMatched
                        ? 'border-rain/60 bg-rain/15'
                        : 'border-lamp/40 bg-room/80 shadow-[0_0_20px_-8px_rgba(247,200,115,0.6)]',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn('text-2xl leading-none sm:text-3xl', isMatched && 'animate-breathe')}
                    >
                      {card.emoji}
                    </span>
                    <span
                      className={cn(
                        'font-display text-[9px] leading-none sm:text-[10px]',
                        isMatched ? 'text-rain' : 'text-paper/85',
                      )}
                    >
                      {card.label}
                    </span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* ============ 结算面板 ============ */}
        {phase !== 'playing' && (
          <div className="absolute inset-0 z-10 flex animate-rise-in flex-col items-center justify-center gap-2 rounded-xl bg-night/90 px-4 text-center backdrop-blur-sm">
            <p className="font-display text-xs text-lamp sm:text-sm">
              {phase === 'won' ? '房间里的东西都找齐了' : '时间到，灯灭了'}
            </p>
            <p className="font-display text-3xl text-paper">{score}</p>
            <p className="text-[11px] leading-relaxed text-dust">
              {phase === 'won' ? `时间奖励 +${timeBonus} · ` : ''}
              用时 {seconds} 秒 · 步数 {moves}
              {phase === 'lost' ? ` · 还剩 ${PAIR_COUNT - matchedCount} 对没找到` : ''}
            </p>
            <Button size="sm" onClick={restart}>
              再来一局
            </Button>
          </div>
        )}
      </div>
    </GameShell>
  )
}
