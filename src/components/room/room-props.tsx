'use client'

import * as React from 'react'

import { CatArt } from '@/components/room/cat-poses'

/**
 * 房间里的东西 —— 全部是手写的 SVG。
 *
 * 为什么不用 emoji：
 *   emoji 是别人设计的彩色字形，混进哑光木色的家具里会像「贴纸贴在画上」。
 *   自己画之后，所有东西共用同一套颜色与画法，画面才是一个整体。
 *
 * 三个必须守住的规矩（都是踩过坑才写下来的）：
 *   1. **亮**。房间是暗的，东西是被台灯照着的 ——
 *      所以物件要用米白、暖木、陶土、青绿这些明度高的颜色，
 *      深色只用来点缀。全是深色的话，物件会糊进墙里，比 emoji 还难看。
 *   2. **大**。在 560px 高的房间里，物件至少要 60px 才看得清轮廓。
 *   3. **左上受光**。台灯在房间偏左，所有东西统一在左上角加一道暖色高光，
 *      光源方向一致，画面才不像剪贴画。
 */

interface ArtProps {
  className?: string
}

/** 每种东西显示多大（px，会随容器缩放）——宁大勿小 */
export const ART_SIZE: Record<string, number> = {
  cat: 92,
  record: 80,
  plant: 76,
  radio: 70,
  books: 68,
  headphone: 68,
  diary: 66,
  handheld: 66,
  tea: 62,
  clock: 58,
  phone: 56,
}

/** 有手绘图形的物件 */
export const ART_IDS = new Set(Object.keys(ART_SIZE))

/**
 * 点击区域的「加宽」（px，四边各加这么多）。
 *
 * 为什么需要：手绘图形在 64×64 里面通常留了空白，猫尤其明显 ——
 * 它只占中间那一竖条（左右各留了 20% 空），而它又是**坐在床上的**。
 * 于是「看着点在猫身上」经常落在床的按钮上，感觉像"猫点不到"。
 *
 * 只给**坐在另一个可点物件上面**的那几样加：
 *   · 猫在床（可点）上
 *   · 热茶 / 掌机在沙发（可点）上
 * 像书堆、手机这些是摆在架子/桌面上的，那两样不是可点物件，
 * 点偏了只是"没反应"，不会点错东西，所以不加 —— 加了反而会和旁边的东西抢点击。
 */
export const HIT_PAD: Record<string, number> = {
  cat: 20,
  tea: 10,
  handheld: 10,
}

const BASE = 'block h-full w-full'

/* ==========================================================================
   唱片机 —— 木壳 + 黑胶 + 唱臂
   ========================================================================== */

function RecordArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      {/* 机身：暖木色，比墙亮 */}
      <rect x="3" y="30" width="58" height="25" rx="6" fill="#9a7551" />
      <rect x="3" y="30" width="58" height="7" rx="3.5" fill="#b98d63" />
      <rect x="3" y="30" width="58" height="2" rx="1" fill="#e8c9a0" opacity="0.6" />
      {/* 转盘 */}
      <circle cx="25" cy="42" r="15" fill="#241d2b" />
      <circle cx="25" cy="42" r="13" fill="#3a2b3a" />
      <circle cx="25" cy="42" r="9.5" fill="none" stroke="#5b4760" strokeWidth="0.9" />
      <circle cx="25" cy="42" r="6" fill="none" stroke="#5b4760" strokeWidth="0.9" />
      <circle cx="25" cy="42" r="4.4" fill="#e78aa6" />
      <circle cx="25" cy="42" r="1.1" fill="#16131f" />
      {/* 高光 */}
      <path d="M16 33 a14 14 0 0 1 9 -4" stroke="#ffe9c4" strokeWidth="1.8" fill="none" opacity="0.45" strokeLinecap="round" />
      {/* 唱臂 */}
      <circle cx="51" cy="36" r="3" fill="#c9c3ba" />
      <path d="M51 36 L43 47" stroke="#e6e0d6" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M43 47 l-2.5 3.5" stroke="#f4eee7" strokeWidth="2.2" strokeLinecap="round" />
      {/* 按钮 */}
      <circle cx="52" cy="48" r="1.8" fill="#f7c873" />
    </svg>
  )
}

