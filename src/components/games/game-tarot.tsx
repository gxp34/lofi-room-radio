'use client'

import * as React from 'react'
import { Moon, Sparkles, Sun } from 'lucide-react'

import { GameShell } from '@/components/games/game-shell'
import { TarotCardFace } from '@/components/games/tarot-cards'
import { Button } from '@/components/ui/button'
import { playSfx } from '@/lib/audio/sfx'
import { THREE_CARD_SPREAD, drawTarot, type TarotDraw } from '@/lib/tarot'
import { cn } from '@/lib/utils'

/**
 * 塔罗占卜。
 *
 * 交互刻意做得慢一点：洗牌要等一下、牌要一张一张翻。
 * 塔罗这件事的意义有一半在"停顿"里 —— 点一下立刻出结果的话，
 * 就变成了一个随机数生成器。
 *
 * 三种状态：
 *   idle      牌背朝上摆着，等你想好问题
 *   shuffling 洗牌中（约 0.9 秒）
 *   revealed  逐张翻开，翻完显示解读
 */

type Phase = 'idle' | 'shuffling' | 'dealing'

export interface GameTarotProps {
  highScore: number
  reportScore: (score: number) => void
}

export function GameTarot({ highScore, reportScore }: GameTarotProps) {
  const [spread, setSpread] = React.useState<1 | 3>(1)
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [draws, setDraws] = React.useState<TarotDraw[]>([])
  const [revealed, setRevealed] = React.useState(0)

  /** 已经占卜过多少次（记在本地最高分里，HUD 上显示） */
  const [readings, setReadings] = React.useState(0)

  const timers = React.useRef<number[]>([])

  // 组件卸载时清掉所有定时器，否则翻牌翻到一半切走会报警告
  React.useEffect(() => {
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id))
      timers.current = []
    }
  }, [])

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }

  const start = () => {
    clearTimers()
    setDraws([])
    setRevealed(0)
    setPhase('shuffling')
    void playSfx('click')

    timers.current.push(
      window.setTimeout(() => {
        const result = drawTarot(spread)
        setDraws(result)
        setPhase('dealing')

        // 逐张翻开：从第一张开始，每张间隔 520ms
        result.forEach((_, index) => {
          timers.current.push(
            window.setTimeout(() => {
              setRevealed(index + 1)
              // 翻牌用翻页声 —— sfx 里没有专门的"翻牌"，page 最贴
              void playSfx('page')
              // 最后一张翻完，把占卜次数 +1
              if (index === result.length - 1) {
                const next = readings + 1
                setReadings(next)
                reportScore(next)
              }
            }, 480 + index * 520),
          )
        })
      }, 900),
    )
  }

  const reset = () => {
    clearTimers()
    setPhase('idle')
    setDraws([])
    setRevealed(0)
  }

  const busy = phase !== 'idle'
  const done = draws.length > 0 && revealed >= draws.length

  const instructions = [
    '先在心里想一个具体的问题，越具体越好。',
    spread === 1
      ? '点「开始占卜」，抽一张 —— 它是这件事此刻的回答。'
      : '点「开始占卜」，抽三张 —— 依次是过去、现在、接下来。',
    '逆位的牌不是凶，是同一张牌「卡住的那一面」。',
    '22 张大阿卡纳、真随机洗牌。同一个问题别连着问三遍，那不叫占卜，叫刷分。',
  ]

  return (
    <GameShell
      name="塔罗 · 大阿卡纳"
      tagline={phase === 'idle' ? '等你想好问题' : phase === 'shuffling' ? '洗牌中…' : '翻开'}
      highScore={Math.max(highScore, readings)}
      score={done ? spread : undefined}
      status={done ? `${spread} 张牌` : undefined}
      onRestart={phase === 'idle' ? undefined : reset}
      instructions={instructions}
      controls={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            {([1, 3] as const).map((n) => (
              <button
                key={n}
                type="button"
                disabled={busy}
                onClick={() => setSpread(n)}
                className={cn(
                  'px-3.5 py-2 font-display text-xs transition-colors disabled:opacity-40',
                  spread === n ? 'bg-lamp/[0.14] text-lamp' : 'text-dust hover:text-paper',
                )}
              >
                {n === 1 ? '抽一张' : '三张牌阵'}
              </button>
            ))}
          </div>

          <Button size="sm" onClick={start} disabled={busy}>
            <Sparkles className="h-3.5 w-3.5" />
            {phase === 'idle' ? '开始占卜' : '重新洗牌'}
          </Button>
        </div>
      }
    >
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-5">
        {/* ---------------- 还没开始：一副牌背 ---------------- */}
        {phase === 'idle' && (
          <div className="flex flex-col items-center gap-4">
            <Deck />
            <p className="max-w-[16rem] text-center text-[11px] leading-relaxed text-dust">
              牌都扣着。想好问题再点「开始占卜」——
              手快点下去的话，抽到的一般都是你自己的惯性。
            </p>
          </div>
        )}

        {/* ---------------- 洗牌中 ---------------- */}
        {phase === 'shuffling' && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((index) => (
                <span
                  key={index}
                  className="animate-breathe h-16 w-11 rounded-md border border-lamp/30 bg-gradient-to-b from-[#3a2f52] to-[#1b1628]"
                  style={{ animationDelay: `${index * 0.12}s` }}
                />
              ))}
            </div>
            <p className="font-display text-[11px] tracking-[0.2em] text-lamp/80">切牌中…</p>
          </div>
        )}

        {/* ---------------- 翻牌 ---------------- */}
        {draws.length > 0 && (
          <div
            className={cn(
              'flex w-full items-start justify-center gap-2.5 sm:gap-4',
              draws.length === 1 ? 'max-w-[15rem]' : '',
            )}
          >
            {draws.map((draw, index) => (
              <FlipCard
                key={`${draw.card.id}-${index}`}
                draw={draw}
                flipped={revealed > index}
                label={draws.length === 3 ? THREE_CARD_SPREAD[index].label : undefined}
              />
            ))}
          </div>
        )}

        {/* ---------------- 解读 ---------------- */}
        {done && (
          <div className="w-full space-y-3">
            {draws.map((draw, index) => (
              <Reading
                key={`${draw.card.id}-read-${index}`}
                draw={draw}
                spreadLabel={draws.length === 3 ? THREE_CARD_SPREAD[index].label : undefined}
                spreadHint={draws.length === 3 ? THREE_CARD_SPREAD[index].hint : undefined}
                onFirst={index === 0}
              />
            ))}
          </div>
        )}
      </div>
    </GameShell>
  )
}

