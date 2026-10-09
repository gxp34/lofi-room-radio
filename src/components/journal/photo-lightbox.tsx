'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { JournalPhoto } from '@/types'

/**
 * 照片灯箱。
 *
 * 键盘：← → 翻照片，ESC 关闭。打开时锁住页面滚动，
 * 关闭后把焦点还给刚才点的那张照片（不然键盘用户会掉到页面顶部）。
 */
export interface PhotoLightboxProps {
  photos: JournalPhoto[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  /** 手帐标题，显示在底部 */
  entryTitle?: string
}

export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  entryTitle,
}: PhotoLightboxProps) {
  const closeRef = React.useRef<HTMLButtonElement | null>(null)

  const current = photos[index] ?? null

  const go = React.useCallback(
    (delta: number) => {
      if (photos.length === 0) return
      onIndexChange((index + delta + photos.length) % photos.length)
    },
    [index, onIndexChange, photos.length],
  )

  /* 键盘 */
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        go(-1)
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        go(1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [go, onClose])

  /* 锁滚动 + 初始焦点 */
  React.useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  if (!current) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`照片查看器：${current.caption ?? '照片'}`}
      className="fixed inset-0 z-[60] flex flex-col bg-night/95 backdrop-blur-sm"
    >
      {/* 顶栏 */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate font-display text-xs text-dust">
          {entryTitle ? `${entryTitle} · ` : ''}
          {index + 1} / {photos.length}
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="关闭（ESC）"
          className="rounded-md p-2 text-dust transition-colors hover:bg-white/[0.06] hover:text-paper"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* 图 */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-3"
        onClick={(event) => {
          // 点空白处关闭，点图片本身不关
          if (event.target === event.currentTarget) onClose()
        }}
      >
        {photos.length > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="上一张（←）"
            className="absolute left-2 z-10 rounded-full bg-night/70 p-2.5 text-paper/80 transition-colors hover:bg-night hover:text-lamp sm:left-6"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={current.id}
          src={current.url}
          alt={current.caption ?? '手帐照片'}
          width={current.width ?? undefined}
          height={current.height ?? undefined}
          className="max-h-full max-w-full rounded-lg object-contain shadow-[0_30px_80px_-30px_rgba(0,0,0,1)]"
        />

        {photos.length > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="下一张（→）"
            className="absolute right-2 z-10 rounded-full bg-night/70 p-2.5 text-paper/80 transition-colors hover:bg-night hover:text-lamp sm:right-6"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* 说明 */}
      <div className="px-6 py-5 text-center">
        {current.caption && (
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-paper/85">{current.caption}</p>
        )}
        <p className={cn('mt-2 font-display text-[10px] text-dust', !current.caption && 'mt-0')}>
          ← → 翻照片 · ESC 关闭
        </p>
      </div>
    </div>
  )
}
