import { AdminPage, EmptyState } from '@/components/admin/ui'
import { AchievementManager } from '@/components/admin/achievement-manager'
import { isSupabaseConfigured } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Tables } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * 成就管理。
 *
 * 除了成就定义本身，还要统计「已解锁总数」—— 那个数字来自 user_achievements，
 * 是判断成就是不是真的有人拿到过的唯一依据。
 */
export default async function AdminAchievementsPage() {
  if (!isSupabaseConfigured) {
    return (
      <AdminPage title="成就" description="软木板上那排小徽章。">
        <EmptyState
          title="还没连上数据库"
          description="请在 .env.local 里填好 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY，并执行 0001–0005 的 SQL。"
        />
      </AdminPage>
    )
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) {
    return (
      <AdminPage title="成就">
        <EmptyState
          title="读不到数据库连接"
          description="环境变量可能只在构建时生效，重启一下开发服务器再试。"
        />
      </AdminPage>
    )
  }

  const achievements = await loadAchievements(supabase)
  const unlockedTotal = await countUnlocked(supabase)

  return (
    <AdminPage
      title="成就"
      description="名字、描述、图标、是否隐藏。删除会连带清掉所有人的解锁记录，动手前想一下。"
    >
      <AchievementManager achievements={achievements} unlockedTotal={unlockedTotal} />
    </AdminPage>
  )
}

/** 读成就定义；出错就返回空数组（页面上会提示补全内置成就） */
async function loadAchievements(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
): Promise<Tables<'achievements'>[]> {
  try {
    const { data, error } = await supabase
      .from('achievements')
      .select('*')
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('[admin/achievements] 读取失败：', error.message)
      return []
    }

    return data ?? []
  } catch (error) {
    console.warn('[admin/achievements] 读取异常：', error)
    return []
  }
}

/** 统计解锁记录总数（一行一条「某人解锁了某成就」） */
async function countUnlocked(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('user_achievements')
      .select('id', { count: 'exact', head: true })

    if (error) {
      console.warn('[admin/achievements] 解锁统计失败：', error.message)
      return 0
    }

    return count ?? 0
  } catch (error) {
    console.warn('[admin/achievements] 解锁统计异常：', error)
    return 0
  }
}
