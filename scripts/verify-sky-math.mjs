/**
 * 星空数学的验证脚本（开发工具，不是网站的一部分）。
 *
 * 用法：node scripts/verify-sky-math.mjs
 *
 * 为什么要写这个：
 *   sky-math.ts 里的公式全是照抄经典算法的，抄错一个系数**不会报错**，
 *   只会让星星跑到不该在的地方 —— 界面看起来依然"像一片星空"，
 *   但懂行的人一眼就知道不对。所以必须拿已知的参照值对一遍。
 *
 * ⚠️ 这个脚本踩过一次坑，写在这里提醒后来人：
 *   第一版里木星火星的"参照值"是凭记忆写的，结果它们当然是错的，
 *   反而把**正确**的实现报成了 FAIL。
 *   所以现在这里的每一条参照都必须是**能独立算出来的**：
 *     · suncalc（项目已有依赖，独立实现）
 *     · 天文学上众所周知的事实（火星冲日、内行星大距上限）
 *     · 手算就能验证的恒等式（天极高度 = 纬度、投影半径）
 *   不要再往这里塞"我记得大概是……"的数字。
 */

/**
 * ⚠️ 源码用的是 `@/lib/...` 这种别名（tsconfig 的 paths），Node 不认。
 * 所以这里先注册一个解析钩子把别名补上 —— 这样才能 import **真实的**
 * scene.ts 做端到端验证，而不是在测试里重写一遍逻辑。
 *
 * ⚠️ 为什么要用 `await import()` 而不是顶部的静态 import：
 *   ESM 的静态 import 会在**任何语句执行之前**全部解析完，
 *   所以 `register()` 那一行根本来不及生效（踩过一次，报的是
 *   "Cannot find package '@/lib'"）。
 *   动态 import 是运行时求值的，钩子这时候已经装好了。
 */
import { register } from 'node:module'

register('./lib/alias-loader.mjs', import.meta.url)

const SunCalc = await import('suncalc')
const { CONSTELLATION_LINES, CONSTELLATION_NAMES, STAR_TABLE } = await import(
  '@/lib/sky/stars.generated'
)
const {
  computeMoon,
  computePlanets,
  julianDay,
  localSiderealTime,
  projectToPlane,
  sunAltitude,
  toHorizontal,
} = await import('@/lib/sky/sky-math')
const { buildSkyScene, starColor } = await import('@/lib/sky/scene')

let failures = 0

function check(label, actual, expected, tolerance, unit = '') {
  const delta = Math.abs(actual - expected)
  const ok = delta <= tolerance
  if (!ok) failures += 1
  const mark = ok ? 'OK  ' : 'FAIL'
  console.log(
    `${mark} ${label.padEnd(44)} 实算 ${actual.toFixed(4)}${unit}  参照 ${expected.toFixed(4)}${unit}  差 ${delta.toFixed(4)}`,
  )
}

/** 两个角度之间的最小差（处理 0/360 环绕） */
function angleDelta(a, b) {
  const delta = Math.abs(((a - b) % 360 + 360) % 360)
  return delta > 180 ? 360 - delta : delta
}

function checkAngle(label, actual, expected, tolerance) {
  const delta = angleDelta(actual, expected)
  const ok = delta <= tolerance
  if (!ok) failures += 1
  const mark = ok ? 'OK  ' : 'FAIL'
  console.log(
    `${mark} ${label.padEnd(44)} 实算 ${actual.toFixed(4)}°  参照 ${expected.toFixed(4)}°  差 ${delta.toFixed(4)}`,
  )
}

/* --------------------------------------------------------------------------
   1. 儒略日：已知值（2000-01-01 12:00 UTC = JD 2451545.0）
   -------------------------------------------------------------------------- */