/* ==========================================================================
   猫 —— 不在这里画
   ==========================================================================
   猫有七个姿势，会跟着**彩蛋（成就）**、灯的开关、还有现在几点换
   （判定在 lib/cat.ts，图形在 components/room/cat-poses.tsx）。
   因为它要读 store，所以单独一个文件，这里只在 ObjectArt 里转发一下。
*/

/* ==========================================================================
   日记本
   ========================================================================== */

function DiaryArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      {/* 页口 */}
      <rect x="17" y="18" width="38" height="38" rx="4" fill="#efe7db" />
      <rect x="17" y="22" width="38" height="30" fill="#ded2be" />
      <path d="M20 26 h32 M20 31 h32 M20 36 h32 M20 41 h32 M20 46 h32" stroke="#c4b7a2" strokeWidth="0.8" opacity="0.7" />
      {/* 封面 */}
      <rect x="10" y="15" width="40" height="42" rx="4.5" fill="#b8566e" />
      <rect x="10" y="15" width="40" height="9" rx="4" fill="#d1708a" />
      <rect x="10" y="15" width="7" height="42" rx="3.5" fill="#8e3f54" />
      {/* 书签带 */}
      <path d="M38 15 h6 v19 l-3 -3.6 -3 3.6 z" fill="#f7c873" />
      {/* 封面压印 */}
      <rect x="24" y="32" width="18" height="2" rx="1" fill="#f4eee7" opacity="0.45" />
      <rect x="24" y="38" width="12" height="2" rx="1" fill="#f4eee7" opacity="0.3" />
      {/* 高光 */}
      <path d="M22 13 q12 -3 24 1" stroke="#ffe9c4" strokeWidth="2.2" fill="none" opacity="0.5" strokeLinecap="round" />
    </svg>
  )
}

/* ==========================================================================
   热茶
   ========================================================================== */

function TeaArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      {/* 把手 */}
      <path d="M47 30 h4 a8 8 0 0 1 0 16 h-4" stroke="#f4eee7" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* 杯身 */}
      <path d="M13 24 h34 v16 a11 11 0 0 1 -11 11 h-12 a11 11 0 0 1 -11 -11 z" fill="#f6f1e9" />
      <path d="M13 24 h34 v5 h-34 z" fill="#ffffff" opacity="0.7" />
      {/* 茶面 */}
      <ellipse cx="30" cy="24" rx="17" ry="4.2" fill="#ded2be" />
      <ellipse cx="30" cy="24" rx="13.5" ry="3" fill="#a8703f" />
      {/* 杯身描线 */}
      <path d="M19 34 h22" stroke="#e78aa6" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
      {/* 高光 */}
      <path d="M19 29 v11" stroke="#ffffff" strokeWidth="2.6" opacity="0.75" strokeLinecap="round" />
      {/* 热气 */}
      <path d="M25 16 q4 -6 0 -11" stroke="#f4eee7" strokeWidth="1.8" fill="none" opacity="0.4" strokeLinecap="round" />
      <path d="M36 18 q4 -5 0 -9" stroke="#f4eee7" strokeWidth="1.8" fill="none" opacity="0.28" strokeLinecap="round" />
    </svg>
  )
}

/* ==========================================================================
   掌机
   ========================================================================== */

function HandheldArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      <rect x="9" y="16" width="46" height="34" rx="8" fill="#7fc8d8" />
      <rect x="9" y="16" width="46" height="10" rx="5" fill="#a3dbe6" />
      <rect x="9" y="16" width="46" height="2.5" rx="1.25" fill="#e8f7fa" opacity="0.7" />
      {/* 屏幕 */}
      <rect x="16" y="21" width="32" height="19" rx="3" fill="#0b0f13" />
      <rect x="19.5" y="24.5" width="25" height="12" rx="2" fill="#1e4b58" />
      <rect x="22" y="27" width="9" height="3.4" rx="1.2" fill="#7fc8d8" opacity="0.85" />
      <rect x="33" y="32" width="9" height="3.4" rx="1.2" fill="#7fc8d8" opacity="0.5" />
      {/* 十字键 */}
      <rect x="17" y="44" width="11" height="3.6" rx="1.8" fill="#16131f" />
      <rect x="20.7" y="40.3" width="3.6" height="11" rx="1.8" fill="#16131f" />
      {/* 按键 */}
      <circle cx="43" cy="46" r="2.8" fill="#e78aa6" />
      <circle cx="49" cy="43" r="2.8" fill="#f7c873" />
      {/* 扬声器 */}
      <circle cx="16" cy="19.5" r="0.9" fill="#16131f" opacity="0.45" />
      <circle cx="48" cy="19.5" r="0.9" fill="#16131f" opacity="0.45" />
    </svg>
  )
}

