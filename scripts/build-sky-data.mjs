/**
 * 星空数据生成器（开发工具，不是网站的一部分）。
 *
 * 用法：
 *   node scripts/build-sky-data.mjs            # 用缓存，缺文件才下载
 *   node scripts/build-sky-data.mjs --refresh  # 强制重新下载
 *
 * 产出：src/lib/sky/stars.generated.ts
 *
 * 为什么要有这个脚本，而不是手敲一张星表：
 *   1000 颗星的赤经赤纬手敲必错，错一位就是天上多一颗没见过的星。
 *   这里从 d3-celestial 的数据文件里**抽**出我们要的那部分（亮星 + 星座连线），
 *   再压成一个紧凑的 TS 模块，源码可复现、可审计、可重跑。
 *
 * 数据来源与许可：
 *   d3-celestial 0.7.35（BSD-3-Clause，https://github.com/ofrohn/d3-celestial）
 *     data/stars.6.json              —— 星表（Yale Bright Star Catalog 5 版系）
 *     data/constellations.lines.json —— 星座连线，坐标是 [赤经°, 赤纬°]
 *     data/constellations.json       —— 星座名（含中文）
 *   原始星表是公有领域的观测数据；连线是 d3-celestial 作者整理的。
 *
 * 为什么只抄这几个文件而不整包搬进 public/：
 *   整包 51 MB，最小可用集（stars.6 + lines + mw + celestial.js）也有 1.4 MB，
 *   而我们要的只是"亮星 + 几条线" —— 抽出来一共 ~35 KB 的 TS 源码。
 *   详见 src/lib/sky/README 里的取舍说明（以及 page.tsx 顶部的块注释）。
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = join(ROOT, '.cache', 'sky-data')
const OUT_FILE = join(ROOT, 'src', 'lib', 'sky', 'stars.generated.ts')

const CDN = 'https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35'

/** 只下这三个：星表、连线、星座名 */
const SOURCES = {
  stars: 'data/stars.6.json',
  lines: 'data/constellations.lines.json',
  constellations: 'data/constellations.json',
}

/**
 * 收录标准：星等 <= 4.4 的星，**加上**所有被星座连线用到的星。
 *
 * 为什么是两条合起来：
 *   · 只看星等不行 —— 连线用到 757 颗星，其中 315 颗比 4.4 等暗，
 *     缺了它们连线就会断成好几截（实测 893 个顶点里会有三分之一对不上）。
 *   · 只看连线也不行 —— 那样天上就只剩星座的骨架，没有"满天星"的感觉。
 * 两条合起来大约 1000 颗，压成 TS 之后 ~35 KB，gzip 之后 ~12 KB。
 */
const MAG_LIMIT = 4.4

const REFRESH = process.argv.includes('--refresh')

/* --------------------------------------------------------------------------
   取数据（带本地缓存：CDN 不该每次生成都拉一遍）
   -------------------------------------------------------------------------- */

