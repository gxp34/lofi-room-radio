'use client'

import * as React from 'react'

import { pickCatPose, type CatPose } from '@/lib/cat'
import { useAchievementStore } from '@/stores/achievement-store'
import { useRoomStore } from '@/stores/room-store'

/**
 * 猫的七个姿势。
 *
 * 猫不是一张固定的图 —— 它会根据你解锁过的彩蛋、房间的灯、还有现在几点换姿势
 * （判定逻辑在 lib/cat.ts）。这些姿势本身就是彩蛋的奖励：
 * 成就页上写的是字，房间里看到的是**猫的态度变了**。
 *
 * 画法沿用房间那一套：平涂 + 左上暖色高光，底部统一落在 y≈57，
 * 这样不管换哪个姿势，它都稳稳地坐在床垫上。
 */

const FUR = '#e0a878'
const FUR_DARK = '#c98d5f'
const BELLY = '#f6cfa6'
const EAR = '#e78aa6'
const EYE = '#3a2b23'
const NOSE = '#e78aa6'
const RIM = '#ffe9c4'
const SILHOUETTE = '#14101a'
const GLOW = '#ffe9c4'

interface PoseProps {
  className?: string
}

const BASE = 'block h-full w-full'

/* ==========================================================================
   1. 坐着看你（默认）
   ========================================================================== */

function Sitting({ className }: PoseProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      <path d="M45 47 q13 -4 9 -17" stroke={FUR} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M45 47 q13 -4 9 -17" stroke={BELLY} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.45" />
      <path d="M19 57 q-4 -24 13 -28 q17 4 13 28 z" fill={FUR} />
      <path d="M32 34 q7 6 5 23 h-10 q-2 -17 5 -23 z" fill={BELLY} />
      <ellipse cx="25" cy="57" rx="6" ry="3.2" fill={BELLY} />
      <ellipse cx="39" cy="57" rx="6" ry="3.2" fill={BELLY} />
      <circle cx="32" cy="23" r="12" fill={FUR} />
      <path d="M21 16 l-2 -10 9 4.5 z" fill={FUR} />
      <path d="M43 16 l2 -10 -9 4.5 z" fill={FUR} />
      <path d="M23 15 l-1 -6 5.4 2.6 z" fill={EAR} opacity="0.65" />
      <path d="M41 15 l1 -6 -5.4 2.6 z" fill={EAR} opacity="0.65" />
      <ellipse cx="27" cy="22" rx="1.9" ry="2.4" fill={EYE} />
      <ellipse cx="37" cy="22" rx="1.9" ry="2.4" fill={EYE} />
      <circle cx="27.6" cy="21.2" r="0.7" fill="#f4eee7" />
      <circle cx="37.6" cy="21.2" r="0.7" fill="#f4eee7" />
      <path d="M32 26.5 l-2.2 2.2 h4.4 z" fill={NOSE} />
      <path d="M32 28.7 v2 M32 30.7 q-2.4 2 -4 0.6 M32 30.7 q2.4 2 4 0.6" stroke="#a86a45" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M18 25 h-5.5 M18 28.5 h-5.5" stroke={BELLY} strokeWidth="0.9" opacity="0.8" strokeLinecap="round" />
      <path d="M46 25 h5.5 M46 28.5 h5.5" stroke={BELLY} strokeWidth="0.9" opacity="0.8" strokeLinecap="round" />
      <path d="M22 15 q10 -7 20 -1" stroke={RIM} strokeWidth="2.2" fill="none" opacity="0.55" strokeLinecap="round" />
    </svg>
  )
}

/* ==========================================================================
   2. 蜷成一团（凌晨）
   ========================================================================== */

function Curled({ className }: PoseProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      {/* 尾巴先画，绕到身体后面再兜回来 */}
      <path d="M50 43 q7 7 -4 10 q-13 3 -20 -3" stroke={FUR} strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* 身体一团 */}
      <ellipse cx="35" cy="38" rx="19" ry="14" fill={FUR} />
      <ellipse cx="35" cy="44" rx="16" ry="7" fill={FUR_DARK} opacity="0.4" />
      {/* 收在脸边的前爪 */}
      <ellipse cx="27" cy="50" rx="5.5" ry="3.2" fill={BELLY} />
      {/* 头搁在左边 */}
      <circle cx="19" cy="41" r="10" fill={FUR} />
      <path d="M11 36 l-3 -8 8 3 z" fill={FUR} />
      <path d="M24 34 l3 -8 -8 2 z" fill={FUR} />
      <path d="M12 35 l-2 -5 5 2 z" fill={EAR} opacity="0.6" />
      <path d="M23 33 l2 -5 -5 1.6 z" fill={EAR} opacity="0.6" />
      {/* 闭着的眼睛 */}
      <path d="M13 41 q2.5 2.6 5 0" stroke={EYE} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M21 42 q2.5 2.6 5 0" stroke={EYE} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M19 46.5 l-1.8 1.8 h3.6 z" fill={NOSE} />
      <path d="M19 48.3 v1.8 M19 50 q-2 1.6 -3.4 0.4 M19 50 q2 1.6 3.4 0.4" stroke="#a86a45" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      <path d="M10 47 h-4.5 M10 49.5 h-4.5" stroke={BELLY} strokeWidth="0.8" opacity="0.7" strokeLinecap="round" />
      {/* 背上的高光 */}
      <path d="M24 28 q13 -6 25 3" stroke={RIM} strokeWidth="2.4" fill="none" opacity="0.5" strokeLinecap="round" />
      {/* 睡着的 Z */}
      <path d="M52 22 h6 l-6 6 h6" stroke={RIM} strokeWidth="1.6" fill="none" opacity="0.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ==========================================================================
   3. 黑里只剩两只眼睛（灯灭）
   ========================================================================== */

