import { isBrowser, readJSON, writeJSON } from '@/lib/storage'

/**
 * 音效播放器。
 *
 * 三条硬规矩（写进代码里，不靠自觉）：
 *   1. **默认静音**：enabled 初始为 false，必须由用户点一下开关才会出声；
 *   2. **文件缺失不报错**：public/audio/ 里没有对应文件时静默跳过，
 *      页面功能完全不受影响（所以这些音效是「可选增强」，不是依赖）；
 *   3. **不预加载**：只有真的要播的时候才创建 Audio，省流量。
 */

/** 所有可用音效 → 对应的文件路径 */
export const SFX_FILES = {
  click: '/audio/click.mp3',
  page: '/audio/page-turn.mp3',
  letter: '/audio/letter-drop.mp3',
  purr: '/audio/cat-purr.mp3',
  crackle: '/audio/vinyl-crackle.mp3',
  static: '/audio/radio-static.mp3',
  hover: '/audio/ui-hover.mp3',
} as const

export type SfxName = keyof typeof SFX_FILES

/** 环境音（循环播放） */
export const AMBIENT_FILES = {
  rain: '/audio/rain-loop.mp3',
  rainHeavy: '/audio/rain-heavy.mp3',
} as const

export type AmbientName = keyof typeof AMBIENT_FILES

const PREF_KEY = 'lofi:sound-enabled'

/** 每个音效的音量（0–1），避免某些效果太吵 */
const SFX_VOLUME: Record<SfxName, number> = {
  click: 0.35,
  page: 0.4,
  letter: 0.5,
  purr: 0.35,
  crackle: 0.3,
  static: 0.25,
  hover: 0.12,
}

/* --------------------------------------------------------------------------
   状态
   -------------------------------------------------------------------------- */

let enabled = false
let hydrated = false
/** 记录哪些文件已经确认加载失败，避免反复重试 */
const failed = new Set<string>()
/** 环境音实例 */
const ambientPlayers = new Map<AmbientName, HTMLAudioElement>()
/** 当前正在播的环境音 */
let currentAmbient: AmbientName | null = null

type Listener = (enabled: boolean) => void
const listeners = new Set<Listener>()

function hydrate(): void {
  if (hydrated || !isBrowser()) return
  hydrated = true
  enabled = readJSON<boolean>(PREF_KEY, false) === true
}

/** 声音是否已开启 */
export function isSoundEnabled(): boolean {
  hydrate()
  return enabled
}

/** 订阅开关变化（给 UI 用） */
export function onSoundChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 开 / 关声音；开启时会播一声咔哒，既是反馈也是浏览器的「用户手势解锁」 */
export function setSoundEnabled(next: boolean): void {
  hydrate()
  enabled = next
  writeJSON(PREF_KEY, next)

  if (!next) {
    stopAmbient()
  } else {
    void playSfx('click')
  }

  listeners.forEach((listener) => listener(next))
}

export function toggleSound(): boolean {
  const next = !isSoundEnabled()
  setSoundEnabled(next)
  return next
}

/* --------------------------------------------------------------------------
   音效
   -------------------------------------------------------------------------- */

/** 播一个短音效；没开启 / 没文件 / 播放被拦，都安静地失败 */
export async function playSfx(name: SfxName): Promise<void> {
  hydrate()
  if (!enabled || !isBrowser()) return

  const src = SFX_FILES[name]
  if (failed.has(src)) return

  try {
    const audio = new Audio(src)
    audio.volume = SFX_VOLUME[name]
    audio.preload = 'auto'

    audio.addEventListener('error', () => {
      failed.add(src)
    })

    await audio.play()
  } catch {
    // 浏览器拦截自动播放、文件 404、解码失败……全都不影响功能
  }
}

/* --------------------------------------------------------------------------
   环境音（雨声）
   -------------------------------------------------------------------------- */

/** 播环境音（循环）；同一时间只会有一个 */
export async function playAmbient(name: AmbientName, volume = 0.25): Promise<void> {
  hydrate()
  if (!enabled || !isBrowser()) return

  const src = AMBIENT_FILES[name]
  if (failed.has(src)) return

  if (currentAmbient && currentAmbient !== name) stopAmbient()
  if (currentAmbient === name) return

  try {
    let player = ambientPlayers.get(name)
    if (!player) {
      player = new Audio(src)
      player.loop = true
      player.preload = 'none'
      player.addEventListener('error', () => {
        failed.add(src)
        ambientPlayers.delete(name)
        if (currentAmbient === name) currentAmbient = null
      })
      ambientPlayers.set(name, player)
    }

    player.volume = volume
    await player.play()
    currentAmbient = name
  } catch {
    // 同上，静默失败
  }
}

/** 停掉所有环境音 */
export function stopAmbient(): void {
  ambientPlayers.forEach((player) => {
    try {
      player.pause()
      player.currentTime = 0
    } catch {
      // 忽略
    }
  })
  currentAmbient = null
}

/** 当前在播哪个环境音 */
export function getCurrentAmbient(): AmbientName | null {
  return currentAmbient
}

/**
 * 用户第一次点击页面任意位置时调用一次。
 * 浏览器的自动播放策略要求「先有用户手势」，这里做一个全局解锁。
 */
export function unlockAudio(): void {
  hydrate()
  if (!enabled || !isBrowser()) return
  // 播一个音量为 0 的静音音效，把 AudioContext 解锁掉
  const audio = new Audio(SFX_FILES.click)
  audio.volume = 0
  void audio.play().catch(() => undefined)
}
