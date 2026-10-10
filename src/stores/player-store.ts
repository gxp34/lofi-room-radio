'use client'

import { create } from 'zustand'

import { RADIO_CHANNELS, STORAGE_KEYS } from '@/lib/constants'
import { readJSON, writeJSON } from '@/lib/storage'
import { useAchievementStore } from '@/stores/achievement-store'
import type { PlayerPrefs, Track } from '@/types'
import type { LiveStation } from '@/types/radio'

/**
 * 播放器状态。
 *
 * 分工：
 *   - 这个 store 决定「应该播哪首、播不播、音量多大」；
 *   - <AudioEngine> 里的那个唯一的 <audio> 元素负责真正出声，
 *     它把 timeupdate / ended 之类的事件回写到这里。
 * 这样刷新页面、切歌、锁屏控制都只有一份真相。
 */

type RepeatMode = PlayerPrefs['repeat']

interface PlayerState {
  hydrated: boolean
  /** 歌单（公开的 + 站长登录后可见的私密曲目） */
  tracks: Track[]
  /** 当前是第几首，-1 表示还没选 */
  currentIndex: number
  isPlaying: boolean
  currentTime: number
  duration: number
  /**
   * 拖动进度条的令牌：每次 seek 都 +1。
   * <audio> 组件监听它来决定「要不要把元素的 currentTime 设过去」——
   * 直接监听 currentTime 会和 timeupdate 打架（自己更新的值又被写回去，进度条会抖）。
   */
  seekToken: number

  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode

  /** 累计播放时长（毫秒），用来做「40 分钟提醒休息」 */
  listeningMs: number
  /** 已经提醒过休息了，避免反复弹 */
  restReminded: boolean

  /** 长按调频的结果，null 表示没在放白噪音 */
  radioChannel: string | null
  /**
   * 正在播的**实时电台**（/radio 页面的那些台）。
   *
   * 和唱片是互斥的：这个不为 null 时，<audio> 的音源就是直播流，
   * 而不是 tracks[currentIndex]。做成一个字段而不是"再写一个播放器"，
   * 是为了复用同一个 <audio>、同一套音量/静音、同一个底部播放条 ——
   * 两个播放器会互相抢声音，最后一定出 bug。
   */
  liveStation: LiveStation | null
  /** 直播流加载失败的原因（界面上就是「信号丢失」）；null = 正常 */
  streamError: string | null
  /** 跳针效果：在这个时间戳之前，进度条会来回抖 */
  glitchUntil: number
  /** 外星电台：在这个时间戳之前，播放器会显示噪音状态 */
  alienUntil: number

  hydrate: () => void
  setTracks: (tracks: Track[]) => void
  playTrackAt: (index: number) => void
  play: () => void
  pause: () => void
  toggle: () => void
  next: (auto?: boolean) => void
  prev: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setShuffle: (shuffle: boolean) => void
  setRepeat: (mode: RepeatMode) => void
  /** 由 audio 元素回调 */
  syncProgress: (currentTime: number, duration: number) => void
  /** 由 audio 元素回调：一首播完了 */
  handleEnded: () => void
  /** 计时器驱动：累计收听时长 */
  addListeningTime: (ms: number) => void
  markRestReminded: () => void
  /** 长按调频 */
  tuneRadio: () => string
  /** 开始放一个实时电台（会顶掉正在放的唱片） */
  playLiveStation: (station: LiveStation) => void
  /** 停止直播（回到唱片，但不会自动继续播） */
  stopLiveStation: () => void
  /** <audio> 回调：流坏了 / 播不了 */
  setStreamError: (message: string | null) => void
  /** 跳针 */
  stutter: (ms?: number) => void
  /** 外星电台 */
  playAlien: (ms?: number) => void
  clearEffects: () => void
}

const PREFS_KEY = STORAGE_KEYS.playerPrefs

const DEFAULT_PREFS: PlayerPrefs = {
  volume: 0.7,
  muted: false,
  shuffle: false,
  repeat: 'off',
  lastTrackId: null,
}

