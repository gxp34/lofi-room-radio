'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Gamepad2, PowerOff, Trophy } from 'lucide-react'

import { useRoom } from '@/components/providers/room-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { playSfx } from '@/lib/audio/sfx'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/achievement-store'
import { useEventStore } from '@/stores/event-store'
import type { GameDef, GameSlug } from '@/types'

/**
 * 摸鱼掌机。
 *
 * 三个游戏都是「只在客户端加载」（dynamic + ssr: false）：
 *   1. 游戏里到处是 Math.random，服务端渲染一遍纯属浪费，还容易 hydration 报错；
 *   2. 只有点开的那一个才下载代码，进来先看到的是掌机外壳而不是一整包 JS。
 *
 * 游戏列表来自数据库的 `games` 表（服务端已按 enabled = true 过滤），
 * 所以后台关掉某个游戏，这里立刻就没有那一盘卡带了。
 */

const GameLoading = () => <Skeleton className="mx-auto h-[420px] w-full max-w-xl rounded-[28px]" />

const Game2048 = dynamic(() => import('@/components/games/game-2048').then((mod) => mod.Game2048), {
  ssr: false,
  loading: GameLoading,
})

const GameSnake = dynamic(() => import('@/components/games/game-snake').then((mod) => mod.GameSnake), {
  ssr: false,
  loading: GameLoading,
})

const GameMemory = dynamic(
  () => import('@/components/games/game-memory').then((mod) => mod.GameMemory),
  { ssr: false, loading: GameLoading },
)

/** slug → 组件。没登记的 slug 会在下面被跳过（数据库里可能有别人加的游戏） */
const GAME_COMPONENTS: Record<
  string,
  React.ComponentType<{ highScore: number; reportScore: (score: number) => void }>
> = {
  '2048': Game2048,
  snake: GameSnake,
  memory: GameMemory,
}

export function GamesClient({ games }: { games: GameDef[] }) {
  const { settings } = useRoom()

  const hydrated = useAchievementStore((state) => state.hydrated)
  const bestScores = useAchievementStore((state) => state.bestScores)

  /** 只保留真的有实现的游戏 */
  const playable = React.useMemo(
    () => games.filter((game) => game.enabled && GAME_COMPONENTS[game.slug]),
    [games],
  )

  const [active, setActive] = React.useState<string>(playable[0]?.slug ?? '')

  // 如果当前这个游戏被后台关掉了，自动切到第一个还能玩的
  React.useEffect(() => {
    if (playable.length === 0) return
    if (!playable.some((game) => game.slug === active)) {
      setActive(playable[0]?.slug ?? '')
    }
  }, [playable, active])

  /** 游戏结束把分数交上来：刷新纪录就写进本地、解锁成就、飘一条气泡 */
  const reportScore = React.useCallback((slug: string, score: number) => {
    if (!Number.isFinite(score) || score <= 0) return

    const store = useAchievementStore.getState()
    const previous = store.bestScores[slug] ?? 0

    if (score > previous) {
      store.setBestScore(slug, score)
      store.unlock('slack_master')
      useEventStore
        .getState()
        .pushToast(`新纪录：${score} 分。掌机屏幕上多了一行。`, 'rare', 'handheld')
      void playSfx('click')
    } else {
      store.evaluate({
        objectType: 'handheld',
        clickCount: {},
        tracksPlayed: store.playedTrackIds.length,
        visits: { days: [], visits: 1, firstSeen: '', lastSeen: '' },
        streak: 1,
        treeholeCount: store.treeholeCount,
        bestScores: { ...store.bestScores, [slug]: score },
      })
    }
  }, [])

  /* ---------------- 游戏厅总开关被关掉了 ---------------- */
  if (!settings.gamesEnabled) {
    return (
      <div className="container max-w-lg py-20 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.02]">
          <PowerOff className="h-6 w-6 text-dust" aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-xl text-paper">掌机没电了</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          游戏厅今天关着。房东说，摸鱼也要看日子。
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">回房间</Link>
        </Button>
      </div>
    )
  }

  /* ---------------- 后台把三盘卡带全拔了 ---------------- */
  if (playable.length === 0) {
    return (
      <div className="container max-w-lg py-20 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.02]">
          <Gamepad2 className="h-6 w-6 text-dust" aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-xl text-paper">卡带都收起来了</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          掌机还在，但没有能玩的卡带。后台可以打开它们。
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/">回房间</Link>
        </Button>
      </div>
    )
  }

  const activeGame = playable.find((game) => game.slug === active) ?? playable[0]
  const ActiveGame = activeGame ? GAME_COMPONENTS[activeGame.slug] : undefined

  return (
    <div className="container py-8 sm:py-12">
      <header className="mb-6">
        <p className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-dust">
          {'// 摸鱼掌机'}
        </p>
        <h1 className="font-display text-2xl text-paper sm:text-3xl">游戏厅</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          电量还有 3%，够玩一会儿。最高分存在你自己的浏览器里，换台设备就没了 ——
          就像小时候那台真的掌机。
        </p>
      </header>

      {/* ---------------- 卡带选择 ---------------- */}
      <div role="tablist" aria-label="选择游戏" className="mb-6 flex flex-wrap gap-2">
        {playable.map((game) => {
          const score = bestScores[game.slug] ?? 0
          const isActive = activeGame?.slug === game.slug

          return (
            <button
              key={game.slug}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(game.slug as GameSlug)}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left transition-colors',
                isActive
                  ? 'border-lamp/40 bg-lamp/[0.08]'
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20',
              )}
            >
              <Gamepad2
                className={cn('h-4 w-4', isActive ? 'text-lamp' : 'text-dust')}
                aria-hidden
              />
              <span className="min-w-0">
                <span
                  className={cn(
                    'block font-display text-sm',
                    isActive ? 'text-lamp' : 'text-paper/85',
                  )}
                >
                  {game.name}
                </span>
                <span className="block font-display text-[10px] text-dust">
                  最高 {hydrated ? score : '—'}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* ---------------- 说明条 ---------------- */}
      <p className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="muted">
          <Trophy className="mr-1 h-3 w-3" aria-hidden />
          本地最高分
        </Badge>
        <span>{activeGame?.description}</span>
      </p>

      {/* ---------------- 掌机 ---------------- */}
      {ActiveGame && activeGame && (
        <ActiveGame
          highScore={bestScores[activeGame.slug] ?? 0}
          reportScore={(score) => reportScore(activeGame.slug, score)}
        />
      )}
    </div>
  )
}
