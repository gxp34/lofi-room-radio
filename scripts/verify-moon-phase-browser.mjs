/**
 * 月相路径的**浏览器级**验证（开发工具，不是网站的一部分）。
 *
 * 用法（需要 dev server 已经在 3000 端口跑着）：
 *   node scripts/verify-moon-phase-browser.mjs
 *
 * 为什么要有这个"另一套"验证：
 *   另一个脚本（verify-moon-phase.mjs）用手写的椭圆不等式去近似 SVG 圆弧的语义。
 *   那份近似我改了三次才勉强对上，每次都是"改到通过为止"——
 *   这本身就是危险信号：**验证器和被验证的东西共用同一套（可能错的）理解**，
 *   它就失去独立价值了。
 *
 *   这里换两条独立的证据：
 *     1. 把路径放进浏览器，让 **Chromium 的渲染引擎**自己判断哪些像素在填充区里
 *        （SVGGeometryElement.isPointInFill）—— 不掺我的推导；
 *     2. "亮面该在哪一侧"用天文上的**亮臂位置角**公式现算
 *        （Meeus 第 48 章），拿真实的太阳/月亮赤经赤纬去定，
 *        而不是靠"我觉得娥眉月应该亮右边"。
 *
 *   两条都对上，才敢说这个月相画对了。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { register } from 'node:module'

register('./lib/alias-loader.mjs', import.meta.url)

const { computeMoon, localSiderealTime } = await import('@/lib/sky/sky-math')
const { moonPhaseName } = await import('@/lib/sky/moon-phase')

const PORT = 9336
const PAGE = process.env.SKY_URL ?? 'http://localhost:3000/sky'

/** 审图用的观测点（和站点兜底值一致：上海） */
const OBSERVER = { latitude: 31.2304, longitude: 121.4737 }

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