console.log('--- 儒略日 ---')
check('儒略日 J2000.0', julianDay(new Date('2000-01-01T12:00:00Z')), 2451545.0, 1e-9)
check('儒略日 2024-01-01 00:00 UTC', julianDay(new Date('2024-01-01T00:00:00Z')), 2460310.5, 1e-9)
check('儒略日 1987-01-27 00:00 UTC', julianDay(new Date('1987-01-27T00:00:00Z')), 2446822.5, 1e-9)

/* --------------------------------------------------------------------------
   2. 天极高度 = 纬度
   -------------------------------------------------------------------------- */
console.log('\n--- 天极高度应当等于观测者纬度（球面天文最基本的恒等式）---')
for (const latitude of [31.2304, 51.5, -33.87]) {
  const date = new Date('2024-06-15T14:00:00Z')
  const lst = localSiderealTime(date, 121.4737)
  // 北极星（α UMi）J2000：赤经 37.9546°、赤纬 89.2641°。
  // 它离天极还有 0.736°，所以高度会比纬度低最多这么多，容差给 0.8°。
  const pole = toHorizontal({ ra: 37.9546, dec: 89.2641 }, lst, latitude)
  check(`纬度 ${latitude} 处北极星高度`, pole.altitude, latitude, 0.8, '°')
}

/* --------------------------------------------------------------------------
   3. 太阳位置 对比 suncalc
   -------------------------------------------------------------------------- */
console.log('\n--- 太阳高度 vs suncalc ---')
console.log('    suncalc 用的是 Meeus 25 章的视位置（含章动 + 光行差 + 大气折射），')
console.log('    我们用的是 24 章的低精度几何位置 —— 差 0.5° 左右是**预期的**（就是折射那部分）。')
for (const iso of [
  '2024-06-15T04:00:00Z',
  '2024-06-15T12:00:00Z',
  '2024-12-15T04:00:00Z',
  '2025-03-20T06:00:00Z',
]) {
  const date = new Date(iso)
  const observer = { latitude: 31.2304, longitude: 121.4737, date }
  const ours = sunAltitude(observer)
  // ⚠️ suncalc 的 altitude 已经是**度**，不要再 ×180/π（第一版就是那么错的）
  const theirs = SunCalc.getPosition(date, observer.latitude, observer.longitude).altitude
  check(`${iso} 太阳高度`, ours, theirs, 0.6, '°')
}

/* --------------------------------------------------------------------------
   4. 月亮位置 对比 suncalc
   -------------------------------------------------------------------------- */
console.log('\n--- 月亮位置 vs suncalc ---')
console.log('    suncalc 的 getMoonPosition 只给方位/高度（赤经赤纬是内部函数，没导出），')
console.log('    所以就比这两个。高度上它有视差修正（月亮视差接近 1°），容差给 1.2°。')
for (const iso of [
  '2024-01-25T00:00:00Z',
  '2024-02-09T00:00:00Z',
  '2024-03-17T00:00:00Z',
  '2025-11-05T12:00:00Z',
]) {
  const date = new Date(iso)
  const observer = { latitude: 31.2304, longitude: 121.4737, date }
  const moon = computeMoon(observer)
  const theirs = SunCalc.getMoonPosition(date, observer.latitude, observer.longitude)

  // suncalc 的 altitude 已经是度，而且带视差 + 折射修正
  check(`${iso} 月亮高度`, moon.altitude, theirs.altitude, 1.2, '°')
  // 视差只沿垂直圈压低高度，**不改方位** —— 所以方位可以卡紧一点
  checkAngle(`${iso} 月亮方位`, moon.azimuth, theirs.azimuth, 0.5)
}

/* --------------------------------------------------------------------------
   5. 月亮相位 对比 suncalc
   -------------------------------------------------------------------------- */
console.log('\n--- 月亮照亮比例 vs suncalc ---')
for (const iso of [
  '2024-01-25T00:00:00Z',
  '2024-02-09T00:00:00Z',
  '2024-03-17T00:00:00Z',
  '2025-11-05T12:00:00Z',
]) {
  const date = new Date(iso)
  const moon = computeMoon({ latitude: 31.2304, longitude: 121.4737, date })
  const theirs = SunCalc.getMoonIllumination(date).fraction
  check(`${iso} 照亮比例`, moon.illumination, theirs, 0.07)
}

