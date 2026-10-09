import type { Metadata } from 'next'

import { GamesClient } from '@/components/games/games-client'
import { DEFAULT_GAMES } from '@/lib/constants'
import { isSupabaseConfigured } from '@/lib/env'
import { rowToGame } from '@/lib/mappers'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { GameDef } from '@/types'

export const metadata: Metadata = {
  title: '摸鱼掌机',
  description: '2048、贪吃蛇、翻牌记忆。',
}

/**
 * 游戏厅。
 *
 * 游戏列表读数据库的 `games` 表 —— 这样后台能单独关掉某一个游戏，
 * 而不是只有「整个游戏厅开关」这一档。读不到（没配 Supabase）就用内置的三个。
 *
 * 用服务端渲染而不是客户端拉取：卡带选择是首屏就要看见的东西，
 * 让它闪一下再出现没有必要。
 */
export default async function GamesPage() {
  const games = await loadGames()

  return <GamesClient games={games} />
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