function Glowing({ className }: PoseProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      <path d="M45 47 q13 -4 9 -17" stroke={SILHOUETTE} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M19 57 q-4 -24 13 -28 q17 4 13 28 z" fill={SILHOUETTE} />
      <ellipse cx="25" cy="57" rx="6" ry="3.2" fill={SILHOUETTE} />
      <ellipse cx="39" cy="57" rx="6" ry="3.2" fill={SILHOUETTE} />
      <circle cx="32" cy="23" r="12" fill={SILHOUETTE} />
      <path d="M21 16 l-2 -10 9 4.5 z" fill={SILHOUETTE} />
      <path d="M43 16 l2 -10 -9 4.5 z" fill={SILHOUETTE} />
      {/* 眼睛的光晕 */}
      <circle cx="27" cy="22" r="6" fill="#f7c873" opacity="0.22" />
      <circle cx="37" cy="22" r="6" fill="#f7c873" opacity="0.22" />
      {/* 眼睛本体：竖瞳 */}
      <ellipse cx="27" cy="22" rx="2.8" ry="3.6" fill={GLOW} />
      <ellipse cx="37" cy="22" rx="2.8" ry="3.6" fill={GLOW} />
      <ellipse cx="27" cy="22" rx="0.9" ry="3.1" fill={SILHOUETTE} />
      <ellipse cx="37" cy="22" rx="0.9" ry="3.1" fill={SILHOUETTE} />
      {/* 轮廓上一点冷色反光，暗示窗外的月光 */}
      <path d="M22 14 q10 -7 20 -1" stroke="#7fc8d8" strokeWidth="1.5" fill="none" opacity="0.3" strokeLinecap="round" />
      <path d="M20 52 q12 5 25 0" stroke="#7fc8d8" strokeWidth="1.2" fill="none" opacity="0.16" strokeLinecap="round" />
    </svg>
  )
}

/* ==========================================================================
   4. 伸懒腰（解锁「房间的秘密」）
   ========================================================================== */

function Stretch({ className }: PoseProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      {/* 尾巴竖起来 */}
      <path d="M55 34 q8 -10 4 -22" stroke={FUR} strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M55 34 q8 -10 4 -22" stroke={BELLY} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.45" />
      {/* 撅起来的屁股 */}
      <ellipse cx="43" cy="42" rx="14" ry="13" fill={FUR} />
      <ellipse cx="40" cy="55" rx="5" ry="3" fill={BELLY} />
      <ellipse cx="50" cy="55" rx="5" ry="3" fill={BELLY} />
      {/* 身体往前趴下去 */}
      <path d="M30 54 q-14 -2 -18 -8 q4 -9 16 -10 q12 -1 16 8 q-4 10 -14 10 z" fill={FUR} />
      {/* 前腿伸出去 */}
      <path d="M15 50 q-8 4 -10 7" stroke={FUR} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M19 54 q-7 3 -9 5" stroke={FUR} strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* 头低下去 */}
      <circle cx="14" cy="43" r="9" fill={FUR} />
      <path d="M7 38 l-3 -7 7 2 z" fill={FUR} />
      <path d="M19 36 l3 -6 -7 1 z" fill={FUR} />
      <path d="M8 37 l-2 -4 4.6 1.4 z" fill={EAR} opacity="0.6" />
      <path d="M18 35 l2 -4 -4.6 1 z" fill={EAR} opacity="0.6" />
      {/* 半睁的眼睛 */}
      <path d="M9 43 q2 1.8 4 0" stroke={EYE} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M15 43 q2 1.8 4 0" stroke={EYE} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M13 47.5 l-1.7 1.7 h3.4 z" fill={NOSE} />
      <path d="M13 49.2 v1.8 M13 51 q-2 1.6 -3.4 0.4 M13 51 q2 1.6 3.4 0.4" stroke="#a86a45" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      {/* 背上的高光 */}
      <path d="M34 31 q11 -3 18 5" stroke={RIM} strokeWidth="2.4" fill="none" opacity="0.5" strokeLinecap="round" />
    </svg>
  )
}

