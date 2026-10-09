'use client'

import * as React from 'react'
import { Lock, Trophy } from 'lucide-react'

import { Icon } from '@/components/icon'
import { achievementProgress, buildAchievementView } from '@/lib/achievements'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/achievement-store'

/**
 * 软木板上的成就墙。
 *
 * 未解锁的隐藏成就会被打码 —— 保留一点「房间里还有东西没被发现」的感觉。
 * 全部记录在 localStorage；登录后台后可以同步到数据库（第三批）。
 */
export function AchievementBoard({ className }: { className?: string }) {
  const hydrated = useAchievementStore((state) => state.hydrated)
  const definitions = useAchievementStore((state) => state.definitions)
  const unlocked = useAchievementStore((state) => state.unlocked)

  const view = React.useMemo(
    () => buildAchievementView(definitions, unlocked),
    [definitions, unlocked],
  )
  const progress = achievementProgress(view)

  return (
    <section
      aria-labelledby="achievement-board-heading"
      className={cn(
        'relative overflow-hidden rounded-2xl border-4 border-[#3a2b23] bg-[#5a4334] p-4 shadow-inner',
        className,
      )}
      style={{
        // 软木板的颗粒感：两层不同方向的点阵
        backgroundImage:
          'radial-gradient(rgba(0,0,0,0.16) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '7px 7px, 11px 11px',
        backgroundPosition: '0 0, 3px 4px',
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="achievement-board-heading"
          className="flex items-center gap-2 font-display text-sm text-[#f4eee7]"
        >
          <Trophy className="h-4 w-4 text-lamp" aria-hidden />
          软木板 · 成就
        </h2>
        <p className="font-display text-xs text-[#f4eee7]/70">
          {hydrated ? `${progress.done} / ${progress.total}` : `— / ${progress.total}`}
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {view.map((item) => (
          <li key={item.key}>
            <div
              className={cn(
                'relative h-full rounded-md border p-2.5 transition-colors',
                item.unlocked
                  ? 'border-lamp/40 bg-[#efe7db] text-[#2b2230]'
                  : 'border-black/25 bg-[#efe7db]/35 text-[#2b2230]/60',
              )}
              // 便签轻微歪一点点，像真的钉在上面
              style={{ transform: `rotate(${(item.sort % 5) - 2}deg)` }}
            >
              {/* 图钉 */}
              <span
                aria-hidden
                className={cn(
                  'absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border border-black/20',
                  item.unlocked ? 'bg-neon' : 'bg-dust/60',
                )}
              />

              <div className="flex items-center gap-1.5">
                {item.masked ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                ) : (
                  <Icon name={item.icon ?? 'Sparkles'} className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate font-display text-[11px] leading-tight">
                  {item.masked ? '？？？' : item.name}
                </span>
              </div>

              <p className="mt-1 line-clamp-2 text-[10px] leading-snug opacity-80">
                {item.masked ? '还没被发现' : (item.description ?? '')}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[10px] leading-relaxed text-[#f4eee7]/55">
        成就记录存在你自己的浏览器里。深夜多待一会儿，总能碰上点什么。
      </p>
    </section>
  )
}
