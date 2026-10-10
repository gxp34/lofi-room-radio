import { fetchWithTimeout, readMemory, writeMemory } from '@/lib/external/cache'
import type { RadioChannelsPayload, RadioFormat, RadioSource, RadioStation } from '@/types/radio'

/**
 * 实时电台的**服务端**逻辑。
 *
 * 数据源：
 *   · SomaFM —— 用它的官方 JSON（`https://somafm.com/channels.json`，免费无密钥），
 *     里面每个频道自带若干个播放列表地址（.pls）。这一份是**活的**，
 *     所以 SomaFM 加台减台我们不用改代码。
 *   · 自定义频道 —— 后台「站点设置」里填的那些（中文电台为主）。
 *     它们大多是会变的，写死在代码里迟早失效，所以做成可配置。
 *
 * 两段缓存，都是 1 小时：
 *   · 频道列表（channels.json）
 *   · 每个频道的播放列表解析结果（/api/radio/stream）
 *
 * ⚠️ 这里**只解析播放列表，不代理音频流本身**。
 * 代理音频要走服务端带宽，而且在 Serverless 上会被函数超时打断 ——
 * 播放列表可能只有几百字节，解析一下告诉前端"真正的流在哪"就够了。
 */

const CHANNELS_CACHE_KEY = 'radio_channels'
const PLAYLIST_CACHE_KEY = 'radio_playlist'
const CACHE_TTL_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 8000
/** 探测流可用性的超时。要比解析短 —— 它只是个"顺便看一眼" */
const PROBE_TIMEOUT_MS = 4000

/**
 * SomaFM 官方目录。
 * 用它而不是写死地址：地址（ice1/ice2/ice4…）会换，官方 JSON 不会。
 */
const SOMAFM_CHANNELS_URL = 'https://somafm.com/channels.json'

/** 默认置顶的五个 SomaFM 频道（用户点名要的） */
export const SOMAFM_FEATURED = ['groovesalad', 'dronezone', 'deepspaceone', 'lush', 'bootliquor']

interface SomaFmPlaylist {
  url?: string
  format?: string
  quality?: string
}

interface SomaFmChannel {
  id?: string
  title?: string
  description?: string
  genre?: string
  image?: string
  playlists?: SomaFmPlaylist[]
}

interface SomaFmResponse {
  channels?: SomaFmChannel[]
}

/* --------------------------------------------------------------------------
   格式判断
   -------------------------------------------------------------------------- */

/** 从地址猜格式。猜不出给 null，让界面什么都不说 */
export function guessFormat(url: string): RadioFormat | null {
  const lower = url.toLowerCase().split('?')[0] ?? ''

  if (lower.endsWith('.m3u8')) return 'hls'
  if (lower.endsWith('.m3u') || lower.endsWith('.pls')) return null // 播放列表，还没到底
  if (lower.endsWith('.aac') || lower.endsWith('.aacp')) return 'aac'
  if (lower.endsWith('.mp3')) return 'mp3'

  // 很多流不带后缀，路径里会有 mp3 / aac / hls 的字样
  if (lower.includes('hls') || lower.includes('m3u8')) return 'hls'
  if (lower.includes('aac')) return 'aac'
  if (lower.includes('mp3')) return 'mp3'
  return null
}

/**
 * 这个地址是不是"还需要再解析一层"的播放列表。
 *
 * ⚠️ **`.m3u8` 不算**，这一点踩过坑：
 * HLS 的 m3u8 本身就**是**要交给播放器的地址 —— 它里面列的是分片，
 * 由 hls.js 自己去取、自己跟随 master → media playlist 的层级。
 * 如果我们把它当播放列表解析，会拿到 master 里那条二级地址，
 * 而像山东音乐广播那种，二级地址是**带一次性 token、每次请求重新生成**的：
 * 解析出来再缓存一小时，一小时后就是一条死链。
 * 所以：`.pls` / `.m3u` 要解析，`.m3u8` 原样交给播放器。
 */
export function isPlaylistUrl(url: string): boolean {
  const lower = url.toLowerCase().split('?')[0] ?? ''
  if (lower.endsWith('.m3u8')) return false
  return lower.endsWith('.pls') || lower.endsWith('.m3u')
}

