'use client'

import * as React from 'react'
import { X } from 'lucide-react'

import { RARITY_LABEL } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useEventStore } from '@/stores/event-store'
import type { EventToastItem, Rarity } from '@/types'

/** 自动消失的时间（毫秒） */
const TOAST_TTL = 7000

const RARITY_STYLE: Record<Rarity, string> = {
  common: 'border-white/10',
  rare: 'border-rain/40 shadow-rain',
  hidden: 'border-neon/45 shadow-neon',
}

const RARITY_BAR: Record<Rarity, string> = {
  common: 'bg-dust/40',
  rare: 'bg-rain',
  hidden: 'bg-neon',
}

/**
 * 事件气泡。
 *
 * 房间里的每句话都从这里飘出来 —— 位置固定在屏幕下方，几秒后自己消失。
 *
 * **为什么整张卡片是 pointer-events-none**：
 *   气泡浮在房间的中下部，而猫、地毯、植物恰好都在那一带。
 *   之前卡片是 pointer-events-auto（为了关掉按钮能点），结果它变成了一层
 *   看不见的玻璃：气泡一冒出来，底下那些东西就全点不到了 ——
 *   而气泡又是"点一下东西就会冒出来"的，等于自己把自己锁死。
 *   现在只有那颗关闭按钮收点击，卡片本体放行。
 */
export function EventToaster() {
  const toasts = useEventStore((state) => state.toasts)
  const dismiss = useEventStore((state) => state.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex flex-col items-center gap-2 px-4"
      role="region"
      aria-label="房间事件"
    >
      {toasts.map((toast) => (
        <ToastBubble key={toast.id} toast={toast} onDismiss={dismiss} />
      ))}
    </div>
  )
}

function ToastBubble({
  toast,
  onDismiss,
}: {
  toast: EventToastItem
  onDismiss: (id: string) => void
}) {
  React.useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_TTL)
    return () => window.clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <div
      className={cn(
        'animate-rise-in pointer-events-none flex w-full max-w-md items-start gap-3 rounded-lg border bg-night/92 px-4 py-3 backdrop-blur-md',
        RARITY_STYLE[toast.rarity],
      )}
    >
      {/* 左边一条竖线表示稀有度 */}
      <span
        className={cn('mt-0.5 h-4 w-0.5 shrink-0 rounded-full', RARITY_BAR[toast.rarity])}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        {toast.rarity !== 'common' && (
          <p className="mb-0.5 font-display text-[10px] uppercase tracking-[0.18em] text-dust">
            {RARITY_LABEL[toast.rarity]}
          </p>
        )}
        <p className="text-sm leading-relaxed text-paper/95">{toast.text}</p>
      </div>

      {/* 只有这颗按钮收点击，其余部分让鼠标穿过去点到房间 */}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="关掉这条提示"
        className="pointer-events-auto rounded p-0.5 text-dust transition-colors hover:text-paper"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
