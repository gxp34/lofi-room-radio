'use client'

import * as React from 'react'
import {
  Hand,
  Heart,
  Moon,
  Sparkles,
  Sun,
  Utensils,
} from 'lucide-react'

import { GameShell } from '@/components/games/game-shell'
import { CatArt } from '@/components/room/cat-poses'
import { Button } from '@/components/ui/button'
import { playSfx } from '@/lib/audio/sfx'
import { hydrateSave, persistSave } from '@/lib/games/save'
import {
  CAT_ACTIONS,
  MAX_LEVEL,
  POSE_UNLOCKS,
  type CatActionId,
  type VirtualCatState,
  applyDecay,
  canDoAction,
  catStatusLabel,
  cooldownLeft,
  createInitialCat,
  doAction,
  expForLevel,
  levelProgress,
  pickCatLine,
  pickVirtualCatPose,
  visitBonus,
} from '@/lib/games/virtual-cat'
import { CAT_POSE_LABEL } from '@/lib/cat'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/achievement-store'

/**
 * 电子猫。
 *
 * **完全独立的一只猫**：不读房间状态、不读钓鱼图鉴、不读手帐和音乐。
 * 只有自己那几个数字和掌机里的时间。
 * （姿势的图画复用了房间猫的 SVG —— 那只是复用素材，不是共享状态。）
 *
 * 结算时机只有两个：**打开的时候**和**页面在的时候每分钟**。
 * 不做后台定时器 —— 关掉页面之后猫不会"偷偷"衰减，
 * 下次打开时按时间差一次算完（applyDecay 就是这么设计的）。
 */

const SAVE_SLUG = 'virtual-cat'

/** 结算间隔：页面开着的时候每分钟重算一次 */
const TICK_MS = 60_000

export interface GameVirtualCatProps {
  highScore: number
  reportScore: (score: number) => void
}

