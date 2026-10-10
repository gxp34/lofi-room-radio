/**
 * 从「星表 + 观测者」算出这一帧要画的天象（SkyScene）。
 *
 * 这一层是**纯函数**：给它一份星表和一个时刻，永远得到同一张图。
 * 它不读 localStorage、不发请求、不碰 window —— 所以既能在浏览器里
 * 每隔几分钟重算一次，也能在服务端跑（写测试的时候很方便）。
 *
 * 两件必须在这里做、否则星图会明显不对的事：
 *
 *   1. **岁差**（precession）
 *      星表是 J2000 历元的，而现在是 202x 年。地轴在缓慢进动，
 *      25 年下来恒星坐标已经漂了约 0.35° —— 在 700px 的星图上就是 2px 多，
 *      而且所有星朝同一个方向偏，整张图会像被"整体推了一下"。
 *      所以这里把星表坐标先推到"今天"。
 *
 *   2. **球面三角**（赤道坐标 → 地平坐标）
 *      恒星的赤经赤纬不随观测者变，但"它在天上哪个位置"随经纬度和时间变。
 *      这一步在 sky-math.ts 的 toHorizontal() 里。
 *
 * 光行差和章动就算了：两者加起来约 0.02°，在这种尺度的图上连一个像素都不到。
 */

import { CONSTELLATION_LINES, CONSTELLATION_NAMES, STAR_TABLE } from '@/lib/sky/stars.generated'
import {
  computeMoon,
  computePlanets,
  julianDay,
  localSiderealTime,
  sunAltitude,
  toHorizontal,
  type MoonPosition,
  type PlanetPosition,
} from '@/lib/sky/sky-math'

/* ==========================================================================
   1. 类型
   ========================================================================== */

/** 一颗已经算好"此刻在天上哪里"的星 */
export interface SkySceneStar {
  /** 地平高度，度 */
  altitude: number
  /** 方位角，度，正北 0、正东 90 */
  azimuth: number
  /** 视星等 */
  magnitude: number
  /** 星点颜色（由色指数 B−V 换算） */
  color: string
  /** 岁差修正之后的赤经赤纬，调试和测试用 */
  ra: number
  dec: number
}

/** 一个星座的连线，每一段都是一串已经算好位置的星 */
export interface SkySceneConstellation {
  abbr: string
  /** 中文名 */
  zh: string
  /** d3-celestial 的知名度分级，1 最有名 */
  rank: number
  segments: SkySceneStar[][]
}

export interface SkyScene {
  /** 算这份图用的时刻 */
  date: Date
  latitude: number
  longitude: number
  /** 地方恒星时（度），调试用 */
  siderealTime: number
  /** 太阳的地平高度：< 0 说明天已经黑了 */
  sunAltitude: number
  stars: SkySceneStar[]
  constellations: SkySceneConstellation[]
  moon: MoonPosition
  planets: PlanetPosition[]
}

export interface SkySceneOptions {
  latitude: number
  longitude: number
  /** 计算时刻。默认"现在" */
  date?: Date
  /**
   * 只算到几等星为止。默认 6（几乎全表）。
   *
   * 为什么把它做成"算的时候"的参数，而不是渲染的时候过滤：
   *   星点数是**唯一**没法用 CSS 控制的量（CSS 藏不掉单个星星），
   *   而每颗星都要做一次岁差 + 一次球面三角。手机上只到 3.1 等的话
   *   能少算一半以上，DOM 也就少一半。
   *
   * 注意连线**不受它影响**：CONSTELLATION_LINES 里存的是坐标而不是下标，
   *   所以滤掉暗星不会让星座连错（这个坑踩过一次，见生成脚本里的说明）。
   */
  maxMagnitude?: number
}

/* ==========================================================================
   2. 岁差：J2000 → 观测时刻
   ========================================================================== */

/** 赤道直角坐标 */
interface Vector3 {
  x: number
  y: number
  z: number
}

/**
 * 生成 J2000 到指定时刻的岁差旋转（Meeus 第 21 章，IAU 1976 的 ζ/z/θ 角）。
 *
 * 返回的是一个**函数**而不是矩阵对象：整个场景有近千颗星，
 * 每次都对同一个角度重新算三角函数太浪费，所以把系数闭包进去。
 * 这些角度单个只有角秒量级，但按 T、T²、T³ 累加到 25 年就很可观了
 * （约 0.35°），不能不修。
 */
function createPrecession(date: Date): (vector: Vector3) => Vector3 {
  // 自 J2000 起算的儒略世纪数
  const t = (julianDay(date) - 2451545.0) / 36525
  const toRadians = Math.PI / 180
  /** 角秒 → 弧度 */
  const arcsecToRad = toRadians / 3600

  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * arcsecToRad
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * arcsecToRad
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * arcsecToRad

  const cosZeta = Math.cos(zeta)
  const sinZeta = Math.sin(zeta)
  const cosZ = Math.cos(z)
  const sinZ = Math.sin(z)
  const cosTheta = Math.cos(theta)
  const sinTheta = Math.sin(theta)

  return ({ x, y, z: zz }) => ({
    x:
      (cosZeta * cosZ * cosTheta - sinZeta * sinZ) * x +
      (-sinZeta * cosZ * cosTheta - cosZeta * sinZ) * y -
      cosZ * sinTheta * zz,
    y:
      (cosZeta * sinZ * cosTheta + sinZeta * cosZ) * x +
      (-sinZeta * sinZ * cosTheta + cosZeta * cosZ) * y -
      sinZ * sinTheta * zz,
    z: cosZeta * sinTheta * x - sinZeta * sinTheta * y + cosTheta * zz,
  })
}

/* ==========================================================================
   3. 星点颜色：色指数 → 屏幕上看得过去的颜色
   ========================================================================== */