/* --------------------------------------------------------------------------
   6. 火星冲日：2022-12-08 那天火星应当几乎正好在太阳的正对面
   -------------------------------------------------------------------------- */
console.log('\n--- 火星冲日 2022-12-08 ---')
console.log('    冲日 = 火星与太阳的地心黄经相差 180°。这是一条"公认事实"，不用查表。')
{
  const date = new Date('2022-12-08T00:00:00Z')
  const observer = { latitude: 31.2304, longitude: 121.4737, date }
  const mars = computePlanets(observer).find((planet) => planet.key === 'mars')
  // 冲日时火星离太阳 180°，也就是 elongation 接近 180
  check('火星与太阳的角距', mars.elongation, 180, 1.5, '°')
  // 冲日时火星离地球最近：2022 年那次是 0.544 AU
  const distanceNote = mars.magnitude < 0 ? '亮' : '暗'
  console.log(`     （顺带：那天火星视星等算出来 ${mars.magnitude.toFixed(2)}，${distanceNote}）`)
}

/* --------------------------------------------------------------------------
   7. 内行星的大距上限（金星 ≤ 47°，水星 ≤ 28°）
   -------------------------------------------------------------------------- */
console.log('\n--- 内行星大距上限（一年里随机取 40 个时刻，绝不能超过上限）---')
{
  let maxMercury = 0
  let maxVenus = 0
  for (let i = 0; i < 40; i += 1) {
    const date = new Date(Date.UTC(2024, 0, 1) + i * 9.13 * 86400000)
    const observer = { latitude: 31.2304, longitude: 121.4737, date }
    const planets = computePlanets(observer)
    maxMercury = Math.max(maxMercury, planets.find((p) => p.key === 'mercury').elongation)
    maxVenus = Math.max(maxVenus, planets.find((p) => p.key === 'venus').elongation)
  }
  // 水星实际最大 28°，金星 47°；留 1° 余量
  check('水星最大角距 <= 29°', maxMercury, Math.min(maxMercury, 29), 0, '°')
  check('金星最大角距 <= 48°', maxVenus, Math.min(maxVenus, 48), 0, '°')
  console.log(`     （实测最大值：水星 ${maxMercury.toFixed(2)}°，金星 ${maxVenus.toFixed(2)}°）`)
}

/* --------------------------------------------------------------------------
   8. 投影：地平线必须在半径 1 上、天顶必须在圆心、北在上东在右
   -------------------------------------------------------------------------- */
console.log('\n--- 球极投影 ---')
const horizon = projectToPlane({ azimuth: 45, altitude: 0 })
check('地平（高度 0°）的半径', Math.hypot(horizon.x, horizon.y), 1, 1e-9)
const zenith = projectToPlane({ azimuth: 123, altitude: 90 })
check('天顶的半径', Math.hypot(zenith.x, zenith.y), 0, 1e-9)

const half = Math.tan(22.5 * (Math.PI / 180))
const north = projectToPlane({ azimuth: 0, altitude: 45 })
check('正北方向的 x', north.x, 0, 1e-9)
check('正北方向的 y（屏幕向上 = 负）', north.y, -half, 1e-9)
const east = projectToPlane({ azimuth: 90, altitude: 45 })
check('正东方向的 x', east.x, half, 1e-9)
check('正东方向的 y', east.y, 0, 1e-9)
// 保角性：等角距的两条线，屏幕上到圆心的距离应该一样
const a = projectToPlane({ azimuth: 0, altitude: 45 })
const b = projectToPlane({ azimuth: 90, altitude: 45 })
check('球极投影是各向同性的（等高度等半径）', Math.hypot(a.x, a.y), Math.hypot(b.x, b.y), 1e-12)

