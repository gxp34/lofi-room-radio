import { AdminPage, EmptyState } from '@/components/admin/ui'
import { TrackManager } from '@/components/admin/track-manager'
import { STORAGE_BUCKETS } from '@/lib/constants'
import { isSupabaseConfigured } from '@/lib/env'
import { rowToTrack } from '@/lib/mappers'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Track } from '@/types'

export const dynamic = 'force-dynamic'

export default async function AdminMusicPage() {
  const tracks = await loadTracks()

  if (!isSupabaseConfigured) {
    return (
      <AdminPage title="音乐" description="唱片架的管理。">
        <EmptyState
          title="还没连上数据库"
          description="请在 .env.local 里填好 NEXT_PUBLIC_SUPABASE_URL 与 ANON KEY，并执行 0001–0005 的 SQL。"
        />
      </AdminPage>
    )
  }

  return (
    <AdminPage
      title="音乐"
      description="上传、编辑、排序、决定公开还是私密。文件直接传到 Supabase Storage，不经过服务器中转。"
    >
      <TrackManager tracks={tracks} />
    </AdminPage>
  )
}

/**
 * 后台要看到全部歌曲（含私密）。
 * 封面在公开桶里，直接用 publicUrl；私密音频这里不给可播地址 ——
 * 要试听就去前台的 /music（站长登录后那边会自动签发临时地址）。
 */
async function loadTracks(): Promise<Track[]> {
  const supabase = createSupabaseServerClient()
  if (!supabase) return []

  try {
    const { data, error } = await supabase
      .from('tracks')
      .select('*')
      .order('sort', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[admin/music] 读取失败：', error.message)
      return []
    }

    return (data ?? []).map((row) =>
      rowToTrack(row, {
        audioUrl: '',
        coverUrl: row.cover_path
          ? supabase.storage.from(STORAGE_BUCKETS.covers).getPublicUrl(row.cover_path).data.publicUrl
          : null,
      }),
    )
  } catch (error) {
    console.warn('[admin/music] 读取异常：', error)
    return []
  }
}
