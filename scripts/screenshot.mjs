/**
 * 开发用截图 + 溢出体检工具（不是网站的一部分）。
 *
 * 用法：
 *   node scripts/screenshot.mjs 1440 1000 http://localhost:3000/ .shots/home.png
 *   node scripts/screenshot.mjs 390 900 http://localhost:3000/ .shots/mobile.png
 *
 * 为什么不用 chrome --screenshot：
 *   headless 的 --window-size 和实际布局视口不是一回事（实测能差 90px 以上），
 *   截出来的图看着像「右边被切了」，其实只是截少了。
 *   这里用 CDP 的 Emulation.setDeviceMetricsOverride 精确锁死视口，
 *   顺便量一遍 scrollWidth，看看到底有没有真的横向溢出。
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const WIDTH = Number(process.argv[2] ?? 1440)
const HEIGHT = Number(process.argv[3] ?? 1000)
const URL_TO_OPEN = process.argv[4] ?? 'http://localhost:3000/'
const OUT = process.argv[5] ?? '.shots/shot.png'
const MOBILE = WIDTH <= 640
const PORT = 9334

/** 等页面稳定多久再截图（要留给事件气泡自己消失，TTL 7 秒） */
const SETTLE_MS = Number(process.env.SHOT_SETTLE_MS ?? 9500)

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
  console.error('找不到 Chrome / Edge，可以设环境变量 CHROME_PATH 指定浏览器路径。')
  process.exit(1)
}

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\dsh-chrome-cdp`,
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
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
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

const MEASURE = `
(() => {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') || '').slice(0, 100),
        left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
      });
    }
  }
  return JSON.stringify({
    viewport: vw,
    pageHeight: doc.scrollHeight,
    docScrollWidth: doc.scrollWidth,
    overflowing: doc.scrollWidth > vw + 1,
    offenderCount: offenders.length,
    offenders: offenders.slice(0, 10),
  }, null, 2);
})()
`

try {
  const target = await waitForTarget()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  const send = createClient(ws)
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: MOBILE,
  })

  await send('Page.navigate', { url: URL_TO_OPEN })
  await sleep(SETTLE_MS)

  const measured = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true })
  console.log(measured?.result?.value ?? '(量不到)')

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  })

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log(`\n截图已保存：${OUT}（视口 ${WIDTH}×${HEIGHT}）`)

  ws.close()
} finally {
  chrome.kill()
}