/* --------------------------------------------------------------------------
   8. 星表与星座连线（生成出来的那份数据是否自洽）
   -------------------------------------------------------------------------- */
console.log('\n--- 星表 / 星座连线 ---')
check('星表颗数（脚本里写的是 975）', STAR_TABLE.length, 975, 0)
check('星座连线个数', CONSTELLATION_LINES.length, 89, 0)

{
  // 坐标必须落在合法范围里：赤经 0–360、赤纬 -90–90、星等合理
  const badRa = STAR_TABLE.filter(([ra]) => !(ra >= 0 && ra < 360)).length
  const badDec = STAR_TABLE.filter(([, dec]) => !(dec >= -90 && dec <= 90)).length
  const badMag = STAR_TABLE.filter(([, , mag]) => !(mag > -2 && mag < 8)).length
  check('赤经越界的星数', badRa, 0, 0)
  check('赤纬越界的星数', badDec, 0, 0)
  check('星等离谱的星数', badMag, 0, 0)

  // 每一段连线至少要有两个点，否则 SVG 会画出空折线
  const shortSegments = CONSTELLATION_LINES.flatMap((line) => line.segments).filter(
    (segment) => segment.length < 2,
  ).length
  check('少于两个顶点的线段数', shortSegments, 0, 0)

  // 天狼星（α CMa）是全天空最亮的星：-1.46 等，赤经 101.29°、赤纬 -16.72°
  const brightest = [...STAR_TABLE].sort((a, b) => a[2] - b[2])[0]
  check('最亮星的星等（天狼星 -1.44）', brightest[2], -1.44, 0.05)
  checkAngle('最亮星的赤经（天狼星 101.29°）', brightest[0], 101.29, 0.1)
  check('最亮星的赤纬（天狼星 -16.72°）', brightest[1], -16.72, 0.1)

  // 中文名表：每个有连线的星座都该有名字，而且不能是空的
  const named = new Set(CONSTELLATION_NAMES.map((item) => item.abbr))
  const missingNames = CONSTELLATION_LINES.filter((line) => !named.has(line.abbr)).length
  check('有连线但没有中文名的星座数', missingNames, 0, 0)
  console.log(
    `     （抽样：${CONSTELLATION_NAMES.slice(0, 5).map((n) => n.zh).join('、')} …）`,
  )
}

/* --------------------------------------------------------------------------
   9. 色指数 → 颜色（踩过一次：源数据里 bv 是字符串，全表曾退化成同一个色）
   -------------------------------------------------------------------------- */
console.log('\n--- 星点颜色 ---')
{
  const colors = new Set(STAR_TABLE.map(([, , , bv]) => starColor(bv)))
  check('不同颜色的种数（>= 10 才算真的用上了色指数）', colors.size, Math.max(colors.size, 10), 0)
  // 蓝星应当比红星更蓝：比较 RGB 里的蓝分量。
  // ⚠️ 用非捕获组 (?:\d+) —— 写成 (\d+) 的话第三个捕获组会匹配到"倒数两个数字"
  //（"173, 199, 255" 里最后一个 (\d+) 是 199），于是这条断言会误报。
  const blue = starColor(-0.3)
  const red = starColor(1.8)
  const blueChannel = (rgb) => Number(/rgb\((?:\d+),\s*(?:\d+),\s*(\d+)\)/.exec(rgb)[1])
  console.log(`     （蓝白 ${blue}，橙红 ${red}）`)
  check('蓝星的蓝分量 > 红星的', blueChannel(blue) > blueChannel(red) ? 1 : 0, 1, 0)
}

/* --------------------------------------------------------------------------
   10. 端到端：真正组装一次 SkyScene
   -------------------------------------------------------------------------- */
