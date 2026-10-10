/**
 * 星空的数学：恒星时、地平坐标、球极投影、月亮和行星的位置。
 *
 * **这个文件不 import 任何东西**（除了类型），所以服务端和客户端都能用，
 * 也方便单独写个脚本拿已知星历对照验证。它不发任何网络请求。
 *
 * 为什么自己写这一套，而不是引第三方库：
 *   1. 精度要求很低 —— 这是氛围功能，不是天文软件。误差 0.5° 在
 *      一个直径 700px 的星图上不到 4px，肉眼看不出来。
 *   2. 项目里已经有 suncalc（日出日落/月相），但它**不提供**月亮和行星的
 *      赤经赤纬，而星图恰恰需要这个。
 *   3. 免得为了几个位置把一个 1.8 MB 的星历库（astronomy-engine）拖进来。
 *
 * 算法出处（都是公开的经典公式，不是自己推的）：
 *   · 儒略日 / 格林尼治恒星时：Meeus《Astronomical Algorithms》第 7 章
 *   · 月亮位置：同书第 47 章的简化版（只取主项，误差约 0.2°）
 *   · 行星位置：JPL 的「近似轨道根数」表（1800–2050 有效），解开普勒方程
 *     得到日心坐标，再减去地球的日心坐标
 *   · 月亮相位：同书第 48 章的月日距角法
 *
 * 坐标约定（和 stars.generated.ts 一致）：
 *   赤经 RA 用**度**（0–360，不是小时），赤纬 Dec 用度（-90–90），J2000 历元。
 *   天文文献习惯用小时，但代码里到处 ×15 更容易出错，所以统一用度。
 */

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

/** J2000 的平黄赤交角 */
const OBLIQUITY_J2000 = 23.4392911
/** 黄赤交角每儒略世纪的变化（度） */
const OBLIQUITY_RATE = -0.0130042

/** 把角度收进 [0, 360) */
export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360
}

export interface EquatorialCoords {
  /** 赤经，度 */
  ra: number
  /** 赤纬，度 */
  dec: number
}

export interface HorizontalCoords {
  /** 方位角，度，正北 0、正东 90 */
  azimuth: number
  /** 地平高度，度，地平线 0、天顶 90 */
  altitude: number
}

/** 观测者：一颗星画在哪，完全由这三样决定 */
export interface SkyObserver {
  latitude: number
  longitude: number
  date: Date
}

/** 太阳系天体在天上的样子 */
export interface SolarSystemBody extends EquatorialCoords {
  /** 地平高度（< 0 就是在地平线以下，看不见） */
  altitude: number
  azimuth: number
  /** 视星等（近似值，只用来决定画多大） */
  magnitude: number
  /** 离太阳的角距（度）：太近就淹没在暮光里 */
  elongation: number
}

/* ==========================================================================
   1. 时间
   ========================================================================== */

/** 儒略日。Meeus 的写法，1582 年之后都有效 */
export function julianDay(date: Date): number {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  const day =
    date.getUTCDate() +
    (date.getUTCHours() + (date.getUTCMinutes() + date.getUTCSeconds() / 60) / 60) / 24

  let y = year
  let m = month
  if (m <= 2) {
    y -= 1
    m += 12
  }

  const a = Math.floor(y / 100)
  const b = 2 - a + Math.floor(a / 4)

  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5
}

/** 自 J2000.0 起算的儒略世纪数 */
function centuriesSinceJ2000(date: Date): number {
  return (julianDay(date) - 2451545.0) / 36525
}

/** 某一时刻的平黄赤交角（度） */
function obliquityAt(date: Date): number {
  return OBLIQUITY_J2000 + OBLIQUITY_RATE * centuriesSinceJ2000(date)
}

/**
 * 地方恒星时（度）。
 *
 * 恒星时是「天上现在几点」，星图没有它就转不起来。
 * 用 Meeus 的 GMST 公式，只取到 T² 项，误差远小于 0.1 秒。
 */
