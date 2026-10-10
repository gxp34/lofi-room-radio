/**
 * 月相外观的目视检查（开发工具，不是网站的一部分）。
 *
 * 用法（需要 dev server 在 3000 端口）：
 *   node scripts/preview-moon-phases.mjs
 *
 * 为什么要看这一眼：
 *   verify-moon-phase-browser.mjs 已经用 Chromium 的 isPointInFill
 *   证明"亮面面积 = 照亮比例"，但它证明不了**看上去像不像月亮** ——
 *   比如缺口方向别扭、边缘有毛刺、新月整个看不见。
 *   这种东西只能靠眼睛。所以这个脚本把一整轮月相按顺序画出来并截图。
 *
 * 截图存到 .shots/moon-phases.png。
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { register } from 'node:module'

register('./lib/alias-loader.mjs', import.meta.url)

const { moonPhasePath, moonPhaseName } = await import('@/lib/sky/moon-phase')

const PORT = 9337
const OUT = '.shots/moon-phases.png'
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

/** 造一页只有月相的静态 HTML，不经过 Next —— 这一步只关心 SVG 画得对不对 */
const CELL = 120
const cells = []
for (let angle = 0; angle < 360; angle += 22.5) {
  const illumination = (1 - Math.cos((angle * Math.PI) / 180)) / 2
  // 亮面在右还是左：按真实天象，盈月（0–180°）在右、亏月在左
  const waxing = angle < 180
  const path = moonPhasePath(60, 60, 44, { illumination, phaseAngle: angle, waxing })
  const label = moonPhaseName(angle)

  cells.push(`
    <figure>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="44" fill="#2b2230" />
        <path d="${path}" fill="#f4eee7" />
        <circle cx="60" cy="60" r="44" fill="none" stroke="#f4eee7" stroke-opacity="0.3" stroke-width="1.5" />
      </svg>
      <figcaption>${angle}° · ${label}<br><span>${(illumination * 100).toFixed(0)}%</span></figcaption>
    </figure>
  `)
}

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<style>
  body { margin: 0; padding: 24px; background: #16131f; color: #f4eee7;
         font-family: ui-monospace, Consolas, monospace; }
  h1 { font-size: 16px; font-weight: 500; letter-spacing: .1em; margin: 0 0 4px; }
  p.note { color: #9b8fa3; font-size: 12px; margin: 0 0 20px; }
  .grid { display: grid; grid-template-columns: repeat(8, 120px); gap: 18px 20px; }
  figure { margin: 0; text-align: center; }
  figcaption { margin-top: 6px; font-size: 11px; color: #9b8fa3; line-height: 1.5; }
  figcaption span { color: #f7c873; }
</style></head>
<body>
  <h1>一整轮月相（每 22.5° 一张）</h1>
  <p class="note">亮面在右 = 盈月（0–180°），亮面在左 = 亏月（180–360°）。0°/180° 分别是新月和满月。</p>
  <div class="grid">${cells.join('')}</div>
</body></html>`

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\dsh-chrome-moonpreview`,
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
      /* 还没起来 */
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

try {
  const target = await waitForTarget()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  const send = createClient(ws)
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 8 * 140 + 48,
    height: 700,
    deviceScaleFactor: 2,
    mobile: false,
  })
  // 直接把 HTML 塞进去：这一步只验 SVG 的绘制，不需要跑 Next
  await send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` })
  await sleep(1200)

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  })

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log(`月相预览已保存：${OUT}`)

  ws.close()
} finally {
  chrome.kill()
}