/**
 * 解析播放列表，返回第一条 http(s) 地址。
 *
 *   .pls  → `File1=http://...`（也可能只有 `File1=`，没有编号）
 *   .m3u  → 一行一个地址，`#` 开头是注释
 *
 * 有些服务器返回的文件没有正确的扩展名，所以这里**两种都试着解析**，
 * 谁先解析出东西就用谁 —— 比按扩展名分派更耐操。
 */
export function parsePlaylist(body: string): string | null {
  const lines = body.split(/\r?\n/)

  // .pls：File1=、File2=……
  for (const line of lines) {
    const match = /^\s*File\d*\s*=\s*(\S+)/i.exec(line)
    if (match?.[1]) return match[1].trim()
  }

  // .m3u：第一个不是注释、看起来像地址的行
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (/^https?:\/\//i.test(trimmed)) return trimmed
  }

  return null
}

/* --------------------------------------------------------------------------
   频道列表
   -------------------------------------------------------------------------- */

/**
 * 自定义频道的一行配置。
 *
 * 后台用**文本**编辑（一行一个：`名称 | 地址 | 标签`），不是复杂的嵌套表单。
 * 理由：这些地址是外面抄来的，改起来要能一眼看懂、直接改一行；
 * 做个带增删按钮的表单反而更慢，而且手机上没法编辑。
 */
export interface CustomChannelLine {
  name: string
  endpoint: string
  tags: string[]
  formatHint: RadioFormat | null
}