export function localSiderealTime(date: Date, longitudeDeg: number): number {
  const t = centuriesSinceJ2000(date)
  const days = julianDay(date) - 2451545.0
  const gmst = 280.46061837 + 360.98564736629 * days + 0.000387933 * t * t

  return normalizeDegrees(gmst + longitudeDeg)
}

/* ==========================================================================
   2. 赤道坐标 → 地平坐标
   ========================================================================== */

/**
 * 一颗星现在在头顶的哪里。
 *
 * 这是星图的**核心一步**：星表里的赤经赤纬是天球上的固定位置，
 * 要变成「屏幕上该画在哪」，必须先知道观测者此刻的经纬度和时间。
 *
 * 注意：这里**不做大气折射修正**（地平线附近真实位置会比几何位置高约 0.5°）。
 * 那 0.5° 在界面上只值几个像素，而「地平线附近本来就看不太清」这件事
 * 是用渐隐处理的（见 sky-chart.tsx），不值得再加一层计算。
 */
export function toHorizontal(
  coords: EquatorialCoords,
  lstDeg: number,
  latitudeDeg: number,
): HorizontalCoords {
  // 时角：0 = 刚好在正南（北半球）上空
  const hourAngle = normalizeDegrees(lstDeg - coords.ra) * DEG
  const dec = coords.dec * DEG
  const lat = latitudeDeg * DEG

  const sinAltitude =
    Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(hourAngle)
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAltitude)))

  // 用 atan2 而不是 acos：acos 在接近天顶时会丢掉方位信息
  const y = -Math.cos(dec) * Math.sin(hourAngle)
  const x = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(hourAngle)
  const azimuth = normalizeDegrees(Math.atan2(y, x) * RAD)

  return { azimuth, altitude: altitude * RAD }
}

/* ==========================================================================
   3. 球极投影（把天球摊到平面上）
   ========================================================================== */

/**
 * 天顶投影：天顶落在圆心，地平线在半径 1 处。返回**归一化坐标**。
 *
 * 为什么用球极投影（stereographic）而不是等距投影：
 *   球极投影是共形的 —— 它保角，所以星座的形状不会被拉歪，
 *   这正是星图和所有星空 App 都用它的原因；
 *   等距投影会让靠近边缘的星座被压扁。
 *
 * 半径的取法：球极投影里 90° 对应 2·tan(45°) = 2 个单位，
 * 所以地平圈正好落在 1 上 —— 圆心是天顶、边缘是地平，
 * 正方形画面也正好把整个可见天空装进去（圆的视窗比矩形更像从井里往上看）。
 *
 * 屏幕像素的换算交给组件（这块数学不该关心排版）。
 */
export interface ProjectedPoint {
  /** 归一化平面坐标，圆心 (0,0)，地平圈半径 1 */
  x: number
  y: number
  /** 离天顶的角距（度）：0 = 正头顶，90 = 地平线 */
  zenithDistance: number
}

export function projectToPlane(horizontal: HorizontalCoords): ProjectedPoint {
  const zenithDistance = 90 - horizontal.altitude
  // 球极投影的径向距离，再归一化到「地平圈 = 1」
  const radius = Math.tan((zenithDistance * DEG) / 2)
  const phi = horizontal.azimuth * DEG

  return {
    x: radius * Math.sin(phi),
    // 屏幕 y 轴向下，所以正北朝上是 -cos
    y: -radius * Math.cos(phi),
    zenithDistance,
  }
}

/* ==========================================================================
   4. 黄道 ↔ 赤道
   ========================================================================== */

