import { loadJournalEntries } from '@/lib/journal-data'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { PuzzlePhoto } from '@/lib/games/puzzle'
import type { RadioDynamicData } from '@/components/games/game-radio'

/**
 * 小游戏的素材来源（**服务端**读，然后当 props 传下去）。
 *
 * 为什么不在客户端拉：
 *   1. 游戏组件是 `dynamic(..., { ssr: false })` 的，在客户端自己请求要多一个来回；
 *   2. 手帐照片的可见性判断已经在服务端有一套（RLS + 显式过滤），
 *      再在客户端写一遍过滤逻辑迟早会不一致。
 *
 * ⚠️ 拼图只喂**公开**手帐的照片。站长登录时 loadJournalEntries() 会把
 * 私密手帐也带回来（RLS 放行），所以这里必须自己再筛一次 ——
 * 否则私密手帐的照片会被拼进一个谁都能看到的小游戏里。
 */

/** 拼图最多用几张照片（够随机了，也不至于把整页数据都拖进来） */
const MAX_PUZZLE_PHOTOS = 12

export async function loadPuzzlePhotos(): Promise<PuzzlePhoto[]> {
  const entries = await loadJournalEntries()

  const photos: PuzzlePhoto[] = []
  for (const entry of entries) {
    if (entry.visibility !== 'public') continue

    for (const photo of entry.photos) {
      const url = photo.url ?? photo.thumbUrl
      if (!url) continue
      photos.push({
        url,
        caption: photo.caption ?? null,
        entryTitle: entry.title,
      })
      if (photos.length >= MAX_PUZZLE_PHOTOS) return photos
    }
  }

  return photos
}

/** 调频用的真实素材量 */
const MAX_TRACKS = 12
const MAX_ECHOES = 8

export async function loadRadioDynamic(): Promise<RadioDynamicData> {
  const supabase = createSupabaseServerClient()
  if (!supabase) return { tracks: [], echoes: [] }

  const [tracksResult, echoesResult] = await Promise.all([
    supabase
      .from('tracks')
      .select('title')
      .eq('visibility', 'public')
      .order('sort', { ascending: true })
      .limit(MAX_TRACKS),
    supabase
      .from('treehole_messages')
      .select('content')
      .eq('is_approved', true)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(MAX_ECHOES),
  ])

  if (tracksResult.error) {
    console.warn('[games] 读唱片失败（调频的点歌台会退化成空台）：', tracksResult.error.message)
  }
  if (echoesResult.error) {
    console.warn('[games] 读树洞失败（调频的树洞回音会退化成空台）：', echoesResult.error.message)
  }

  return {
    tracks: (tracksResult.data ?? []).map((row) => row.title).filter(Boolean),
    // 树洞内容可能很长，截断一下 —— 电台念不了三千字
    echoes: (echoesResult.data ?? [])
      .map((row) => (row.content ?? '').trim().replace(/\s+/g, ' '))
      .filter((line) => line.length > 0)
      .map((line) => (line.length > 60 ? `${line.slice(0, 60)}…` : line)),
  }
}
