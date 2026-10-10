import { moonPhasePath, type MoonShape } from '@/lib/sky/moon-phase'
import { cn } from '@/lib/utils'

/**
 * 月相插图 —— 手写 SVG，不用任何图片文件。
 *
 * 这里只负责**画**：几何全在 lib/sky/moon-phase.ts 里
 * （那边是纯函数，有 scripts/verify-moon-phase-browser.mjs 验证 ——
 *   它把路径真的放进 Chromium，用 isPointInFill 量亮面面积）。
 *
 * 颜色用的是站内的设计 token：月亮的球体取 `room`（比背景亮一点的暗部，
 * 这样新月时也能看出"那里有个月亮"），亮面取 `paper`（米白）。
 * 刻意**不用** `lamp`（台灯暖黄）—— 在这个房间的设定里月亮是冷色的，
 * 和台灯那套暖光分开，两处光源才不打架。
 *
 * 从 lib 里把这两个名字再导出一次，是为了让调用方
 * （sky-chart.tsx / sky-client.tsx）只从一个地方 import 月相相关的东西。
 */
export { moonPhasePath }
export type { MoonShape }

export interface MoonPhaseIconProps {
  shape: MoonShape
  /** 显示尺寸（像素） */
  size?: number
  className?: string
}

export function MoonPhaseIcon({ shape, size = 72, className }: MoonPhaseIconProps) {
  // 用一个固定的 100×100 viewBox，渲染尺寸交给 size，缩放让浏览器去做
  const viewBox = 100
  const radius = 34
  const center = viewBox / 2
  const path = moonPhasePath(center, center, radius, shape)

  /**
   * 暗面的亮度：新月时几乎全暗，得给一点点底光才看得见"那里有个月亮"。
   * 但给太多了，满月时又会在亮面边上透出一圈灰边。
   * 所以按照亮比例在两者之间插值。
   */
  const darkOpacity = 0.55 + shape.illumination * 0.2

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      role="img"
      aria-label={`月相：被照亮 ${Math.round(shape.illumination * 100)}%`}
      className={cn('shrink-0', className)}
    >
      {/* 整个球（暗面） */}
      <circle cx={center} cy={center} r={radius} fill="#2b2230" opacity={darkOpacity} />
      {/* 被照亮的部分 */}
      <path d={path} fill="#f4eee7" />
      {/* 一圈很淡的外缘：让它在深色底上"亮"起来，也给新月一个轮廓 */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#f4eee7"
        strokeOpacity={0.3 + shape.illumination * 0.25}
        strokeWidth={1.5}
      />
    </svg>
  )
}
