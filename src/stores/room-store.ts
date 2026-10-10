'use client'

import { create } from 'zustand'

import { STORAGE_KEYS } from '@/lib/constants'
import { readJSON, writeJSON } from '@/lib/storage'
import { isSoundEnabled, setSoundEnabled as persistSoundEnabled } from '@/lib/audio/sfx'
import type { LightsMode } from '@/types'
import type { SkyPhase } from '@/types/external'

/**
 * 房间状态：灯、猫、环境效果、声音开关。
 *
 * 为什么用时间戳而不是布尔值？
 * 「灯泡闪一下」这种效果需要一个**每次都会变的值**来触发 React 的副作用，
 * 用 true/false 的话连续闪两次会被 React 合并掉。时间戳天然唯一。
 */

export type RainLevel = 'none' | 'light' | 'normal' | 'heavy'
export type AmbientKind = 'light_flicker' | 'car_light' | 'notes_fall' | 'phone_buzz' | 'moon_move'

export interface AmbientState {
  /** 雨势。'none' = 雨停了（真拿到天气且是晴天时才会出现） */
  rain: RainLevel
  /** 各环境效果的最近触发时间戳 */
  lightFlickerAt: number
  carLightAt: number
  notesFallAt: number
  phoneBuzzAt: number
  moonMoveAt: number
  /** 月亮横向偏移（百分比），每次「月亮移动」累加 */
  moonShift: number
  /**
   * 一天里的时段，来自外部数据（日出日落算出来的）。
   * null = 还没拿到 → 房间按默认的夜色渲染。
   * 它只影响色调，不影响任何交互，所以拿不到完全没损失。
   */
  skyPhase: SkyPhase | null
  /** 温度，只用于显示 */
  temperature: number | null
  /** 天气是不是真的拿到了（false = 降级成「雨」） */
  weatherLive: boolean
}

const DEFAULT_AMBIENT: AmbientState = {
  rain: 'normal',
  lightFlickerAt: 0,
  carLightAt: 0,
  notesFallAt: 0,
  phoneBuzzAt: 0,
  moonMoveAt: 0,
  moonShift: 0,
  skyPhase: null,
  temperature: null,
  weatherLive: false,
}

const LIGHTS_KEY = STORAGE_KEYS.lights

interface RoomState {
  /** 是否已经从 localStorage 恢复过 */
  hydrated: boolean
  /** 灯：开 / 关 / 月光色 */
  lights: LightsMode
  /** 猫在不在（「猫走了」事件会临时把它藏起来） */
  catPresent: boolean
  /** 是否处于跳闸黑屏状态 */
  powerTrip: boolean
  /** 环境效果 */
  ambient: AmbientState
  /** 猫踩键盘写进日记的乱码 */
  diaryGlitch: string | null
  /** 声音开关（与 sfx 模块同步） */
  soundEnabled: boolean

  hydrate: () => void
  setLights: (mode: LightsMode) => void
  toggleLights: () => LightsMode
  setCatPresent: (present: boolean) => void
  setPowerTrip: (tripped: boolean) => void
  setRain: (level: RainLevel) => void
  /** 把外部那半（天气 / 时段）写进房间 */
  setExternalSky: (input: {
    rain: RainLevel
    skyPhase: SkyPhase | null
    temperature: number | null
    weatherLive: boolean
  }) => void
  /** 触发一个环境效果 */
  triggerAmbient: (kind: AmbientKind) => void
  setDiaryGlitch: (text: string | null) => void
  toggleSound: () => boolean
}

export const useRoomStore = create<RoomState>((set, get) => ({
  hydrated: false,
  lights: 'on',
  catPresent: true,
  powerTrip: false,
  ambient: DEFAULT_AMBIENT,
  diaryGlitch: null,
  soundEnabled: false,

  hydrate: () => {
    if (get().hydrated) return
    const lights = readJSON<LightsMode>(LIGHTS_KEY, 'on')
    set({
      hydrated: true,
      lights: lights === 'off' || lights === 'moon' || lights === 'on' ? lights : 'on',
      soundEnabled: isSoundEnabled(),
    })
  },

  setLights: (mode) => {
    writeJSON(LIGHTS_KEY, mode)
    set({ lights: mode })
  },

  toggleLights: () => {
    const next: LightsMode = get().lights === 'on' ? 'off' : 'on'
    writeJSON(LIGHTS_KEY, next)
    set({ lights: next })
    return next
  },

  setCatPresent: (present) => set({ catPresent: present }),
  setPowerTrip: (tripped) => set({ powerTrip: tripped }),

  setRain: (level) => set((state) => ({ ambient: { ...state.ambient, rain: level } })),

  /**
   * 把外部那半（天气 + 时段）写进房间。
   *
   * 天气功能关着、或者没拿到时，调用方会传 weatherLive: false 和 rain: 'normal'，
   * 也就是**回到这个站原本的样子**（窗外在下雨）。
   */
  setExternalSky: (input) =>
    set((state) => ({
      ambient: {
        ...state.ambient,
        rain: input.rain,
        skyPhase: input.skyPhase,
        temperature: input.temperature,
        weatherLive: input.weatherLive,
      },
    })),

  triggerAmbient: (kind) => {
    const now = Date.now()
    set((state) => {
      const ambient = { ...state.ambient }
      switch (kind) {
        case 'light_flicker':
          ambient.lightFlickerAt = now
          break
        case 'car_light':
          ambient.carLightAt = now
          break
        case 'notes_fall':
          ambient.notesFallAt = now
          break
        case 'phone_buzz':
          ambient.phoneBuzzAt = now
          break
        case 'moon_move':
          ambient.moonMoveAt = now
          // 每次往左挪 6%，挪到头再从右边回来
          ambient.moonShift = (ambient.moonShift + 6) % 42
          break
      }
      return { ambient }
    })
  },

  setDiaryGlitch: (text) => set({ diaryGlitch: text }),

  toggleSound: () => {
    const next = !get().soundEnabled
    persistSoundEnabled(next)
    set({ soundEnabled: next })
    return next
  },
}))
