import type { Metadata } from 'next'
import { unstable_noStore as noStore } from 'next/cache'
import { Camera, Lock, Pin } from 'lucide-react'

import { JournalList } from '@/components/journal/journal-list'
import { isSupabaseConfigured } from '@/lib/env'
import { loadJournalEntries, loadLockedEntries } from '@/lib/journal-data'
import type { JournalEntry, LockedJournalEntry } from '@/types'

export const metadata: Metadata = {
  title: '图文手帐',
  description: '照片和字写在一起的本子。',
}

/**
 * 图文手帐。
 *
 * 原来分开的「日记」和「照片」在这里合成一个模块：
 * 一条手帐 = 若干照片 + 标题 + 正文 + 日期 + 心情 + 天气 + 标签 + 可见性。
 *
 * 读数据的规则：
 *   · 公开手帐（还有站长登录后能看到的私密手帐）由 loadJournalEntries() 拿
 *   · 口令手帐只拿得到标题和日期，正文要输对口令才由接口取回
 */
export default async function JournalPage() {
  noStore()

  const [entries, locked] = await Promise.all([loadJournalEntries(), loadLockedEntries()])

  const isAdminView = entries.some((entry) => entry.visibility !== 'public')

  return (
    <div className="container max-w-3xl py-8 sm:py-12">
      <header className="mb-8">
        <p className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-dust">
          {'// 图文手帐'}
        </p>
        <h1 className="font-display text-2xl text-paper sm:text-3xl">书桌上摊开的那本</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          照片贴在纸上，字写在照片下面。一页一页往后翻，不着急。
        </p>

        <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-dust">
          <li className="flex items-center gap-1.5">
            <Camera className="h-3 w-3" aria-hidden />
            {entries.length} 页
          </li>
          {locked.length > 0 && (
            <li className="flex items-center gap-1.5">
              <Lock className="h-3 w-3" aria-hidden />
              {locked.length} 页上锁
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <Pin className="h-3 w-3" aria-hidden />
            点照片可以放大，← → 翻页
          </li>
          {isAdminView && (
            <li className="text-lamp">你正以站长的身份浏览，私密手帐也显示出来了</li>
          )}
        </ul>
      </header>

      {!isSupabaseConfigured && (
        <p className="mb-6 rounded-xl border border-neon/25 bg-neon/[0.06] p-4 text-xs leading-relaxed text-paper/85">
          还没连上 Supabase，所以这里看不到真实的手帐。
          把 <code>.env.local</code> 里的两项配置填好、并执行
          <code> supabase/migrations/0006_journal.sql </code>
          之后重启开发服务器即可。
        </p>
      )}

      <JournalList entries={entries as JournalEntry[]} locked={locked as LockedJournalEntry[]} />
    </div>
  )
}