/* ==========================================================================
   5. 翻肚皮（解锁「猫的耐心是有限的」）
   ========================================================================== */

function BellyUp({ className }: PoseProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      {/* 摊开的尾巴 */}
      <path d="M52 47 q9 2 8 8" stroke={FUR} strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* 躺平的身体 */}
      <ellipse cx="33" cy="45" rx="20" ry="11" fill={FUR} />
      {/* 露出来的肚皮 */}
      <ellipse cx="33" cy="45" rx="14" ry="7" fill={BELLY} />
      {/* 四只爪子朝天 */}
      <ellipse cx="21" cy="32" rx="4" ry="6" fill={BELLY} transform="rotate(-16 21 32)" />
      <ellipse cx="29" cy="29" rx="4" ry="6.5" fill={BELLY} transform="rotate(-6 29 29)" />
      <ellipse cx="38" cy="29" rx="4" ry="6.5" fill={BELLY} transform="rotate(6 38 29)" />
      <ellipse cx="46" cy="32" rx="4" ry="6" fill={BELLY} transform="rotate(16 46 32)" />
      {/* 头歪在左边 */}
      <circle cx="14" cy="42" r="9.5" fill={FUR} />
      <path d="M7 36 l-3 -8 8 2 z" fill={FUR} />
      <path d="M20 34 l4 -7 -8 1 z" fill={FUR} />
      <path d="M8 35 l-2 -5 4.6 1.6 z" fill={EAR} opacity="0.6" />
      <path d="M19 33 l2.4 -4.6 -4.6 1 z" fill={EAR} opacity="0.6" />
      {/* 满足地眯着眼 */}
      <path d="M8 41 q2.6 -2.2 5.2 0" stroke={EYE} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M15 41 q2.6 -2.2 5.2 0" stroke={EYE} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M14 46 l-1.8 1.8 h3.6 z" fill={NOSE} />
      <path d="M14 47.8 v1.8 M14 49.6 q-2 1.6 -3.4 0.4 M14 49.6 q2 1.6 3.4 0.4" stroke="#a86a45" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      <path d="M5 45 h-4 M5 47.5 h-4" stroke={BELLY} strokeWidth="0.8" opacity="0.7" strokeLinecap="round" />
      <path d="M23 40 q10 -5 20 -1" stroke={RIM} strokeWidth="2.2" fill="none" opacity="0.5" strokeLinecap="round" />
    </svg>
  )
}

/* ==========================================================================
   6. 竖着耳朵（解锁「外星电台」）
   ========================================================================== */

function Alert({ className }: PoseProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      {/* 尾巴僵直地立着 */}
      <path d="M46 46 q10 -5 9 -22" stroke={FUR} strokeWidth="4.5" fill="none" strokeLinecap="round" />
      {/* 坐得更直 */}
      <path d="M20 57 q-4 -22 12 -26 q16 4 12 26 z" fill={FUR} />
      <path d="M32 42 q7 5 5 15 h-10 q-2 -10 5 -15 z" fill={BELLY} />
      <ellipse cx="25" cy="57" rx="6" ry="3.2" fill={BELLY} />
      <ellipse cx="39" cy="57" rx="6" ry="3.2" fill={BELLY} />
      <circle cx="32" cy="25" r="12" fill={FUR} />
      {/* 耳朵竖到顶 */}
      <path d="M22 17 l-3 -13 10 5.5 z" fill={FUR} />
      <path d="M42 17 l3 -13 -10 5.5 z" fill={FUR} />
      <path d="M24 15.5 l-2 -8 6.4 3.4 z" fill={EAR} opacity="0.7" />
      <path d="M40 15.5 l2 -8 -6.4 3.4 z" fill={EAR} opacity="0.7" />
      {/* 眼睛瞪大 */}
      <ellipse cx="27" cy="24" rx="3.2" ry="3.8" fill={EYE} />
      <ellipse cx="37" cy="24" rx="3.2" ry="3.8" fill={EYE} />
      <circle cx="27.9" cy="22.8" r="1.2" fill="#f4eee7" />
      <circle cx="37.9" cy="22.8" r="1.2" fill="#f4eee7" />
      <path d="M32 29 l-2.2 2.2 h4.4 z" fill={NOSE} />
      <path d="M32 31.2 v2 M32 33.2 q-2.4 2 -4 0.6 M32 33.2 q2.4 2 4 0.6" stroke="#a86a45" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M18 27 h-5.5 M18 30.5 h-5.5" stroke={BELLY} strokeWidth="0.9" opacity="0.8" strokeLinecap="round" />
      <path d="M46 27 h5.5 M46 30.5 h5.5" stroke={BELLY} strokeWidth="0.9" opacity="0.8" strokeLinecap="round" />
      <path d="M22 17 q10 -6 20 -1" stroke={RIM} strokeWidth="2.2" fill="none" opacity="0.55" strokeLinecap="round" />
    </svg>
  )
}

