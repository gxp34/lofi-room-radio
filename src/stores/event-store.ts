'use client'

import { create } from 'zustand'

import { COMBO_WINDOW_MS, STORAGE_KEYS } from '@/lib/constants'
import { applyEventToLedger, type EventLedger } from '@/lib/events/engine'
import { readJSON, writeJSON } from '@/lib/storage'
import type { EventToastItem, Rarity, RoomEvent } from '@/types'

/**
 * 事件账本 + 事件气泡。
 *
 * 账本（已触发 / 冷却 / 点击次数 / 连点）会写进 localStorage，
 * 所以「一辈子只触发一次」的文案刷新页面也不会重复出现。
 */

const FIRED_KEY = STORAGE_KEYS.firedEvents
const COOLDOWN_KEY = STORAGE_KEYS.cooldowns
const CLICK_KEY = STORAGE_KEYS.clickCount

/** 屏幕上最多同时挂几条气泡 */
const MAX_TOASTS = 4

interface ComboRecord {
  count: number
  lastAt: number
}

interface EventState extends EventLedger {
  hydrated: boolean
  /** 各物件累计被点次数 */
  clickCount: Record<string, number>
  /** 各物件的连点计数（带时间窗） */
  combos: Record<string, ComboRecord>
  /** 屏幕上飘着的事件气泡 */
  toasts: EventToastItem[]

  hydrate: () => void
  /** 记一次点击，返回累计次数 */
  bumpClick: (objectType: string) => number
  /** 记一次连点，返回时间窗内的连点次数 */
  bumpCombo: (objectType: string) => number
  /** 把某条事件写进账本 */
  commitEvent: (event: RoomEvent, now?: Date) => void
  /** 往屏幕上推一条气泡 */
  pushToast: (text: string, rarity: Rarity, objectType: string) => void
  dismissToast: (id: string) => void
  /** 清空全部本地记录（后台/调试用） */
  reset: () => void
}

let toastSeq = 0

export const useEventStore = create<EventState>((set, get) => ({
  hydrated: false,
  fired: {},
  cooldowns: {},
  clickCount: {},
  combos: {},
  toasts: [],

  hydrate: () => {
    if (get().hydrated) return
    set({
      hydrated: true,
      fired: readJSON<Record<string, number>>(FIRED_KEY, {}),
      cooldowns: readJSON<Record<string, number>>(COOLDOWN_KEY, {}),
      clickCount: readJSON<Record<string, number>>(CLICK_KEY, {}),
    })
  },

  bumpClick: (objectType) => {
    const next = (get().clickCount[objectType] ?? 0) + 1
    const clickCount = { ...get().clickCount, [objectType]: next }
    writeJSON(CLICK_KEY, clickCount)
    set({ clickCount })
    return next
  },

  bumpCombo: (objectType) => {
    const now = Date.now()
    const previous = get().combos[objectType]
    const count =
      previous && now - previous.lastAt <= COMBO_WINDOW_MS ? previous.count + 1 : 1

    set({ combos: { ...get().combos, [objectType]: { count, lastAt: now } } })
    return count
  },

  commitEvent: (event, now = new Date()) => {
    const ledger: EventLedger = { fired: get().fired, cooldowns: get().cooldowns }
    const next = applyEventToLedger(ledger, event, now)

    writeJSON(FIRED_KEY, next.fired)
    writeJSON(COOLDOWN_KEY, next.cooldowns)

    set({ fired: next.fired, cooldowns: next.cooldowns })
  },

  pushToast: (text, rarity, objectType) => {
    toastSeq += 1
    const item: EventToastItem = {
      id: `toast-${Date.now()}-${toastSeq}`,
      text,
      rarity,
      objectType,
      createdAt: Date.now(),
    }

    // 新的在上面；超过上限就从最旧的开始丢
    set({ toasts: [item, ...get().toasts].slice(0, MAX_TOASTS) })
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),

  reset: () => {
    writeJSON(FIRED_KEY, {})
    writeJSON(COOLDOWN_KEY, {})
    writeJSON(CLICK_KEY, {})
    set({ fired: {}, cooldowns: {}, clickCount: {}, combos: {}, toasts: [] })
  },
}))