/* ==========================================================================
   牌背
   ========================================================================== */

/** 牌背：月亮 + 太阳 + 一圈星，和牌面同一套金箔 */
function CardBack({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 340" className={cn('h-full w-full', className)} aria-hidden>
      <defs>
        <linearGradient id="tback-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#312a56" />
          <stop offset="100%" stopColor="#161126" />
        </linearGradient>
        <linearGradient id="tback-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7e3b0" />
          <stop offset="50%" stopColor="#f0c674" />
          <stop offset="100%" stopColor="#a8813c" />
        </linearGradient>
      </defs>

      <rect width="200" height="340" rx="10" fill="url(#tback-bg)" />

      {/* 菱形网格 */}
      {Array.from({ length: 9 }).map((_, row) =>
        Array.from({ length: 5 }).map((_, col) => (
          <path
            key={`${row}-${col}`}
            d={`M${20 + col * 40} ${22 + row * 38} l14 14 l-14 14 l-14 -14 Z`}
            fill="none"
            stroke="#f0c674"
            strokeWidth="0.4"
            opacity="0.16"
          />
        )),
      )}

      <rect
        x="5"
        y="5"
        width="190"
        height="330"
        rx="8"
        fill="none"
        stroke="url(#tback-gold)"
        strokeWidth="1.6"
      />
      <rect
        x="12"
        y="12"
        width="176"
        height="316"
        rx="5"
        fill="none"
        stroke="#a8813c"
        strokeWidth="0.6"
        opacity="0.6"
      />

      {/* 中央的日与月 */}
      <g transform="translate(100 170)">
        <circle r="34" fill="none" stroke="#f0c674" strokeWidth="1" opacity="0.55" />
        <circle r="26" fill="none" stroke="#f0c674" strokeWidth="0.6" opacity="0.35" />
        {/* 太阳：带射线 */}
        <circle cx="0" cy="-8" r="11" fill="#f0c674" opacity="0.9" />
        {Array.from({ length: 12 }).map((_, index) => (
          <path
            key={index}
            d="M0 -22 L0 -27"
            stroke="#f0c674"
            strokeWidth="1.2"
            opacity="0.7"
            transform={`translate(0 -8) rotate(${index * 30})`}
          />
        ))}
        {/* 月亮：在下，做成一弯 */}
        <path
          d="M0 10 A11 11 0 1 0 0 32 A14 14 0 1 1 0 10 Z"
          fill="#f7e3b0"
          opacity="0.85"
          transform="rotate(180)"
        />
      </g>

      {/* 四角的小星 */}
      {[
        [26, 26],
        [174, 26],
        [26, 314],
        [174, 314],
      ].map(([x, y]) => (
        <path
          key={`${x}-${y}`}
          d={`M${x} ${y - 5} L${x + 1.6} ${y - 1.6} L${x + 5} ${y} L${x + 1.6} ${y + 1.6} L${x} ${y + 5} L${x - 1.6} ${y + 1.6} L${x - 5} ${y} L${x - 1.6} ${y - 1.6} Z`}
          fill="#f0c674"
          opacity="0.7"
        />
      ))}
    </svg>
  )
}