/* ==========================================================================
   7. 叼来一把钥匙（解锁「隐藏抽屉的钥匙」）
   ========================================================================== */

function WithKey({ className }: PoseProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      {/* 钥匙的光晕 */}
      <circle cx="48" cy="52" r="9" fill="#f7c873" opacity="0.16" />
      <path d="M45 47 q13 -4 9 -17" stroke={FUR} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M19 57 q-4 -24 13 -28 q17 4 13 28 z" fill={FUR} />
      <path d="M32 34 q7 6 5 23 h-10 q-2 -17 5 -23 z" fill={BELLY} />
      <ellipse cx="25" cy="57" rx="6" ry="3.2" fill={BELLY} />
      <ellipse cx="39" cy="57" rx="6" ry="3.2" fill={BELLY} />
      <circle cx="32" cy="23" r="12" fill={FUR} />
      <path d="M21 16 l-2 -10 9 4.5 z" fill={FUR} />
      <path d="M43 16 l2 -10 -9 4.5 z" fill={FUR} />
      <path d="M23 15 l-1 -6 5.4 2.6 z" fill={EAR} opacity="0.65" />
      <path d="M41 15 l1 -6 -5.4 2.6 z" fill={EAR} opacity="0.65" />
      {/* 眼睛往下看着钥匙 */}
      <ellipse cx="28" cy="24" rx="1.9" ry="2.5" fill={EYE} />
      <ellipse cx="37.5" cy="24" rx="1.9" ry="2.5" fill={EYE} />
      <circle cx="28.7" cy="23.3" r="0.7" fill="#f4eee7" />
      <circle cx="38.2" cy="23.3" r="0.7" fill="#f4eee7" />
      <path d="M32 26.5 l-2.2 2.2 h4.4 z" fill={NOSE} />
      <path d="M32 28.7 v2 M32 30.7 q-2.4 2 -4 0.6 M32 30.7 q2.4 2 4 0.6" stroke="#a86a45" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M22 15 q10 -7 20 -1" stroke={RIM} strokeWidth="2.2" fill="none" opacity="0.55" strokeLinecap="round" />
      {/* 放在它脚边的钥匙 */}
      <g transform="translate(42 48)">
        <circle cx="4" cy="4" r="3.8" fill="none" stroke="#e0bb74" strokeWidth="2" />
        <path d="M7 6.4 l9 3.2" stroke="#e0bb74" strokeWidth="2" strokeLinecap="round" />
        <path d="M12.6 8.4 v2.6 M15.4 9.4 v2.4" stroke="#e0bb74" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/* ==========================================================================
   分发
   ========================================================================== */

const POSES: Record<CatPose, React.ComponentType<PoseProps>> = {
  sitting: Sitting,
  curled: Curled,
  glowing: Glowing,
  stretch: Stretch,
  bellyUp: BellyUp,
  alert: Alert,
  withKey: WithKey,
}

/**
 * 猫。
 *
 * 注意 mounted：姿势会受到「现在是不是凌晨」的影响，
 * 服务端和浏览器的时区不一定一样，直接算会造成 hydration 不一致。
 * 所以首屏先按默认姿势渲染，挂载之后再换成真实姿势。
 */
export function CatArt({ className }: PoseProps) {
  const lights = useRoomStore((state) => state.lights)
  const unlocked = useAchievementStore((state) => state.unlocked)

  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const pose = React.useMemo<CatPose>(() => {
    if (!mounted) return 'sitting'
    return pickCatPose({ lights, unlocked: Object.keys(unlocked) }).pose
  }, [mounted, lights, unlocked])

  const Component = POSES[pose]
  return <Component className={className} />
}

/** 当前姿势（悬停提示用；同样要等挂载后才准） */
export function useCatPose(): { pose: CatPose; label: string } {
  const lights = useRoomStore((state) => state.lights)
  const unlocked = useAchievementStore((state) => state.unlocked)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return React.useMemo(() => {
    if (!mounted) return { pose: 'sitting' as CatPose, label: '坐着看你' }
    const info = pickCatPose({ lights, unlocked: Object.keys(unlocked) })
    return { pose: info.pose, label: info.label }
  }, [mounted, lights, unlocked])
}
