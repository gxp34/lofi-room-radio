'use client'

/**
 * 调频小游戏的纯逻辑。
 *
 * 电台的「信号」不是真的音频处理，而是一条简单的数学关系：
 *   离中心频率越近，强度越高。超过宽度就是纯噪音。
 * 剩下的味道全靠三件事做出来：
 *   · **漂移** —— 信号强度随时间抖动，不会稳稳停在一个数上
 *   · **干扰** —— 随机一小段时间整个频段被压掉
 *   · **跳频** —— 某个台偶尔挪开零点几兆，得追着它微调
 * 这三样都是由时间决定的，所以这里用 `at` 时间戳当参数，
 * 同一时刻算几次结果一致（可测），也让组件不必自己保存随机数。
 */

export const RADIO_MIN = 80
export const RADIO_MAX = 108
export const RADIO_STEP = 0.1

/** 强度超过这个值就算「收到了」 */
export const RADIO_LOCK_THRESHOLD = 0.72

export type RadioDynamic = 'request' | 'echo'

export interface RadioStation {
  id: string
  /** 中心频率（MHz） */
  freq: number
  name: string
  /** 台里的内容，收到之后一行一行放出来 */
  lines: string[]
  /** 收得到这个台的频率半径（MHz） */
  width: number
  /** 隐藏台：不找到就不出现在图鉴里 */
  secret?: boolean
  /** 只在深夜（0:00–5:00）出现 */
  deepNightOnly?: boolean
  /**
   * 需要真实数据的台 —— 组件会去拿站里的歌名 / 树洞原文填进来。
   * 这样调频就不是一个孤立的小游戏：点歌台真的会报出唱片架上的歌。
   */
  dynamic?: RadioDynamic
  /** 找到之后额外说一句 */
  reward?: string
}

/**
 * 六个台。
 *
 * 频率是「手感优先」而不是随机撒的：88 到 104 之间均匀铺开，
 * 每个台之间至少隔 3 MHz，这样慢慢拧的时候有"一格一格找过去"的节奏；
 * 107.9 顶在最右边，是留给隐藏台的位置 —— 一般人拧到 108 就停了。
 */
export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'weather',
    freq: 88.7,
    name: '天气预报',
    width: 0.9,
    lines: [
      '今夜阴，有雨。明天也是。',
      '本市未来三天没有晴天，出门记得带伞。',
      '空气湿度 91%，很适合待在家里。',
    ],
  },
  {
    id: 'news',
    freq: 92.3,
    name: '深夜新闻',
    width: 0.9,
    lines: [
      '本市今晚没有发生什么大事。',
      '凌晨两点的路况：畅通，只有你一辆车。',
      '接下来是一条本地消息：有人捡到一只猫，正在找主人。',
    ],
  },
  {
    id: 'request',
    freq: 96.5,
    name: '点歌台',
    width: 1.0,
    lines: ['下面这首，是一位听众点给还没睡的人的。'],
    dynamic: 'request',
    reward: '点歌台把你的唱片架念了出来 ——「深夜」那一栏，原来真的有人在听。',
  },
  {
    id: 'echo',
    freq: 101.2,
    name: '树洞回音',
    width: 1.0,
    lines: ['这个频率上有人在很远的地方，也醒着。'],
    dynamic: 'echo',
    reward: '树洞回音把抽屉里的一封信念了出来。它本来只贴在墙上。',
  },
  {
    id: 'alien',
    freq: 104.8,
    name: '外星广播',
    width: 0.8,
    secret: true,
    deepNightOnly: true,
    lines: [
      '……（后面是一段听不懂的话）',
      '信号里夹着一串规律的脉冲，像是有人在数数。',
      '那段声音反复出现同一个音节，你听不懂，但觉得很熟。',
    ],
    reward: '这段广播只在凌晨才会出现。你听到了。',
  },
  {
    id: 'hidden',
    freq: 107.9,
    name: '？？？',
    width: 0.5,
    secret: true,
    lines: [
      '这个频率上什么都没有，除了一段很轻的呼吸声。',
      '……',
      '「你找到这里了。」',
    ],
    reward: '107.9。它不在任何一份节目单上。',
  },
]

/* --------------------------------------------------------------------------
   信号
   -------------------------------------------------------------------------- */