/* ==========================================================================
   手机
   ========================================================================== */

function PhoneArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      <rect x="18" y="10" width="28" height="46" rx="6" fill="#4a4256" />
      <rect x="18" y="10" width="28" height="3.5" rx="1.75" fill="#6b6079" />
      <rect x="21" y="15" width="22" height="36" rx="3.5" fill="#12212c" />
      {/* 屏幕上的光 */}
      <rect x="21" y="15" width="22" height="36" rx="3.5" fill="url(#phoneGlow)" opacity="0.9" />
      <rect x="24" y="19" width="16" height="4" rx="2" fill="#7fc8d8" opacity="0.75" />
      <rect x="24" y="26" width="11" height="2.6" rx="1.3" fill="#7fc8d8" opacity="0.45" />
      <rect x="24" y="31" width="14" height="2.6" rx="1.3" fill="#7fc8d8" opacity="0.3" />
      <circle cx="32" cy="12.5" r="1" fill="#16131f" />
      <defs>
        <linearGradient id="phoneGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7fc8d8" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#7fc8d8" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/* ==========================================================================
   时钟
   ========================================================================== */

function ClockArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      <circle cx="32" cy="31" r="21" fill="#8a6a4f" />
      <circle cx="32" cy="31" r="17.5" fill="#f6f1e9" />
      {/* 刻度 */}
      {[0, 90, 180, 270].map((deg) => (
        <rect
          key={deg}
          x="31.4"
          y="15.5"
          width="1.3"
          height="3.6"
          rx="0.65"
          fill="#6b5140"
          transform={`rotate(${deg} 32 31)`}
        />
      ))}
      {/* 指针 */}
      <path d="M32 31 V20.5" stroke="#3a2b23" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M32 31 L40.5 36" stroke="#3a2b23" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="32" cy="31" r="2" fill="#b8566e" />
      {/* 高光 */}
      <path d="M20 20 a17 17 0 0 1 13 -5.5" stroke="#ffe9c4" strokeWidth="2.2" fill="none" opacity="0.6" strokeLinecap="round" />
    </svg>
  )
}

/* ==========================================================================
   收音机
   ========================================================================== */

function RadioArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      {/* 天线 */}
      <path d="M20 26 L29 8" stroke="#c9c3ba" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="29" cy="8" r="1.8" fill="#e6e0d6" />
      {/* 机身 */}
      <rect x="6" y="25" width="52" height="29" rx="5" fill="#9a7551" />
      <rect x="6" y="25" width="52" height="7" rx="3.5" fill="#b98d63" />
      <rect x="6" y="25" width="52" height="2" rx="1" fill="#e8c9a0" opacity="0.6" />
      {/* 喇叭网 */}
      <rect x="11" y="31" width="22" height="18" rx="3" fill="#5b4433" />
      <circle cx="22" cy="40" r="7" fill="#3a2b23" />
      <circle cx="22" cy="40" r="2.6" fill="#6b5140" />
      <path d="M13 34 h18 M13 37 h18 M13 43 h18 M13 46 h18" stroke="#6b5140" strokeWidth="0.7" opacity="0.5" />
      {/* 刻度盘 */}
      <rect x="37" y="31" width="16" height="7" rx="2" fill="#efe7db" />
      <rect x="39" y="33.5" width="9" height="2.2" rx="1.1" fill="#b8566e" opacity="0.8" />
      {/* 旋钮 */}
      <circle cx="41" cy="45" r="3" fill="#c9a45e" />
      <circle cx="49" cy="45" r="3" fill="#c9a45e" />
      <circle cx="41" cy="45" r="1" fill="#8a6a3f" />
      <circle cx="49" cy="45" r="1" fill="#8a6a3f" />
    </svg>
  )
}

/* ==========================================================================
   书堆
   ========================================================================== */

function BooksArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      {/* 最下面一本 */}
      <rect x="9" y="46" width="46" height="10" rx="2" fill="#b8566e" />
      <rect x="13" y="48" width="38" height="6.5" fill="#f6f1e9" />
      <path d="M15 50 h34 M15 52.5 h34" stroke="#ded2be" strokeWidth="0.7" />
      {/* 中间一本，歪一点 */}
      <g transform="rotate(-5 32 40)">
        <rect x="12" y="35" width="40" height="10" rx="2" fill="#4a8a94" />
        <rect x="16" y="37" width="32" height="6.5" fill="#f6f1e9" />
        <path d="M18 39 h28 M18 41.5 h28" stroke="#ded2be" strokeWidth="0.7" />
      </g>
      {/* 最上面一本 */}
      <rect x="13" y="24" width="36" height="10" rx="2" fill="#c9a45e" />
      <rect x="17" y="26" width="28" height="6.5" fill="#f6f1e9" />
      <path d="M19 28 h24 M19 30.5 h24" stroke="#ded2be" strokeWidth="0.7" />
      {/* 书脊高光 */}
      <rect x="13" y="24" width="36" height="2" rx="1" fill="#ffe9c4" opacity="0.5" />
    </svg>
  )
}

/* ==========================================================================
   耳机
   ========================================================================== */

function HeadphoneArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      {/* 头梁：浅色，才看得见 */}
      <path d="M13 40 V33 a19 19 0 0 1 38 0 v7" stroke="#ded2be" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M16 34 a17 17 0 0 1 32 0" stroke="#f6f1e9" strokeWidth="2" fill="none" opacity="0.7" />
      {/* 耳罩 */}
      <rect x="6" y="36" width="14" height="20" rx="6" fill="#3a2b3a" />
      <rect x="44" y="36" width="14" height="20" rx="6" fill="#3a2b3a" />
      <rect x="9" y="39" width="8" height="14" rx="4" fill="#e78aa6" opacity="0.85" />
      <rect x="47" y="39" width="8" height="14" rx="4" fill="#e78aa6" opacity="0.85" />
      <path d="M11.5 41 v9" stroke="#ffe9c4" strokeWidth="1.6" opacity="0.5" strokeLinecap="round" />
      {/* 线 */}
      <path d="M13 56 q7 6 13 3" stroke="#9b8fa3" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/* ==========================================================================
   植物
   ========================================================================== */

function PlantArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? BASE} aria-hidden>
      {/* 叶子 */}
      <path d="M32 44 q-16 -8 -13 -24 q15 5 13 24 z" fill="#6ba05e" />
      <path d="M32 44 q16 -9 13 -25 q-15 6 -13 25 z" fill="#87b87f" />
      <path d="M32 44 q-7 -17 0 -28 q7 11 0 28 z" fill="#a3d199" />
      <path d="M32 44 V18" stroke="#4a6b45" strokeWidth="1.6" />
      <path d="M26 28 l-6 -5 M38 26 l6 -5 M32 22 v-6" stroke="#4a6b45" strokeWidth="1.2" opacity="0.7" />
      {/* 花盆 */}
      <path d="M19 43 h26 l-4 16 h-18 z" fill="#c2664a" />
      <rect x="16" y="39.5" width="32" height="6" rx="3" fill="#d97a5c" />
      <rect x="16" y="39.5" width="32" height="2" rx="1" fill="#ffb99e" opacity="0.6" />
      <path d="M22 48 h18" stroke="#a8563f" strokeWidth="1.6" opacity="0.6" />
    </svg>
  )
}

/* ==========================================================================
   分发
   ========================================================================== */

const ART: Record<string, React.ComponentType<ArtProps>> = {
  record: RecordArt,
  diary: DiaryArt,
  tea: TeaArt,
  handheld: HandheldArt,
  phone: PhoneArt,
  clock: ClockArt,
  radio: RadioArt,
  books: BooksArt,
  headphone: HeadphoneArt,
  plant: PlantArt,
}

/** 取某样东西的手绘图形；没有的话返回 null（由调用方退化成 emoji） */
export function ObjectArt({ id, className }: { id: string } & ArtProps) {
  // 猫单独走 cat-poses：它的图形取决于彩蛋状态，要读 store
  if (id === 'cat') return <CatArt className={className} />

  const Component = ART[id]
  if (!Component) return null
  return <Component className={className} />
}

export function hasArt(id: string): boolean {
  return id === 'cat' || Boolean(ART[id])
}
