/**
 * 静态星图 —— 降级用的兜底画面（纯数据，不依赖时间、经纬度、window 或网络）。
 *
 * 为什么需要它：
 *   这一页最糟的情况是"界面成了一块黑屏"。只要还有一张能看的星图，
 *   访客就不会以为网站坏了。所以兜底画面必须能在**任何计算都不做**的前提下
 *   画出来 —— 不读时间、不读经纬度、不发请求。
 *
 * 为什么不用真实星表算一遍：
 *   那就又要位置又要时间了，而那种计算恰恰是最可能出错的东西。
 *   所以这里用**固定种子的伪随机星点**：一张"看着像那么回事"的星图，
 *   和真实天象无关，也不需要是 —— 它只在出问题时出现。
 *
 * 「静态」是字面意思：同一个种子永远给出同一张图，不随刷新跳动，
 * 也不会因为服务端/客户端各算一遍而水合（hydration）不一致。
 * 种子写死、结果在模块加载时算成常量，所以不存在随机水合错误。
 */

import { CONSTELLATION_LINES } from '@/lib/sky/stars.generated'
import { projectToPlane } from '@/lib/sky/sky-math'

/** 固定种子：改它就会换一张"底图"，但它永远不会自己变 */
const SEED = 0x5eed1a7e

/** 兜底画面里的星点数。140 个已经够密，再多就显脏 */
const STATIC_STAR_COUNT = 140

/** 兜底画面只画这么多条星座连线（真实的连线表里有 89 个星座，太多了） */
const STATIC_LINE_COUNT = 26

/** 归一化的平面坐标（圆心 0,0，地平圈半径 1），和天顶投影同一套 */
export interface StaticPoint {
  x: number
  y: number
}

export interface StaticStar extends StaticPoint {
  magnitude: number
}

/**
 * 确定性伪随机数（mulberry32）。
 *
 * 用它而不是 Math.random()：这张图必须是**静态**的 ——
 * 每次渲染、每次刷新、服务端和客户端，都得给出同样的结果。
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 一张固定的星图。
 *
 * 撒点方式：方位角均匀取，高度按 `asin(u)` 取 —— 这是球面上"均匀按面积"的
 * 正确写法。天顶投影是共形的，直接用均匀的 u 会让星点全挤在圆心附近，
 * 而 asin 恰好把它摊匀到整个圆盘上。
 *
 * 亮星排在前面：SVG 后画的东西压在上面，亮星的光晕不该被暗星盖住。
 */
function buildStaticStars(): StaticStar[] {
  const random = createRandom(SEED)
  const stars: StaticStar[] = []

  for (let i = 0; i < STATIC_STAR_COUNT; i += 1) {
    const azimuth = random() * 360
    const altitude = Math.asin(random()) * (180 / Math.PI)
    // 1.1–5.5 等：有亮有暗，但都看得见
    const magnitude = 1.1 + random() * 4.4
    const point = projectToPlane({ azimuth, altitude })

    stars.push({ x: point.x, y: point.y, magnitude })
  }

  return stars.sort((a, b) => a.magnitude - b.magnitude)
}

/** 固定星点（模块加载时算一次，之后就是常量） */
export const STATIC_STARS: readonly StaticStar[] = buildStaticStars()

/**
 * 固定的星座连线。
 *
 * 用的是**真实**的连线拓扑（stars.generated.ts 里的坐标），但把每个顶点
 * 按它自己的赤经赤纬映射到静态图上——所以这些线的形状仍然是真实的星座形状，
 * 降级画面看起来像一片认识的天，而不是一堆随机折线。
 *
 * 映射方式：赤经直接当方位角（它本来就在 0–360），赤纬的绝对值当高度。
 * 赤纬取绝对值是为了让南天星座也出现在图里（否则它们全会沉在下面看不见）。
 */
function buildStaticLines(): readonly (readonly StaticPoint[])[] {
  const lines: Array<readonly StaticPoint[]> = []

  for (const line of CONSTELLATION_LINES.slice(0, STATIC_LINE_COUNT)) {
    for (const segment of line.segments) {
      const points: StaticPoint[] = segment.map(([ra, dec]) => {
        const point = projectToPlane({
          azimuth: ra,
          // 压到 5°–85°：贴边的星点会被圆盘裁掉，那样就看不出是个星座了
          altitude: 5 + (Math.abs(dec) / 90) * 80,
        })
        return { x: point.x, y: point.y }
      })

      // 少于两点的折线画不出来，直接丢掉
      if (points.length >= 2) lines.push(points)
    }
  }

  return lines
}

/** 固定连线（同样在模块加载时算好） */
export const STATIC_LINES: readonly (readonly StaticPoint[])[] = buildStaticLines()
