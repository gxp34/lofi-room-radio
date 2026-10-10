import { fetchWithTimeout, readCachedSetting, readSetting, writeCachedSetting } from '@/lib/external/cache'
import type { DailyQuote } from '@/types/external'

/**
 * 每日一句。
 *
 * 来源：Hitokoto（一言），`https://v1.hitokoto.cn/`，免费无密钥。
 *
 * 三条规则：
 *   1. **一天只自动换一次** —— 服务端按"服务器日期"缓存 24 小时，
 *      存进 site_settings 的 `daily_quote`。刷新页面不会换句子。
 *   2. **后台可以手动覆盖** —— 覆盖值存在 `daily_quote_override`，
 *      它的优先级高于自动抓的那句，而且**当天一直有效**。
 *   3. **拿不到就用本地句子库** —— 内置 20 句，永远有得显示。
 *
 * 注意本地句子库是**按天轮换**的（用日期做种子），不是随机的：
 * 不然同一个访客刷两次就看到两句不一样的话，和"每日一句"自相矛盾。
 */

const CACHE_KEY = 'daily_quote'
const OVERRIDE_KEY = 'daily_quote_override'
const QUOTE_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 5000

/**
 * 本地句子库。
 *
 * 语气和整个站一致：深夜、一个人、不劝人向上。
 * 这 20 句同时也是"一言挂了"时的兜底，所以不能写得太"名言警句"。
 */
export const LOCAL_QUOTES: Array<{ text: string; from: string | null }> = [
  { text: '夜里三点的心事，第二天早上看起来都不太成立。', from: null },
  { text: '你不是懒，你只是需要先把窗户开一条缝。', from: null },
  { text: '今天也没做什么。但雨下了一整天，这不算浪费。', from: null },
  { text: '有些事想不通就先睡。脑子是自己会整理的。', from: null },
  { text: '把灯关掉之后，房间才真正属于你。', from: null },
  { text: '不用每件事都有意义。有些歌就是好听而已。', from: null },
  { text: '你上一次毫无目的地出门，是什么时候。', from: null },
  { text: '别人的进度条和你没关系，你们跑的不是同一条赛道。', from: null },
  { text: '难过的时候不要做决定，等雨停。', from: null },
  { text: '猫不会安慰你，但它会坐在你旁边。这就够了。', from: null },
  { text: '有些话写下来就不疼了，不一定要给谁看。', from: null },
  { text: '今天的任务可以只有一件：活到明天。', from: null },
  { text: '你不是不够努力，你是太久没休息了。', from: null },
  { text: '世界不会因为你今晚偷懒而塌掉。', from: null },
  { text: '一杯热的东西，比十条建议管用。', from: null },
  { text: '允许自己讨厌今天。明天再说。', from: null },
  { text: '你记得的那些尴尬瞬间，别人早忘了。', from: null },
  { text: '雨声之所以让人安心，是因为它什么都不要求你。', from: null },
  { text: '不用急着变好。慢慢来，也是在来。', from: null },
  { text: '这间房间一直在这儿。你什么时候回来都行。', from: null },
]

/** 服务器当地日期（YYYY-MM-DD） */
export function serverDayKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 用日期当种子挑一句：同一天永远是同一句 */
export function localQuoteForDay(day: string): { text: string; from: string | null } {
  let hash = 0
  for (let i = 0; i < day.length; i++) {
    hash = (hash * 31 + day.charCodeAt(i)) % 1_000_000_007
  }
  return LOCAL_QUOTES[hash % LOCAL_QUOTES.length] ?? LOCAL_QUOTES[0]
}

interface HitokotoResponse {
  hitokoto?: string
  from?: string
  from_who?: string | null
}

/**
 * 拿今天这一句。
 *
 * 永远返回一个对象，永不抛错 —— 调用方不需要 try。
 */
export async function loadDailyQuote(options: { enabled: boolean; fresh?: boolean }): Promise<DailyQuote> {
  const day = serverDayKey()

  // ---- 1. 后台手动覆盖优先 ----
  const override = await readSetting<string>(OVERRIDE_KEY)
  if (typeof override === 'string' && override.trim().length > 0) {
    return { text: override.trim(), from: null, source: 'manual', day }
  }

  // ---- 2. 今天已经抓过了吗 ----
  if (!options.fresh) {
    const cached = await readCachedSetting<DailyQuote>(CACHE_KEY, QUOTE_TTL_MS)
    if (cached && cached.day === day) return cached
  }

  // ---- 3. 开关关着 ----
  if (!options.enabled) {
    const local = localQuoteForDay(day)
    return { text: local.text, from: local.from, source: 'local', day }
  }

  // ---- 4. 去抓 ----
  return fetchQuote(day)
}

async function fetchQuote(day: string): Promise<DailyQuote> {
  try {
    const response = await fetchWithTimeout('https://v1.hitokoto.cn/?encode=json&max_length=48', FETCH_TIMEOUT_MS, {
      headers: { accept: 'application/json' },
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = (await response.json()) as HitokotoResponse
    const text = typeof data.hitokoto === 'string' ? data.hitokoto.trim() : ''
    if (text.length === 0) throw new Error('返回里没有内容')

    // 出处：优先 from_who（作者），没有就用 from（作品）
    const who = typeof data.from_who === 'string' && data.from_who.trim() ? data.from_who.trim() : null
    const work = typeof data.from === 'string' && data.from.trim() ? data.from.trim() : null

    const quote: DailyQuote = {
      text,
      from: who ?? work,
      source: 'hitokoto',
      day,
    }

    // 抓到就存 24 小时
    void writeCachedSetting(CACHE_KEY, quote)
    return quote
  } catch (error) {
    console.warn('[quote] 拿不到每日一句，用本地句子库：', error)

    const local = localQuoteForDay(day)
    return { text: local.text, from: local.from, source: 'local', day }
  }
}

/** 后台手动覆盖 / 取消覆盖用的键名（settings.ts 里也要用） */
export const DAILY_QUOTE_OVERRIDE_KEY = OVERRIDE_KEY