console.log('\n--- buildSkyScene 端到端 ---')
{
  /**
   * 用一个**确定的**时刻和一个**北极**上的观测者，这样结果可以手推：
   *   在北极点（纬度 90°），天顶就是北天极，所以：
   *     · 赤纬 > 0 的星永远在地平线以上
   *     · 赤纬 < 0 的星永远在地平线以下
   *   这是球面天文里最好推的一条，用它来验"地平坐标没算反"最直接。
   */
  const date = new Date('2024-03-20T12:00:00Z')
  const scene = buildSkyScene({ latitude: 90, longitude: 0, date })

  const north = scene.stars.filter((star) => star.dec > 0.5)
  const south = scene.stars.filter((star) => star.dec < -0.5)
  const northBelow = north.filter((star) => star.altitude < 0).length
  const southAbove = south.filter((star) => star.altitude > 0).length

  check('北极点上：赤纬 > 0 却在地平线下的星数', northBelow, 0, 0)
  check('北极点上：赤纬 < 0 却在地平线上的星数', southAbove, 0, 0)
  console.log(`     （北天 ${north.length} 颗、南天 ${south.length} 颗，样本量够）`)

  // 天极的高度应当等于纬度
  check('北极点上天极的高度', scene.stars.find((star) => star.dec > 89)?.altitude ?? 0, 90, 0.8, '°')

  // 赤道上看：所有星在一昼夜里都会升落，此刻应当大概一半在地平线上
  const equator = buildSkyScene({ latitude: 0, longitude: 0, date })
  const above = equator.stars.filter((star) => star.altitude > 0).length
  const ratio = above / equator.stars.length
  check('赤道上此刻在地平线上的星占比（应该接近 0.5）', ratio, 0.5, 0.08)

  // 星等过滤：只算亮星时，颗数应当明显变少，而且连线**一条都不少**
  const bright = buildSkyScene({ latitude: 31.23, longitude: 121.47, date, maxMagnitude: 3.1 })
  const full = buildSkyScene({ latitude: 31.23, longitude: 121.47, date })
  check('3.1 等以内的星数（应当 ~170）', bright.stars.length, 170, 25)
  check('maxMagnitude 会减少星点', bright.stars.length < full.stars.length ? 1 : 0, 1, 0)
  check(
    'maxMagnitude 不影响星座连线条数',
    bright.constellations.length,
    full.constellations.length,
    0,
  )

  // 场景里不该出现 NaN —— 一处 NaN 会让整条 polyline 消失，而且很难查
  const allNumbers = [
    ...full.stars.flatMap((star) => [star.altitude, star.azimuth, star.ra, star.dec]),
    ...full.constellations.flatMap((line) =>
      line.segments.flatMap((segment) =>
        segment.flatMap((star) => [star.altitude, star.azimuth]),
      ),
    ),
    full.moon.altitude,
    full.moon.azimuth,
    full.moon.illumination,
    full.moon.phaseAngle,
    ...full.planets.flatMap((planet) => [planet.altitude, planet.azimuth, planet.magnitude]),
    full.sunAltitude,
    full.siderealTime,
  ]
  const nanCount = allNumbers.filter((value) => !Number.isFinite(value)).length
  check('场景里的 NaN / Infinity 个数', nanCount, 0, 0)
  console.log(`     （检查了 ${allNumbers.length} 个数字）`)

  // 月亮相位与 suncalc 的一致性，在"真实调用路径"上再验一遍
  check(
    'buildSkyScene 的月亮照亮比例 vs suncalc',
    full.moon.illumination,
    SunCalc.getMoonIllumination(date).fraction,
    0.07,
  )
}

/* --------------------------------------------------------------------------
   汇总
   -------------------------------------------------------------------------- */
console.log('')
if (failures === 0) {
  console.log('全部通过 ✓')
  // 显式归零：这个脚本会被 git hook / CI 直接调用，退出码必须是可信的
  process.exitCode = 0
} else {
  console.log(`${failures} 项没通过 ✗`)
  process.exitCode = 1
}
