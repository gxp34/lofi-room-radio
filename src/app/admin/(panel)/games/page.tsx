import { GameManager, type AdminGameCard } from '@/components/admin/game-manager'
import { AdminPage, EmptyState, StatCard } from '@/components/admin/ui'
import { isSupabaseConfigured } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * 后台 · 小游戏管理。
 *
 * 这里能看到的排行榜记录，只可能是访客主动提交上来的：
 * 前台的最高分存在浏览器 localStorage 里（/games 页面目前只写本地，这是预期行为），
 * 所以「记录条数一直是 0」不等于后台坏了。
 */

export const dynamic = 'force-dynamic'

/** 每个游戏最多列出的最近记录数 */
const RECENT_SCORE_LIMIT = 20

export default async function AdminGamesPage() {
  if (!isSupabaseConfigured) {
    return (
      <AdminPage title="小游戏" description="掌机里三个小游戏的开关、说明与排行榜。">
        <EmptyState
          title="还没连上数据库"
          description="请在 .env.local 里填好 NEXT_PUBLIC_SUPABASE_URL 与 ANON KEY，并执行 0001–0005 的 SQL。"
        />
      </AdminPage>
    )
  }

  const games = await loadGames()
  const enabledCount = games.filter((game) => game.enabled).length
  const totalScores = games.reduce((sum, game) => sum + game.scoreCount, 0)

  return (
    <AdminPage title="小游戏" description="开关游戏、改名字和说明、清理访客提交上来的排行榜记录。">
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            label="启用中的游戏"
            value={`${enabledCount} / ${games.length}`}
            hint="关掉的游戏在前台掌机里看不到"
          />
          <StatCard
            label="排行榜记录"
            value={totalScores}
            hint="全部来自访客主动提交的分数"
          />
        </div>

        <p className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3 text-xs leading-relaxed text-dust">
          前台最高分存在访客浏览器的 localStorage 里，换台设备就没了 —— /games
          页面目前只写本地，这是预期行为。下面列出的排行榜是访客
          <b className="text-paper/80">主动提交</b>之后才会有的数据，所以条数可能一直是 0。
        </p>

        <GameManager games={games} />
      </div>
    </AdminPage>
  )
}

/* --------------------------------------------------------------------------
   读数据
   -------------------------------------------------------------------------- */

async function loadGames(): Promise<AdminGameCard[]> {
  const supabase = createSupabaseServerClient()
  if (!supabase) return []

  try {
    const { data: rows, error } = await supabase
      .from('games')
      .select('*')
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('[admin/games] 读取游戏失败：', error.message)
      return []
    }

    const games = rows ?? []

    // 每个游戏三条查询：最近 20 条、总条数、最高分。
    // Promise.all 一起发，别在循环里 await（那样三个游戏要串九次）。
    return await Promise.all(
      games.map(async (game) => {
        const [recent, countResult, bestResult] = await Promise.all([
          supabase
            .from('game_scores')
            .select('*')
            .eq('game_slug', game.slug)
            .order('created_at', { ascending: false })
            .limit(RECENT_SCORE_LIMIT),
          supabase
            .from('game_scores')
            .select('*', { count: 'exact', head: true })
            .eq('game_slug', game.slug),
          supabase
            .from('game_scores')
            .select('score')
            .eq('game_slug', game.slug)
            .order('score', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])

        if (recent.error) console.warn('[admin/games] 读取排行榜失败：', recent.error.message)
        if (countResult.error) console.warn('[admin/games] 统计排行榜失败：', countResult.error.message)
        if (bestResult.error) console.warn('[admin/games] 读取最高分失败：', bestResult.error.message)

        return {
          slug: game.slug,
          name: game.name,
          description: game.description,
          enabled: game.enabled,
          sort: game.sort,
          bestScore: bestResult.data?.score ?? 0,
          scoreCount: countResult.count ?? 0,
          recentScores: (recent.data ?? []).map((score) => ({
            id: score.id,
            playerName: score.player_name,
            score: score.score,
            createdAtLabel: formatScoreTime(score.created_at),
          })),
        }
      }),
    )
  } catch (error) {
    console.warn('[admin/games] 读取异常：', error)
    return []
  }
}

/**
 * 时间格式化。
 *
 * 刻意在服务端算好、按北京时间显示，而不是在客户端用 toLocaleString：
 * Vercel 上的服务器时区是 UTC，浏览器是 UTC+8，两边各算一次会导致 hydration 对不上。
 */
function formatScoreTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return beijing.toISOString().slice(0, 16).replace('T', ' ')
}
