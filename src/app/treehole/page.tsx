import type { Metadata } from 'next'
import { unstable_noStore as noStore } from 'next/cache'

import { TreeholeForm } from '@/components/treehole/treehole-form'
import { TreeholeWall } from '@/components/treehole/treehole-wall'
import { rowToTreeholeMessage } from '@/lib/mappers'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { TreeholeMessage } from '@/types'

export const metadata: Metadata = {
  title: '深夜抽屉',
  description: '匿名投递的树洞，会认真读完。',
}

/**
 * 深夜抽屉（树洞）。
 *
 * 左边是「墙上」已经公开的信，右边（手机上是下面）是投递表单。
 */
export default async function TreeholePage() {
  const messages = await loadWall()

  return (
    <div className="container py-8 sm:py-12">
      <header className="mb-8">
        <p className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-dust">
          {'// 深夜抽屉'}
        </p>
        <h1 className="font-display text-2xl text-paper sm:text-3xl">床头信箱</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          不用登录、不用留名字。写什么都可以，包括「不知道写什么」。
          投进来的信我会一封一封读完。
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* 墙 */}
        <section aria-labelledby="wall-heading">
          <h2 id="wall-heading" className="mb-4 font-display text-lg text-lamp">
            {'// 树洞墙'}
          </h2>
          <TreeholeWall messages={messages} />
        </section>

        {/* 表单 */}
        <section aria-labelledby="form-heading">
          <h2 id="form-heading" className="sr-only">
            投递
          </h2>
          <TreeholeForm />
        </section>
      </div>
    </div>
  )
}

/**
 * 读树洞墙。
 * RLS 已经保证了「未审核 / 已隐藏 / 被举报」的留言读不出来，
 * 这里不需要再过滤一遍 —— 但为了意图清晰，还是显式写一下。
 */
async function loadWall(): Promise<TreeholeMessage[]> {
  // 树洞墙随时可能有新留言通过审核，不要静态化
  noStore()

  const supabase = createSupabaseServerClient()
  if (!supabase) return []

  try {
    const { data, error } = await supabase
      .from('treehole_messages')
      .select('*')
      .eq('visibility', 'public')
      .eq('is_approved', true)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(60)

    if (error) {
      console.warn('[treehole] 读取树洞墙失败：', error.message)
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

    return rows.map((row) => rowToTreeholeMessage(row, repliesByMessage.get(row.id) ?? []))
  } catch (error) {
    console.warn('[treehole] 读取树洞墙异常：', error)
    return []
  }
}