/** 强度 0–1 */
export interface RadioSignal {
  station: RadioStation | null
  strength: number
}

/** 稳定的伪随机：同一个 (seed, at) 永远得到同一个值，便于测试与重放 */
function noise(seed: number, at: number): number {
  const x = Math.sin(seed * 127.1 + at * 0.017) * 43758.5453
  return x - Math.floor(x)
}

/**
 * 当前时刻某个台「看起来」在哪个频率上。
 *
 * 平时就是它自己的频率；偶尔（约每 11 秒一次，持续 3 秒）会跳开 ±0.4。
 * 这就是"跳频" —— 玩家会看到信号忽明忽暗，得微调一下才能咬住。
 */
export function driftedFrequency(station: RadioStation, at: number): number {
  const hop = noise(station.freq * 7.3, at)
  if (hop > 0.93) {
    const direction = noise(station.freq * 3.1, at) > 0.5 ? 1 : -1
    return station.freq + direction * 0.4
  }
  return station.freq
}

/**
 * 整段频段是否正被干扰压住。
 *
 * 阈值调过一次：原来 0.965，也就是每 9 个心跳（约 1 秒）就有 3.5% 的概率，
 * 平均两三秒静默一次 —— 太吵了，而且每次静默都会把"台里念到第几句"打断，
 * 结果是台词永远停在第一句。现在 0.99（约每 10 秒一次），
 * 保住"偶尔抖一下"的味道，又不至于让人念不完整。
 */
export function isInterfered(at: number): boolean {
  return noise(99.7, at) > 0.99
}

/**
 * 算出调谐盘放在 dial 时的信号。
 *
 * @param dial      当前频率
 * @param at        时间戳（毫秒）；用 Date.now() 传进来
 * @param available 可用的台（深夜过滤之类在外面做完再传进来）
 */
export function signalAt(dial: number, at: number, available: RadioStation[]): RadioSignal {
  if (isInterfered(at)) return { station: null, strength: 0 }

  let best: RadioStation | null = null
  let bestStrength = 0

  for (const station of available) {
    const center = driftedFrequency(station, at)
    const distance = Math.abs(dial - center)
    if (distance > station.width) continue

    // 距离 → 强度：中心 1，边缘 0，用平方让"咬住"的手感更明确
    const base = 1 - distance / station.width
    const shaped = base * base

    // 再叠一层抖动，否则数值会定在那儿一动不动
    const jitter = 0.88 + noise(station.freq * 13.7, at) * 0.12
    const strength = shaped * jitter

    if (strength > bestStrength) {
      bestStrength = strength
      best = station
    }
  }

  return { station: best, strength: bestStrength }
}

/** 显示成 96.5 这样的形式 */
export function formatFrequency(value: number): string {
  return value.toFixed(1)
}

/** 把频率夹回合法范围并吸附到步长上 */
export function clampFrequency(value: number): number {
  const clamped = Math.min(RADIO_MAX, Math.max(RADIO_MIN, value))
  return Math.round(clamped / RADIO_STEP) * RADIO_STEP
}

/** 现在是不是深夜（0:00–5:00）—— 外星广播只在这个时段出现 */
export function isDeepNightAt(date: Date): boolean {
  const hour = date.getHours()
  return hour >= 0 && hour < 5
}

/**
 * 挑这个时刻能收到的台。
 * 隐藏台不受时段限制（不然白天就永远找不到，反而不好玩），
 * 外星广播只在深夜出现。
 */
export function availableStations(stations: RadioStation[], date: Date): RadioStation[] {
  const deepNight = isDeepNightAt(date)
  return stations.filter((station) => (station.deepNightOnly ? deepNight : true))
}

/* --------------------------------------------------------------------------
   存档
   -------------------------------------------------------------------------- */

export interface RadioSave {
  /** 已经收到过的台 id */
  found: string[]
  /** 一共拧了多少次旋钮（只是好看） */
  scans: number
}

export const EMPTY_RADIO_SAVE: RadioSave = { found: [], scans: 0 }

/** 记一个台，返回新存档；已经记过就原样返回 */
export function noteStationFound(save: RadioSave, id: string): RadioSave {
  if (save.found.includes(id)) return save
  return { ...save, found: [...save.found, id] }
}

/** 收到几个了（隐藏台也算在里面） */
export function foundCount(save: RadioSave): number {
  return save.found.length
}