/** 黄道坐标 → 赤道坐标（绕黄赤交角转一下） */
function eclipticToEquatorial(
  date: Date,
  longitudeDeg: number,
  latitudeDeg: number,
): EquatorialCoords {
  const obliquity = obliquityAt(date) * DEG
  const lambda = longitudeDeg * DEG
  const beta = latitudeDeg * DEG

  const sinDec =
    Math.sin(beta) * Math.cos(obliquity) + Math.cos(beta) * Math.sin(obliquity) * Math.sin(lambda)
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)))

  const y = Math.sin(lambda) * Math.cos(obliquity) - Math.tan(beta) * Math.sin(obliquity)
  const x = Math.cos(lambda)

  return { ra: normalizeDegrees(Math.atan2(y, x) * RAD), dec: dec * RAD }
}

/* ==========================================================================
   5. 太阳
   ========================================================================== */

interface EclipticPosition {
  /** 黄经，度 */
  longitude: number
  /** 黄纬，度 */
  latitude: number
  /** 到地球的距离，AU */
  distance: number
}

/**
 * 太阳的地心黄道坐标。Meeus 低精度公式（24 章），误差 0.01°。
 * 它的黄经同时用来判断行星「是不是离太阳太近、看不见」。
 */
function sunEcliptic(date: Date): EclipticPosition {
  const t = centuriesSinceJ2000(date)

  // 太阳平黄经与平近点角
  const meanLongitude = 280.46646 + 36000.76983 * t + 0.0003032 * t * t
  const meanAnomaly = 357.52911 + 35999.05029 * t - 0.0001537 * t * t

  // 中心差：把匀速圆轨道修正成椭圆
  const center =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(meanAnomaly * DEG) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * meanAnomaly * DEG) +
    0.000289 * Math.sin(3 * meanAnomaly * DEG)

  const eccentricity = 0.016708634 - 0.000042037 * t
  const distance =
    (1.000001018 * (1 - eccentricity * eccentricity)) /
    (1 + eccentricity * Math.cos((meanAnomaly + center) * DEG))

  return { longitude: normalizeDegrees(meanLongitude + center), latitude: 0, distance }
}

/** 太阳此刻的地平高度。星图靠它决定「现在其实还是白天」 */
export function sunAltitude(observer: SkyObserver): number {
  const sun = sunEcliptic(observer.date)
  const equatorial = eclipticToEquatorial(observer.date, sun.longitude, 0)
  const lst = localSiderealTime(observer.date, observer.longitude)

  return toHorizontal(equatorial, lst, observer.latitude).altitude
}

/* ==========================================================================
   6. 行星
   ========================================================================== */

/**
 * 行星的近似轨道根数（JPL 的 Keplerian Elements for Approximate Positions，
 * 1800–2050 年有效）。
 *
 * 每行是 a(AU) / e / i(°) / L(°) / ϖ(°) / Ω(°)，以及它们每儒略世纪的变化率。
 * 用这套根数的好处是：**只依赖 12 个数字**，不用把几 MB 的星历表塞进包里。
 *
 * 这里**不做**外行星的大行星摄动修正（JPL 原表后面还跟着一串 b/c/s/f 项）。
 * 木星土星最多差 0.3° 左右，在星图上约 2 个像素，可以接受。
 */
interface OrbitalElements {
  base: readonly [number, number, number, number, number, number]
  rate: readonly [number, number, number, number, number, number]
}

const PLANET_ELEMENTS = {
  mercury: {
    base: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  },
  venus: {
    base: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  },
  earth: {
    base: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  },
  mars: {
    base: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  },
  jupiter: {
    base: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  },
  saturn: {
    base: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  },
} satisfies Record<string, OrbitalElements>

type PlanetKey = keyof typeof PLANET_ELEMENTS

/** 日心黄道直角坐标（AU） */
interface Vector3 {
  x: number
  y: number
  z: number
}

