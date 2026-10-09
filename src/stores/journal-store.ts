'use client'

import { create } from 'zustand'

/**
 * 图文手帐的临时状态。
 *
 * 房间里的随机事件（猫踩到手帐、翻页掉出旧照片、照片背面有字、雨夜照片变暗、
 * 抽屉里翻出旧手帐）需要让**手帐页面**做出反应，但事件是在房间那边触发的。
 * 所以状态放这里，两边共用；用时间戳而不是布尔值，
 * 因为「连续踩两次」也要能各触发一次动画 —— 布尔值会被 React 合并掉。
 */

interface JournalState {
  /** 猫踩上去（爪印） */
  pawAt: number
  /** 翻页掉出一张旧照片 */
  photoFallAt: number
  fallPhotoCaption: string | null
  /** 照片背面有字 */
  backTextAt: number
  backText: string | null
  /** 雨夜照片变暗 */
  dimUntil: number
  /** 从抽屉里翻出一本旧手帐（前台会把最旧的一篇高亮出来） */
  oldFindAt: number

  triggerPaw: () => void
  triggerPhotoFall: (caption?: string) => void
  triggerBackText: (text: string) => void
  triggerDim: (ms?: number) => void
  triggerOldFind: () => void
  clear: () => void
}

/** 照片背面的字：随机挑一句 */
export const BACK_TEXTS = [
  '「那天也在下雨。」',
  '「拍完这张，我们就走了。」',
  '「别删。」',
  '「洗出来才发现拍歪了。」',
  '「某人说这张最像我。」',
  '「忘了是几月，反正是很冷的时候。」',
] as const

export const useJournalStore = create<JournalState>((set) => ({
  pawAt: 0,
  photoFallAt: 0,
  fallPhotoCaption: null,
  backTextAt: 0,
  backText: null,
  dimUntil: 0,
  oldFindAt: 0,

  triggerPaw: () => set({ pawAt: Date.now() }),

  triggerPhotoFall: (caption) =>
    set({ photoFallAt: Date.now(), fallPhotoCaption: caption ?? '一张不知道什么时候拍的' }),

  triggerBackText: (text) => set({ backTextAt: Date.now(), backText: text }),

  triggerDim: (ms = 12_000) => set({ dimUntil: Date.now() + ms }),

  triggerOldFind: () => set({ oldFindAt: Date.now() }),

  clear: () =>
    set({
      pawAt: 0,
      photoFallAt: 0,
      fallPhotoCaption: null,
      backTextAt: 0,
      backText: null,
      dimUntil: 0,
      oldFindAt: 0,
    }),
}))
