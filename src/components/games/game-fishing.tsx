'use client'

import * as React from 'react'
import { BookOpen, CloudRain, Waves } from 'lucide-react'

import { GameShell } from '@/components/games/game-shell'
import { Button } from '@/components/ui/button'
import { playSfx } from '@/lib/audio/sfx'
import { hydrateSave, persistSave } from '@/lib/games/save'
import {
  EMPTY_FISHING_SAVE,
  FISH_SPECIES,
  RARITY_LABEL,
  type FishSpecies,
  type FishingConditions,
  type FishingSave,
  biteWindow,
  collectionProgress,
  isInTarget,
  noteCatch,
  noteEscape,
  rollBiteDelay,
  rollFish,
  rollTargetCenter,
} from '@/lib/games/fishing'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/achievement-store'
import { useEventStore } from '@/stores/event-store'
import { useRoomStore } from '@/stores/room-store'

/**
 * 钓鱼。
 *
 * 一竿四拍：抛竿 → 等鱼影 → 咬钩（短反应窗口）→ 提竿（力度条停绿区）。
 * 两处判定叠起来才有"等 + 抓"的节奏；只有力度条就变成纯手速游戏了。
 *
 * 场景是手写的 CSS/SVG（和房间一样，不用图片）：
 * 雨丝、水面、浮标、靠近的鱼影。
 * 天气读的是房间那边的雨势状态 —— 只是读一个"现在下不下雨"，不是联动玩法。
 */

const SAVE_SLUG = 'fishing'

type Phase = 'idle' | 'waiting' | 'biting' | 'reeling' | 'result'

export interface GameFishingProps {
  highScore: number
  reportScore: (score: number) => void
}