/** 轨道根数 + 时间 → 日心黄道直角坐标 */
function heliocentric(elements: OrbitalElements, centuries: number): Vector3 {
  const semiMajor = elements.base[0] + elements.rate[0] * centuries
  const eccentricity = elements.base[1] + elements.rate[1] * centuries
  const inclination = (elements.base[2] + elements.rate[2] * centuries) * DEG
  const meanLongitude = elements.base[3] + elements.rate[3] * centuries
  const perihelionDeg = elements.base[4] + elements.rate[4] * centuries
  const node = (elements.base[5] + elements.rate[5] * centuries) * DEG

  const argumentOfPerihelion = perihelionDeg * DEG - node
  // ⚠️ 平近点角是 M = L − ϖ，两个都还在**度**上减。
  // 这里踩过一次坑：先写成 `meanLongitude − perihelionDeg * DEG`（把 ϖ 转成弧度再减），
  // 结果火星赤经差了 4.6°，而画面上只是"火星站在了隔壁星座" —— 不验证根本发现不了。
  const meanAnomalyDeg = normalizeDegrees(meanLongitude - perihelionDeg)

  // 解开普勒方程 M = E − e·sinE，牛顿迭代三次足够收敛
  let eccentricAnomaly = meanAnomalyDeg * DEG
  for (let i = 0; i < 3; i += 1) {
    eccentricAnomaly -=
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomalyDeg * DEG) /
      (1 - eccentricity * Math.cos(eccentricAnomaly))
  }

  // 轨道平面内的坐标
  const xOrbital = semiMajor * (Math.cos(eccentricAnomaly) - eccentricity)
  const yOrbital = semiMajor * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentricAnomaly)

  // 旋转到黄道坐标系
  const cosNode = Math.cos(node)
  const sinNode = Math.sin(node)
  const cosArgument = Math.cos(argumentOfPerihelion)
  const sinArgument = Math.sin(argumentOfPerihelion)
  const cosInclination = Math.cos(inclination)
  const sinInclination = Math.sin(inclination)

  return {
    x:
      (cosArgument * cosNode - sinArgument * sinNode * cosInclination) * xOrbital +
      (-sinArgument * cosNode - cosArgument * sinNode * cosInclination) * yOrbital,
    y:
      (cosArgument * sinNode + sinArgument * cosNode * cosInclination) * xOrbital +
      (-sinArgument * sinNode + cosArgument * cosNode * cosInclination) * yOrbital,
    z: sinArgument * sinInclination * xOrbital + cosArgument * sinInclination * yOrbital,
  }
}

/**
 * 行星的地心坐标 = 行星的日心坐标 − 地球的日心坐标。
 *
 * ⚠️ 严格来说还该做「光行时」修正（我们看到的是它几分钟前的样子），
 * 但那对木星也只有 0.01° 的量级，忽略。
 */
function planetEquatorial(
  key: PlanetKey,
  date: Date,
): { equatorial: EquatorialCoords; distance: number; sunDistance: number } {
  const t = centuriesSinceJ2000(date)

  const planet = heliocentric(PLANET_ELEMENTS[key], t)
  const earth = heliocentric(PLANET_ELEMENTS.earth, t)

  const x = planet.x - earth.x
  const y = planet.y - earth.y
  const z = planet.z - earth.z

  const distance = Math.hypot(x, y, z)
  const longitude = normalizeDegrees(Math.atan2(y, x) * RAD)
  const latitude = Math.asin(z / distance) * RAD

  return {
    equatorial: eclipticToEquatorial(date, longitude, latitude),
    distance,
    sunDistance: Math.hypot(planet.x, planet.y, planet.z),
  }
}

/* ==========================================================================
   7. 月亮
   ========================================================================== */

