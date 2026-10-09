import { AdminPage, EmptyState } from '@/components/admin/ui'
import { TreeholeManager } from '@/components/admin/treehole-manager'
import { isSupabaseConfigured } from '@/lib/env'
import { rowToTreeholeMessage } from '@/lib/mappers'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { TreeholeMessage } from '@/types'

export const dynamic = 'force-dynamic'

export default async function AdminTreeholePage() {
  if (!isSupabaseConfigured) {
    return (
      <AdminPage title="树洞">
        <EmptyState
          title="还没连上数据库"
          description="请在 .env.local 里填好 Supabase 的两项配置，并执行 0001–0005 的 SQL。"
        />
      </AdminPage>
    )
  }

  const messages = await loadMessages()
  const pending = messages.filter((item) => !item.isApproved && !item.isHidden).length

  return (
    <AdminPage
      title="树洞"
      description={
        pending > 0
          ? `有 ${pending} 封信在等你。审核通过后才会出现在树洞墙上。`
          : '抽屉里的信都看过了。'
      }
    >
      <TreeholeManager messages={messages} />
    </AdminPage>
  )
}

/**
 * 读全部投稿（含未审核、已隐藏）。
 * 排序刻意放在 JS 里做：待审的排最前，然后带敏感词标记的往前，
 * 最后才按时间倒序 —— 让「需要你处理的东西」先出现。
 */
async function loadMessages(): Promise<TreeholeMessage[]> {
  const supabase = createSupabaseServerClient()
  if (!supabase) return []

  try {
    const { data, error } = await supabase
      .from('treehole_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.warn('[admin/treehole] 读取失败：', error.message)
      return []
    }

    const rows = data ?? []
    if (rows.length === 0) return []

    const ids = rows.map((row) => row.id)
    const { data: replies } = await supabase
      .from('treehole_replies')
      .select('*')
      .in('message_id', ids)
      .order('created_at', { ascending: true })

    const repliesByMessage = new Map<string, typeof replies>()
    for (const reply of replies ?? []) {
      const list = repliesByMessage.get(reply.message_id) ?? []
      list.push(reply)
      repliesByMessage.set(reply.message_id, list)
    }

    return rows
      .map((row) => rowToTreeholeMessage(row, repliesByMessage.get(row.id) ?? []))
      .sort((a, b) => {
        const scoreOf = (item: TreeholeMessage) => {
          if (!item.isApproved && !item.isHidden) return item.isFlagged ? 0 : 1
          if (item.isFlagged) return 2
          return 3
        }
        const diff = scoreOf(a) - scoreOf(b)
        if (diff !== 0) return diff
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  } catch (error) {
    console.warn('[admin/treehole] 读取异常：', error)
    return []
  }
}