export function GameVirtualCat({ highScore, reportScore }: GameVirtualCatProps) {
  const [cat, setCat] = React.useState<VirtualCatState>(() => createInitialCat())
  const [ready, setReady] = React.useState(false)
  const [line, setLine] = React.useState<string>('（它刚醒，还没看清你。）')
  const [flash, setFlash] = React.useState<string | null>(null)
  const [cloudNote, setCloudNote] = React.useState<string | null>(null)

  const settledRef = React.useRef(false)

  /* ---------------- 读存档 + 首次结算 ---------------- */

  React.useEffect(() => {
    let alive = true

    void (async () => {
      const envelope = await hydrateSave<VirtualCatState>(SAVE_SLUG, createInitialCat(), (cloud) => {
        if (alive) setCloudNote('从云端读到了你在别的设备上养的那只。')
      })

      if (!alive) return

      // applyDecay 先按离线时长结算，再记到访拿连续奖励
      const decayed = applyDecay(envelope.state)
      const { next, gained } = visitBonus(decayed)

      setCat(next)
      setReady(true)
      setLine(pickCatLine(next).text)

      // 第一次结算就把结果落盘，免得刷新一次又算一遍
      if (!settledRef.current) {
        settledRef.current = true
        persistSave(SAVE_SLUG, next)
        if (gained > 0) setFlash(`今天第一次来，它记下了。经验 +${gained}`)
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  /* ---------------- 页面开着时每分钟结算 ---------------- */

  React.useEffect(() => {
    if (!ready) return

    const id = window.setInterval(() => {
      setCat((current) => {
        const next = applyDecay(current)
        if (next === current) return current
        persistSave(SAVE_SLUG, next)
        return next
      })
    }, TICK_MS)

    return () => window.clearInterval(id)
  }, [ready])

  /* ---------------- 亲密度满了就解锁成就 ---------------- */

  const unlockedRef = React.useRef(false)
  React.useEffect(() => {
    if (!ready || unlockedRef.current) return
    if (cat.affinity < 100) return
    unlockedRef.current = true
    useAchievementStore.getState().unlock('cat_bond')
  }, [cat.affinity, ready])

  /* ---------------- 经验上报（存进本地最高分，顺便当"摸鱼大师"的分数）------- */

  const reportedRef = React.useRef(-1)
  React.useEffect(() => {
    if (!ready) return
    const level = levelProgress(cat.exp).level
    if (level === reportedRef.current) return
    reportedRef.current = level
    reportScore(level)
  }, [cat.exp, ready, reportScore])

  /* ---------------- 动作 ---------------- */

  const act = (id: CatActionId) => {
    if (!canDoAction(cat, id)) {
      setFlash(`${CAT_ACTIONS.find((item) => item.id === id)?.label ?? ''}还要再等一会儿。`)
      return
    }

    const { next, message } = doAction(cat, id)
    setCat(next)
    persistSave(SAVE_SLUG, next)
    setFlash(message)
    setLine(pickCatLine(next).text)
    void playSfx(id === 'feed' ? 'click' : id === 'sleep' ? 'purr' : 'hover')
  }

  const poseChoice = pickVirtualCatPose(cat)
  const progress = levelProgress(cat.exp)
  const asleep = cat.sleepingSince !== null
  const now = new Date()

  return (
    <GameShell
      name="电子猫"
      tagline={catStatusLabel(cat)}
      highScore={Math.max(highScore, progress.level)}
      score={progress.level}
      status={`Lv.${progress.level} · 亲密 ${Math.round(cat.affinity)}`}
      instructions={[
        '它有三个数字：饱食度、心情、亲密度。前两个随时间掉，亲密度只会涨。',
        '喂食 / 抚摸 / 玩耍都有冷却 —— 连点按钮不会更快。',
        '睡觉是个开关：睡着的猫掉状态慢一半，心情还会回。睡满 20 分钟再叫醒有奖励。',
        '连续几天来看它，经验一次比一次多。',
        `亲密度到 100 会叼来一把小钥匙（现在 ${Math.round(cat.affinity)}）。`,
      ]}
      controls={
        <div className="flex flex-wrap items-center justify-center gap-2">
          {CAT_ACTIONS.map((action) => {
            const left = cooldownLeft(cat, action.id, now)
            const usable = action.id === 'sleep' ? true : left === 0
            const Icon = ACTION_ICONS[action.id] ?? Sparkles

            return (
              <Button
                key={action.id}
                size="sm"
                variant={action.id === 'sleep' && asleep ? 'default' : 'outline'}
                disabled={!usable}
                onClick={() => act(action.id)}
                title={action.hint}
              >
                {action.id === 'sleep' && asleep ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {action.id === 'sleep' && asleep
                  ? '叫醒'
                  : usable
                    ? action.label
                    : `${action.label} ${Math.ceil(left / 60_000)}′`}
              </Button>
            )
          })}
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {/* ---------------- 猫 ---------------- */}
        <div className="relative flex h-[190px] w-full max-w-[20rem] items-end justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-[#241d33] to-[#12101c]">
          {/* 地板的暖光 */}
          <span
            aria-hidden
            className="absolute bottom-0 h-24 w-40 rounded-[50%] bg-lamp/10 blur-2xl"
          />

          <CatArt className="relative mb-6 h-32 w-32" pose={poseChoice.pose} />

          {/* 睡着时的 Z */}
          {asleep && (
            <span
              aria-hidden
              className="animate-rise absolute right-16 top-8 font-display text-xs text-dust/70"
            >
              z
            </span>
          )}

          <span className="absolute left-3 top-2.5 font-display text-[10px] text-dust/70">
            {CAT_POSE_LABEL[poseChoice.pose]} · {poseChoice.reason}
          </span>
        </div>

        {/* ---------------- 台词 ---------------- */}
        <div className="w-full max-w-[20rem] rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <p className="text-[12px] leading-relaxed text-paper/80">{line}</p>
          {flash && <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-lamp">{flash}</p>}
        </div>

        {/* ---------------- 三个数字 ---------------- */}
        <div className="w-full max-w-[20rem] space-y-2">
          <Stat label="饱食度" value={cat.fullness} tone="lamp" icon={<Utensils className="h-3 w-3" />} />
          <Stat label="心情" value={cat.mood} tone="rain" icon={<Sparkles className="h-3 w-3" />} />
          <Stat label="亲密度" value={cat.affinity} tone="neon" icon={<Heart className="h-3 w-3" />} />
        </div>

        {/* ---------------- 等级 ---------------- */}
        <div className="w-full max-w-[20rem] rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
          <div className="mb-1.5 flex items-center justify-between font-display text-[10px] text-dust">
            <span>
              Lv.{progress.level}
              {progress.level >= MAX_LEVEL ? ' · 满级' : ` / ${MAX_LEVEL}`}
            </span>
            <span>
              {progress.level >= MAX_LEVEL
                ? `${cat.exp} 经验`
                : `${progress.current} / ${progress.need}`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-lamp transition-[width] duration-300"
              style={{
                width:
                  progress.level >= MAX_LEVEL
                    ? '100%'
                    : `${Math.min(100, Math.round((progress.current / Math.max(1, progress.need)) * 100))}%`,
              }}
            />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-dust/70">
            连续到访 {cat.streak} 天 · 累计互动 {cat.totalActions} 次
            {progress.level < MAX_LEVEL ? ` · 下一级还要 ${expForLevel(progress.level)} 经验` : ''}
          </p>
        </div>

        {/* ---------------- 解锁进度 ---------------- */}
        <div className="w-full max-w-[20rem]">
          <p className="mb-1.5 font-display text-[10px] uppercase tracking-[0.18em] text-dust">
            它学会的东西
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {POSE_UNLOCKS.map((unlock) => {
              const got = cat.affinity >= unlock.affinity
              return (
                <li
                  key={unlock.pose}
                  className={cn(
                    'rounded-md border px-2 py-0.5 font-display text-[10px]',
                    got
                      ? 'border-lamp/30 bg-lamp/[0.07] text-lamp'
                      : 'border-white/[0.07] bg-white/[0.02] text-dust/50',
                  )}
                >
                  {got ? unlock.label : `亲密 ${unlock.affinity} 解锁`}
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
   小零件
   ========================================================================== */

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  feed: Utensils,
  pet: Hand,
  play: Sparkles,
  sleep: Moon,
}

function Stat({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'lamp' | 'rain' | 'neon'
  icon: React.ReactNode
}) {
  const color =
    tone === 'lamp'
      ? 'bg-lamp'
      : tone === 'rain'
        ? 'bg-rain'
        : 'bg-neon'

  const low = value < 25

  return (
    <div>
      <div className="mb-1 flex items-center justify-between font-display text-[10px] text-dust">
        <span className={cn('flex items-center gap-1.5', low && 'text-neon')}>
          {icon}
          {label}
        </span>
        <span className={cn(low && 'text-neon')}>{Math.round(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', color, low && 'animate-breathe')}
          style={{ width: `${Math.round(value)}%` }}
        />
      </div>
    </div>
  )
}