/**
 * 把 B−V 色指数换成星点的颜色。
 *
 * 真实做法是查色温表再转 RGB，但那样得到的颜色饱和度极低
 * （星星本来颜色就淡），在深色背景上几本分不出来。所以这里用**手调过的锚点**：
 * 参宿七那种蓝白、太阳那种黄白、参宿四那种橙红各给一个能在夜色上
 * 分辨出来的值，中间线性插值。它不物理，但它是给眼睛看的。
 */
export function starColor(bv: number): string {
  interface Anchor {
    bv: number
    rgb: readonly [number, number, number]
  }

  const anchors: readonly Anchor[] = [
    { bv: -0.35, rgb: [168, 196, 255] }, // 蓝白（参宿七）
    { bv: 0.0, rgb: [202, 216, 255] },
    { bv: 0.6, rgb: [244, 238, 231] }, // 黄白（太阳）—— 直接用站内的 paper
    { bv: 1.2, rgb: [250, 220, 180] },
    { bv: 1.8, rgb: [255, 196, 150] }, // 橙红（参宿四）
  ]

  const first = anchors[0] as Anchor
  const last = anchors[anchors.length - 1] as Anchor

  if (bv <= first.bv) return `rgb(${first.rgb.join(', ')})`
  if (bv >= last.bv) return `rgb(${last.rgb.join(', ')})`

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const low = anchors[i] as Anchor
    const high = anchors[i + 1] as Anchor
    if (bv < low.bv || bv > high.bv) continue

    const ratio = (bv - low.bv) / (high.bv - low.bv)
    const channel = (index: 0 | 1 | 2) =>
      Math.round(low.rgb[index] + (high.rgb[index] - low.rgb[index]) * ratio)

    return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`
  }

  return `rgb(${first.rgb.join(', ')})`
}

/* ==========================================================================
   4. 主函数
   ========================================================================== */

/** 赤经赤纬（度）→ 单位向量 */
function equatorialToVector(ra: number, dec: number): Vector3 {
  const raRad = ra * (Math.PI / 180)
  const decRad = dec * (Math.PI / 180)
  const cosDec = Math.cos(decRad)

  return { x: cosDec * Math.cos(raRad), y: cosDec * Math.sin(raRad), z: Math.sin(decRad) }
}

/** 单位向量 → 赤经赤纬（度） */
function vectorToEquatorial({ x, y, z }: Vector3): { ra: number; dec: number } {
  const ra = Math.atan2(y, x) * (180 / Math.PI)
  const dec = Math.asin(Math.max(-1, Math.min(1, z))) * (180 / Math.PI)

  return { ra: ((ra % 360) + 360) % 360, dec }
}

/**
 * 算出这一帧的完整天象。
 *
 * 975 颗星各做一次岁差 + 一次球面三角，实测是个位数毫秒 ——
 * 所以完全可以每隔几分钟重算一次，让星空慢慢地转。
 */
export function buildSkyScene(options: SkySceneOptions): SkyScene {
  const date = options.date ?? new Date()
  const { latitude, longitude } = options
  const maxMagnitude = options.maxMagnitude ?? 6

  const lst = localSiderealTime(date, longitude)
  const precess = createPrecession(date)

  /* ---- 星点 ---- */
  const stars: SkySceneStar[] = []

  for (const [ra, dec, magnitude, bv] of STAR_TABLE) {
    /**
     * 比阈值暗的星**直接跳过计算**，不是算完再筛。
     *
     * 手机上只到 3.1 等，全表 975 颗里只有 170 颗左右需要算 ——
     * 省下的是 800 次岁差 + 800 次球面三角。这一页每 4 分钟重算一次，
     * 白算的这部分是实打实的电量。
     *
     * 之所以敢在这里 continue（而不是像旧版那样占个位再标记），
     * 是因为 CONSTELLATION_LINES 存的是坐标而不是下标 ——
     * 滤掉星点不会让任何星座连错星。
     */
    if (magnitude > maxMagnitude) continue

    const moved = precess(equatorialToVector(ra, dec))
    const shifted = vectorToEquatorial(moved)
    const horizontal = toHorizontal(shifted, lst, latitude)

    stars.push({
      altitude: horizontal.altitude,
      azimuth: horizontal.azimuth,
      magnitude,
      color: starColor(bv),
      ra: shifted.ra,
      dec: shifted.dec,
    })
  }

  /* ---- 星座连线：把连线上的赤经赤纬也算一遍 ---- */
  const nameByAbbr = new Map(CONSTELLATION_NAMES.map((item) => [item.abbr, item]))

  const constellations: SkySceneConstellation[] = CONSTELLATION_LINES.map((line) => {
    const meta = nameByAbbr.get(line.abbr)

    return {
      abbr: line.abbr,
      zh: meta?.zh ?? line.abbr,
      rank: meta?.rank ?? 3,
      segments: line.segments.map((segment) =>
        segment.map(([ra, dec]) => {
          const moved = precess(equatorialToVector(ra, dec))
          const shifted = vectorToEquatorial(moved)
          const horizontal = toHorizontal(shifted, lst, latitude)

          return {
            altitude: horizontal.altitude,
            azimuth: horizontal.azimuth,
            // 连线自己不带星等/颜色，这两项只是类型上的需要
            magnitude: 6,
            color: starColor(0.6),
            ra: shifted.ra,
            dec: shifted.dec,
          }
        }),
      ),
    }
  })

  /* ---- 月亮与行星 ---- */
  const observer = { latitude, longitude, date }

  return {
    date,
    latitude,
    longitude,
    siderealTime: lst,
    sunAltitude: sunAltitude(observer),
    stars,
    constellations,
    moon: computeMoon(observer),
    planets: computePlanets(observer),
  }
}