export function GameFishing({ highScore, reportScore }: GameFishingProps) {
  const rain = useRoomStore((state) => state.ambient.rain)

  const [save, setSave] = React.useState<FishingSave>(EMPTY_FISHING_SAVE)
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [target, setTarget] = React.useState<FishSpecies | null>(null)
  const [marker, setMarker] = React.useState(0)
  const [zone, setZone] = React.useState({ center: 0.5, tolerance: 0.3 })
  const [result, setResult] = React.useState<{ fish: FishSpecies; landed: boolean; why: string } | null>(null)
  const [cloudNote, setCloudNote] = React.useState<string | null>(null)
  /** 鱼影的靠近程度 0–1，只影响画面 */
  const [approach, setApproach] = React.useState(0)

  const timers = React.useRef<number[]>([])
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  React.useEffect(() => clearTimers, [])

  /* ---------------- 存档 ---------------- */

  React.useEffect(() => {
    let alive = true
    void hydrateSave<FishingSave>(SAVE_SLUG, EMPTY_FISHING_SAVE, (cloud) => {
      if (alive) {
        setSave(cloud)
        setCloudNote('从云端读到了你在别的设备上的图鉴。')
      }
    }).then((envelope) => {
      if (alive) setSave(envelope.state)
    })
    return () => {
      alive = false
    }
  }, [])

  const deepNight = isDeepNightLocal()
  // 房间那边的雨势直接就是 light / normal / heavy，和钓鱼这边的定义一致
  const conditions: FishingConditions = { rain, deepNight }

  /* ---------------- 抛竿 ---------------- */

  const cast = () => {
    if (phase === 'waiting' || phase === 'biting' || phase === 'reeling') return
    clearTimers()

    setResult(null)
    setTarget(null)
    setApproach(0)
    setPhase('waiting')
    void playSfx('click')

    const fish = rollFish(conditions)
    const delay = rollBiteDelay(fish)

    // 鱼影分几步靠近，纯画面
    ;[0.25, 0.5, 0.75, 1].forEach((value, index) => {
      later(() => setApproach(value), (delay / 4) * (index + 1))
    })

    later(() => {
      setTarget(fish)
      setPhase('biting')
      void playSfx('hover')

      // 反应窗口过了还没提竿 → 鱼走
      later(() => {
        setPhase((current) => {
          if (current !== 'biting') return current
          setResult({ fish, landed: false, why: '提竿晚了，它把饵吐了出来。' })
          setSave((old) => {
            const next = noteEscape(old)
            persistSave(SAVE_SLUG, next)
            return next
          })
          return 'result'
        })
      }, biteWindow(fish))
    }, delay)
  }

  /* ---------------- 咬钩时提竿 ---------------- */

  const hook = () => {
    setPhase('reeling')
    setZone({ center: rollTargetCenter(), tolerance: target?.tolerance ?? 0.25 })
    setMarker(0)
    void playSfx('page')
  }

  /* ---------------- 力度条扫描 ---------------- */

  const sweepSpeed = target?.sweepSpeed ?? 1

  React.useEffect(() => {
    if (phase !== 'reeling') return

    let raf = 0
    const start = performance.now()

    const loop = (now: number) => {
      const elapsed = (now - start) / 1000
      const cycle = (elapsed * sweepSpeed) % 2
      setMarker(cycle <= 1 ? cycle : 2 - cycle)
      raf = window.requestAnimationFrame(loop)
    }

    raf = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(raf)
  }, [phase, sweepSpeed])

  /* ---------------- 提竿 ---------------- */

  const reel = () => {
    if (phase !== 'reeling' || !target) return

    const landed = isInTarget(marker, zone.center, zone.tolerance)

    if (landed) {
      setResult({ fish: target, landed: true, why: '' })
      setPhase('result')
      void playSfx('letter')

      setSave((old) => {
        const next = noteCatch(old, target)
        persistSave(SAVE_SLUG, next)
        reportScore(Object.keys(next.caught).length)
        return next
      })

      if (target.rarity === 'legendary') {
        useAchievementStore.getState().unlock('rare_catch')
        useEventStore
          .getState()
          .pushToast(`${target.name}。捞上来的时候，鳞还在发光。`, 'hidden', 'handheld')
      }
    } else {
      setResult({
        fish: target,
        landed: false,
        why: marker < zone.center ? '收得太急，线断了。' : '拉得太猛，钩脱了。',
      })
      setPhase('result')
      void playSfx('static')

      setSave((old) => {
        const next = noteEscape(old)
        persistSave(SAVE_SLUG, next)
        return next
      })
    }
  }

  const progress = collectionProgress(save)
  const record = save.record ? FISH_SPECIES.find((fish) => fish.id === save.record) : undefined

  return (
    <GameShell
      name="钓鱼"
      tagline={
        phase === 'idle'
          ? '池塘很安静'
          : phase === 'waiting'
            ? '盯着浮标…'
            : phase === 'biting'
              ? '咬钩了！'
              : phase === 'reeling'
                ? '别让它跑'
                : '这一竿结束了'
      }
      highScore={Math.max(highScore, progress.done)}
      status={`${RAIN_LABEL[rain]} · ${deepNight ? '凌晨' : '夜里'}`}
      onRestart={phase === 'idle' ? undefined : () => {
        clearTimers()
        setPhase('idle')
        setResult(null)
        setTarget(null)
        setApproach(0)
      }}
      instructions={[
        '点「抛竿」，然后等浮标动。',
        '浮标一沉就点「提竿」—— 慢了鱼就吐饵走了。',
        '上钩之后力度条会来回扫，在绿区里点「收线」才拉得上来。',
        `雨势和时段会改概率：下雨时鲫鱼和锦鲤更容易上钩${deepNight ? '；现在是凌晨，星光鱼会出现' : '；星光鱼只在凌晨 0–5 点出现'}。`,
        `图鉴 ${progress.done} / ${progress.total}${record ? ` · 最好的一条：${record.name}` : ''}`,
      ]}
      controls={
        <div className="flex flex-wrap items-center justify-center gap-2">
          {phase === 'idle' || phase === 'result' ? (
            <Button size="sm" onClick={cast}>
              <Waves className="h-3.5 w-3.5" />
              抛竿
            </Button>
          ) : phase === 'biting' ? (
            <Button size="sm" onClick={hook} className="animate-breathe">
              提竿！
            </Button>
          ) : phase === 'reeling' ? (
            <Button size="sm" onClick={reel}>
              收线
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              等鱼影…
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3">
        {/* ---------------- 场景 ---------------- */}
        <div className="relative aspect-[16/10] w-full max-w-[22rem] overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-[#131a2a] to-[#0b0f16]">
          {/* 雨丝 */}
          {AREA_RAIN.map((item, index) => (
            <span
              key={index}
              aria-hidden
              className="animate-rainfall absolute top-0 w-px bg-gradient-to-b from-transparent via-rain/45 to-transparent"
              style={{
                left: `${item.left}%`,
                height: rain === 'heavy' ? '26px' : '16px',
                animationDelay: `${item.delay}s`,
                animationDuration: rain === 'heavy' ? '0.5s' : '0.95s',
              }}
            />
          ))}

          {/* 月亮 */}
          <span
            aria-hidden
            className="absolute right-5 top-4 h-6 w-6 rounded-full bg-paper/80 shadow-[0_0_22px_rgba(244,238,231,0.45)]"
          />

          {/* 水面。
              比夜色亮一档：鱼影是**比水更深**的一块，水太黑的话影子就看不见了。 */}
          <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-b from-[#1d3350] to-[#0d1728]">
            {[0, 1, 2, 3].map((row) => (
              <span
                key={row}
                aria-hidden
                className="absolute inset-x-0 h-px bg-white/[0.09]"
                style={{ top: `${18 + row * 20}%` }}
              />
            ))}
          </div>

          {/* 鱼影：等待时慢慢靠近。
              深色剪影 + 一圈淡淡的高光边，这样在深水上也能看出是个"东西"在游。 */}
          <span
            aria-hidden
            className={cn(
              'absolute left-1/2 h-5 w-14 -translate-x-1/2 rounded-[50%] transition-all duration-700',
              'bg-[#050a12] shadow-[0_0_0_1px_rgba(200,220,255,0.10)] ring-1 ring-white/[0.06]',
              phase === 'biting' ? 'opacity-100' : 'opacity-80',
            )}
            style={{
              top: `${52 + (1 - approach) * 20}%`,
              transform: `translateX(-50%) scale(${0.6 + approach * 0.55})`,
            }}
          />

          {/* 浮标：竖着的那根 */}
          <span
            aria-hidden
            className={cn(
              'absolute left-1/2 h-6 w-[3px] -translate-x-1/2 rounded-full transition-all duration-150',
              phase === 'biting' ? 'translate-y-3 bg-neon shadow-[0_0_10px_rgba(231,138,166,0.8)]' : 'bg-lamp',
            )}
            style={{ top: '56%' }}
          />

          {/* 咬钩时的水花 */}
          {phase === 'biting' && (
            <span
              aria-hidden
              className="animate-breathe absolute left-1/2 top-[60%] h-12 w-12 -translate-x-1/2 rounded-full border-2 border-neon/50"
            />
          )}

          {/* 场景角标 */}
          <span className="absolute bottom-2 left-3 flex items-center gap-1 font-display text-[10px] text-dust/70">
            <CloudRain className="h-2.5 w-2.5" />
            {RAIN_LABEL[rain]}
          </span>
        </div>

        {/* ---------------- 力度条 ---------------- */}
        {phase === 'reeling' && target && (
          <div className="w-full max-w-[22rem]">
            <p className="mb-1.5 flex items-center justify-between font-display text-[10px] text-dust">
              <span>力度 · 绿区里收线</span>
              <span className="text-lamp">{target.name}</span>
            </p>
            <div className="relative h-7 overflow-hidden rounded-lg border border-white/10 bg-black/40">
              {/* 绿区 */}
              <span
                className="absolute inset-y-0 bg-[#7fa86a]/35"
                style={{
                  left: `${(zone.center - zone.tolerance / 2) * 100}%`,
                  width: `${zone.tolerance * 100}%`,
                }}
              />
              {/* 标记 */}
              <span
                className="absolute inset-y-0 w-[3px] bg-lamp shadow-[0_0_10px_rgba(247,200,115,0.9)]"
                style={{ left: `${marker * 100}%` }}
              />
            </div>
            <p className="mt-1 text-center text-[10px] text-dust/70">
              窗口越窄说明这条越稀有
            </p>
          </div>
        )}

        {/* ---------------- 结果 ---------------- */}
        {phase === 'result' && result && (
          <div
            className={cn(
              'animate-rise-in w-full max-w-[22rem] rounded-xl border p-3.5 text-left',
              result.landed ? 'border-lamp/25 bg-lamp/[0.05]' : 'border-white/10 bg-white/[0.02]',
            )}
          >
            {result.landed ? (
              <>
                <p className="flex items-center gap-2 font-display text-sm text-lamp">
                  <span className="text-lg" aria-hidden>
                    {result.fish.emoji}
                  </span>
                  {result.fish.name}
                  <span className="rounded-full border border-white/15 px-1.5 py-0.5 text-[9px] text-dust">
                    {RARITY_LABEL[result.fish.rarity]}
                  </span>
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-paper/80">{result.fish.note}</p>
              </>
            ) : (
              <>
                <p className="font-display text-sm text-dust">
                  {result.fish.emoji} {result.fish.name} · 跑了
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                  {result.why}
                </p>
              </>
            )}
          </div>
        )}

        {/* ---------------- 图鉴 ---------------- */}
        <div className="w-full max-w-[22rem]">
          <p className="mb-1.5 flex items-center gap-1.5 font-display text-[10px] uppercase tracking-[0.18em] text-dust">
            <BookOpen className="h-3 w-3" aria-hidden />
            图鉴 · {progress.done} / {progress.total}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {FISH_SPECIES.map((fish) => {
              const caught = save.caught[fish.id]
              return (
                <li
                  key={fish.id}
                  className={cn(
                    'rounded-md border px-2 py-0.5 font-display text-[10px]',
                    caught
                      ? 'border-lamp/30 bg-lamp/[0.07] text-lamp'
                      : 'border-white/[0.07] bg-white/[0.02] text-dust/50',
                  )}
                >
                  {caught ? `${fish.emoji} ${fish.name} ×${caught.count}` : '？？？'}
                </li>
              )
            })}
          </ul>
        </div>

        {cloudNote && <p className="text-[11px] text-rain/80">{cloudNote}</p>}
      </div>
    </GameShell>
  )
}

/** 雨丝的位置写死，免得每次渲染都跳 */
const AREA_RAIN = [8, 19, 31, 44, 57, 68, 79, 91].map((left, index) => ({
  left,
  delay: index * 0.23,
}))

/** 雨势的中文（雨停了也是一个状态，不能显示成"中雨"） */
const RAIN_LABEL: Record<string, string> = {
  none: '雨停了',
  light: '小雨',
  normal: '中雨',
  heavy: '大雨',
}

/** 现在是不是凌晨 0–5 点。只在客户端调用 */
function isDeepNightLocal(): boolean {
  const hour = new Date().getHours()
  return hour >= 0 && hour < 5
}