/** 解析后台那一坨文本。坏行直接跳过，不抛错 */
export function parseCustomChannels(text: string): CustomChannelLine[] {
  const out: CustomChannelLine[] = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    // 允许用 # 注释掉一行
    if (line === '' || line.startsWith('#')) continue

    const parts = line.split('|').map((part) => part.trim())
    const name = parts[0]
    const endpoint = parts[1]

    // 名称和地址缺一不可
    if (!name || !endpoint || !/^https?:\/\//i.test(endpoint)) continue

    out.push({
      name,
      endpoint,
      tags: (parts[2] ?? '')
        .split(/[,，\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      formatHint: guessFormat(endpoint),
    })
  }

  return out
}

/**
 * 自定义频道 → 频道对象。
 *
 * id 直接用名字（`custom:华语金曲500首`）。
 * 一开始我用的是"名字的字符哈希 + 序号"，看着更"技术"，
 * 但那个 id 没法在别处写出来 —— 后台的「默认频道」要填一个 id，
 * 哈希值没人算得出来。用名字就可读、可预测、能在 query 里传
 * （前端会 encodeURIComponent）。
 * 同名的两行会撞 id —— 那本来就是配置写重了，撞了正好。
 */
function customToStation(line: CustomChannelLine): RadioStation {
  return {
    id: `custom:${line.name}`,
    name: line.name,
    description: line.tags.length > 0 ? line.tags.join(' · ') : '自定义频道',
    tags: line.tags,
    source: 'custom' satisfies RadioSource,
    endpoint: line.endpoint,
    formatHint: line.formatHint,
    coverUrl: null,
  }
}

/** SomaFM 频道 → 频道对象。挑一个最合适的播放列表 */
function somafmToStation(channel: SomaFmChannel): RadioStation | null {
  const id = channel.id?.trim()
  const title = channel.title?.trim()
  if (!id || !title) return null

  const playlists = channel.playlists ?? []
  if (playlists.length === 0) return null

  /**
   * 选播放列表的顺序。
   *
   * ⚠️ 这里踩过一个坑，值得写下来：
   * SomaFM 的 mp3 只提供 **256k** 这一档（`xxx256.pls`），
   * 而高码率流的并发是有上限的 —— 满了之后它会把你重定向到
   * `https://somafm.com/alert.mp3`，也就是一段"这个台现在满了"的提示音。
   * 实测 Groove Salad 的 256k 当时就是满的，但 Deep Space One（只有 128k）
   * 一次就通。所以**优先挑不带 256 的 mp3**，其次 AAC 130，
   * 实在没有才用 256 —— 这样大多数台是最好兼容的 mp3，
   * 又不会一进页面就听到提示音。
   */
  const mp3s = playlists.filter((item) => item.format === 'mp3')
  const pick =
    mp3s.find((item) => !/256/.test(item.url ?? '')) ??
    playlists.find((item) => item.format === 'aac' && item.quality === 'highest') ??
    mp3s[0] ??
    playlists[0]

  const endpoint = pick?.url?.trim()
  if (!endpoint) return null

  const genre = channel.genre?.trim()

  // 格式提示按实际挑中的那个算，不要用 format 字段直接映射 ——
  // aacp（HE-AAC）在部分浏览器上支持不好，标成 aac 更贴近事实
  const format: RadioFormat = pick?.format === 'mp3' ? 'mp3' : 'aac'

  return {
    id: `somafm:${id}`,
    name: title,
    description: channel.description?.trim() || genre || 'SomaFM',
    tags: [genre ?? '', 'SomaFM'].filter(Boolean),
    source: 'somafm' satisfies RadioSource,
    endpoint,
    formatHint: format,
    // SomaFM 的封面是 png/jpg 的固定路径
    coverUrl: channel.image ? `https://somafm.com${channel.image}` : null,
  }
}

/**
 * 拿频道列表。
 *
 * 返回的对象**永远不是 null**：SomaFM 挂了就只返回自定义频道，
 * 自定义也是空的就返回空数组 —— 页面上会显示「信号丢失」，但不会崩。
 */
export async function loadRadioChannels(options: {
  enabled: boolean
  customText: string
  defaultStationId: string | null
  fresh?: boolean
}): Promise<RadioChannelsPayload> {
  const now = new Date().toISOString()

  const custom = parseCustomChannels(options.customText).map(customToStation)

  if (!options.enabled) {
    return {
      enabled: false,
      note: '电台在后台关着。',
      // 关掉之后仍然把列表给出去，让页面能展示"有哪些台"，只是不放声音
      stations: custom,
      defaultStationId: options.defaultStationId,
      fetchedAt: now,
    }
  }

  /* ---- 缓存 ---- */
  if (!options.fresh) {
    const hit = readMemory<RadioStation[]>(CHANNELS_CACHE_KEY, CACHE_TTL_MS)
    if (hit) {
      return {
        enabled: true,
        note: null,
        stations: mergeStations(hit, custom),
        defaultStationId: options.defaultStationId,
        fetchedAt: now,
      }
    }
  }

  let somafm: RadioStation[] = []
  let note: string | null = null

  try {
    const response = await fetchWithTimeout(SOMAFM_CHANNELS_URL, FETCH_TIMEOUT_MS, {
      headers: { accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = (await response.json()) as SomaFmResponse
    somafm = (data.channels ?? [])
      .map(somafmToStation)
      .filter((item): item is RadioStation => item !== null)

    if (somafm.length === 0) throw new Error('返回里没有可用频道')

    writeMemory(CHANNELS_CACHE_KEY, somafm)
  } catch (error) {
    console.warn('[radio] 拿不到 SomaFM 频道列表：', error)
    note = custom.length > 0 ? 'SomaFM 连不上，只列出自己配的频道。' : '信号丢失：拿不到频道列表。'
  }

  return {
    enabled: true,
    note,
    stations: mergeStations(somafm, custom),
    defaultStationId: options.defaultStationId,
    fetchedAt: now,
  }
}

/**
 * 把 SomaFM 的频道和自定义频道拼起来。
 *
 * 置顶规则：自定义频道在前（中文台是给这个站的访客用的），
 * 然后是 SOMAFM_FEATURED 里点名的五个，最后是 SomaFM 剩下的。
 * 不置顶的话，46 个英文台会把几个中文台淹掉。
 */
function mergeStations(somafm: RadioStation[], custom: RadioStation[]): RadioStation[] {
  const featuredOrder = new Map(SOMAFM_FEATURED.map((id, index) => [`somafm:${id}`, index]))

  const rest = [...somafm].sort((a, b) => {
    const ai = featuredOrder.get(a.id)
    const bi = featuredOrder.get(b.id)
    if (ai !== undefined && bi !== undefined) return ai - bi
    if (ai !== undefined) return -1
    if (bi !== undefined) return 1
    return a.name.localeCompare(b.name)
  })

  return [...custom, ...rest]
}

/* --------------------------------------------------------------------------
   流地址解析
   -------------------------------------------------------------------------- */

export interface ResolvedStream {
  ok: boolean
  streamUrl: string | null
  format: RadioFormat | null
  error: string | null
}

/**
 * 探一下这个流到底能不能放。
 *
 * 为什么需要这一步：SomaFM 在**按 IP 限流**（或者某个台满了）的时候，
 * 不会返回错误码，而是把你 302 到 `https://somafm.com/alert.mp3` ——
 * 那是一段"这个台现在满了"的录音。
 * 不检查的话，访客点下去会听到一段莫名其妙的提示音，
 * 而我们还以为播放成功了。
 *
 * 做法：发一个只取 2 字节的请求，让 fetch 自己跟完跳转，
 * 然后看**最终地址**里有没有 alert。只看头，不读 body。
 *
 * 探测本身失败（超时、网络不通）不当成"流坏了" —— 那种情况下
 * 更应该让播放器去试，而不是我们提前判死。
 */
async function probeStream(url: string): Promise<{ throttled: boolean }> {
  try {
    const response = await fetchWithTimeout(url, PROBE_TIMEOUT_MS, {
      headers: { range: 'bytes=0-1' },
    })

    // 立刻放掉 body：我们只要地址，不要那 2 个字节之外的任何东西
    void response.body?.cancel().catch(() => undefined)

    return { throttled: /\/alert\.mp3/i.test(response.url) }
  } catch {
    return { throttled: false }
  }
}

/**
 * 把一个频道的 endpoint 解析成真正能交给 <audio> 的地址。
 *
 * 分三种情况：
 *   1. endpoint 本身就是流（直连地址，或者 HLS 的 .m3u8）→ 直接返回
 *   2. endpoint 是 .pls / .m3u → 拉下来解析，再探一下有没有被限流
 *   3. 解析失败 / 被限流 → ok:false，界面上就是一句人话
 */
export async function resolveStream(
  station: RadioStation,
  options: { fresh?: boolean } = {},
): Promise<ResolvedStream> {
  // ---- 1. 不需要解析 ----
  if (!isPlaylistUrl(station.endpoint)) {
    return {
      ok: true,
      streamUrl: station.endpoint,
      format: guessFormat(station.endpoint) ?? station.formatHint,
      error: null,
    }
  }

  const cacheKey = `${PLAYLIST_CACHE_KEY}:${station.id}`

  if (!options.fresh) {
    const hit = readMemory<ResolvedStream>(cacheKey, CACHE_TTL_MS)
    if (hit) return hit
  }

  // ---- 2. 解析播放列表 ----
  try {
    const response = await fetchWithTimeout(station.endpoint, FETCH_TIMEOUT_MS, {
      headers: { accept: '*/*' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const body = await response.text()
    const url = parsePlaylist(body)
    if (!url) throw new Error('播放列表里没有地址')

    const format = guessFormat(url) ?? station.formatHint

    // ---- 3. 探一下有没有被限流 ----
    const probe = await probeStream(url)
    if (probe.throttled) {
      // 注意**不缓存**这个结果：限流是一时的，缓存一小时等于让这个台
      // 一小时内都点不动，而它可能十秒后就恢复了
      return {
        ok: false,
        streamUrl: null,
        format,
        error: '这个台现在挤满了（或者被限流了），换一个试试。',
      }
    }

    const resolved: ResolvedStream = { ok: true, streamUrl: url, format, error: null }

    writeMemory(cacheKey, resolved)
    return resolved
  } catch (error) {
    console.warn(`[radio] 解析 ${station.name} 的播放列表失败：`, error)

    return {
      ok: false,
      streamUrl: null,
      format: null,
      error: '信号丢失',
    }
  }
}
