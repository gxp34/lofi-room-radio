/**
 * 「点一下到底有没有反应」测试（开发用）。
 *
 * 用法：
 *   node scripts/clicktest.mjs 猫              # 点第一个名字匹配的物件
 *   node scripts/clicktest.mjs 猫 3            # 点 3 次
 *
 * 和 hittest.mjs 的区别：
 *   hittest 只问「这个坐标最上层是谁」；这个会**真的派发鼠标事件**，
 *   然后看事件气泡有没有冒出来。因为「能命中」和「有反应」是两件事 ——
 *   按钮可能命中了，但事件在冷却里、被 once 吃掉了、或者引擎判定成静默。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const WANTED = process.argv[2] ?? '猫'
const TIMES = Number(process.argv[3] ?? 1)
const URL_TO_OPEN = process.argv[4] ?? 'http://localhost:3000/'
/** js = 直接调 element.click()（只测 React 的回调有没有接上）；
 *  mouse = 派发真实鼠标事件（连命中一起测）。默认 mouse。 */
const MODE = process.env.CLICK_MODE ?? 'mouse'
const PORT = 9338

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
  console.error('找不到 Chrome / Edge，可以设环境变量 CHROME_PATH。')
  process.exit(1)
}

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\dsh-chrome-click`,
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
  const events = []
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.consoleAPICalled') {
      events.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
    if (typeof message.id === 'number' && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  return { send, events }
}

/** 读当前屏幕上的事件气泡文字 */
const READ_TOASTS = `
(() => {
  const nodes = Array.from(document.querySelectorAll('[class*="animate-rise-in"]'));
  return JSON.stringify(nodes.map((n) => (n.innerText || '').replace(/\\s+/g, ' ').trim()).filter(Boolean));
})()
`

/** 找到一个物件的中心坐标 */
function findCenterScript(name) {
  return `
  (() => {
    const buttons = Array.from(document.querySelectorAll('button[aria-label]'));
    const target = buttons.find((b) => {
      if (b.getClientRects().length === 0) return false;
      const label = (b.getAttribute('aria-label') || '').split(/[：:]/)[0].trim();
      return label === ${JSON.stringify(name)};
    });
    if (!target) return 'null';
    // behavior:'instant' 是必须的：站点全局 scroll-behavior:smooth，
    // 默认的 scrollIntoView 是动画滚动，坐标会取在滚动途中的位置
    target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = target.getBoundingClientRect();
    return JSON.stringify({
      x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2),
      // CDP 的 Input.dispatchMouseEvent 用的是**文档坐标**（含滚动量），
      // 而 getBoundingClientRect 是视口坐标。滚动之后这两个差一个 scrollY，
      // 不换算的话点击会落在完全不相干的地方。
      pageX: Math.round(r.left + r.width / 2 + window.scrollX),
      pageY: Math.round(r.top + r.height / 2 + window.scrollY),
      scrollY: Math.round(window.scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
      label: target.getAttribute('aria-label'),
    });
  })()
  `
}

try {
  const target = await waitForTarget()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  const { send } = createClient(ws)
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1400,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Page.navigate', { url: URL_TO_OPEN })
  await sleep(9000)

  const found = await send('Runtime.evaluate', {
    expression: findCenterScript(WANTED),
    returnByValue: true,
  })

  if (!found?.result?.value || found.result.value === 'null') {
    console.error(`找不到「${WANTED}」这个物件`)
    process.exit(1)
  }

  const spot = JSON.parse(found.result.value)
  console.log(`模式：${MODE === 'js' ? 'element.click()' : '真实鼠标事件'}`)
  console.log(`目标：${spot.label}`)
  console.log(
    `视口坐标：(${spot.x}, ${spot.y})   文档坐标：(${spot.pageX}, ${spot.pageY})   scrollY=${spot.scrollY}   尺寸 ${spot.w}×${spot.h}\n`,
  )

  /**
   * CDP 的坐标基准：Input.dispatchMouseEvent 用的是**视口** CSS 像素，
   * 和 getBoundingClientRect 一致。另外 pressed/released 必须带上 buttons，
   * 否则浏览器不把它当成一次真实按压，也就不会合成 click 事件。
   *
   * CLICK_OFFSET="dx,dy" 可以在中心点基础上偏移 —— 用来验证
   * 「点偏一点还点不点得到」（比如猫的透明点击加宽有没有生效）。
   */
  const [offsetX, offsetY] = (process.env.CLICK_OFFSET ?? '0,0')
    .split(',')
    .map((value) => Number(value.trim()))
  const clickX = spot.x + (offsetX || 0)
  const clickY = spot.y + (offsetY || 0)

  if (offsetX || offsetY) {
    console.log(`偏移点击：中心 (${spot.x}, ${spot.y}) → (${clickX}, ${clickY})\n`)
  }

  const before = JSON.parse(
    (await send('Runtime.evaluate', { expression: READ_TOASTS, returnByValue: true })).result.value,
  )

  for (let index = 0; index < TIMES; index++) {
    if (MODE === 'js') {
      // 直接触发 click 事件：绕开命中测试，只验证 React 的回调
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            const b = Array.from(document.querySelectorAll('button[aria-label]')).find((x) =>
              x.getClientRects().length > 0 &&
              (x.getAttribute('aria-label') || '').split(/[：:]/)[0].trim() === ${JSON.stringify(WANTED)},
            );
            if (b) b.click();
            return b ? 'clicked' : 'not-found';
          })()
        `,
        returnByValue: true,
      })
    } else {
      // 真的按下 + 抬起，走完整的事件链
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: clickX,
        y: clickY,
        button: 'none',
      })
      await sleep(120)
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: clickX,
        y: clickY,
        button: 'left',
        buttons: 1,
        clickCount: 1,
      })
      await sleep(60)
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: clickX,
        y: clickY,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      })
    }
    await sleep(900)

    const now = JSON.parse(
      (await send('Runtime.evaluate', { expression: READ_TOASTS, returnByValue: true })).result
        .value,
    )
    const fresh = now.filter((text) => !before.includes(text))
    console.log(
      `第 ${index + 1} 次点击 → ${
        now.length === 0 ? '屏幕上没有气泡' : fresh.length > 0 ? `新气泡：${fresh.join(' | ')}` : `气泡还在（无新的）：${now.join(' | ')}`
      }`,
    )
    before.length = 0
    before.push(...now)
  }

  ws.close()
} finally {
  chrome.kill()
}