const CHROME = CHROME_CANDIDATES.find((candidate) => existsSync(candidate))
if (!CHROME) {
  console.error('找不到 Chrome / Edge，可以设 CHROME_PATH 指定。')
  process.exit(1)
}

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\dsh-chrome-moon`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForTarget(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      /* 端口还没起来 */
    }
    await sleep(400)
  }
  throw new Error('Chrome 调试端口一直没起来')
}

function createClient(ws) {
  let nextId = 1
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (typeof message.id === 'number' && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    }
  })
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
}

/* ==========================================================================
   亮臂位置角：亮面到底朝向哪一边（天文公式，不用几何近似）
   ========================================================================== */

const DEG = Math.PI / 180
const RAD = 180 / Math.PI
const norm = (value) => ((value % 360) + 360) % 360

/**
 * 亮臂位置角（position angle of the bright limb，Meeus 第 48 章）。
 *
 * 定义：从月面的**北点**起算，向东（天球上的东，画面上是左）量到亮面中心。
 *   0°   = 亮面朝北（上半亮）
 *   90°  = 亮面朝东（画面**左**边亮）
 *   180° = 亮面朝南（下半亮）
 *   270° = 亮面朝西（画面**右**边亮）
 *
 * 公式里的 χ 是"太阳相对月亮的方向角"，再**减去视差角 q** 才是
 * 观测者眼里的朝向 —— 少了这一项，得到的是黄道上的关系，不是看到的画面。
 */
function brightLimbPositionAngle(date) {
  const moon = computeMoon({ ...OBSERVER, date })
  const sun = sunEquatorial(date)

  const raDiff = (sun.ra - moon.ra) * DEG
  const chi = Math.atan2(
    Math.cos(sun.dec * DEG) * Math.sin(raDiff),
    Math.sin(sun.dec * DEG) * Math.cos(moon.dec * DEG) -
      Math.cos(sun.dec * DEG) * Math.sin(moon.dec * DEG) * Math.cos(raDiff),
  )

  const hourAngle = (localSiderealTime(date, OBSERVER.longitude) - moon.ra) * DEG
  const parallactic = Math.atan2(
    Math.sin(hourAngle),
    Math.tan(OBSERVER.latitude * DEG) * Math.cos(moon.dec * DEG) -
      Math.sin(moon.dec * DEG) * Math.cos(hourAngle),
  )

  return norm((chi - parallactic) * RAD)
}

/**
 * 太阳的地心赤道坐标（低精度，Meeus 第 25 章）。
 *
 * 这里**故意不复用 sky-math 里的私有函数**：那份是内部实现，
 * 而验证脚本应该尽量少依赖被测模块的内部细节。
 * 太阳位置用谁都写得出来的低精度公式重算一遍就够了（误差 0.01°）。
 */
function sunEquatorial(date) {
  const jd = date.getTime() / 86400000 + 2440587.5
  const t = (jd - 2451545.0) / 36525

  const meanLongitude = 280.46646 + 36000.76983 * t
  const meanAnomaly = 357.52911 + 35999.05029 * t
  const center =
    1.914602 * Math.sin(meanAnomaly * DEG) + 0.019993 * Math.sin(2 * meanAnomaly * DEG)
  const trueLongitude = (meanLongitude + center) * DEG
  const obliquity = (23.439291 - 0.0130042 * t) * DEG

  return {
    ra: norm(Math.atan2(Math.cos(obliquity) * Math.sin(trueLongitude), Math.cos(trueLongitude)) * RAD),
    dec: Math.asin(Math.sin(obliquity) * Math.sin(trueLongitude)) * RAD,
  }
}

/** 位置角 → 画面上的左/右（上北下南、左东右西） */
function sideFromPositionAngle(positionAngle) {
  const x = Math.cos(positionAngle * DEG)
  // 接近 0°/180° 时亮面朝上/朝下，没有明确的左右
  if (Math.abs(x) < 0.2) return '上/下'
  return x > 0 ? '左' : '右'
}

/* ==========================================================================
   在页面里量面积
   ========================================================================== */

/**
 * 关键点：**`waxing` 不是"盈/亏"的开关，它决定亮面画在哪一侧。**
 *
 * 这里对整圈相位都传 `waxing: true`，把"亮面在右"这一版当基准，
 * 单独验证"面积 = (1 − cos 相位角) / 2"这条——面积是对称的，
 * 与亮面在哪一侧无关，所以这样量最干净。
 *
 * （前一版我让 `waxing: angle < 180`，等于给同一个月亮贴了两个互相矛盾的标签，
 *   量出来的凸月比例是 1−照亮比例，看着"错了一半"。）
 */
const MEASURE = (moonPhasePathSource) => `
(() => {
  const moonPhasePath = ${moonPhasePathSource}

  const R = 50
  const CX = 60
  const CY = 60

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '120')
  svg.setAttribute('height', '120')
  svg.style.position = 'fixed'
  svg.style.left = '-9999px'
  document.body.appendChild(svg)

  const results = []
  const STEPS = 200

  for (let angle = 0; angle < 360; angle += 15) {
    const illumination = (1 - Math.cos((angle * Math.PI) / 180)) / 2
    const d = moonPhasePath(CX, CY, R, { illumination, phaseAngle: angle, waxing: true })

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', '#fff')
    svg.appendChild(path)

    let lit = 0
    let total = 0
    for (let i = 0; i < STEPS; i += 1) {
      for (let j = 0; j < STEPS; j += 1) {
        const x = -R + (2 * R * (i + 0.5)) / STEPS
        const y = -R + (2 * R * (j + 0.5)) / STEPS
        if (x * x + y * y > R * R) continue
        total += 1
        if (path.isPointInFill(new DOMPoint(CX + x, CY + y))) lit += 1
      }
    }

    results.push({ angle, expected: illumination, measured: lit / total })
    svg.removeChild(path)
  }

  svg.remove()
  return JSON.stringify(results)
})()
`

/* ==========================================================================
   跑起来
   ========================================================================== */

let failures = 0

try {
  /* ---- 第一件事：用天文公式把"亮面朝哪边"算出来（不开浏览器也能跑） ---- */
  console.log('--- 亮臂位置角：真实天象下亮面朝哪边 ---')
  console.log('（2026-10-10 起每两天同一时刻，上海）')
  console.log('日期          照亮比例   位置角     画面上的亮面')

  for (let day = 0; day < 31; day += 2) {
    const date = new Date(Date.UTC(2026, 9, 10, 14, 0, 0) + day * 86400000)
    const moon = computeMoon({ ...OBSERVER, date })
    const positionAngle = brightLimbPositionAngle(date)

    console.log(
      `${date.toISOString().slice(0, 10)}   ${moon.illumination.toFixed(3)}    ` +
        `${positionAngle.toFixed(1).padStart(6)}°   ${sideFromPositionAngle(positionAngle)}`,
    )
  }

  console.log('\n     （新月附近照亮比例接近 0，亮面方向也就没有意义了）')

  /* ---- 月相名必须和照亮比例自洽 ---- */
  /**
   * 这一条是补一次真实事故的：
   *   页面上曾经出现过「满月 · 被照亮 0%」这种自相矛盾的显示。
   *   原因是 sky-client.tsx 里**又抄了一份** moonName()，
   *   而那份用的是反过来的公式（(1+cos)/2），于是名字和数字对不上。
   *
   *   教训：同一个物理量在两处各写一套公式，迟早会分叉。
   *   现在公式只留在 lib/sky/moon-phase.ts 一个地方，
   *   这条断言就是防止有人再抄一份 —— 名字和数字必须永远一致。
   */
  console.log('\n--- 月相名 vs 照亮比例（不能出现「满月 0%」）---')
  const conflict = []
  for (let day = 0; day < 30; day += 1) {
    const date = new Date(Date.UTC(2026, 9, 1, 14, 0, 0) + day * 86400000)
    const moon = computeMoon({ ...OBSERVER, date })
    const name = moonPhaseName(moon.phaseAngle)

    // 名字里隐含的"该不该是亮/暗"和数字对不上就是错
    const looksFull = name === '满月'
    const looksNew = name === '新月'
    const isFull = moon.illumination > 0.97
    const isNew = moon.illumination < 0.03

    if (looksFull !== isFull || looksNew !== isNew) {
      conflict.push(
        `${date.toISOString().slice(0, 10)} ${name} ${(moon.illumination * 100).toFixed(1)}%`,
      )
    }
  }
  if (conflict.length > 0) {
    failures += conflict.length
    console.log(`FAIL 有 ${conflict.length} 天名字和照亮比例对不上：`)
    for (const line of conflict.slice(0, 6)) console.log(`     ${line}`)
  } else {
    console.log('OK   30 天里月相名与照亮比例全部自洽')
  }

  /* ---- 第二件事：让 Chromium 量面积 ---- */
  const target = await waitForTarget()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  const send = createClient(ws)
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: PAGE })
  await sleep(2500)

  // 把 moonPhasePath 的实现原样注入（和 src/lib/sky/moon-phase.ts 保持一致）
  const source = `
    function moonPhasePath(cx, cy, radius, shape) {
      const { phaseAngle, waxing } = shape
      const top = cx + ',' + (cy - radius)
      const bottom = cx + ',' + (cy + radius)
      const outerSweep = waxing ? 1 : 0
      const terminatorRadiusX = radius * Math.cos((phaseAngle * Math.PI) / 180)
      const innerSweep = terminatorRadiusX <= 0 ? 1 : 0
      return [
        'M ' + top,
        'A ' + radius + ' ' + radius + ' 0 0 ' + outerSweep + ' ' + bottom,
        'A ' + Math.abs(terminatorRadiusX) + ' ' + radius + ' 0 0 ' + innerSweep + ' ' + top,
        'Z',
      ].join(' ')
    }
  `

  const evaluated = await send('Runtime.evaluate', {
    expression: MEASURE(source),
    returnByValue: true,
  })

  if (evaluated.exceptionDetails) {
    throw new Error(`页面里执行失败：${JSON.stringify(evaluated.exceptionDetails)}`)
  }

  const results = JSON.parse(evaluated.result.value)

  console.log('\n--- 路径面积（Chromium 的 isPointInFill 当裁判）---')
  console.log('相位角   实算亮面   期望亮面   差       判定')
  for (const row of results) {
    const delta = Math.abs(row.measured - row.expected)
    const ok = delta <= 0.01
    if (!ok) failures += 1
    console.log(
      `${String(row.angle).padStart(4)}°   ${row.measured.toFixed(4).padStart(8)}   ` +
        `${row.expected.toFixed(4).padStart(8)}   ${delta.toFixed(4)}   ${ok ? 'OK' : 'FAIL'}`,
    )
  }

  ws.close()
} finally {
  chrome.kill()
}

console.log('')
if (failures === 0) {
  console.log('全部通过 ✓')
  process.exitCode = 0
} else {
  console.log(`${failures} 项没通过 ✗`)
  process.exitCode = 1
}
