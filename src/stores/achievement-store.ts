'use client'

import { create } from 'zustand'

import { evaluateAchievements, type AchievementContext } from '@/lib/achievements'
import { DEFAULT_ACHIEVEMENTS, STORAGE_KEYS } from '@/lib/constants'
import { readJSON, writeJSON } from '@/lib/storage'
import type { AchievementDef } from '@/types'

/**
 * 成就状态。
 *
 * 解锁记录存在 localStorage；登录后台后可以同步到数据库的
 * user_achievements 表（第三批做）。没登录也照样能玩，只是记录在本地。
 */

const UNLOCKED_KEY = STORAGE_KEYS.achievements

interface AchievementState {
  hydrated: boolean
  /** achievement key → 解锁时间（ISO 字符串） */
  unlocked: Record<string, string>
  /** 成就定义（来自数据库，读不到就用内置的） */
  definitions: AchievementDef[]
  /** 刚才新解锁的成就（用来弹提示，展示完调用 consumeNewlyUnlocked 清掉） */
  newlyUnlocked: AchievementDef[]

  /** 听过多少首不同的歌 */
  playedTrackIds: string[]
  /** 往树洞投过几次 */
  treeholeCount: number
  /** 各小游戏最高分（本地缓存，和 localStorage 保持同步） */
  bestScores: Record<string, number>

  hydrate: () => void
  setDefinitions: (defs: AchievementDef[]) => void
  /** 直接解锁一个成就；已解锁返回 false */
  unlock: (key: string) => boolean
  /** 根据当前状态批量判定，返回新解锁的 key */
  evaluate: (ctx: Omit<AchievementContext, 'bestScores'> & { bestScores?: Record<string, number> }) => string[]
  /** 记一首听过的歌，返回听过的总数 */
  registerTrackPlay: (trackId: string) => number
  /** 树洞投递 +1 */
  incrementTreehole: () => number
  setBestScore: (slug: string, score: number) => void
  consumeNewlyUnlocked: () => void
  reset: () => void
}

export const useAchievementStore = create<AchievementState>((set, get) => ({
  hydrated: false,
  unlocked: {},
  definitions: DEFAULT_ACHIEVEMENTS,
  newlyUnlocked: [],
  playedTrackIds: [],
  treeholeCount: 0,
  bestScores: {},

  hydrate: () => {
    if (get().hydrated) return
    const unlocked = readJSON<Record<string, string>>(UNLOCKED_KEY, {})
    const bestScores = readJSON<Record<string, number>>(STORAGE_KEYS.gameScores, {})
    set({ hydrated: true, unlocked, bestScores })
  },

  setDefinitions: (defs) => {
    if (defs.length > 0) set({ definitions: defs })
  },

  unlock: (key) => {
    if (get().unlocked[key]) return false

    const unlocked = { ...get().unlocked, [key]: new Date().toISOString() }
    writeJSON(UNLOCKED_KEY, unlocked)

    const definition = get().definitions.find((item) => item.key === key)
    set({
      unlocked,
      newlyUnlocked: definition ? [...get().newlyUnlocked, definition] : get().newlyUnlocked,
    })
    return true
  },

  evaluate: (ctx) => {
    const state = get()
    const candidates = evaluateAchievements({
      ...ctx,
      bestScores: ctx.bestScores ?? state.bestScores,
    })

    const fresh = candidates.filter((key) => !state.unlocked[key])
    if (fresh.length === 0) return []

    const unlocked = { ...state.unlocked }
    const now = new Date().toISOString()
    for (const key of fresh) unlocked[key] = now
    writeJSON(UNLOCKED_KEY, unlocked)

    const newlyUnlocked = [
      ...state.newlyUnlocked,
      ...fresh
        .map((key) => state.definitions.find((item) => item.key === key))
        .filter((item): item is AchievementDef => Boolean(item)),
    ]

    set({ unlocked, newlyUnlocked })
    return fresh
  },

  registerTrackPlay: (trackId) => {
    const ids = get().playedTrackIds
    if (ids.includes(trackId)) return ids.length

    const next = [...ids, trackId]
    set({ playedTrackIds: next })
    return next.length
  },

  incrementTreehole: () => {
    const next = get().treeholeCount + 1
    set({ treeholeCount: next })
    return next
  },

  setBestScore: (slug, score) => {
    const bestScores = { ...get().bestScores, [slug]: Math.max(get().bestScores[slug] ?? 0, score) }
    writeJSON(STORAGE_KEYS.gameScores, bestScores)
    set({ bestScores })
  },

  consumeNewlyUnlocked: () => set({ newlyUnlocked: [] }),

  reset: () => {
    writeJSON(UNLOCKED_KEY, {})
    set({ unlocked: {}, newlyUnlocked: [], playedTrackIds: [], treeholeCount: 0, bestScores: {} })
  },
}))
