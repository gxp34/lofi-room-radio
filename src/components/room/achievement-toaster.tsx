'use client'

import * as React from 'react'
import { Sparkles, X } from 'lucide-react'

import { Icon } from '@/components/icon'
import { useAchievementStore } from '@/stores/achievement-store'
import type { AchievementDef } from '@/types'

const TTL = 9000

/**
 * 成就解锁提示。
 * 显示在屏幕上方 —— 和事件气泡（下方）分开，免得两件事挤在一起看不清。
 */
export function AchievementToaster() {
  const newly = useAchievementStore((state) => state.newlyUnlocked)
  const consume = useAchievementStore((state) => state.consumeNewlyUnlocked)

  // 一次解锁多个时排队展示，避免叠在一起
  const [current, setCurrent] = React.useState<AchievementDef | null>(null)

  React.useEffect(() => {
    if (!current && newly.length > 0) {
      const [first, ...rest] = newly
      setCurrent(first ?? null)
      // 把剩下的放回队列（consume 之后由下面的 effect 继续取）
      if (rest.length > 0) {
        useAchievementStore.setState({ newlyUnlocked: rest })
      } else {
        consume()
      }
    }
  }, [newly, current, consume])

  React.useEffect(() => {
    if (!current) return
    const timer = window.setTimeout(() => setCurrent(null), TTL)
    return () => window.clearTimeout(timer)
  }, [current])

  if (!current) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      {/* 和事件气泡一样：整张卡片放行鼠标，只让关闭按钮收点击 ——
          否则成就一弹出来，墙上那排东西（窗户、软木板、时钟、画、便签）
          在这一带就全点不到了 */}
      <div className="animate-rise-in pointer-events-none flex w-full max-w-sm items-start gap-3 rounded-xl border border-lamp/35 bg-night/95 px-4 py-3 shadow-lamp backdrop-blur-md">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-lamp/30 bg-lamp/10">
          <Icon name={current.icon ?? 'Sparkles'} className="h-4 w-4 text-lamp" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-[0.18em] text-lamp">
            <Sparkles className="h-3 w-3" aria-hidden />
            解锁成就
          </p>
          <p className="mt-0.5 font-display text-sm text-paper">{current.name}</p>
          {current.description && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {current.description}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCurrent(null)}
          aria-label="关掉成就提示"
          className="pointer-events-auto rounded p-0.5 text-dust transition-colors hover:text-paper"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