/** 摊开的一叠牌背，idle 时显示 */
function Deck() {
  return (
    <div className="relative h-[190px] w-[112px]">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="absolute inset-0 block overflow-hidden rounded-lg border border-lamp/20 shadow-[0_14px_30px_-14px_rgba(0,0,0,0.9)]"
          style={{
            transform: `translate(${index * 7}px, ${index * -5}px) rotate(${(index - 1) * 3.5}deg)`,
          }}
        >
          <CardBack />
        </span>
      ))}
      <span className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full border border-lamp/40 bg-night">
        <Moon className="h-3.5 w-3.5 text-lamp" aria-hidden />
      </span>
    </div>
  )
}

/* ==========================================================================
   翻转的牌
   ========================================================================== */

function FlipCard({
  draw,
  flipped,
  label,
}: {
  draw: TarotDraw
  flipped: boolean
  label?: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      {label && (
        <span className="font-display text-[10px] tracking-[0.18em] text-dust">{label}</span>
      )}

      <div className="w-full [perspective:1200px]">
        <div
          className="relative aspect-[200/340] w-full transition-transform duration-700 ease-out [transform-style:preserve-3d]"
          style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* 正面朝下时看到的是牌背 */}
          <span className="absolute inset-0 block overflow-hidden rounded-lg shadow-[0_14px_30px_-14px_rgba(0,0,0,0.95)] [backface-visibility:hidden]">
            <CardBack />
          </span>
          {/* 翻开后是牌面（先转到背面，翻转时才正过来） */}
          <span
            className="absolute inset-0 block overflow-hidden rounded-lg [backface-visibility:hidden]"
            style={{ transform: 'rotateY(180deg)' }}
          >
            <TarotCardFace card={draw.card} reversed={draw.reversed} />
          </span>
        </div>
      </div>

      {/* 翻开之后在牌下面标一下正逆位，不用去认那个小三角 */}
      <span
        className={cn(
          'font-display text-[10px] transition-opacity duration-500',
          flipped ? 'opacity-100' : 'opacity-0',
          draw.reversed ? 'text-neon' : 'text-lamp',
        )}
      >
        {draw.reversed ? '逆位' : '正位'}
      </span>
    </div>
  )
}

/* ==========================================================================
   解读
   ========================================================================== */

function Reading({
  draw,
  spreadLabel,
  spreadHint,
  onFirst,
}: {
  draw: TarotDraw
  spreadLabel?: string
  spreadHint?: string
  onFirst?: boolean
}) {
  const { card, reversed } = draw
  const keywords = reversed ? card.reversedKeywords : card.uprightKeywords
  const meaning = reversed ? card.reversed : card.upright

  return (
    <article
      className="animate-rise-in rounded-xl border border-lamp/15 bg-lamp/[0.03] p-3.5 text-left"
      style={{ borderLeftWidth: 3, borderLeftColor: card.accent }}
    >
      <header className="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {spreadLabel && (
          <span className="rounded-full border border-white/10 px-2 py-0.5 font-display text-[10px] text-dust">
            {spreadLabel}
            {spreadHint ? ` · ${spreadHint}` : ''}
          </span>
        )}
        <span className="font-display text-xs text-dust">{card.roman}</span>
        <h3 className="font-display text-base text-paper">{card.name}</h3>
        <span className="font-display text-[10px] tracking-widest text-dust/70">
          {card.nameEn}
        </span>
        <span
          className={cn(
            'ml-auto flex items-center gap-1 font-display text-[10px]',
            reversed ? 'text-neon' : 'text-lamp',
          )}
        >
          {reversed ? <Moon className="h-3 w-3" aria-hidden /> : <Sun className="h-3 w-3" aria-hidden />}
          {reversed ? '逆位' : '正位'}
        </span>
      </header>

      <ul className="mb-2 flex flex-wrap gap-1.5">
        {keywords.map((word) => (
          <li
            key={word}
            className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] text-paper/80"
          >
            {word}
          </li>
        ))}
      </ul>

      <p className="text-[13px] leading-[1.85] text-muted-foreground">{meaning}</p>

      {/* 只给第一张牌显示意象说明，免得一屏塞满字 */}
      {onFirst && (
        <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] leading-relaxed text-dust">
          牌面：{card.motif}
        </p>
      )}
    </article>
  )
}