async function loadSource(key) {
  const file = join(CACHE_DIR, `${key}.json`)

  if (REFRESH || !existsSync(file)) {
    const url = `${CDN}/${SOURCES[key]}`
    process.stdout.write(`下载 ${url} … `)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url} 返回 HTTP ${response.status}`)
    const text = await response.text()
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(file, text)
    console.log(`完成（${(statSync(file).size / 1024).toFixed(1)} KB）`)
  } else {
    console.log(`用缓存 ${SOURCES[key]}（${(statSync(file).size / 1024).toFixed(1)} KB）`)
  }

  return JSON.parse(readFileSync(file, 'utf8'))
}

/* --------------------------------------------------------------------------
   几何小工具
   -------------------------------------------------------------------------- */

const RAD = Math.PI / 180

/** 两个天球坐标之间的角距离（度）。先用经纬度粗略比较，够用了 */
function angularDistance(a, b) {
  const dra = (a[0] - b[0]) * RAD
  const ddec = (a[1] - b[1]) * RAD
  // 赤经差要按纬度收缩，否则高赤纬处会算得偏大
  const cosDec = Math.cos(((a[1] + b[1]) / 2) * RAD)
  return Math.hypot(dra * cosDec, ddec) / RAD
}

function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/* --------------------------------------------------------------------------
   主流程
   -------------------------------------------------------------------------- */

const starsRaw = await loadSource('stars')
const linesRaw = await loadSource('lines')
const constellationsRaw = await loadSource('constellations')

/** id → { ra, dec, mag, bv } */
const catalog = new Map()
/** 色指数是不是全表都有 —— 没有的话下面会报警，免得悄悄退化成"所有星星一个颜色" */
let missingBv = 0

for (const feature of starsRaw.features) {
  const [ra, dec] = feature.geometry.coordinates
  const mag = feature.properties?.mag
  // ⚠️ 源数据里 bv 是**字符串**（"0.911"），不是 number。
  // 第一版按 number 判，结果 975 颗星全都退化成同一个默认色 —— 而且不报错。
  const bvRaw = feature.properties?.bv
  const bv = typeof bvRaw === 'number' ? bvRaw : Number.parseFloat(bvRaw)
  if (typeof ra !== 'number' || typeof dec !== 'number') continue
  if (!Number.isFinite(bv)) missingBv += 1

  catalog.set(feature.id, {
    ra,
    dec,
    mag: typeof mag === 'number' ? mag : 6,
    // 色指数 B−V：负 = 偏蓝，正 = 偏红。缺了就按 0.6（太阳那种黄白）算
    bv: Number.isFinite(bv) ? bv : 0.6,
  })
}

/* ---- 1. 先把星座连线上的每个顶点对到具体一颗星 ---- */

/**
 * 连线里的坐标不一定和星表**完全**一致（实测 99% 一致，剩下的是
 * 几颗连线端点用了近似的坐标）。所以按"最近邻"匹配，而不是要求相等。
 * 匹配半径 2°：比这还远说明这颗星根本不在表里，宁可丢掉这个顶点
 * （丢掉的那个端点就画不出来，但绝不会连到别的星座上去）。
 */
const MATCH_TOLERANCE_DEG = 2

const starIdOrder = [...catalog.keys()]
/** 连线顶点坐标 → 星表 id（同一坐标只算一次） */
const vertexToStar = new Map()

function nearestStar(vertex) {
  let best = null
  let bestDistance = Infinity
  for (const id of starIdOrder) {
    const star = catalog.get(id)
    const distance = angularDistance(vertex, [star.ra, star.dec])
    if (distance < bestDistance) {
      bestDistance = distance
      best = star
    }
  }
  return bestDistance <= MATCH_TOLERANCE_DEG ? best : null
}

/* ---- 2. 决定收录哪些星 ---- */

const usedStars = [] // 连线用到的星对象
for (const feature of linesRaw.features) {
  for (const segment of feature.geometry.coordinates) {
    for (const vertex of segment) {
      const key = `${vertex[0]},${vertex[1]}`
      if (vertexToStar.has(key)) continue
      const star = nearestStar(vertex)
      vertexToStar.set(key, star)
      if (star) usedStars.push(star)
    }
  }
}
const bright = [...catalog.values()].filter((star) => star.mag <= MAG_LIMIT)
const kept = []
const keptSet = new Set()
// 先放亮星，再补连线星：这样"亮星"的索引在前，调试时好看
for (const star of [...bright, ...usedStars]) {
  if (keptSet.has(star)) continue
  keptSet.add(star)
  kept.push(star)
}

/* ---- 3. 连线：直接存坐标，不存下标 ---- */

/**
 * ⚠️ 这里存的是**坐标**，不是 STAR_TABLE 的下标。
 *
 * 第一版存的是下标（省那几个字节），结果踩了坑：
 * 只要有任何一处按星等过滤了星表（比如手机上只画亮星），
 * 下标就会整体错位 —— 星座会连到完全不相干的星上去，而且画面
 * 依然"像一片星空"，根本看不出错。坐标多占几 KB，换掉这类隐患很值。
 */
let droppedVertices = 0
const lines = []
for (const feature of linesRaw.features) {
  const segments = []
  for (const segment of feature.geometry.coordinates) {
    const vertices = []
    for (const vertex of segment) {
      const star = vertexToStar.get(`${vertex[0]},${vertex[1]}`)
      if (!star) {
        droppedVertices += 1
        continue
      }

      // 赤经统一归到 0–360：源数据里有些顶点是负的（例如 Aps 的 -138°），
      // 数学上等价（进去都是取正弦余弦），但同一份数据里混着两种写法
      // 以后一定会看糊涂 —— 实测 975 颗星里有 491 颗是负的
      const ra = round(normalizeRa(star.ra), 3)
      const dec = round(star.dec, 3)
      // 相邻重复的顶点会让 SVG 出现零长度线段
      const previous = vertices[vertices.length - 1]
      if (previous && previous[0] === ra && previous[1] === dec) continue
      vertices.push([ra, dec])
    }
    if (vertices.length >= 2) segments.push(vertices)
  }
  lines.push({ id: feature.id, segments })
}

/* ---- 4. 星座名（中文）+ 它在天上的位置 ---- */

/** 用连线顶点的平均位置当标签锚点 —— 比 d3-celestial 给的 display 更贴我们的画面 */
const nameByAbbr = new Map()
for (const feature of constellationsRaw.features) {
  const properties = feature.properties ?? {}
  nameByAbbr.set(feature.id, {
    zh: typeof properties.zh === 'string' && properties.zh.length > 0 ? properties.zh : feature.id,
    rank: Number(properties.rank ?? 3),
  })
}

/**
 * 星座的中文名表。
 *
 * 只留 88 个缩写里**连线非空**的那些，按 rank 排序 —— rank 1 是黄道/最出名的，
 * 移动端只画 rank 1 的名字（不然 390px 宽的屏幕上字会糊成一片）。
 */
const constellationNames = lines
  .filter((line) => line.segments.length > 0)
  /**
   * ⚠️ 这里踩过一次坑（症状：星座中文名全变成 '0'、'1'、'10' 这种数字）。
   *
   * 原来写的是 `Object.entries(lines).map(([abbr]) => …)`。
   * 但 `lines` 是一个**数组**（元素形如 `{ id: 'And', segments: [...] }`），
   * `Object.entries` 对数组给出的是 `['0', 元素]`、`['1', 元素]`……
   * 于是 `abbr` 拿到的是下标字符串，nameByAbbr 查不到，全部退回成数字。
   *
   * 教训：中文名这种"看着差不多就行"的字段不会让人立刻发现出错，
   * 所以下面专门有一段自检（查不到名字的星座会报警）。
   */
  .map((line) => {
    const meta = nameByAbbr.get(line.id)
    return { abbr: line.id, zh: meta?.zh ?? line.id, rank: meta?.rank ?? 3 }
  })
  .sort((a, b) => a.rank - b.rank || a.abbr.localeCompare(b.abbr))

/* ---- 5. 写文件 ---- */

/** 赤经统一归到 0–360 */
function normalizeRa(ra) {
  return ((ra % 360) + 360) % 360
}

const starLines = kept
  .map(
    (star) =>
      `  [${round(normalizeRa(star.ra), 3)}, ${round(star.dec, 3)}, ${round(star.mag, 2)}, ${round(star.bv, 2)}],`,
  )
  .join('\n')

const lineLines = lines
  .filter((line) => line.segments.length > 0)
  .map((line) => {
    const segments = line.segments
      .map(
        (segment) =>
          `[${segment.map(([ra, dec]) => `[${ra}, ${dec}]`).join(', ')}]`,
      )
      .join(', ')
    return `  { abbr: '${line.id}', segments: [${segments}] },`
  })
  .join('\n')

const nameLines = constellationNames
  .map((item) => `  { abbr: '${item.abbr}', zh: '${item.zh}', rank: ${item.rank} },`)
  .join('\n')

const output = `/**
 * ⚠️ **这个文件是自动生成的，不要手改。**
 *
 * 生成命令：node scripts/build-sky-data.mjs
 *
 * 内容：${kept.length} 颗星（星等 <= ${MAG_LIMIT} 的，加上所有被星座连线用到的）
 *       + ${lines.filter((l) => l.segments.length > 0).length} 个星座的连线 + 88 星座的中文名。
 *
 * 数据来源：d3-celestial 0.7.35（BSD-3-Clause）
 *   https://github.com/ofrohn/d3-celestial
 *   星表来自 Yale Bright Star Catalog；星座连线与中文名是 d3-celestial 整理的那一份。
 *   我们只**抽取**了所需要的部分，没有整包引入（整包 51 MB，见 page.tsx 的说明）。
 *
 * 坐标约定（很重要，改之前先看 sky-math.ts）：
 *   [0] 赤经 RA，**度**，J2000，0–360
 *   [1] 赤纬 Dec，度，J2000，-90–90
 *   [2] 视星等 V，越小越亮（天狼星 -1.44）
 *   [3] 色指数 B−V：负值偏蓝、正值偏红，用来给星点配色
 */

/** 一颗星：[赤经°, 赤纬°, 星等, 色指数 B−V] */
export type StarTuple = readonly [number, number, number, number]

/** 一个星座的连线：每个元素是一条折线，里面是 [赤经°, 赤纬°] 顶点 */
export interface ConstellationLine {
  /** 国际缩写，如 'UMa' */
  abbr: string
  segments: ReadonlyArray<ReadonlyArray<readonly [number, number]>>
}

export interface ConstellationName {
  abbr: string
  /** 中文名，如「大熊座」 */
  zh: string
  /** d3-celestial 给的知名度分级：1 最有名（黄道十二宫、北斗那一批） */
  rank: number
}

/** ${kept.length} 颗亮星 */
export const STAR_TABLE: readonly StarTuple[] = [
${starLines}
]

/** 星座连线；每条折线的顶点是内联的 [赤经°, 赤纬°]（不引用上面的下标，见脚本里的说明） */
export const CONSTELLATION_LINES: readonly ConstellationLine[] = [
${lineLines}
]

/** 星座中文名（按知名度排序） */
export const CONSTELLATION_NAMES: readonly ConstellationName[] = [
${nameLines}
]
`

mkdirSync(dirname(OUT_FILE), { recursive: true })
writeFileSync(OUT_FILE, output)

console.log('')
console.log(`收录星数：      ${kept.length}（星等 <= ${MAG_LIMIT} 的 ${bright.length} 颗 + 连线补的）`)
console.log(`星座连线：      ${lines.filter((l) => l.segments.length > 0).length} 个`)
console.log(`连不上的顶点：  ${droppedVertices} / ${[...vertexToStar.keys()].length}（会少画一点线头）`)
console.log(`星座名：        ${constellationNames.length} 个（有连线的才留）`)
console.log(`缺色指数：      ${missingBv} 颗（会用默认色）`)

// 自检：色指数如果全都一样，说明源头字段名/类型又变了，早报早好
const uniqueBv = new Set(kept.map((star) => round(star.bv, 2)))
if (uniqueBv.size < 10) {
  console.warn(`\n⚠️  只有 ${uniqueBv.size} 种不同的色指数 —— 星点颜色会退化成一片白，检查 stars.6.json 的 properties.bv`)
}

/**
 * 自检：星座中文名。
 *
 * 这一条是补上一次真实事故的：曾经因为把数组当对象遍历，
 * 89 个星座的中文名全变成了 "0"、"1"、"10" 这种下标数字 ——
 * 而画面上只是"星座名不太对"，不盯着看根本发现不了。
 * 所以这里硬性检查：名字必须像中文，查不到名字的星座必须为 0。
 */
const unnamed = constellationNames.filter((item) => item.zh === item.abbr)
const notChinese = constellationNames.filter((item) => !/[\u4e00-\u9fa5]/.test(item.zh))
if (unnamed.length > 0 || notChinese.length > 0) {
  console.error(
    `\n❌ 星座名不对：查不到名字的 ${unnamed.length} 个、不含中文的 ${notChinese.length} 个。\n` +
      `   样例：${constellationNames
        .slice(0, 5)
        .map((item) => `${item.abbr}=${item.zh}`)
        .join('、')}\n` +
      `   检查 constellations.json 的 properties.zh 和上面构造 constellationNames 的方式。`,
  )
  process.exitCode = 1
}

console.log(`输出：          ${OUT_FILE.replace(ROOT + '\\', '')}（${(statSync(OUT_FILE).size / 1024).toFixed(1)} KB）`)
