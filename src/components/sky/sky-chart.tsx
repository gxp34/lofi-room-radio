'use client'

import * as React from 'react'

import { moonPhasePath, type MoonShape } from '@/components/sky/moon-phase'
import { STATIC_LINES, STATIC_STARS } from '@/components/sky/static-sky'
import type { SkyScene } from '@/lib/sky/scene'
import { projectToPlane } from '@/lib/sky/sky-math'
import { cn } from '@/lib/utils'

/**
 * 星图的渲染层。
 *
 * 这个文件**只负责画**：不做天文计算、不发请求、不读 localStorage。
 * 拿到一份 SkyScene 就画出来。计算在 lib/sky/ 里（那部分有验证脚本），
 * 取数在 sky-client.tsx 里。拆开的好处是：渲染出问题时，
 * 一眼就能看出是"算错了"还是"画错了"。
 *
 * 用 SVG 而不是 canvas：
 *   · 站内的设计 token（paper / lamp / rain…）直接就是 SVG 的 fill，
 *     不用再维护第二套取色逻辑；
 *   · 高分屏上文字和细线自动清晰，不用手写 devicePixelRatio 缩放；
 *   · 元素是真实 DOM，调样式不用重编译画图代码。
 *   星点 800 个上下、连线几百条，DOM 完全撑得住；而 canvas 擅长的那种
 *   逐帧动画，这张图根本不需要（它是一帧静态天象）。
 */

/** 颜色直接写设计 token 的字面值（见 tailwind.config.ts，改色板要一起改） */
const COLOR = {
  paper: '#f4eee7',
  lamp: '#f7c873',
  rain: '#7fc8d8',
  dust: '#9b8fa3',
  roomDeep: '#1e1926',
} as const

/** 地平圈以下还画这么多度。再往下就完全看不见了 */
const BELOW_HORIZON_FADE_DEG = 8

/**
 * 窄屏上逐步显露的元素。
 *
 * 手机（简化模式）只留：亮星 + 月亮 + 星座连线。
 * 行星、星座名、方位刻度这三样**用 CSS 断点控制**，不用 JS 判断 ——
 * 用 JS 判会先渲染一帧桌面版再跳成手机版（水合不一致），
 * 交给 CSS 则首帧就是对的，缩放窗口也不会抖。
 *
 * 具体的媒体查询写在 globals.css 里（这个项目的插图一律手写 CSS）。
 */
const BREAKPOINT_CLASS = {
  /** 方位刻度：≥400px */
  cardinal: 'sky-show-cardinal',
  /** 行星标记：≥768px（手机上那几个小圆点会盖住星星） */
  planets: 'sky-show-planets',
  /** 文字标签（星座名、月亮）：≥560px，再窄就一定糊成一团 */
  labels: 'sky-show-labels',
} as const

/** 星点的视半径：星等越小越大。1.4 的底数让每暗一等就小一截，接近肉眼观感 */
function starRadius(magnitude: number): number {
  return 0.0035 + 0.0115 * 1.4 ** -magnitude
}

/**
 * 地平线渐隐。
 *
 * 为什么不让地平线以下直接消失：那样星星会在圆盘边缘"啪"地一下冒出来，
 * 像一张被硬裁过的照片。真实夜空本来就是越贴地平越看不见
 * （大气消光 + 地面光污染），所以这里让它们在 +1° 到 -8° 之间渐隐 ——
 * 既遮住了硬边，又正好是真实的观感。
 */
function altitudeOpacity(altitude: number): number {
  if (altitude >= 1) return 1
  if (altitude <= -BELOW_HORIZON_FADE_DEG) return 0
  return (altitude + BELOW_HORIZON_FADE_DEG) / (BELOW_HORIZON_FADE_DEG + 1)
}

/** 地平坐标 → SVG 坐标。viewBox 是 [-1,1]，地平圈正好落在半径 1 上 */
function toPoint(azimuth: number, altitude: number): { x: number; y: number } {
  const projected = projectToPlane({ azimuth, altitude })
  return { x: projected.x, y: projected.y }
}

export interface SkyChartProps {
  /**
   * 真实天象。
   * `null` = 降级：只画 static-sky.ts 那张固定底图（不是加载动画）。
   */
  scene: SkyScene | null
  className?: string
}

