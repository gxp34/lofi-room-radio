import { AdminPage, EmptyState } from '@/components/admin/ui'
import { EventManager } from '@/components/admin/event-manager'
import { isSupabaseConfigured } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Tables } from '@/types'

export const dynamic = 'force-dynamic'

/**
 * 事件池管理。
 *
 * 服务端负责取全量事件（按 sort 升序），筛选与编辑都在客户端的 EventManager 里做 ——
 * 事件池是几十到几百条的量级，一次全取回来比每次筛选都打一次数据库更省事。
 */
export default async function AdminEventsPage() {
  if (!isSupabaseConfigured) {
    return (
      <AdminPage title="事件池" description="房间会说什么话，都由这里决定。">
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
      <AdminPage title="事件池">
        <EmptyState
          title="读不到数据库连接"
          description="环境变量可能只在构建时生效，重启一下开发服务器再试。"
        />
      </AdminPage>
    )
  }

  const events = await loadEvents(supabase)

  return (
    <AdminPage
      title="事件池"
      description="点台灯、摸猫、长按唱片机时房间会说什么。改动会在前台下一次刷新后生效。"
    >
      <EventManager events={events} />
    </AdminPage>
  )
}

/** 读事件池；出错就返回空数组（页面上会显示「事件池是空的」并提示导入） */
async function loadEvents(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>,
): Promise<Tables<'events'>[]> {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('sort', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      console.warn('[admin/events] 读取失败：', error.message)
      return []
    }

    return data ?? []
  } catch (error) {
    console.warn('[admin/events] 读取异常：', error)
    return []
  }
}
