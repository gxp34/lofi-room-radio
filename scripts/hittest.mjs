/**
 * 房间物件的「命中测试」工具（开发用，不是网站的一部分）。
 *
 * 用法：
 *   node scripts/hittest.mjs http://localhost:3000/
 *
 * 它做的事：把页面上每个可点物件（button[aria-label]）的中心坐标拿出来，
 * 然后用 document.elementFromPoint() 问浏览器「这个位置最上面的是谁」。
 *
 * 为什么需要这个：
 *   物件画得好不好看，截图能看出来；但「点不到」截图看不出来 ——
 *   要嘛被后面画的东西盖住了（灯光、投影、别的家具），
 *   要嘛元素本身 pointer-events 被关掉了。这类问题只有命中测试能查出来。
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const URL_TO_OPEN = process.argv[2] ?? 'http://localhost:3000/'
const PORT = 9336

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
    `--user-data-dir=${process.env.TEMP}\\dsh-chrome-hit`,
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

const SCRIPT = `
(async () => {
  const out = [];
  const buttons = Array.from(document.querySelectorAll('button[aria-label]'));
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  for (const button of buttons) {
    const label = button.getAttribute('aria-label') || '';
    const name = label.split(/[：:]/)[0].trim();
    if (!name) continue;

    // 桌面版和窄屏版是两棵 DOM，窄屏那棵在 lg 以上是 display:none。
    // 隐藏元素跳过，不然会报一堆假的「尺寸为 0」。
    if (button.getClientRects().length === 0) continue;

    // 先把物件滚到视口中间再测 —— 不然 elementFromPoint 会因为
    // 坐标在视口外而返回 null，看起来像「点不到」。
    // 必须写 behavior:'instant'：站点全局有 scroll-behavior:smooth，
    // 默认的 scrollIntoView 是动画滚动，等一两帧根本到不了位。
    button.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    await frame();
    await frame();

    const rect = button.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      out.push({ name, verdict: '尺寸为 0，根本没渲染' });
      continue;
    }

    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);

    const probes = [
      [cx, cy],
      [Math.round(rect.left + rect.width * 0.25), cy],
      [Math.round(rect.left + rect.width * 0.75), cy],
      [cx, Math.round(rect.top + rect.height * 0.25)],
      [cx, Math.round(rect.top + rect.height * 0.75)],
    ];

    let selfHits = 0;
    let outside = 0;
    let blocker = null;

    for (const [px, py] of probes) {
      if (px < 0 || py < 0 || px > window.innerWidth || py > window.innerHeight) {
        outside++;
        continue;
      }
      const top = document.elementFromPoint(px, py);
      if (!top) {
        outside++;
        continue;
      }
      const owner = top.closest('button');
      if (owner === button) {
        selfHits++;
      } else if (!blocker) {
        blocker = {
          tag: top.tagName.toLowerCase(),
          cls: (top.getAttribute('class') || '').slice(0, 64),
          pointerEvents: getComputedStyle(top).pointerEvents,
          ownerLabel: owner ? (owner.getAttribute('aria-label') || '').split(/[：:]/)[0] : null,
        };
      }
    }

    const tested = probes.length - outside;
    out.push({
      name,
      size: Math.round(rect.width) + '×' + Math.round(rect.height),
      selfHits: selfHits + '/' + tested + (outside ? '（' + outside + ' 点出界）' : ''),
      verdict:
        tested === 0 ? '测不到（都在视口外）' : selfHits === tested ? 'OK' : selfHits === 0 ? '完全点不到' : '部分被挡',
      blocker,
    });
  }
  return JSON.stringify(out, null, 1);
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
    width: 1400,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })

  await send('Page.navigate', { url: URL_TO_OPEN })
  // 等事件气泡自己消失（TTL 7 秒）。
  // 想测「气泡正挂着的时候点不点得到」，把 HIT_SETTLE_MS 调小（比如 2500）。
  await sleep(Number(process.env.HIT_SETTLE_MS ?? 10000))

  const result = await send('Runtime.evaluate', {
    expression: SCRIPT,
    returnByValue: true,
    awaitPromise: true,
  })
  const rows = JSON.parse(result?.result?.value ?? '[]')

  const broken = rows.filter((row) => row.verdict !== 'OK')
  for (const row of rows) {
    const flag = row.verdict === 'OK' ? 'OK  ' : '!!  '
    console.log(
      `${flag}${String(row.name).padEnd(10)} ${String(row.size ?? '-').padEnd(9)} 命中 ${String(row.selfHits ?? '-').padEnd(16)} ${row.verdict}` +
        (row.blocker
          ? `\n      ← 被 ${row.blocker.tag}.${row.blocker.cls} 挡住（pointer-events: ${row.blocker.pointerEvents}）` +
            (row.blocker.ownerLabel ? `，它属于「${row.blocker.ownerLabel}」` : '，不是任何人物的按钮')
          : ''),
    )
  }
  console.log(`\n${rows.length} 个物件，${broken.length} 个有问题`)
  process.exitCode = broken.length > 0 ? 1 : 0

  ws.close()
} finally {
  chrome.kill()
}
