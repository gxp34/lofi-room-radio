import { STORAGE_KEYS } from '@/lib/constants'
import { readJSON, writeJSON } from '@/lib/storage'
import type { GameScoreRecord } from '@/types'

/**
 * 小游戏最高分（存在本地）。
 * 服务端读不到，所以组件要用 useHighScores() 这种「先默认值、再 hydration」的姿势。
 */

export type HighScoreMap = Record<string, number>

/** 读全部最高分 */
export function readHighScores(): HighScoreMap {
  const raw = readJSON<Record<string, unknown>>(STORAGE_KEYS.gameScores, {})
  const result: HighScoreMap = {}
  for (const [slug, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      result[slug] = Math.floor(value)
    }
  }
  return result
}

/** 读某个游戏的历史最高分 */
export function readHighScore(slug: string): number {
  return readHighScores()[slug] ?? 0
}

/**
 * 提交一局分数。
 * 只有刷新纪录才会写入，返回 { best, isNewRecord }。
 */
export function submitScore(slug: string, score: number): { best: number; isNewRecord: boolean } {
  const safeScore = Number.isFinite(score) && score > 0 ? Math.floor(score) : 0
  const all = readHighScores()
  const previous = all[slug] ?? 0

  if (safeScore > previous) {
    all[slug] = safeScore
    writeJSON(STORAGE_KEYS.gameScores, all)
    return { best: safeScore, isNewRecord: true }
  }

  return { best: previous, isNewRecord: false }
}

/** 清空某个游戏的纪录（后台/调试用） */
export function clearHighScore(slug: string): void {
  const all = readHighScores()
  delete all[slug]
  writeJSON(STORAGE_KEYS.gameScores, all)
}

/** 所有纪录明细（后台展示用） */
export function listScoreRecords(): GameScoreRecord[] {
  const all = readHighScores()
  return Object.entries(all).map(([slug, score]) => ({
    slug,
    score,
    at: new Date().toISOString(),
  }))
}
