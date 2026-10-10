'use client'

import * as React from 'react'
import { Minus, Plus, Radio, RotateCcw, Signal } from 'lucide-react'

import { GameShell } from '@/components/games/game-shell'
import { Button } from '@/components/ui/button'
import { playSfx } from '@/lib/audio/sfx'
import { hydrateSave, persistSave } from '@/lib/games/save'
import {
  EMPTY_RADIO_SAVE,
  RADIO_LOCK_THRESHOLD,
  RADIO_MAX,
  RADIO_MIN,
  RADIO_STATIONS,
  RADIO_STEP,
  type RadioSave,
  type RadioStation,
  availableStations,
  clampFrequency,
  formatFrequency,
  foundCount,
  isDeepNightAt,
  noteStationFound,
  signalAt,
} from '@/lib/games/radio'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/achievement-store'

/**
 * 调频。
 *
 * 手感全靠三件事（逻辑在 lib/games/radio.ts）：
 *   信号随距离衰减、随机干扰把整段压掉、台偶尔跳频要追着微调。
 *
 * 噪音不是放出来的音频（这站所有声音都必须用户主动开），
 * 而是一排随机高度的竖条 —— 看着像雪花，收到台之后高度收敛成一条平的波形。
 *
 * 点歌台和树洞回音用的是**真实数据**（服务端读好传进来）：
 * 点歌台会念出唱片架上的歌名，树洞回音念的是墙上真实的一封信。
 */

const SAVE_SLUG = 'radio'

/** 噪音条的根数 */
const NOISE_BARS = 44

export interface RadioDynamicData {
  /** 唱片架上的歌名，点歌台会念 */
  tracks: string[]
  /** 树洞墙上的信，树洞回音会念 */
  echoes: string[]
}

export interface GameRadioProps {
  /**
   * 真实素材（唱片架的歌名、树洞墙上的信）。不传就退化成「空台」。
   *
   * 可选的原因和照片拼图那边一样：要能塞进 GAME_COMPONENTS 那张表。
   */
  dynamic?: RadioDynamicData
  highScore: number
  reportScore: (score: number) => void
}

