import type { Json } from '@/types'

/** 仪表盘用的一组数字（与 0005_admin_stats.sql 的返回结构一一对应） */
export interface AdminOverview {
  visitsToday: number
  visits7d: number
  visitsTotal: number
  sessionsTotal: number
  treeholePending: number
  treeholeTotal: number
  treeholeFlagged: number
  diariesTotal: number
  diariesPublic: number
  tracksTotal: number
  tracksPublic: number
  playTotal: number
  topTracks: { id: string; title: string; playCount: number }[]
  eventsTotal: number
  achievementsTotal: number
  mediaTotal: number
}

const EMPTY: AdminOverview = {
  visitsToday: 0,
  visits7d: 0,
  visitsTotal: 0,
  sessionsTotal: 0,
  treeholePending: 0,
  treeholeTotal: 0,
  treeholeFlagged: 0,
  diariesTotal: 0,
  diariesPublic: 0,
  tracksTotal: 0,
  tracksPublic: 0,
  playTotal: 0,
  topTracks: [],
  eventsTotal: 0,
  achievementsTotal: 0,
  mediaTotal: 0,
}

function num(source: Record<string, Json | undefined>, key: string): number {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function str(source: Record<string, Json | undefined>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value : ''
}

/**
 * 把数据库返回的 jsonb 规整成强类型对象。
 * 数据库里少一个字段、或者类型不对，都会退回 0 —— 后台不会因为一条统计坏掉而白屏。
 */
export function parseOverview(value: Json | null | undefined): AdminOverview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY

  const source = value as Record<string, Json | undefined>
  const topTracksRaw = source.top_tracks

  const topTracks = Array.isArray(topTracksRaw)
    ? topTracksRaw
        .filter(
          (item): item is Record<string, Json | undefined> =>
            Boolean(item) && typeof item === 'object' && !Array.isArray(item),
        )
        .map((item) => ({
          id: str(item, 'id'),
          title: str(item, 'title') || '（没有标题）',
          playCount: num(item, 'play_count'),
        }))
    : []

  return {
    visitsToday: num(source, 'visits_today'),
    visits7d: num(source, 'visits_7d'),
    visitsTotal: num(source, 'visits_total'),
    sessionsTotal: num(source, 'sessions_total'),
    treeholePending: num(source, 'treehole_pending'),
    treeholeTotal: num(source, 'treehole_total'),
    treeholeFlagged: num(source, 'treehole_flagged'),
    diariesTotal: num(source, 'diaries_total'),
    diariesPublic: num(source, 'diaries_public'),
    tracksTotal: num(source, 'tracks_total'),
    tracksPublic: num(source, 'tracks_public'),
    playTotal: num(source, 'play_total'),
    topTracks,
    eventsTotal: num(source, 'events_total'),
    achievementsTotal: num(source, 'achievements_total'),
    mediaTotal: num(source, 'media_total'),
  }
}

export { EMPTY as EMPTY_OVERVIEW }
