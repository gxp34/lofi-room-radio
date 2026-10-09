import { AdminPage, EmptyState } from '@/components/admin/ui'
import { JournalManager } from '@/components/admin/journal-manager'
import { isSupabaseConfigured } from '@/lib/env'
import { loadJournalEntries } from '@/lib/journal-data'

export const dynamic = 'force-dynamic'

export default async function AdminJournalPage() {
  if (!isSupabaseConfigured) {
    return (
      <AdminPage title="图文手帐">
        <EmptyState
          title="还没连上数据库"
          description="请在 .env.local 里填好 Supabase 的两项配置，并执行 0001–0006 的 SQL。"
        />
      </AdminPage>
    )
  }

  // 后台要看得到全部：公开、私密、口令都在这里
  const entries = await loadJournalEntries({ includePassword: true })

  return (
    <AdminPage
      title="图文手帐"
      description="照片和字写在一起。拖进来的照片会在浏览器里压缩、剥掉 EXIF（含 GPS），再直传到 Supabase Storage。"
    >
      <JournalManager entries={entries} />
    </AdminPage>
  )
}