/** 月亮的黄道位置（相位和赤道坐标都从它推出来，保证两者自洽） */
function moonEcliptic(date: Date): EclipticPosition {
  const t = centuriesSinceJ2000(date)

  // 月亮的平黄经、平距角、太阳平近点角、月亮平近点角、升交点角距
  const L = 218.3164477 + 481267.88123421 * t
  const D = 297.8501921 + 445267.1114034 * t
  const M = 357.5291092 + 35999.0502909 * t
  const MPrime = 134.9633964 + 477198.8675055 * t
  const F = 93.272095 + 483202.0175233 * t

  // 黄经的主要周期项（度）
  const longitudeCorrection =
    6.288774 * Math.sin(MPrime * DEG) +
    1.274027 * Math.sin((2 * D - MPrime) * DEG) +
    0.658314 * Math.sin(2 * D * DEG) +
    0.213618 * Math.sin(2 * MPrime * DEG) -
    0.185116 * Math.sin(M * DEG) -
    0.114332 * Math.sin(2 * F * DEG) +
    0.058793 * Math.sin((2 * D - 2 * MPrime) * DEG) +
    0.057066 * Math.sin((2 * D - M - MPrime) * DEG)

  // 黄纬的主要周期项
  const latitudeCorrection =
    5.128122 * Math.sin(F * DEG) +
    0.280602 * Math.sin((MPrime + F) * DEG) +
    0.277693 * Math.sin((MPrime - F) * DEG) +
    0.173237 * Math.sin((2 * D - F) * DEG)

  // 地心距离（km）→ AU
  const distanceKm =
    385000.56 -
    20905.355 * Math.cos(MPrime * DEG) -
    3699.111 * Math.cos((2 * D - MPrime) * DEG) -
    2955.968 * Math.cos(2 * D * DEG)

  return {
    longitude: normalizeDegrees(L + longitudeCorrection),
    latitude: latitudeCorrection,
    distance: distanceKm / 149597870.7,
  }
}

/** 月亮：位置 + 相位 + 地平坐标 */
export interface MoonPosition extends SolarSystemBody {
  /** 被照亮的比例，0–1（和 suncalc 的 fraction 同义） */
  illumination: number
  /**
   * 相位角，**地球居中**：0° = 新月，90°/270° = 上下弦，180° = 满月。
   *
   * ⚠️ 这个约定必须和「月—日—地」那个角（Meeus 叫 elongation）分清楚，
   * 两者相差 180°。第一版就是把 SunCalc 那套（0 = 满月）混了进来，
   * 结果月相图整个反了 —— 而且上下弦正好落在 90°，反不反都画出一半，
   * 所以只有对着"娥眉月应该是一条细牙"才看得出来。
   *
   * 本项目统一用**地球居中**这一套，因为：
   *   · suncalc 的 getMoonIllumination().fraction 就是 (1 + cos(相位角)) / 2；
   *   · lib/external/sky.ts 的 MoonInfo.phase 也是 0 新月 / 0.5 满月。
   * 两者能直接对上，不用在两处之间做心算换算。
   */
  phaseAngle: number
}

/**
 * 月亮现在在哪、被照亮了多少。
 *
 * 相位是**按黄经差现算**的，不是查表 —— 这样「月亮长什么样」和
 * 「月亮在天上哪个位置」必然自洽（两者来自同一份黄经）。
 * 客户端因此不用为了月相再去请求一次接口。
 */
export function computeMoon(observer: SkyObserver): MoonPosition {
  const moon = moonEcliptic(observer.date)
  const sun = sunEcliptic(observer.date)

  /**
   * 「月—日—地」的角距，也就是太阳和月亮的黄经差。
   * 0° = 新月（日月同向）、180° = 满月（日月相对）。
   */
  const sunEarthMoonAngle =
    Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          Math.cos(moon.latitude * DEG) * Math.cos((moon.longitude - sun.longitude) * DEG),
        ),
      ),
    ) * RAD

  // 照亮比例直接用这个角算：0° 时为 0，180° 时为 1
  const illumination = (1 - Math.cos(sunEarthMoonAngle * DEG)) / 2
  const equatorial = eclipticToEquatorial(observer.date, moon.longitude, moon.latitude)
  const lst = localSiderealTime(observer.date, observer.longitude)
  const horizontal = toHorizontal(equatorial, lst, observer.latitude)

  return {
    ...equatorial,
    altitude: horizontal.altitude,
    azimuth: horizontal.azimuth,
    // 视星等只用来决定画多大；月亮的观感主要由 illumination 控制
    magnitude: -12.7 + 0.026 * Math.abs(180 - sunEarthMoonAngle),
    /**
     * 离太阳的角距（度），也就是上面那个「月—日—地」的角。
     * 它和 phaseAngle 是**互补**的（两者相加 180°）——
     * 这个字段来自 SolarSystemBody，对行星来说"离太阳多远"决定能不能看见，
     * 月亮这边保留它是为了不让类型分叉。
     */
    elongation: sunEarthMoonAngle,
    // 对外统一成"地球居中"的相位角
    phaseAngle: sunEarthMoonAngle,
    illumination,
  }
}

