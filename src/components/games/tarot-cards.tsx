/**
 * 塔罗卡面 · 全部手写 SVG，不用任何图片。
 *
 * 刻意不画写实的人像：一来手写路径画不好脸，二来这个站的房间物件
 * 也是几何化的（见 room-props.tsx），保持同一套视觉语言更统一。
 * 「精致」靠三件事：统一的夜空底色、金箔描边、每张牌一个有辨识度的符号构图。
 *
 * 结构：
 *   TarotCardFace  —— 卡框（金边 / 星野 / 罗马数字 / 牌名），22 张共用
 *   TarotArt       —— 按 id 分发的插图，画在卡框中央的凹槽里
 *
 * 逆位只把**插图**转 180°（见 TarotCardFace 的 reversed）。
 * 整张牌转过来的话牌名会倒着，读不了 —— 真牌可以拿在手里转，网页不行。
 */

import { cn } from '@/lib/utils'
import type { TarotCard } from '@/lib/tarot'

/** 卡面配色。金、夜、纸 —— 和整站的夜色主题同一套 */
const GOLD = '#f0c674'
const GOLD_DEEP = '#a8813c'
const GOLD_PALE = '#f7e3b0'
const INK = '#171226'
const NIGHT = '#241d3a'
const PAPER = '#f4eee7'

/* ==========================================================================
   卡框
   ========================================================================== */