function pickRandomIndex(length: number, exclude: number): number {
  if (length <= 1) return 0
  let index = exclude
  let guard = 0
  while (index === exclude && guard < 20) {
    index = Math.floor(Math.random() * length)
    guard += 1
  }
  return index
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  hydrated: false,
  tracks: [],
  currentIndex: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  seekToken: 0,
  volume: DEFAULT_PREFS.volume,
  muted: DEFAULT_PREFS.muted,
  shuffle: DEFAULT_PREFS.shuffle,
  repeat: DEFAULT_PREFS.repeat,
  listeningMs: 0,
  restReminded: false,
  radioChannel: null,
  liveStation: null,
  streamError: null,
  glitchUntil: 0,
  alienUntil: 0,

  hydrate: () => {
    if (get().hydrated) return
    const prefs = readJSON<Partial<PlayerPrefs>>(PREFS_KEY, {})
    set({
      hydrated: true,
      volume:
        typeof prefs.volume === 'number' && prefs.volume >= 0 && prefs.volume <= 1
          ? prefs.volume
          : DEFAULT_PREFS.volume,
      muted: typeof prefs.muted === 'boolean' ? prefs.muted : DEFAULT_PREFS.muted,
      shuffle: typeof prefs.shuffle === 'boolean' ? prefs.shuffle : DEFAULT_PREFS.shuffle,
      repeat:
        prefs.repeat === 'all' || prefs.repeat === 'one' || prefs.repeat === 'off'
          ? prefs.repeat
          : DEFAULT_PREFS.repeat,
    })
  },

  setTracks: (tracks) => {
    const { currentIndex } = get()
    // 歌单变化后尽量保持当前这首歌还在原位
    const currentId = get().tracks[currentIndex]?.id
    const nextIndex = currentId ? tracks.findIndex((track) => track.id === currentId) : -1
    set({ tracks, currentIndex: nextIndex >= 0 ? nextIndex : tracks.length > 0 ? 0 : -1 })
  },

  playTrackAt: (index) => {
    const { tracks } = get()
    const track = tracks[index]
    if (!track) return

    set({
      currentIndex: index,
      isPlaying: true,
      currentTime: 0,
      radioChannel: null,
      // 放唱片就把直播停掉：两个音源同时出声是这里唯一不能接受的 bug
      liveStation: null,
      streamError: null,
    })

    // 听歌计数：用于「黑胶旅人」成就。
    // 这里只登记，不在这里判定成就 —— 判定需要访问记录等一整套上下文，
    // 统一交给 useRoomEvents() 那个编排层去做。
    useAchievementStore.getState().registerTrackPlay(track.id)
  },

  play: () => {
    if (get().tracks.length === 0) return
    if (get().currentIndex < 0) {
      set({ currentIndex: 0 })
    }
    set({ isPlaying: true })
  },

  pause: () => set({ isPlaying: false }),

  toggle: () => {
    if (get().tracks.length === 0) return
    if (get().currentIndex < 0) {
      get().playTrackAt(0)
      return
    }
    set({ isPlaying: !get().isPlaying })
  },

  next: (auto = false) => {
    const { tracks, currentIndex, shuffle, repeat } = get()
    if (tracks.length === 0) return

    if (repeat === 'one' && auto) {
      // 单曲循环：从头再放一次
      set({ currentTime: 0, isPlaying: true })
      return
    }

    if (shuffle) {
      set({ currentIndex: pickRandomIndex(tracks.length, currentIndex), currentTime: 0, isPlaying: true })
      return
    }

    const nextIndex = currentIndex + 1
    if (nextIndex < tracks.length) {
      set({ currentIndex: nextIndex, currentTime: 0, isPlaying: true })
      return
    }

    // 到末尾了
    if (auto && repeat === 'off') {
      set({ isPlaying: false, currentTime: 0, currentIndex: 0 })
      return
    }
    set({ currentIndex: 0, currentTime: 0, isPlaying: true })
  },

  prev: () => {
    const { tracks, currentIndex, currentTime } = get()
    if (tracks.length === 0) return

    // 播了 3 秒以上，先回到本首开头（和大多数播放器一致）
    if (currentTime > 3) {
      set({ currentTime: 0 })
      return
    }

    const prevIndex = currentIndex - 1
    set({
      currentIndex: prevIndex >= 0 ? prevIndex : tracks.length - 1,
      currentTime: 0,
      isPlaying: true,
    })
  },

  seek: (seconds) => {
    const duration = get().duration
    const safe = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds)
    set({ currentTime: safe, seekToken: get().seekToken + 1 })
  },

  setVolume: (volume) => {
    const safe = Math.min(Math.max(volume, 0), 1)
    const prefs = { ...readJSON<PlayerPrefs>(PREFS_KEY, DEFAULT_PREFS), volume: safe, muted: safe === 0 }
    writeJSON(PREFS_KEY, prefs)
    set({ volume: safe, muted: safe === 0 ? true : get().muted })
  },

  toggleMute: () => {
    const muted = !get().muted
    const prefs = { ...readJSON<PlayerPrefs>(PREFS_KEY, DEFAULT_PREFS), muted }
    writeJSON(PREFS_KEY, prefs)
    set({ muted })
  },

  setShuffle: (shuffle) => {
    writeJSON(PREFS_KEY, { ...readJSON<PlayerPrefs>(PREFS_KEY, DEFAULT_PREFS), shuffle })
    set({ shuffle })
  },

  setRepeat: (repeat) => {
    writeJSON(PREFS_KEY, { ...readJSON<PlayerPrefs>(PREFS_KEY, DEFAULT_PREFS), repeat })
    set({ repeat })
  },

  syncProgress: (currentTime, duration) => {
    set({ currentTime, duration: Number.isFinite(duration) ? duration : 0 })
  },

  handleEnded: () => {
    get().next(true)
  },

  addListeningTime: (ms) => set({ listeningMs: get().listeningMs + ms }),

  markRestReminded: () => set({ restReminded: true }),

  tuneRadio: () => {
    const channel = RADIO_CHANNELS[Math.floor(Math.random() * RADIO_CHANNELS.length)] ?? '沙沙声'
    set({ radioChannel: channel, isPlaying: false })
    return channel
  },

  stutter: (ms = 2000) => set({ glitchUntil: Date.now() + ms }),

  playAlien: (ms = 5000) => set({ alienUntil: Date.now() + ms, isPlaying: false }),

  clearEffects: () => set({ radioChannel: null, glitchUntil: 0, alienUntil: 0 }),

  /* ------------------------------------------------------------------
     实时电台
     ------------------------------------------------------------------ */

  playLiveStation: (station) =>
    set({
      liveStation: station,
      streamError: null,
      isPlaying: true,
      // 直播没有"进度"这个概念，把时长清零免得底部播放条画出一条假进度
      currentTime: 0,
      duration: 0,
      radioChannel: null,
    }),

  stopLiveStation: () => set({ liveStation: null, streamError: null, isPlaying: false }),

  setStreamError: (message) =>
    // 出错时只暂停，**不清空 liveStation** ——
    // 清了的话界面就退回"没在放任何东西"，看不到是哪个台丢了信号
    set({ streamError: message, isPlaying: false }),
}))

/** 当前这首歌（没有就返回 null） */
export function selectCurrentTrack(state: PlayerState): Track | null {
  return state.tracks[state.currentIndex] ?? null
}
