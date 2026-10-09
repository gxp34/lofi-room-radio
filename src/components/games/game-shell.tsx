'use client'

import * as React from 'react'
import { RotateCcw, Trophy } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface GameShellProps {
  /** 游戏名，显示在机身上 */
  name: string
  /** 屏幕上的一句话 */
  tagline: string
  /** 本地最高分 */
  highScore: number
  /** 当前分数 */
  score?: number
  /** 右上角状态，例如「游戏结束」 */
  status?: string
  /** 重新开始 */
  onRestart?: () => void
  /** 操作说明，显示在机身下半部分 */
  instructions: string[]
  /** 屏幕下方的额外控件（方向键、功能键等） */
  controls?: React.ReactNode
  /** 游戏主体 */
  children: React.ReactNode
  className?: string
}

/**
 * 摸鱼掌机的外壳。
 * 三个小游戏共用它，所以机身样式只写一次；游戏本身只管画屏幕里的东西。
 */
export function GameShell({
  name,
  tagline,
  highScore,
  score,
  status,
  onRestart,
  instructions,
  controls,
  children,
  className,
}: GameShellProps) {
  return (
    <div className={cn('mx-auto w-full max-w-xl', className)}>
      {/* ============ 机身 ============ */}
      <div className="relative rounded-[28px] border border-white/[0.08] bg-gradient-to-b from-[#2b2230] via-[#241d2b] to-[#1b1622] p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] sm:p-5">
        {/* 机身顶部：扬声器孔 + 铭牌 */}
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-1" aria-hidden>
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={index} className="h-1 w-1 rounded-full bg-white/15" />
            ))}
          </div>
          <span className="font-display text-[11px] uppercase tracking-[0.2em] text-dust">
            LOFI-01
          </span>
        </div>

        {/* ============ 屏幕 ============ */}
        <div className="scanlines relative overflow-hidden rounded-2xl border border-black/60 bg-[#0b0f13] p-3 shadow-[inset_0_0_40px_rgba(0,0,0,0.9)]">
          {/* 屏幕 HUD */}
          <div className="mb-3 flex items-center justify-between gap-3 font-display text-[11px]">
            <span className="flex items-center gap-1.5 text-lamp">
              <Trophy className="h-3.5 w-3.5" aria-hidden />
              {highScore}
            </span>

            {typeof score === 'number' && (
              <span className="text-rain">本局 {score}</span>
            )}

            <span className="truncate text-dust">{status ?? tagline}</span>
          </div>

          {/* 游戏画面 */}
          <div className="min-h-[320px] sm:min-h-[360px]">{children}</div>
        </div>

        {/* ============ 机身下半部分 ============ */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.04]"
              aria-hidden
            />
            <span className="font-display text-xs tracking-widest text-dust">{name}</span>
          </div>

          {onRestart && (
            <Button variant="outline" size="sm" onClick={onRestart}>
              <RotateCcw className="h-3.5 w-3.5" />
              重新开始
            </Button>
          )}
        </div>

        {controls && <div className="mt-3">{controls}</div>}
      </div>

      {/* ============ 说明书 ============ */}
      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
        <p className="mb-2 font-display text-xs uppercase tracking-widest text-dust">操作说明</p>
        <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          {instructions.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-lamp" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
