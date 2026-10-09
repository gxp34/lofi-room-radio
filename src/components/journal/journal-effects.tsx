'use client'

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'

import { useJournalStore } from '@/stores/journal-store'

/**
 * 房间里的随机事件落到手帐页上的效果。
 *
 * 和房间那边用同一个套路：**时间戳当 key**，每次触发就重新挂载一次动画元素，
 * 播完自己卸载。这样连续触发两次也能各播一遍，不需要手动管一堆类名。
 *
 * 打通的事件：
 *   · 猫踩到手帐        → 一枚爪印
 *   · 翻页掉落旧照片    → 一张拍立得从上面掉下来
 *   · 照片背面有字      → 浮出一张写着字的纸背
 *   · 雨夜照片变暗      → 整页照片压暗一段时间
 *   · 抽屉里发现旧手帐  → 由列表那边把最旧的一篇高亮出来
 */

/** 挂载 → 等 ms 毫秒 → 自动卸载 */
function useTransient(ms: number): boolean {
  const [visible, setVisible] = React.useState(true)
  React.useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), ms)
    return () => window.clearTimeout(timer)
  }, [ms])
  return visible
}

export function JournalEffects() {
  const pawAt = useJournalStore((state) => state.pawAt)
  const photoFallAt = useJournalStore((state) => state.photoFallAt)
  const fallCaption = useJournalStore((state) => state.fallPhotoCaption)
  const backTextAt = useJournalStore((state) => state.backTextAt)
  const backText = useJournalStore((state) => state.backText)
  const dimUntil = useJournalStore((state) => state.dimUntil)

  const reduceMotion = useReducedMotion()

  return (
    <>
      {pawAt > 0 && <PawPrint key={pawAt} seed={pawAt} />}
      {photoFallAt > 0 && <FallingPhoto key={photoFallAt} caption={fallCaption} />}
      {backTextAt > 0 && backText && <BackText key={backTextAt} text={backText} />}
      {dimUntil > Date.now() && <RainDim until={dimUntil} instant={Boolean(reduceMotion)} />}
    </>
  )
}

/** 爪印：盖在页面上，慢慢淡掉 */
function PawPrint({ seed }: { seed: number }) {
  const visible = useTransient(3200)

  // 用时间戳算位置，避免 Math.random 在服务端/客户端不一致
  const left = 12 + ((seed % 61) / 61) * 68
  const top = 16 + ((seed % 37) / 37) * 46
  const rotate = ((seed % 41) / 41) * 50 - 25

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      <svg
        viewBox="0 0 64 64"
        className="absolute h-24 w-24 text-[#f4eee7]/25"
        style={{ left: `${left}%`, top: `${top}%`, transform: `rotate(${rotate}deg)` }}
      >
        <ellipse cx="32" cy="40" rx="15" ry="12" fill="currentColor" />
        <ellipse cx="14" cy="22" rx="6" ry="7.5" fill="currentColor" />
        <ellipse cx="25" cy="14" rx="5.5" ry="7" fill="currentColor" />
        <ellipse cx="38" cy="14" rx="5.5" ry="7" fill="currentColor" />
        <ellipse cx="49" cy="22" rx="6" ry="7.5" fill="currentColor" />
      </svg>
    </div>
  )
}

/** 翻页掉出来的旧照片 */
function FallingPhoto({ caption }: { caption: string | null }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      <motion.div
        initial={{ y: -140, rotate: -18, opacity: 0 }}
        animate={{ y: '42vh', rotate: 9, opacity: 1 }}
        transition={{ duration: 1.5, ease: [0.3, 0.9, 0.4, 1] }}
        className="absolute left-1/2 w-40 -translate-x-1/2 rounded-[3px] bg-[#f3ece1] p-2 pb-6 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.9)]"
      >
        <span className="block h-28 w-full rounded-[2px] bg-gradient-to-br from-[#8a6a4f] via-[#5b4433] to-[#2b2230]" />
        {caption && (
          <span className="mt-2 block text-center font-display text-[10px] text-[#2b2230]/70">
            {caption}
          </span>
        )}
      </motion.div>
    </div>
  )
}

/** 照片背面写的字 */
function BackText({ text }: { text: string }) {
  const visible = useTransient(7000)
  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-50 flex justify-center px-4" aria-hidden>
      <motion.div
        initial={{ opacity: 0, y: -12, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: -1.5 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-xs rounded-[3px] bg-[#f3ece1] px-5 py-6 text-center shadow-[0_20px_44px_-18px_rgba(0,0,0,0.9)]"
      >
        <span className="mx-auto mb-3 block h-px w-10 bg-[#2b2230]/15" />
        <p className="font-display text-sm leading-relaxed text-[#2b2230]/85">{text}</p>
        <span className="mx-auto mt-3 block h-px w-10 bg-[#2b2230]/15" />
      </motion.div>
    </div>
  )
}

/** 雨夜照片变暗：整页压一层，自己到点恢复 */
function RainDim({ until, instant }: { until: number; instant: boolean }) {
  const [visible, setVisible] = React.useState(true)

  React.useEffect(() => {
    const remaining = Math.max(0, until - Date.now())
    const timer = window.setTimeout(() => setVisible(false), remaining)
    return () => window.clearTimeout(timer)
  }, [until])

  if (!visible) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 transition-opacity duration-1000"
      style={{
        background:
          'linear-gradient(to bottom, rgba(11,15,19,0.42), rgba(11,15,19,0.6))',
        backdropFilter: instant ? undefined : 'saturate(0.7) brightness(0.85)',
      }}
    />
  )
}