export function TarotCardFace({
  card,
  reversed = false,
  className,
}: {
  card: TarotCard
  reversed?: boolean
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 200 340"
      className={cn('h-full w-full', className)}
      role="img"
      aria-label={`${card.name}${reversed ? '（逆位）' : ''}`}
    >
      <defs>
        <linearGradient id="tcard-bg" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#2c2450" />
          <stop offset="52%" stopColor={NIGHT} />
          <stop offset="100%" stopColor={INK} />
        </linearGradient>
        <linearGradient id="tcard-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={GOLD_PALE} />
          <stop offset="38%" stopColor={GOLD} />
          <stop offset="70%" stopColor={GOLD_DEEP} />
          <stop offset="100%" stopColor={GOLD} />
        </linearGradient>
        <radialGradient id="tcard-glow" cx="0.5" cy="0.42" r="0.62">
          <stop offset="0%" stopColor={GOLD} stopOpacity="0.20" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 卡面底色 */}
      <rect width="200" height="340" rx="10" fill="url(#tcard-bg)" />

      {/* 星野：十几颗疏密不等的小点，让夜空不是一块死色 */}
      <g fill={PAPER}>
        {STARS.map((star, index) => (
          <circle key={index} cx={star[0]} cy={star[1]} r={star[2]} opacity={star[3]} />
        ))}
      </g>

      {/* 中央的光晕 */}
      <ellipse cx="100" cy="150" rx="76" ry="96" fill="url(#tcard-glow)" />

      {/* 双层金边 */}
      <rect
        x="3"
        y="3"
        width="194"
        height="334"
        rx="9"
        fill="none"
        stroke="url(#tcard-gold)"
        strokeWidth="2"
      />
      <rect
        x="9.5"
        y="9.5"
        width="181"
        height="321"
        rx="6"
        fill="none"
        stroke={GOLD_DEEP}
        strokeWidth="0.7"
        opacity="0.75"
      />

      {/* 四角花饰 */}
      {[
        [18, 18, 0],
        [182, 18, 90],
        [182, 322, 180],
        [18, 322, 270],
      ].map(([x, y, rotate]) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${rotate})`}>
          <path
            d="M0 0 L11 0 M0 0 L0 11 M3 3 L8 3 M3 3 L3 8"
            stroke={GOLD}
            strokeWidth="1"
            fill="none"
            opacity="0.85"
          />
          <circle cx="11" cy="0" r="1.2" fill={GOLD} opacity="0.9" />
          <circle cx="0" cy="11" r="1.2" fill={GOLD} opacity="0.9" />
        </g>
      ))}

      {/* ---- 罗马数字（上方小牌匾）---- */}
      <g>
        <rect
          x="76"
          y="17"
          width="48"
          height="20"
          rx="10"
          fill={INK}
          stroke={GOLD_DEEP}
          strokeWidth="0.8"
          opacity="0.96"
        />
        <text
          x="100"
          y="31.5"
          textAnchor="middle"
          fontFamily="var(--font-display, serif)"
          fontSize="11"
          letterSpacing="1.6"
          fill={GOLD}
        >
          {card.roman}
        </text>
      </g>

      {/* ---- 插图（逆位时整体转 180°）---- */}
      <g transform={reversed ? 'translate(200 340) rotate(180)' : undefined}>
        <TarotArt id={card.id} accent={card.accent} />
      </g>

      {/* ---- 牌名 ---- */}
      <g>
        <path
          d="M34 292 L166 292"
          stroke={GOLD_DEEP}
          strokeWidth="0.7"
          opacity="0.6"
        />
        <text
          x="100"
          y="311"
          textAnchor="middle"
          fontFamily="var(--font-display, serif)"
          fontSize="16"
          letterSpacing="3"
          fill={GOLD_PALE}
        >
          {card.name}
        </text>
        <text
          x="100"
          y="325"
          textAnchor="middle"
          fontFamily="var(--font-display, serif)"
          fontSize="7.5"
          letterSpacing="2.2"
          fill={GOLD}
          opacity="0.7"
        >
          {card.nameEn.toUpperCase()}
        </text>
      </g>

      {/* 逆位标记：一个倒过来的小三角 */}
      {reversed && (
        <path d="M100 44 L94 34 L106 34 Z" fill={card.accent} opacity="0.9" />
      )}
    </svg>
  )
}

/** 固定的星野坐标（写死而不是随机，免得每次渲染星星都跳） */
const STARS: Array<[number, number, number, number]> = [
  [24, 52, 1.1, 0.55],
  [41, 78, 0.8, 0.4],
  [168, 60, 1.2, 0.5],
  [152, 92, 0.7, 0.35],
  [30, 246, 0.9, 0.4],
  [172, 232, 1.1, 0.45],
  [56, 132, 0.7, 0.3],
  [147, 148, 0.8, 0.32],
  [22, 170, 0.9, 0.3],
  [178, 176, 0.7, 0.28],
  [70, 42, 0.7, 0.3],
  [132, 40, 0.9, 0.34],
  [36, 200, 0.7, 0.26],
  [164, 198, 0.8, 0.3],
  [100, 52, 0.6, 0.22],
]

/* ==========================================================================
   插图分发
   ========================================================================== */

/** 插图统一在一个 ±62 的坐标系里画，原点在卡面中央偏上 */
function Art({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <g transform="translate(100 162)">
      {/* 主色辉光：先铺一层，让符号从夜底色里浮出来 */}
      <ellipse cx="0" cy="-4" rx="78" ry="112" fill={accent} opacity="0.10" />

      {/* 尖拱。符号构图本身是方的，而卡片是竖的 ——
          只靠符号的话上下会空掉一大块。加一层拱窗把竖向空间撑起来，
          顺便也更像一张"牌"：符号像是嵌在窗里，而不是浮在空处。 */}
      <path
        d="M-70 106 L-70 -46 A70 70 0 0 1 70 -46 L70 106 Z"
        fill={accent}
        opacity="0.05"
      />
      <path
        d="M-70 106 L-70 -46 A70 70 0 0 1 70 -46 L70 106 Z"
        fill="none"
        stroke={GOLD_DEEP}
        strokeWidth="0.9"
        opacity="0.42"
      />
      <path
        d="M-63.5 106 L-63.5 -44 A63.5 63.5 0 0 1 63.5 -44 L63.5 106 Z"
        fill="none"
        stroke={GOLD_DEEP}
        strokeWidth="0.5"
        opacity="0.22"
      />

      {/* 符号本体：放大 1.34 倍填满拱窗 */}
      <g transform="scale(1.34)">{children}</g>
    </g>
  )
}

export function TarotArt({ id, accent }: { id: number; accent: string }) {
  switch (id) {
    case 0:
      return <Fool accent={accent} />
    case 1:
      return <Magician accent={accent} />
    case 2:
      return <Priestess accent={accent} />
    case 3:
      return <Empress accent={accent} />
    case 4:
      return <Emperor accent={accent} />
    case 5:
      return <Hierophant accent={accent} />
    case 6:
      return <Lovers accent={accent} />
    case 7:
      return <Chariot accent={accent} />
    case 8:
      return <Strength accent={accent} />
    case 9:
      return <Hermit accent={accent} />
    case 10:
      return <Fortune accent={accent} />
    case 11:
      return <Justice accent={accent} />
    case 12:
      return <HangedMan accent={accent} />
    case 13:
      return <Death accent={accent} />
    case 14:
      return <Temperance accent={accent} />
    case 15:
      return <Devil accent={accent} />
    case 16:
      return <Tower accent={accent} />
    case 17:
      return <Star accent={accent} />
    case 18:
      return <Moon accent={accent} />
    case 19:
      return <Sun accent={accent} />
    case 20:
      return <Judgement accent={accent} />
    default:
      return <World accent={accent} />
  }
}

/** 无限符号（魔术师、力量都用） */
function Lemniscate({ y = 0, color = GOLD, scale = 1 }: { y?: number; color?: string; scale?: number }) {
  return (
    <g transform={`translate(0 ${y}) scale(${scale})`}>
      <path
        d="M0 0 C-7 -9 -19 -9 -19 0 C-19 9 -7 9 0 0 C7 -9 19 -9 19 0 C19 9 7 9 0 0 Z"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
      />
    </g>
  )
}

/** 一根柱子（女祭司、教皇、正义都用） */
function Pillar({ x, tone }: { x: number; tone: string }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <rect x="-6" y="-46" width="12" height="92" rx="2" fill={tone} opacity="0.9" />
      <rect x="-9" y="-52" width="18" height="6" rx="1.5" fill={GOLD} opacity="0.8" />
      <rect x="-9" y="46" width="18" height="6" rx="1.5" fill={GOLD} opacity="0.8" />
    </g>
  )
}

/* --------------------------------------------------------------------------
   22 张牌
   -------------------------------------------------------------------------- */

function Fool({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 太阳 */}
      <circle cx="34" cy="-46" r="13" fill={accent} opacity="0.95" />
      <circle cx="34" cy="-46" r="18" fill="none" stroke={accent} strokeWidth="0.8" opacity="0.4" />
      {/* 悬崖 */}
      <path d="M-62 44 L-6 44 L-6 60 L-62 60 Z" fill="#3a2f52" />
      <path d="M-62 44 L-6 44" stroke={GOLD_DEEP} strokeWidth="0.9" opacity="0.7" />
      {/* 人：仰头、抬脚、背着小包 */}
      <circle cx="-8" cy="-24" r="6.5" fill={PAPER} opacity="0.92" />
      <path d="M-8 -17 L-8 8 M-8 8 L-16 26 M-8 8 L2 26 M-8 -12 L-20 -20 M-8 -12 L2 -6" stroke={PAPER} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.92" />
      <path d="M-14 -14 L-26 -6 L-26 4 L-14 -2 Z" fill={accent} opacity="0.8" />
      {/* 脚边的小狗 */}
      <path d="M-40 30 L-30 30 L-30 24 L-24 24 L-22 18 L-34 18 L-38 24 Z" fill={PAPER} opacity="0.55" />
      {/* 一朵白玫瑰 */}
      <circle cx="26" cy="34" r="4" fill={PAPER} opacity="0.85" />
      <path d="M26 38 L26 50" stroke="#6fae8a" strokeWidth="1.4" />
    </Art>
  )
}

function Magician({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      <Lemniscate y={-52} color={accent} />
      {/* 一手向天、一手指地 */}
      <circle cx="0" cy="-30" r="7" fill={PAPER} opacity="0.92" />
      <path d="M0 -23 L0 12 M0 -14 L-18 -46 M0 -14 L16 4" stroke={PAPER} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.92" />
      <path d="M-18 -46 L-18 -54 M-18 -54 L-13 -49 M-18 -54 L-23 -49" stroke={accent} strokeWidth="1.6" fill="none" />
      {/* 桌子 */}
      <rect x="-40" y="12" width="80" height="5" rx="1.5" fill="#5a4630" />
      <path d="M-34 17 L-34 40 M34 17 L34 40" stroke="#3a2b23" strokeWidth="3" />
      {/* 桌上的四元素 */}
      <path d="M-28 4 L-22 4 L-20 12 L-30 12 Z" fill={accent} opacity="0.9" />
      <path d="M-12 -2 L-8 12 L-16 12 Z" fill={GOLD} opacity="0.85" />
      <rect x="4" y="-2" width="3" height="14" fill="#c8a077" />
      <circle cx="24" cy="6" r="6" fill="none" stroke={GOLD} strokeWidth="1.6" />
      <circle cx="24" cy="6" r="2" fill={GOLD} />
      {/* 袍子 */}
      <path d="M-16 12 L16 12 L22 46 L-22 46 Z" fill="#3a2f52" opacity="0.9" />
    </Art>
  )
}

function Priestess({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 帷幕 */}
      <path d="M-44 -56 L44 -56 L44 -34 L-44 -34 Z" fill="#2c2450" opacity="0.9" />
      {[-36, -24, -12, 0, 12, 24, 36].map((x) => (
        <path key={x} d={`M${x} -56 L${x} -34`} stroke={GOLD_DEEP} strokeWidth="0.7" opacity="0.5" />
      ))}
      {/* 石榴 */}
      {[[-30, -42], [-8, -45], [16, -41], [32, -44]].map(([x, y]) => (
        <circle key={`${x}`} cx={x} cy={y} r="2.6" fill={accent} opacity="0.75" />
      ))}
      {/* 黑白两根柱子 */}
      <Pillar x={-42} tone="#e6dff0" />
      <Pillar x={42} tone="#2a2340" />
      {/* 女祭司：坐着，胸前一个等边十字 */}
      <circle cx="0" cy="-26" r="7" fill={PAPER} opacity="0.92" />
      <path d="M-16 -14 L16 -14 L24 34 L-24 34 Z" fill="#3d3560" opacity="0.95" />
      <path d="M0 -8 L0 12 M-8 0 L8 0" stroke={GOLD} strokeWidth="2" />
      {/* 脚边一弯月亮 */}
      <path d="M-16 46 A10 10 0 1 0 -16 30 A13 13 0 1 1 -16 46 Z" fill={accent} opacity="0.85" />
      {/* 手里的卷轴 */}
      <path d="M20 4 L34 4" stroke={PAPER} strokeWidth="2" opacity="0.7" />
    </Art>
  )
}

function Empress({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 十二星冠 */}
      {[-30, -20, -10, 0, 10, 20, 30].map((x, i) => (
        <circle key={x} cx={x} cy={-48 - Math.abs(i - 3) * 1.6} r="2.2" fill={GOLD} />
      ))}
      {/* 麦田 */}
      {[-46, -32, 32, 46].map((x) => (
        <g key={x} transform={`translate(${x} 20)`}>
          <path d="M0 0 L0 30" stroke="#7fa86a" strokeWidth="1.6" />
          <ellipse cx="0" cy="-4" rx="3" ry="7" fill={accent} opacity="0.85" />
        </g>
      ))}
      {/* 王座 */}
      <path d="M-34 -30 L-34 34 L34 34 L34 -30 Z" fill="#5a4630" opacity="0.85" />
      <path d="M-40 -36 L40 -36 L34 -30 L-34 -30 Z" fill={GOLD_DEEP} opacity="0.7" />
      {/* 皇后 */}
      <circle cx="0" cy="-18" r="7" fill={PAPER} opacity="0.92" />
      <path d="M-18 -6 L18 -6 L26 34 L-26 34 Z" fill={accent} opacity="0.85" />
      {/* 金星权杖 */}
      <path d="M24 -4 L24 -40" stroke={GOLD} strokeWidth="2" />
      <circle cx="24" cy="-44" r="5" fill="none" stroke={GOLD} strokeWidth="1.6" />
      <path d="M24 -39 L24 -49 M19 -44 L29 -44" stroke={GOLD} strokeWidth="1.4" />
      {/* 石榴 */}
      <circle cx="-12" cy="18" r="4" fill="#c94f5e" opacity="0.8" />
    </Art>
  )
}

function Emperor({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 荒山 */}
      <path d="M-58 20 L-30 -18 L-8 20 Z" fill="#2f2748" opacity="0.9" />
      <path d="M-14 24 L16 -26 L48 24 Z" fill="#3a2f52" opacity="0.9" />
      {/* 石王座 */}
      <path d="M-30 -26 L-30 34 L30 34 L30 -26 Z" fill="#4a3f5e" />
      <path d="M-36 -34 L36 -34 L30 -26 L-30 -26 Z" fill="#5c5074" />
      {/* 皇帝：盔甲 + 红袍 */}
      <circle cx="0" cy="-16" r="7.5" fill={PAPER} opacity="0.92" />
      <path d="M-17 -4 L17 -4 L24 34 L-24 34 Z" fill={accent} opacity="0.85" />
      <path d="M-17 -4 L17 -4 L14 8 L-14 8 Z" fill={PAPER} opacity="0.5" />
      {/* 白羊权杖 */}
      <path d="M26 -24 L26 30" stroke={GOLD} strokeWidth="2" />
      <g transform="translate(26 -30)">
        <circle cx="0" cy="0" r="5" fill="none" stroke={GOLD} strokeWidth="1.6" />
        <path d="M-5 -2 C-9 -6 -11 -1 -7 1" stroke={GOLD} strokeWidth="1.4" fill="none" />
        <path d="M5 -2 C9 -6 11 -1 7 1" stroke={GOLD} strokeWidth="1.4" fill="none" />
      </g>
      {/* 脚下的盾 */}
      <path d="M-40 34 L-40 50 L-32 58 L-24 50 L-24 34 Z" fill="#3a2f52" stroke={GOLD_DEEP} strokeWidth="0.8" />
    </Art>
  )
}

function Hierophant({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      <Pillar x={-44} tone="#4a3f5e" />
      <Pillar x={44} tone="#4a3f5e" />
      {/* 三重冠 */}
      <path d="M-14 -50 L14 -50 L10 -44 L-10 -44 Z" fill={GOLD} />
      <path d="M-12 -44 L12 -44 L9 -38 L-9 -38 Z" fill={GOLD} opacity="0.85" />
      <path d="M-10 -38 L10 -38 L7 -32 L-7 -32 Z" fill={GOLD} opacity="0.7" />
      {/* 教皇 */}
      <circle cx="0" cy="-20" r="7" fill={PAPER} opacity="0.92" />
      <path d="M-18 -8 L18 -8 L26 38 L-26 38 Z" fill={accent} opacity="0.8" />
      <path d="M0 -8 L0 16" stroke={GOLD} strokeWidth="1.4" opacity="0.7" />
      {/* 交叉的两把钥匙 */}
      <g transform="translate(0 34)">
        <path d="M-18 0 L18 0" stroke={GOLD} strokeWidth="2.4" />
        <path d="M-8 -6 L-8 6 M8 -6 L8 6" stroke={GOLD} strokeWidth="1.6" />
        <circle cx="-20" cy="0" r="3.4" fill="none" stroke={GOLD} strokeWidth="1.6" />
        <circle cx="20" cy="0" r="3.4" fill="none" stroke={GOLD} strokeWidth="1.6" />
      </g>
      {/* 两名信徒 */}
      <circle cx="-34" cy="46" r="4" fill={PAPER} opacity="0.45" />
      <circle cx="34" cy="46" r="4" fill={PAPER} opacity="0.45" />
    </Art>
  )
}

function Lovers({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 天使：光环 + 一对翅膀 + 张开的双臂 */}
      <circle cx="0" cy="-52" r="9" fill="none" stroke={GOLD} strokeWidth="1.1" opacity="0.8" />
      <circle cx="0" cy="-44" r="5.5" fill={PAPER} opacity="0.9" />
      <path d="M-3 -46 L3 -46" stroke={INK} strokeWidth="0.8" opacity="0.5" />
      <path
        d="M-5 -40 C-24 -54 -36 -40 -16 -30 Z"
        fill={accent}
        opacity="0.55"
      />
      <path d="M5 -40 C24 -54 36 -40 16 -30 Z" fill={accent} opacity="0.55" />
      <path
        d="M-5 -36 C-18 -46 -26 -36 -12 -30"
        fill="none"
        stroke={PAPER}
        strokeWidth="0.6"
        opacity="0.35"
      />
      <path
        d="M5 -36 C18 -46 26 -36 12 -30"
        fill="none"
        stroke={PAPER}
        strokeWidth="0.6"
        opacity="0.35"
      />
      <path d="M0 -38 L0 -28" stroke={PAPER} strokeWidth="2" opacity="0.85" />
      <path d="M-9 -32 L-16 -24 M9 -32 L16 -24" stroke={PAPER} strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />

      {/* 左边的树：结果子的那棵 */}
      <path d="M-44 14 L-44 -10" stroke="#6b5136" strokeWidth="3" />
      <path d="M-44 -10 L-50 -4 M-44 -4 L-38 0" stroke="#6b5136" strokeWidth="1.6" opacity="0.8" />
      <circle cx="-44" cy="-18" r="13" fill="#4f7a46" opacity="0.92" />
      <circle cx="-50" cy="-22" r="3" fill={accent} opacity="0.9" />
      <circle cx="-38" cy="-14" r="3" fill={accent} opacity="0.9" />
      <circle cx="-44" cy="-28" r="2.4" fill={accent} opacity="0.8" />

      {/* 右边的树：燃着的那棵 */}
      <path d="M44 14 L44 -10" stroke="#6b5136" strokeWidth="3" />
      <path d="M44 -10 C32 -22 38 -38 44 -44 C50 -38 56 -22 44 -10 Z" fill="#e07840" opacity="0.92" />
      <path d="M44 -16 C39 -24 42 -32 44 -36 C46 -32 49 -24 44 -16 Z" fill={GOLD} opacity="0.95" />
      <circle cx="44" cy="-40" r="1.6" fill={PAPER} opacity="0.7" />

      {/* 两个人：袍子 + 头，面对面 */}
      <g transform="translate(-15 20)">
        <circle cx="0" cy="0" r="6" fill={PAPER} opacity="0.94" />
        <path d="M-9 6 L9 6 L12 30 L-12 30 Z" fill={accent} opacity="0.9" />
        <path d="M0 6 L0 30" stroke={INK} strokeWidth="0.7" opacity="0.3" />
        <path d="M6 9 L13 14" stroke={PAPER} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      </g>
      <g transform="translate(15 20)">
        <circle cx="0" cy="0" r="6" fill={PAPER} opacity="0.94" />
        <path d="M-9 6 L9 6 L12 30 L-12 30 Z" fill={PAPER} opacity="0.6" />
        <path d="M0 6 L0 30" stroke={INK} strokeWidth="0.7" opacity="0.25" />
        <path d="M-6 9 L-13 14" stroke={PAPER} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      </g>

      {/* 两人之间的一道光 */}
      <path d="M0 -22 L0 6" stroke={GOLD} strokeWidth="0.8" opacity="0.35" strokeDasharray="2 3" />

      {/* 地面 */}
      <path d="M-56 50 L56 50" stroke={GOLD_DEEP} strokeWidth="0.9" opacity="0.5" />
    </Art>
  )
}

function Chariot({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 星星华盖 */}
      <path d="M-38 -44 L38 -44" stroke={GOLD} strokeWidth="1.2" opacity="0.7" />
      {[-30, -18, -6, 6, 18, 30].map((x) => (
        <circle key={x} cx={x} cy={-50} r="2" fill={GOLD} />
      ))}
      {/* 城墙 */}
      <path d="M-56 -18 L56 -18 L56 -6 L-56 -6 Z" fill="#2f2748" opacity="0.8" />
      {[-48, -32, -16, 0, 16, 32, 48].map((x) => (
        <rect key={x} x={x - 4} y="-24" width="8" height="6" fill="#2f2748" opacity="0.8" />
      ))}
      {/* 驾车的人：肩上有两块月牙 */}
      <circle cx="0" cy="-4" r="6.5" fill={PAPER} opacity="0.92" />
      <path d="M-6 0 C-14 -6 -14 4 -6 2 Z" fill={accent} opacity="0.85" />
      <path d="M6 0 C14 -6 14 4 6 2 Z" fill={accent} opacity="0.85" />
      <path d="M-16 6 L16 6 L20 26 L-20 26 Z" fill="#3d3560" />
      {/* 战车 */}
      <path d="M-24 26 L24 26 L24 40 L-24 40 Z" fill="#4a3f5e" />
      <path d="M-14 30 L14 30" stroke={GOLD} strokeWidth="1" opacity="0.6" />
      {/* 两只狮身兽，一黑一白 */}
      <circle cx="-32" cy="46" r="8" fill="#e6dff0" opacity="0.85" />
      <circle cx="32" cy="46" r="8" fill="#2a2340" />
      <path d="M-38 42 L-26 42 M26 42 L38 42" stroke={GOLD} strokeWidth="1" opacity="0.6" />
    </Art>
  )
}

function Strength({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      <Lemniscate y={-50} color={accent} />
      {/* 狮子 */}
      <circle cx="0" cy="20" r="22" fill={accent} opacity="0.35" />
      <circle cx="0" cy="20" r="15" fill="#c98a3f" opacity="0.9" />
      <circle cx="-5" cy="16" r="2" fill={INK} />
      <circle cx="5" cy="16" r="2" fill={INK} />
      <path d="M-5 26 C-2 30 2 30 5 26" stroke={INK} strokeWidth="1.4" fill="none" />
      <path d="M-16 20 L-24 18 M16 20 L24 18" stroke="#8a5f2c" strokeWidth="1" opacity="0.7" />
      {/* 女子：手按在狮子口鼻上，姿态是俯身而不是用力 */}
      <circle cx="0" cy="-22" r="7" fill={PAPER} opacity="0.92" />
      <path d="M-14 -12 L14 -12 L20 6 L-20 6 Z" fill={accent} opacity="0.8" />
      <path d="M-8 -8 L-4 4 M8 -8 L4 4" stroke={PAPER} strokeWidth="2" strokeLinecap="round" />
      {/* 头顶的花环 */}
      <path d="M-10 -32 C-4 -36 4 -36 10 -32" stroke="#6fae8a" strokeWidth="1.6" fill="none" />
      <circle cx="0" cy="-35" r="2.4" fill={accent} />
    </Art>
  )
}

function Hermit({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 山 */}
      <path d="M-58 40 L-18 -12 L14 40 Z" fill="#2f2748" opacity="0.9" />
      <path d="M6 40 L38 2 L62 40 Z" fill="#3a2f52" opacity="0.75" />
      {/* 提灯 */}
      <g transform="translate(24 -30)">
        <path d="M-8 0 L8 0 L6 -14 L-6 -14 Z" fill={GOLD_DEEP} opacity="0.9" />
        <path d="M-5 -2 L5 -2 L4 -12 L-4 -12 Z" fill={INK} />
        <path d="M0 -10 L0 -4 M-3 -7 L3 -7 M-3 -4 L3 -10" stroke={accent} strokeWidth="1.2" />
        <path d="M-8 -14 L8 -14 M0 -14 L0 -18" stroke={GOLD} strokeWidth="1.4" />
        <circle cx="0" cy="-7" r="10" fill={accent} opacity="0.18" />
      </g>
      {/* 隐者：斗篷 + 长杖 */}
      <circle cx="-4" cy="-22" r="7" fill="#c9bfae" opacity="0.85" />
      <path d="M-20 -10 L12 -10 L20 44 L-26 44 Z" fill="#3d3560" opacity="0.95" />
      <path d="M-20 -10 L-4 -18 L12 -10" stroke={GOLD_DEEP} strokeWidth="1" fill="none" opacity="0.6" />
      <path d="M-22 -34 L-22 46" stroke={GOLD} strokeWidth="2" />
      {/* 脚下的雪线 */}
      <path d="M-52 44 L52 44" stroke={PAPER} strokeWidth="0.8" opacity="0.35" />
    </Art>
  )
}

function Fortune({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 轮子 */}
      <circle cx="0" cy="0" r="40" fill="none" stroke={GOLD} strokeWidth="2" />
      <circle cx="0" cy="0" r="31" fill="none" stroke={GOLD_DEEP} strokeWidth="0.8" opacity="0.7" />
      <circle cx="0" cy="0" r="13" fill={accent} opacity="0.5" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <path
          key={angle}
          d="M0 -31 L0 -40"
          stroke={GOLD}
          strokeWidth="1.4"
          opacity="0.8"
          transform={`rotate(${angle})`}
        />
      ))}
      {/* 轮上的 TARO 字母，绕一圈 */}
      {['T', 'A', 'R', 'O'].map((letter, index) => (
        <text
          key={letter}
          x="0"
          y="-20"
          textAnchor="middle"
          fontSize="8"
          fontFamily="var(--font-display, serif)"
          fill={GOLD_PALE}
          transform={`rotate(${index * 90 + 45})`}
        >
          {letter}
        </text>
      ))}
      <circle cx="0" cy="0" r="6" fill={GOLD} opacity="0.85" />
      {/* 四角的生灵：用四个小符号代表，不画写实动物 */}
      {[[-46, -50], [46, -50], [-46, 50], [46, 50]].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="6" fill="none" stroke={accent} strokeWidth="1.2" opacity="0.75" />
          <path d={`M${x - 3} ${y} L${x + 3} ${y}`} stroke={accent} strokeWidth="1" opacity="0.6" />
        </g>
      ))}
    </Art>
  )
}

function Justice({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 紫幕 */}
      <path d="M-40 -54 L40 -54 L40 34 L-40 34 Z" fill="#2c2450" opacity="0.8" />
      {[-28, -14, 0, 14, 28].map((x) => (
        <path key={x} d={`M${x} -54 L${x} 34`} stroke={GOLD_DEEP} strokeWidth="0.6" opacity="0.4" />
      ))}
      {/* 正义：一手剑、一手天平 */}
      <circle cx="0" cy="-24" r="7" fill={PAPER} opacity="0.92" />
      <path d="M-16 -12 L16 -12 L22 36 L-22 36 Z" fill={accent} opacity="0.7" />
      {/* 剑 */}
      <path d="M20 -46 L20 4" stroke={PAPER} strokeWidth="2.4" />
      <path d="M20 -50 L20 -46" stroke={PAPER} strokeWidth="1.6" />
      <path d="M14 -6 L26 -6" stroke={GOLD} strokeWidth="2" />
      {/* 天平 */}
      <path d="M-20 -40 L-20 -18" stroke={GOLD} strokeWidth="1.6" />
      <path d="M-32 -34 L-8 -34" stroke={GOLD} strokeWidth="1.6" />
      <path d="M-32 -34 L-32 -26 M-8 -34 L-8 -26" stroke={GOLD_DEEP} strokeWidth="0.9" />
      <path d="M-38 -26 L-26 -26 L-32 -18 Z" fill={GOLD} opacity="0.8" />
      <path d="M-14 -26 L-2 -26 L-8 -18 Z" fill={GOLD} opacity="0.8" />
      {/* 王冠 */}
      <path d="M-9 -32 L9 -32 L7 -36 L-7 -36 Z" fill={GOLD} opacity="0.85" />
    </Art>
  )
}

function HangedMan({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* T 形树 */}
      <path d="M-30 -46 L30 -46" stroke="#6b5136" strokeWidth="5" />
      <path d="M0 -46 L0 -30" stroke="#6b5136" strokeWidth="4" />
      <path d="M-30 -46 L-30 -20 M30 -46 L30 -20" stroke="#6b5136" strokeWidth="3" opacity="0.8" />
      {/* 一条腿勾在横木上 */}
      <path d="M0 -30 L0 -16" stroke={PAPER} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M0 -16 L-14 4" stroke={PAPER} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M0 -16 L10 -2" stroke={PAPER} strokeWidth="2.6" strokeLinecap="round" />
      {/* 倒悬的身体：头在下 */}
      <path d="M-14 4 L14 4 L12 26 L-12 26 Z" fill={accent} opacity="0.8" />
      <circle cx="0" cy="36" r="8" fill={PAPER} opacity="0.92" />
      {/* 头上一圈光 */}
      <circle cx="0" cy="36" r="13" fill="none" stroke={GOLD} strokeWidth="1.4" opacity="0.85" />
      {/* 背在身后的手 */}
      <path d="M-12 12 C-20 16 -20 22 -14 24" stroke={PAPER} strokeWidth="1.8" fill="none" opacity="0.6" />
    </Art>
  )
}

function Death({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 远处正在升起的太阳 */}
      <circle cx="0" cy="-30" r="20" fill={accent} opacity="0.22" />
      <path d="M-52 -30 L52 -30" stroke={GOLD_DEEP} strokeWidth="0.8" opacity="0.5" />
      <path d="M-16 -30 A16 16 0 0 1 16 -30 Z" fill={accent} opacity="0.5" />
      {/* 白骨骑士 */}
      <g transform="translate(-6 -6)">
        <circle cx="0" cy="-18" r="6.5" fill={PAPER} opacity="0.9" />
        <path d="M-3 -20 L3 -20 M-3 -16 L3 -16" stroke={INK} strokeWidth="1.2" />
        <path d="M-10 -10 L10 -10 L14 12 L-14 12 Z" fill="#4a4152" opacity="0.9" />
        <path d="M-10 -10 L-16 14 M10 -10 L16 14" stroke="#4a4152" strokeWidth="2.4" />
      </g>
      {/* 马的下半身 */}
      <path d="M-34 20 L24 20 L30 40 L-30 40 Z" fill="#2a2340" />
      <path d="M-30 40 L-30 52 M24 40 L24 52" stroke="#2a2340" strokeWidth="3" />
      {/* 白玫瑰旗 */}
      <path d="M22 -34 L22 16" stroke={GOLD} strokeWidth="2" />
      <path d="M22 -34 L44 -28 L22 -18 Z" fill={INK} stroke={GOLD_DEEP} strokeWidth="0.7" />
      <circle cx="31" cy="-26" r="4" fill={PAPER} opacity="0.95" />
    </Art>
  )
}

function Temperance({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 水与岸的分界 */}
      <path d="M-56 26 L56 26" stroke={GOLD_DEEP} strokeWidth="0.9" opacity="0.6" />
      {[-48, -34, -20, -6].map((x) => (
        <path key={x} d={`M${x} 32 L${x + 6} 32 M${x} 40 L${x + 6} 40`} stroke={accent} strokeWidth="1" opacity="0.45" />
      ))}
      {/* 天使 */}
      <circle cx="0" cy="-34" r="6.5" fill={PAPER} opacity="0.92" />
      <path d="M-5 -38 C-20 -50 -26 -38 -12 -33 Z" fill={accent} opacity="0.5" />
      <path d="M5 -38 C20 -50 26 -38 12 -33 Z" fill={accent} opacity="0.5" />
      <path d="M-14 -22 L14 -22 L18 26 L-18 26 Z" fill={PAPER} opacity="0.85" />
      {/* 两个杯子与中间的水流 */}
      <path d="M-26 -14 L-14 -14 L-16 -4 L-24 -4 Z" fill={GOLD} opacity="0.9" />
      <path d="M26 -8 L14 -8 L16 2 L24 2 Z" fill={GOLD} opacity="0.9" />
      <path d="M-18 -4 C-10 4 -4 10 0 14 C4 18 10 20 14 0" stroke={accent} strokeWidth="2" fill="none" opacity="0.9" />
      {/* 一只脚在水里、一只在岸上 */}
      <path d="M-6 26 L-14 44 M6 26 L14 40" stroke={PAPER} strokeWidth="2.2" strokeLinecap="round" opacity="0.8" />
      <path d="M-18 46 C-14 42 -6 42 -2 46" stroke={accent} strokeWidth="1.4" fill="none" opacity="0.7" />
    </Art>
  )
}

function Devil({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 倒五角星 */}
      <g transform="translate(0 -34)">
        <path
          d="M0 14 L-13 -10 L13 -10 Z M-13 -10 L9 8 L-9 8 L13 -10"
          fill="none"
          stroke={accent}
          strokeWidth="1.4"
          opacity="0.85"
        />
        <circle cx="0" cy="-12" r="13" fill="none" stroke={GOLD_DEEP} strokeWidth="0.6" opacity="0.5" />
      </g>
      {/* 山羊头 */}
      <circle cx="0" cy="-26" r="9" fill="#3a2f52" />
      <path d="M-8 -32 C-18 -40 -22 -30 -12 -26" stroke={GOLD} strokeWidth="1.6" fill="none" />
      <path d="M8 -32 C18 -40 22 -30 12 -26" stroke={GOLD} strokeWidth="1.6" fill="none" />
      <circle cx="-3.5" cy="-27" r="1.4" fill={accent} />
      <circle cx="3.5" cy="-27" r="1.4" fill={accent} />
      {/* 倒立的火把 */}
      <path d="M-24 -8 L-24 18" stroke={GOLD_DEEP} strokeWidth="2" />
      <path d="M-24 -8 C-28 -2 -20 -2 -24 -8 Z" fill={accent} />
      <path d="M24 -8 L24 18" stroke={GOLD_DEEP} strokeWidth="2" />
      {/* 两个被拴住的人：链子是松的 */}
      <circle cx="-16" cy="26" r="6" fill={PAPER} opacity="0.85" />
      <circle cx="16" cy="26" r="6" fill={PAPER} opacity="0.85" />
      <path d="M-16 32 L-16 46 M16 32 L16 46" stroke={PAPER} strokeWidth="2" opacity="0.85" />
      <path
        d="M-10 22 C-6 18 6 18 10 22"
        stroke={GOLD}
        strokeWidth="1.4"
        fill="none"
        strokeDasharray="3 2.5"
        opacity="0.9"
      />
      <circle cx="0" cy="20" r="3.4" fill="none" stroke={GOLD} strokeWidth="1.4" />
    </Art>
  )
}

function Tower({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 闪电 */}
      <path
        d="M-6 -62 L10 -30 L-2 -28 L14 2"
        stroke={GOLD_PALE}
        strokeWidth="3"
        fill="none"
        strokeLinejoin="round"
        opacity="0.95"
      />
      {/* 塔：顶被劈开 */}
      <path d="M-20 -12 L-20 46 L20 46 L20 -12 L8 -20 L-4 -12 L-20 -12 Z" fill="#4a3f5e" />
      <path d="M-24 -12 L6 -22 L24 -12" stroke={accent} strokeWidth="1.6" fill="none" opacity="0.8" />
      {/* 窗 */}
      <path d="M-6 6 L6 6 L6 20 L-6 20 Z" fill={INK} />
      <path d="M-6 30 L6 30 L6 42 L-6 42 Z" fill={INK} />
      {/* 被掀飞的王冠 */}
      <g transform="translate(28 -34) rotate(22)">
        <path d="M-10 0 L10 0 L7 -8 L3 -3 L0 -9 L-3 -3 L-7 -8 Z" fill={GOLD} opacity="0.9" />
      </g>
      {/* 两个坠落的人 */}
      <g transform="translate(-34 6) rotate(-24)">
        <circle cx="0" cy="0" r="4.5" fill={PAPER} opacity="0.9" />
        <path d="M0 4.5 L0 16" stroke={PAPER} strokeWidth="2" opacity="0.9" />
      </g>
      <g transform="translate(34 18) rotate(24)">
        <circle cx="0" cy="0" r="4.5" fill={PAPER} opacity="0.9" />
        <path d="M0 4.5 L0 16" stroke={PAPER} strokeWidth="2" opacity="0.9" />
      </g>
      {/* 山基 */}
      <path d="M-52 46 L52 46" stroke={GOLD_DEEP} strokeWidth="1" opacity="0.6" />
    </Art>
  )
}

function Star({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 一颗大的八角星 + 七颗小的 */}
      <g transform="translate(0 -46)">
        <path
          d="M0 -14 L3.6 -3.6 L14 0 L3.6 3.6 L0 14 L-3.6 3.6 L-14 0 L-3.6 -3.6 Z"
          fill={accent}
        />
        <circle cx="0" cy="0" r="16" fill={accent} opacity="0.16" />
      </g>
      {[[-34, -50], [32, -52], [-44, -22], [44, -24], [-18, -62], [20, -64], [0, -70]].map(([x, y]) => (
        <path
          key={`${x}-${y}`}
          d={`M${x} ${y - 4} L${x + 1.2} ${y - 1.2} L${x + 4} ${y} L${x + 1.2} ${y + 1.2} L${x} ${y + 4} L${x - 1.2} ${y + 1.2} L${x - 4} ${y} L${x - 1.2} ${y - 1.2} Z`}
          fill={GOLD}
          opacity="0.85"
        />
      ))}
      {/* 池水 */}
      <path d="M-50 22 L50 22" stroke={accent} strokeWidth="1" opacity="0.55" />
      {[-40, -24, -8, 8, 24, 40].map((x) => (
        <path key={x} d={`M${x} 30 L${x + 8} 30 M${x} 38 L${x + 8} 38`} stroke={accent} strokeWidth="1" opacity="0.35" />
      ))}
      {/* 跪着的女子，两只水罐 */}
      <circle cx="0" cy="-4" r="6" fill={PAPER} opacity="0.92" />
      <path d="M-12 6 L8 6 L10 22 L-14 22 Z" fill={accent} opacity="0.7" />
      <path d="M-22 -2 L-14 -2 L-16 6 L-20 6 Z" fill={GOLD} opacity="0.9" />
      <path d="M8 4 L16 4 L14 12 L10 12 Z" fill={GOLD} opacity="0.9" />
      <path d="M-18 6 C-18 12 -20 16 -24 20" stroke={accent} strokeWidth="1.6" fill="none" opacity="0.8" />
      <path d="M12 12 C14 16 20 18 26 20" stroke={accent} strokeWidth="1.6" fill="none" opacity="0.8" />
    </Art>
  )
}

function Moon({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 月亮：有脸的月牙 */}
      <path d="M0 -58 A22 22 0 1 0 0 -14 A27 27 0 1 1 0 -58 Z" fill={accent} opacity="0.92" />
      <circle cx="-8" cy="-38" r="1.8" fill={INK} opacity="0.8" />
      <path d="M-13 -32 C-10 -29 -6 -29 -4 -32" stroke={INK} strokeWidth="1.2" fill="none" opacity="0.7" />
      {/* 两侧的塔 */}
      <path d="M-52 -6 L-40 -6 L-40 22 L-52 22 Z" fill="#3a2f52" />
      <path d="M-54 -10 L-38 -10 L-40 -6 L-52 -6 Z" fill="#4a3f5e" />
      <path d="M40 -6 L52 -6 L52 22 L40 22 Z" fill="#3a2f52" />
      <path d="M38 -10 L54 -10 L52 -6 L40 -6 Z" fill="#4a3f5e" />
      {/* 两只对月而吠的犬狼 */}
      <g transform="translate(-26 40)">
        <path d="M-8 0 L8 0 L6 -8 L10 -12 L4 -10 L0 -16 L-4 -10 L-10 -12 L-6 -8 Z" fill={PAPER} opacity="0.6" />
      </g>
      <g transform="translate(26 40)">
        <path d="M-8 0 L8 0 L6 -8 L10 -12 L4 -10 L0 -16 L-4 -10 L-10 -12 L-6 -8 Z" fill={PAPER} opacity="0.6" />
      </g>
      {/* 从水里爬上来的甲壳动物 */}
      <g transform="translate(0 46)">
        <ellipse cx="0" cy="0" rx="9" ry="6" fill={accent} opacity="0.8" />
        <path d="M-9 -2 L-16 -6 M9 -2 L16 -6 M-6 5 L-10 10 M6 5 L10 10" stroke={accent} strokeWidth="1.4" />
      </g>
      {/* 水线 */}
      <path d="M-56 30 L56 30" stroke={GOLD_DEEP} strokeWidth="0.8" opacity="0.45" />
    </Art>
  )
}

function Sun({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 带脸的太阳 */}
      <circle cx="0" cy="-44" r="17" fill={accent} />
      <circle cx="-6" cy="-48" r="1.8" fill={INK} opacity="0.75" />
      <circle cx="6" cy="-48" r="1.8" fill={INK} opacity="0.75" />
      <path d="M-7 -38 C-3 -34 3 -34 7 -38" stroke={INK} strokeWidth="1.4" fill="none" opacity="0.7" />
      {Array.from({ length: 12 }).map((_, index) => (
        <path
          key={index}
          d="M0 -63 L0 -70"
          stroke={GOLD}
          strokeWidth="1.8"
          opacity="0.85"
          transform={`translate(0 -44) rotate(${index * 30})`}
        />
      ))}
      {/* 围墙 */}
      <path d="M-52 6 L52 6 L52 14 L-52 14 Z" fill="#4a3f5e" opacity="0.8" />
      {/* 白马 */}
      <path d="M-6 14 L24 14 L28 32 L-10 32 Z" fill={PAPER} opacity="0.92" />
      <path d="M-4 14 L-8 4 L-2 2 L2 10 Z" fill={PAPER} opacity="0.92" />
      <path d="M-8 32 L-8 46 M22 32 L22 46" stroke={PAPER} strokeWidth="3" opacity="0.9" />
      <path d="M-8 4 L-12 -2 L-6 -2 Z" fill={accent} opacity="0.8" />
      {/* 孩子 */}
      <circle cx="6" cy="-2" r="5.5" fill={PAPER} opacity="0.95" />
      <path d="M6 3 L6 16" stroke={PAPER} strokeWidth="2" opacity="0.95" />
      {/* 向日葵 */}
      {[[-42, 22], [-30, 30], [42, 22]].map(([x, y]) => (
        <g key={x} transform={`translate(${x} ${y})`}>
          <path d="M0 0 L0 18" stroke="#6fae8a" strokeWidth="1.4" />
          <circle cx="0" cy="-2" r="5" fill={GOLD} />
          <circle cx="0" cy="-2" r="2" fill="#8a5f2c" />
        </g>
      ))}
    </Art>
  )
}

function Judgement({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 天使与号角 */}
      <circle cx="0" cy="-52" r="6.5" fill={PAPER} opacity="0.92" />
      <path d="M-5 -56 C-20 -68 -26 -56 -12 -51 Z" fill={accent} opacity="0.55" />
      <path d="M5 -56 C20 -68 26 -56 12 -51 Z" fill={accent} opacity="0.55" />
      <path d="M-14 -30 L14 -30 L18 -6 L-18 -6 Z" fill={PAPER} opacity="0.85" />
      {/* 十字旗 */}
      <path d="M6 -46 L6 6" stroke={GOLD} strokeWidth="2" />
      <path d="M6 -46 L40 -40 L40 -14 L6 -20 Z" fill={accent} opacity="0.55" stroke={GOLD_DEEP} strokeWidth="0.7" />
      <path d="M23 -42 L23 -18 M10 -30 L36 -30" stroke={PAPER} strokeWidth="2" opacity="0.9" />
      {/* 号角 */}
      <path d="M-8 -40 L-34 -34 L-34 -26 L-8 -32 Z" fill={GOLD} opacity="0.9" />
      <path d="M-34 -40 L-34 -20" stroke={GOLD} strokeWidth="1.6" />
      {/* 从棺中举起双手的人 */}
      {[-30, 0, 30].map((x, index) => (
        <g key={x} transform={`translate(${x} ${index === 1 ? 8 : 20})`}>
          <path d="M-14 12 L14 12 L14 30 L-14 30 Z" fill="#3a2f52" />
          <circle cx="0" cy="0" r="6" fill={PAPER} opacity="0.9" />
          <path d="M-5 5 L-11 -12 M5 5 L11 -12" stroke={PAPER} strokeWidth="2" strokeLinecap="round" opacity="0.9" />
        </g>
      ))}
      <path d="M-52 46 L52 46" stroke={GOLD_DEEP} strokeWidth="0.9" opacity="0.5" />
    </Art>
  )
}

function World({ accent }: { accent: string }) {
  return (
    <Art accent={accent}>
      {/* 桂冠花环 */}
      <ellipse cx="0" cy="0" rx="34" ry="46" fill="none" stroke="#6fae8a" strokeWidth="3" opacity="0.9" />
      <ellipse cx="0" cy="0" rx="27" ry="38" fill="none" stroke={GOLD_DEEP} strokeWidth="0.6" opacity="0.5" />
      {Array.from({ length: 16 }).map((_, index) => {
        const angle = (index / 16) * Math.PI * 2
        return (
          <ellipse
            key={index}
            cx={Math.cos(angle) * 34}
            cy={Math.sin(angle) * 46}
            rx="3.4"
            ry="2"
            fill={accent}
            opacity="0.6"
            transform={`rotate(${(index / 16) * 360} ${Math.cos(angle) * 34} ${Math.sin(angle) * 46})`}
          />
        )
      })}
      {/* 花环中的舞者 */}
      <circle cx="0" cy="-6" r="6" fill={PAPER} opacity="0.92" />
      <path d="M-6 2 L6 2 L8 20 L-8 20 Z" fill={accent} opacity="0.85" />
      <path d="M-4 20 L-12 34 M4 20 L12 34" stroke={PAPER} strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
      <path d="M-6 6 L-16 -4 M6 6 L16 -4" stroke={PAPER} strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      {/* 四角生灵 */}
      {[[-44, -50], [44, -50], [-44, 50], [44, 50]].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="5.5" fill="none" stroke={GOLD} strokeWidth="1.2" opacity="0.8" />
          <circle cx={x} cy={y} r="1.8" fill={GOLD} opacity="0.8" />
        </g>
      ))}
    </Art>
  )
}