export function GameRadio({ dynamic: dynamicProp, highScore, reportScore }: GameRadioProps) {
  const dynamic = React.useMemo<RadioDynamicData>(
    () => dynamicProp ?? { tracks: [], echoes: [] },
    [dynamicProp],
  )

  /**
   * 开局停在一个**没有台**的频率上。
   *
   * 第一版停在 88.7（天气预报），一进来就自动"收到"了 —— 白送一个台，
   * 而且玩家什么都没做就看到成就/图鉴动了，会以为是页面坏了。
   * 85.0 附近六个台都不占，得自己拧过去。
   */
  const [dial, setDial] = React.useState(85)
  const [save, setSave] = React.useState<RadioSave>(EMPTY_RADIO_SAVE)
  const [now, setNow] = React.useState(() => Date.now())
  const [locked, setLocked] = React.useState<RadioStation | null>(null)
  /**
   * 咬住这个台之后要念的内容。
   *
   * **必须缓存成 state**：点歌台和树洞回音是从真实数据里随机挑一条的，
   * 如果在渲染时现算，组件每 110ms 的心跳都会让它换一句，
   * 屏幕上的字会疯狂闪烁。第一版就是这么写的。
   */
  const [lockedLines, setLockedLines] = React.useState<string[]>([])
  const [lineIndex, setLineIndex] = React.useState(0)
  const [bars, setBars] = React.useState<number[]>(() => Array(NOISE_BARS).fill(0.1))
  const [cloudNote, setCloudNote] = React.useState<string | null>(null)

  const knobRef = React.useRef<HTMLDivElement | null>(null)

  /**
   * 这次会话里已经「宣布」过的台。
   *
   * 为什么需要：锁定这件事会被反复触发 ——
   *   · 开发环境的 StrictMode 会把 effect 跑两遍
   *   · 信号抖动时会掉出阈值再咬回来，等于又"刚收到"一次
   * 每一次都推一条气泡、解锁一次成就的话，屏幕上会叠三张一样的提示
   * （第一版就是这个效果）。图鉴那边有 noteStationFound 兜幂等，
   * 但气泡和成就是副作用，得单独挡一道。
   */
  const announcedRef = React.useRef<Set<string>>(new Set())

  /* ---------------- 存档 ---------------- */

  React.useEffect(() => {
    let alive = true
    void hydrateSave<RadioSave>(SAVE_SLUG, EMPTY_RADIO_SAVE, (cloud) => {
      if (alive) {
        setSave(cloud)
        setCloudNote('从云端读到了你在别的设备上收到过的台。')
      }
    }).then((envelope) => {
      if (alive) setSave(envelope.state)
    })
    return () => {
      alive = false
    }
  }, [])

  /* ---------------- 心跳：信号与噪音 ---------------- */

  React.useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now())
      // 噪音条：收到台之后收敛，没信号时乱跳
      setBars((previous) =>
        previous.map((_, index) => {
          const seed = index * 1.7
          const random = Math.abs(Math.sin(seed + Date.now() * 0.004))
          return random
        }),
      )
    }, 110)
    return () => window.clearInterval(id)
  }, [])

  const moment = React.useMemo(() => new Date(now), [now])
  const stations = React.useMemo(() => availableStations(RADIO_STATIONS, moment), [moment])
  const signal = React.useMemo(() => signalAt(dial, now, stations), [dial, now, stations])

  /** 强度换算成 0–1 的「稳定度」，噪音条和仪表都看它 */
  const stability = signal.strength

  /* ---------------- 收到台 ---------------- */

  React.useEffect(() => {
    const station = signal.strength >= RADIO_LOCK_THRESHOLD ? signal.station : null

    if (!station) {
      setLocked(null)
      return
    }

    // 已经宣布过这个台了：只要界面还指着它就行，副作用一概不重复
    if (announcedRef.current.has(station.id)) {
      setLocked((current) => (current?.id === station.id ? current : station))
      return
    }
    announcedRef.current.add(station.id)
    setLocked(station)
    void playSfx('crackle')

    // 副作用（图鉴、上报、成就）都放在 setState 之外 ——
    // 塞进 updater 里的话 StrictMode 会把它们跑两遍。
    const nextSave = noteStationFound(save, station.id)
    if (nextSave !== save) {
      setSave(nextSave)
      persistSave(SAVE_SLUG, nextSave)
      reportScore(foundCount(nextSave))
    }

    // 只靠成就系统弹提示就够了（unlock 内部会推一条），
    // 这里再 pushToast 一次会出现两张内容几乎一样的提示。
    if (station.id === 'hidden') {
      useAchievementStore.getState().unlock('hidden_frequency')
    }
    if (station.id === 'alien') {
      // 和房间里的稀有事件共用同一个成就 —— 两条路都能到
      useAchievementStore.getState().unlock('alien_radio')
    }
  }, [reportScore, save, signal.station, signal.strength])

  /**
   * 台里的台词：**按「当前锁定的是哪个台」重建**，和上面那个 effect 分开。
   *
   * 为什么必须分开：信号抖动时会短暂掉出阈值，locked 变成 null、再咬回来。
   * 如果台词的重建挂在"第一次宣布"那条路径上，第二次咬住同一个台时
   * 就会走进短路分支，locked 有了但台词还是空的 —— 屏幕上只剩奖励那句话。
   * 第一版就是这个症状。
   */
  const linesForRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    // 掉线时**不清** linesForRef：信号抖动经常掉一下又咬回来，
    // 清掉的话同一个台会被当成"新台"，台词从头开始念，永远停在第一句。
    if (!locked) return
    if (linesForRef.current === locked.id) return

    // 真的换台了才重建台词、才把进度归零
    linesForRef.current = locked.id
    setLockedLines(buildStationLines(locked, dynamic))
    setLineIndex(0)
  }, [dynamic, locked])

  // 台里的内容一行一行放出来。
  // 依赖用 `locked?.id` 而不是 `locked` 对象：信号抖动会让 locked 在
  // null 和台之间来回切，用对象当依赖的话每次都重新计时，永远念不到第二句。
  const lockedId = locked?.id ?? null
  React.useEffect(() => {
    if (!lockedId || lockedLines.length === 0) return
    if (lineIndex >= lockedLines.length - 1) return
    const id = window.setTimeout(() => setLineIndex((value) => value + 1), 1800)
    return () => window.clearTimeout(id)
  }, [lineIndex, lockedLines.length, lockedId])

  /* ---------------- 调谐 ---------------- */

  const tune = (next: number, countAsScan = false) => {
    const value = clampFrequency(next)
    setDial(value)
    if (countAsScan) {
      setSave((old) => {
        const nextSave = { ...old, scans: old.scans + 1 }
        persistSave(SAVE_SLUG, nextSave)
        return nextSave
      })
    }
  }

  /** 旋钮：按角度拖动 */
  const onKnobPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = knobRef.current
    if (!element) return
    if (event.type === 'pointerdown') {
      element.setPointerCapture(event.pointerId)
    }
    if (event.buttons === 0 && event.type === 'pointermove') return

    const rect = element.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const angle = Math.atan2(event.clientY - cy, event.clientX - cx)

    // 把角度映射到频率：从左下开始顺时针一圈
    const normalized = (angle + Math.PI * 0.75 + Math.PI * 2) % (Math.PI * 2)
    const fraction = normalized / (Math.PI * 2)
    tune(RADIO_MIN + fraction * (RADIO_MAX - RADIO_MIN))
  }

  const fraction = (dial - RADIO_MIN) / (RADIO_MAX - RADIO_MIN)
  const deepNight = isDeepNightAt(moment)

  return (
    <GameShell
      name="调频"
      tagline={locked ? `${locked.name} · ${formatFrequency(dial)}` : '噪音'}
      highScore={Math.max(highScore, foundCount(save))}
      status={`${formatFrequency(dial)} MHz`}
      onRestart={() => {
        setSave((old) => ({ ...old, scans: 0 }))
        tune(88.7)
      }}
      instructions={[
        '拖旋钮、拉滑块，或者用 ±0.5 慢慢找。80 到 108 之间。',
        '信号强度过线才算收到，收过的台会进图鉴。',
        '偶尔会有干扰和跳频，信号抖的时候微调一下。',
        deepNight ? '现在是深夜 —— 有些台只在凌晨才出现。' : '外星广播只在凌晨 0–5 点出现。',
        `已收录 ${foundCount(save)} / ${RADIO_STATIONS.length}`,
      ]}
      controls={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" variant="outline" onClick={() => tune(dial - 0.5, true)}>
            <Minus className="h-3.5 w-3.5" />
            0.5
          </Button>
          <Button size="sm" variant="outline" onClick={() => tune(dial + 0.5, true)}>
            <Plus className="h-3.5 w-3.5" />
            0.5
          </Button>
          <Button size="sm" variant="ghost" onClick={() => tune(107.9, true)}>
            <Radio className="h-3.5 w-3.5" />
            跳到最右
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {/* ---------------- 频率 ---------------- */}
        <div className="text-center">
          <p
            className={cn(
              'font-display text-4xl tabular-nums transition-colors',
              locked ? 'text-lamp' : 'text-dust',
            )}
          >
            {formatFrequency(dial)}
          </p>
          <p className="font-display text-[10px] tracking-[0.24em] text-dust/70">MHz</p>
        </div>

        {/* ---------------- 信号强度 ---------------- */}
        <div className="w-full max-w-[20rem]">
          <div className="mb-1.5 flex items-center justify-between font-display text-[10px] text-dust">
            <span className="flex items-center gap-1.5">
              <Signal className="h-3 w-3" aria-hidden />
              信号
            </span>
            <span className={cn(locked ? 'text-lamp' : 'text-dust/70')}>
              {Math.round(stability * 100)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-100',
                locked ? 'bg-lamp' : 'bg-rain/60',
              )}
              style={{ width: `${Math.round(stability * 100)}%` }}
            />
          </div>
          {/* 过线的位置标一下，让人知道要拧到哪儿 */}
          <div className="relative mt-0.5 h-2">
            <span
              className="absolute top-0 h-1.5 w-px bg-white/25"
              style={{ left: `${RADIO_LOCK_THRESHOLD * 100}%` }}
              aria-hidden
            />
          </div>
        </div>

        {/* ---------------- 噪音条 ---------------- */}
        <div className="flex h-16 w-full max-w-[20rem] items-end justify-between gap-[2px]">
          {bars.map((value, index) => {
            // 收到台之后：条子收成一条平稳的波形；没信号：乱跳
            const height = locked
              ? 0.34 + Math.sin(index * 0.9) * 0.06 + value * 0.05
              : 0.08 + value * 0.92
            return (
              <span
                key={index}
                className={cn(
                  'flex-1 rounded-[1px] transition-[height,background-color] duration-100',
                  locked ? 'bg-lamp/70' : 'bg-rain/25',
                )}
                style={{ height: `${Math.max(4, height * 100)}%` }}
              />
            )
          })}
        </div>

        {/* ---------------- 旋钮 + 滑块 ---------------- */}
        <div className="flex w-full flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
          {/* 旋钮（鼠标/触屏按角度拖） */}
          <div className="hidden sm:block">
            <div
              ref={knobRef}
              role="slider"
              tabIndex={0}
              aria-label="调谐旋钮"
              aria-valuemin={RADIO_MIN}
              aria-valuemax={RADIO_MAX}
              aria-valuenow={Number(formatFrequency(dial))}
              onPointerDown={onKnobPointer}
              onPointerMove={onKnobPointer}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') tune(dial - 0.5, true)
                if (event.key === 'ArrowRight') tune(dial + 0.5, true)
              }}
              className="relative h-24 w-24 cursor-grab rounded-full border border-white/10 bg-gradient-to-b from-[#3a3153] to-[#1b1626] shadow-[inset_0_2px_6px_rgba(255,255,255,0.08),0_10px_24px_-12px_rgba(0,0,0,0.9)] active:cursor-grabbing"
            >
              {/* 指针 */}
              <span
                className="absolute left-1/2 top-1/2 h-9 w-[2px] origin-bottom -translate-x-1/2 rounded-full bg-lamp"
                style={{ transform: `translate(-50%, -100%) rotate(${-135 + fraction * 270}deg)` }}
                aria-hidden
              />
              <span
                className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0b0f13] ring-1 ring-white/15"
                aria-hidden
              />
            </div>
            <p className="mt-2 text-center font-display text-[10px] text-dust/70">按住拖动</p>
          </div>

          {/* 滑块（移动端主力） */}
          <div className="w-full max-w-[20rem] sm:max-w-[16rem]">
            <input
              type="range"
              min={RADIO_MIN}
              max={RADIO_MAX}
              step={RADIO_STEP}
              value={dial}
              aria-label="调谐滑块"
              onChange={(event) => tune(Number(event.target.value), true)}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/[0.08] accent-lamp"
            />
            <div className="mt-1 flex justify-between font-display text-[9px] text-dust/60">
              <span>80</span>
              <span>94</span>
              <span>108</span>
            </div>
          </div>
        </div>

        {/* ---------------- 收到的台 ---------------- */}
        <div className="w-full max-w-[22rem] rounded-xl border border-white/10 bg-black/30 p-3 text-left">
          {locked ? (
            <div className="animate-rise-in">
              <p className="mb-2 flex items-center gap-2 font-display text-xs text-lamp">
                <Radio className="h-3.5 w-3.5" aria-hidden />
                {locked.name}
                {locked.secret && (
                  <span className="rounded-full border border-neon/40 px-1.5 py-0.5 text-[9px] text-neon">
                    未登记
                  </span>
                )}
              </p>
              <ul className="space-y-1.5">
                {lockedLines.slice(0, lineIndex + 1).map((line, index) => (
                  <li key={index} className="text-[12px] leading-relaxed text-paper/80">
                    {line}
                  </li>
                ))}
              </ul>
              {locked.reward && lineIndex >= lockedLines.length - 1 && (
                <p className="mt-2 border-t border-white/[0.07] pt-2 text-[11px] leading-relaxed text-dust">
                  {locked.reward}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[12px] leading-relaxed text-dust">
              沙沙声。信号强度要过线才收得到 —— 慢慢拧，别跳太快。
            </p>
          )}
        </div>

        {/* ---------------- 图鉴 ---------------- */}
        <div className="w-full max-w-[22rem]">
          <p className="mb-1.5 font-display text-[10px] uppercase tracking-[0.18em] text-dust">
            图鉴 · {foundCount(save)} / {RADIO_STATIONS.length}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {RADIO_STATIONS.map((station) => {
              const found = save.found.includes(station.id)
              // 隐藏台没找到之前，连占位都不给 —— 不然就不叫隐藏了
              if (station.secret && !found) return null
              return (
                <li
                  key={station.id}
                  className={cn(
                    'rounded-md border px-2 py-0.5 font-display text-[10px]',
                    found
                      ? 'border-lamp/30 bg-lamp/[0.07] text-lamp'
                      : 'border-white/[0.07] bg-white/[0.02] text-dust/60',
                  )}
                >
                  {found ? `${formatFrequency(station.freq)} ${station.name}` : '？？？'}
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

/* ==========================================================================
   台词：静态的直接用，需要真实数据的接上服务端传来的内容
   ========================================================================== */

/**
 * 拼出台词。只在「刚咬住一个台」的那一刻调用一次，结果存进 state ——
 * 里面用了 Math.random 挑真实数据，每次渲染都算的话文字会闪。
 */
function buildStationLines(station: RadioStation, dynamic: RadioDynamicData): string[] {
  if (station.dynamic === 'request') {
    if (dynamic.tracks.length === 0) {
      return [...station.lines, '点歌台今天没有听众点歌。唱片架还空着。']
    }
    const picked = dynamic.tracks[Math.floor(Math.random() * dynamic.tracks.length)]
    return [...station.lines, `今晚点播的是《${picked}》。`, '点给还没睡的人。']
  }

  if (station.dynamic === 'echo') {
    if (dynamic.echoes.length === 0) {
      return [...station.lines, '这个频率上暂时没有回音。抽屉还是空的。']
    }
    const picked = dynamic.echoes[Math.floor(Math.random() * dynamic.echoes.length)]
    return [...station.lines, `「${picked}」`, '念完了。这个频率又安静下来。']
  }

  return station.lines
}
