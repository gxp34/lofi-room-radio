import type { Metadata } from 'next'

import { GamesClient } from '@/components/games/games-client'
import { DEFAULT_GAMES } from '@/lib/constants'
import { isSupabaseConfigured } from '@/lib/env'
import { loadPuzzlePhotos, loadRadioDynamic } from '@/lib/games/sources'
import { rowToGame } from '@/lib/mappers'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { GameDef } from '@/types'

export const metadata: Metadata = {
  title: '摸鱼掌机',
  description: '2048、贪吃蛇、翻牌记忆、塔罗、照片拼图、调频。',
}

/**
 * 游戏厅。
 *
 * 游戏列表读数据库的 `games` 表 —— 这样后台能单独关掉某一个游戏，
 * 而不是只有「整个游戏厅开关」这一档。读不到（没配 Supabase）就用内置的。
 *
 * 用服务端渲染而不是客户端拉取：卡带选择是首屏就要看见的东西，
 * 让它闪一下再出现没有必要。
 *
 * 照片拼图和调频需要素材（公开手帐的照片、唱片架的歌名、树洞墙上的信），
 * 都在这里一次读好当 props 传下去 —— 那两个游戏是 ssr:false 的，
 * 让它们自己在客户端再请求要多一个来回，可见性过滤逻辑也会分成两份。
 */
export default async function GamesPage() {
  const [games, puzzlePhotos, radioDynamic] = await Promise.all([
    loadGames(),
    loadPuzzlePhotos(),
    loadRadioDynamic(),
  ])

  return (
    <GamesClient games={games} puzzlePhotos={puzzlePhotos} radioDynamic={radioDynamic} />
  )
}

/** 读已启用的游戏；查不到或没配数据库就退回内置列表 */
async function loadGames(): Promise<GameDef[]> {
  if (!isSupabaseConfigured) return DEFAULT_GAMES

  const supabase = createSupabaseServerClient()
  if (!supabase) return DEFAULT_GAMES

  try {
    // 显式只取 enabled = true：站长登录时 RLS 会放行全部，
    // 但前台应当和访客看到的一样，所以这里自己再筛一次
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('enabled', true)
      .order('sort', { ascending: true })

    if (error) {
      console.warn('[games] 读取失败，改用内置列表：', error.message)
      return DEFAULT_GAMES
    }

    if (!data || data.length === 0) return DEFAULT_GAMES

    return data.map(rowToGame)
  } catch (error) {
    console.warn('[games] 读取异常：', error)
    return DEFAULT_GAMES
  }
}