/* ==========================================================================
   8. 行星（对外）
   ========================================================================== */

/** 行星的中文名与颜色（颜色用站内设计 token，见 tailwind.config.ts） */
export const PLANETS = [
  { key: 'mercury', name: '水星', color: '#9b8fa3' },
  { key: 'venus', name: '金星', color: '#f4eee7' },
  { key: 'mars', name: '火星', color: '#e78aa6' },
  { key: 'jupiter', name: '木星', color: '#f7c873' },
  { key: 'saturn', name: '土星', color: '#7fc8d8' },
] as const satisfies ReadonlyArray<{ key: PlanetKey; name: string; color: string }>

export interface PlanetPosition extends SolarSystemBody {
  key: PlanetKey
  name: string
  color: string
  /** 在地平线以上、且离太阳够远（否则指也指不出来） */
  visible: boolean
}

/** 行星的近似视星等，只用来决定画多大、多亮 */
function planetMagnitude(
  key: PlanetKey,
  distance: number,
  sunDistance: number,
  phaseAngle: number,
): number {
  // 标准公式 m = m0 + 5·log10(r·Δ) + 相位项
  const intrinsic: Record<PlanetKey, number> = {
    mercury: -0.42,
    venus: -4.4,
    mars: -1.52,
    jupiter: -9.4,
    saturn: -8.88,
    earth: 0,
  }

  return (
    intrinsic[key] +
    5 * Math.log10(Math.max(1e-6, sunDistance * distance)) +
    0.02 * Math.abs(phaseAngle)
  )
}

/**
 * 五颗肉眼可见的行星现在各自在哪。
 *
 * visible 同时卡两件事：地平高度 > 3°，且离太阳至少 12°。
 * 不卡的话界面上会出现「大白天看见金星」这种一眼就觉得不对的提示。
 */
export function computePlanets(observer: SkyObserver): PlanetPosition[] {
  const lst = localSiderealTime(observer.date, observer.longitude)
  const sun = sunEcliptic(observer.date)

  return PLANETS.map((meta) => {
    const { equatorial, distance, sunDistance } = planetEquatorial(meta.key, observer.date)

    // 地心黄经：用来算离太阳多远
    const obliquity = obliquityAt(observer.date) * DEG
    const geocentricLambda = normalizeDegrees(
      Math.atan2(
        Math.sin(equatorial.ra * DEG) * Math.cos(obliquity) +
          Math.tan(equatorial.dec * DEG) * Math.sin(obliquity),
        Math.cos(equatorial.ra * DEG),
      ) * RAD,
    )

    let elongation = Math.abs(geocentricLambda - sun.longitude)
    if (elongation > 180) elongation = 360 - elongation

    const horizontal = toHorizontal(equatorial, lst, observer.latitude)

    return {
      key: meta.key,
      name: meta.name,
      color: meta.color,
      ra: equatorial.ra,
      dec: equatorial.dec,
      altitude: horizontal.altitude,
      azimuth: horizontal.azimuth,
      magnitude: planetMagnitude(meta.key, distance, sunDistance, 180 - elongation),
      elongation,
      visible: horizontal.altitude > 3 && elongation >= 12,
    }
  })
}