export function SkyChart({ scene, className }: SkyChartProps) {
  const degraded = scene === null

  /* ---------------- 这一帧要画的东西（纯计算，没有副作用） ---------------- */

  /**
   * 降级底图。
   *
   * 它是模块级常量（static-sky.ts 里算好的），所以这里是零成本引用 ——
   * 这一点很重要：**降级路径不能再依赖任何计算**，
   * 否则"算不出来"的时候这张底图也跟着出不来。
   */
  const staticFrame = React.useMemo(
    () => ({
      stars: STATIC_STARS.map((star) => ({
        x: star.x,
        y: star.y,
        magnitude: star.magnitude,
      })),
      lines: STATIC_LINES.map((segment) => segment.map((point) => ({ x: point.x, y: point.y }))),
    }),
    [],
  )

  const frame = React.useMemo(() => {
    if (!scene) return null

    /* ---- 星点：只留地平线以上（含渐隐区）的 ---- */
    const stars = scene.stars
      .filter((star) => star.altitude > -BELOW_HORIZON_FADE_DEG)
      .map((star) => ({
        magnitude: star.magnitude,
        color: star.color,
        altitude: star.altitude,
        ...toPoint(star.azimuth, star.altitude),
      }))

    /* ---- 星座连线：把星坐标取出来，再丢掉地平线以下的点 ---- */
    const lines = scene.constellations
      .map((constellation) => ({
        abbr: constellation.abbr,
        paths: constellation.segments
          // 上一版这里套了三层 filter/reduce，读起来费劲还写错过一次；
          // 拆成"先过滤、再映射"两步就一眼能看懂了
          .map((segment) => segment.filter((star) => star.altitude > -BELOW_HORIZON_FADE_DEG))
          .filter((segment) => segment.length >= 2)
          .map((segment) => segment.map((star) => toPoint(star.azimuth, star.altitude))),
      }))
      .filter((constellation) => constellation.paths.length > 0)

    /* ---- 星座名的锚点：取露出地平线那些星点的平均位置 ---- */
    const anchors = scene.constellations
      .map((constellation) => {
        const visible = constellation.segments.flat().filter((star) => star.altitude > 12)
        // 少于 3 颗星露在外面的星座（比如天箭座），名字放上去也认不出来
        if (visible.length < 3) return null

        const sum = visible.reduce(
          (accumulator, star) => {
            const point = toPoint(star.azimuth, star.altitude)
            return { x: accumulator.x + point.x, y: accumulator.y + point.y }
          },
          { x: 0, y: 0 },
        )

        return {
          abbr: constellation.abbr,
          zh: constellation.zh,
          rank: constellation.rank,
          x: sum.x / visible.length,
          y: sum.y / visible.length,
        }
      })
      .filter((anchor): anchor is NonNullable<typeof anchor> => anchor !== null)

    return { stars, lines, anchors }
  }, [scene])

  /**
   * 标签避让。
   *
   * 89 个星座名全画上就是一团糊，尤其在圆盘中间。这里按
   * 「知名度（rank）→ 中文名」排序，一个个往图上放，离已放好的太近就跳过。
   *
   * 排序必须**稳定**：不能出现"刷新一下某几个星座名换了位置"。
   * 所以第二个排序键用 localeCompare，而不是"露出来的亮星数量"这种会变的东西。
   */
  const labels = React.useMemo(() => {
    if (!frame) return []

    const ordered = [...frame.anchors].sort((a, b) => a.rank - b.rank || a.zh.localeCompare(b.zh))
    const accepted: typeof ordered = []
    /** 两个标签至少隔开 0.22（归一化坐标，圆盘半径是 1） */
    const MIN_DISTANCE = 0.22

    for (const label of ordered) {
      const tooClose = accepted.some(
        (other) => Math.hypot(other.x - label.x, other.y - label.y) < MIN_DISTANCE,
      )
      if (tooClose) continue
      accepted.push(label)
      if (accepted.length >= 26) break
    }

    return accepted
  }, [frame])

  /* ---------------- 月亮 ---------------- */

  const moon = scene?.moon ?? null
  const moonPoint = moon ? toPoint(moon.azimuth, moon.altitude) : null
  const moonShape: MoonShape | null = moon
    ? {
        illumination: moon.illumination,
        phaseAngle: moon.phaseAngle,
        /**
         * ⚠️ 「上弦月亮右边」= 相位角 < 180°。
         *
         * phaseAngle 的定义是「太阳—月亮—地球」的夹角：新月是 0°、满月是 180°。
         * 所以 0→180° 这一段是**往满月走**，北半球看到的亮面就在右边。
         *
         * 第一版这里判反了，结果上弦月画成了下弦月 ——
         * 这种错误盯着代码看看不出来，必须对着"上弦月右边亮"这条常识核一遍。
         */
        waxing: moon.phaseAngle < 180,
      }
    : null

  return (
    <svg
      viewBox="-1.04 -1.04 2.08 2.08"
      className={cn('block h-auto w-full', className)}
      role="img"
      aria-label={
        scene
          ? `今晚的星空：${scene.stars.length} 颗星、${scene.constellations.length} 个星座的连线`
          : '一张静态的星空图（今晚的星空暂时算不出来）'
      }
    >
      <defs>
        {/* 天幕：中心比边缘深一点，画面才有"穹顶"的感觉 */}
        <radialGradient id="sky-vault" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0d0b14" />
          <stop offset="68%" stopColor="#16131f" />
          <stop offset="100%" stopColor="#241d2c" />
        </radialGradient>
        {/* 地平线附近那一圈很淡的暖色，像远处的城市光 */}
        <radialGradient id="sky-horizon" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor={COLOR.lamp} stopOpacity="0" />
          <stop offset="94%" stopColor={COLOR.lamp} stopOpacity="0.14" />
          <stop offset="100%" stopColor={COLOR.lamp} stopOpacity="0.03" />
        </radialGradient>
        {/* 亮星和月亮共用的光晕。radialGradient 默认按包围盒定位，
            对正圆来说包围盒中心就是圆心，所以这一条对所有圆都适用 */}
        <radialGradient id="sky-glow">
          <stop offset="0%" stopColor={COLOR.paper} stopOpacity="0.5" />
          <stop offset="55%" stopColor={COLOR.paper} stopOpacity="0.12" />
          <stop offset="100%" stopColor={COLOR.paper} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ================= 天幕 ================= */}
      <circle cx="0" cy="0" r="1" fill="url(#sky-vault)" />
      <circle cx="0" cy="0" r="1" fill="url(#sky-horizon)" />

      {/* ================= 降级底图 =================
          只在算不出真实天象时出现。它是固定常量（见 static-sky.ts），
          所以这一块永远不会白屏，也永远不会水合不一致。 */}
      {degraded && (
        <g>
          <g
            fill="none"
            stroke={COLOR.dust}
            strokeOpacity={0.18}
            strokeWidth={0.005}
            strokeLinecap="round"
          >
            {staticFrame.lines.map((segment, index) => (
              <polyline
                key={`static-${index}`}
                points={segment.map((point) => `${point.x},${point.y}`).join(' ')}
              />
            ))}
          </g>
          <g fill={COLOR.paper}>
            {staticFrame.stars.map((star, index) => (
              <circle
                key={`static-star-${index}`}
                cx={star.x}
                cy={star.y}
                r={starRadius(star.magnitude) * 0.9}
                opacity={star.magnitude > 4.2 ? 0.5 : 0.85}
              />
            ))}
          </g>
        </g>
      )}

      {/* ================= 真实天象 ================= */}
      {frame && (
        <>
          {/* ---- 星座连线 ---- */}
          <g
            fill="none"
            stroke={COLOR.rain}
            strokeOpacity={0.3}
            strokeWidth={0.005}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {frame.lines.map((constellation) =>
              constellation.paths.map((segment, index) => (
                <polyline
                  key={`${constellation.abbr}-${index}`}
                  points={segment.map((point) => `${point.x},${point.y}`).join(' ')}
                />
              )),
            )}
          </g>

          {/* ---- 星点 ---- */}
          <g>
            {frame.stars.map((star, index) => {
              const radius = starRadius(star.magnitude)

              return (
                <g key={index} opacity={altitudeOpacity(star.altitude)}>
                  {/* 只给 1.5 等以内的真亮星加光晕，否则整张图会发灰 */}
                  {star.magnitude <= 1.5 && (
                    <circle cx={star.x} cy={star.y} r={radius * 3.6} fill="url(#sky-glow)" />
                  )}
                  <circle
                    cx={star.x}
                    cy={star.y}
                    r={radius}
                    fill={star.color}
                    opacity={star.magnitude > 4 ? 0.66 : 0.96}
                  />
                </g>
              )
            })}
          </g>

          {/* ---- 月亮 ---- */}
          {moon && moonPoint && moonShape && moon.altitude > -BELOW_HORIZON_FADE_DEG && (
            <g opacity={altitudeOpacity(moon.altitude)}>
              <circle
                cx={moonPoint.x}
                cy={moonPoint.y}
                r={2.1 + moon.illumination * 1.1}
                fill="url(#sky-glow)"
              />
              {/* 月亮的半径固定取 0.042（约合 2.4°，是真实月亮视直径的两倍多，
                  不放大在图上就只是个小点）。亮暗变化交给亮面比例去表现 */}
              <circle cx={moonPoint.x} cy={moonPoint.y} r={0.042} fill={COLOR.roomDeep} />
              {/* 亮面：和右侧那张大图共用同一个 moonPhasePath，保证两处月相一致 */}
              <path
                d={moonPhasePath(moonPoint.x, moonPoint.y, 0.042, moonShape)}
                fill={COLOR.paper}
              />
              <circle
                cx={moonPoint.x}
                cy={moonPoint.y}
                r={0.042}
                fill="none"
                stroke={COLOR.paper}
                strokeOpacity={0.25}
                strokeWidth={0.004}
              />
              <text
                x={moonPoint.x}
                y={moonPoint.y - 0.08}
                textAnchor="middle"
                fontSize={0.055}
                fill={COLOR.paper}
                opacity={0.85}
                className={cn('font-display', BREAKPOINT_CLASS.labels)}
              >
                月亮
              </text>
            </g>
          )}

          {/* ---- 行星（窄屏由 CSS 隐藏）---- */}
          <g className={BREAKPOINT_CLASS.planets}>
            {scene?.planets.map((planet) => {
              // 地平线以下的行星不画：标一个看不见的东西只会让人困惑
              if (planet.altitude <= -BELOW_HORIZON_FADE_DEG) return null

              const point = toPoint(planet.azimuth, planet.altitude)
              const radius = 0.013 + Math.max(0, 2.5 - planet.magnitude) * 0.004

              return (
                <g key={planet.key} opacity={altitudeOpacity(planet.altitude)}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={radius * 2.4}
                    fill={planet.color}
                    opacity={planet.visible ? 0.22 : 0.1}
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={radius}
                    fill={planet.color}
                    opacity={planet.visible ? 0.95 : 0.5}
                  />
                  <text
                    x={point.x}
                    y={point.y - radius - 0.028}
                    textAnchor="middle"
                    fontSize={0.055}
                    fill={planet.color}
                    opacity={planet.visible ? 0.9 : 0.5}
                    className="font-display"
                  >
                    {planet.name}
                  </text>
                </g>
              )
            })}
          </g>

          {/* ---- 星座名（窄屏由 CSS 隐藏）---- */}
          <g className={cn('font-display', BREAKPOINT_CLASS.labels)} textAnchor="middle">
            {labels.map((label) => (
              <text
                key={label.abbr}
                x={label.x}
                y={label.y}
                fontSize={0.056}
                fill={COLOR.dust}
                opacity={label.rank === 1 ? 0.85 : 0.6}
                letterSpacing={0.02}
              >
                {label.zh}
              </text>
            ))}
          </g>
        </>
      )}

      {/* ================= 地平圈与方位 ================= */}
      <circle
        cx="0"
        cy="0"
        r="1"
        fill="none"
        stroke={COLOR.dust}
        strokeOpacity={0.32}
        strokeWidth={0.006}
      />
      <g className={cn('font-display', BREAKPOINT_CLASS.cardinal)} textAnchor="middle">
        {(
          [
            { label: '北', x: 0, y: -1 },
            { label: '东', x: 1, y: 0 },
            { label: '南', x: 0, y: 1 },
            { label: '西', x: -1, y: 0 },
          ] as const
        ).map((mark) => (
          <text
            key={mark.label}
            x={mark.x * 0.905}
            y={mark.y * 0.905}
            dy="0.022"
            fontSize={0.07}
            fill={COLOR.dust}
            opacity={0.8}
          >
            {mark.label}
          </text>
        ))}
      </g>
    </svg>
  )
}
