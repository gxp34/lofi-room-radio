import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  Disc3,
  Download,
  Eye,
  Mailbox,
  NotebookPen,
  Play,
  Sparkles,
  Wand2,
} from 'lucide-react'

import { AdminPage, EmptyState, Section, StatCard, Tag } from '@/components/admin/ui'
import { Button } from '@/components/ui/button'
import { MOOD_MAP } from '@/lib/constants'
import { isSupabaseConfigured } from '@/lib/env'
import { hasServiceRole } from '@/lib/env.server'
import { parseOverview } from '@/lib/admin/stats'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** 可以导出的数据类型 */
const EXPORTS = [
  { kind: 'diaries', label: '图文手帐' },
  { kind: 'treehole', label: '树洞' },
  { kind: 'tracks', label: '音乐列表' },
  { kind: 'events', label: '事件池' },
  { kind: 'achievements', label: '成就' },
  { kind: 'settings', label: '站点设置' },
] as const

export default async function AdminDashboardPage() {
  /* ---------------- 还没配数据库：显示自检信息 ---------------- */
  if (!isSupabaseConfigured) {
    return (
      <AdminPage title="仪表盘" description="还没有连上数据库，所以这里暂时没有数字。">
        <Section title="环境自检" description="这三项都打勾，后台的功能才能全部用起来。">
          <ul className="space-y-2 text-sm">
            <CheckItem ok={false} label="NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 已配置" />
            <CheckItem ok={hasServiceRole} label="SUPABASE_SERVICE_ROLE_KEY 已配置" />
            <CheckItem ok label="已能用站长账号登录（说明 Auth 通了）" />
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            另外记得按顺序执行 <code>supabase/migrations/</code> 下的 0001–0005 五个 SQL 文件。
          </p>
        </Section>
      </AdminPage>
    )
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) {
    return (
      <AdminPage title="仪表盘">
        <EmptyState title="读不到数据库连接" description="环境变量可能只在构建时生效，重启一下开发服务器。" />
      </AdminPage>
    )
  }

  /* ---------------- 取数据 ---------------- */
  const [overviewResult, recentTreehole, recentDiaries] = await Promise.all([
    supabase.rpc('admin_overview'),
    supabase
      .from('treehole_messages')
      .select('id, nickname, content, mood, is_approved, is_hidden, is_flagged, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('diaries')
      .select('id, title, visibility, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (overviewResult.error) {
    return (
      <AdminPage title="仪表盘">
        <EmptyState
          title="统计函数还没建好"
          description={`请先执行 supabase/migrations/0005_admin_stats.sql。数据库返回：${overviewResult.error.message}`}
        />
      </AdminPage>
    )
  }

  const stats = parseOverview(overviewResult.data)
  const treeholeList = recentTreehole.data ?? []
  const diaryList = recentDiaries.data ?? []

  return (
    <AdminPage
      title="仪表盘"
      description="房间最近的样子。数字来自 event_logs 与各张表的实时统计。"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/" target="_blank" rel="noreferrer">
            <Eye className="h-3.5 w-3.5" />
            看看前台
          </Link>
        </Button>
      }
    >
      {/* ---------------- 访问量 ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="今日访问"
          value={stats.visitsToday}
          hint="页面浏览次数，不是人数"
          icon={<Activity className="h-3.5 w-3.5 text-lamp" aria-hidden />}
        />
        <StatCard
          label="最近 7 天"
          value={stats.visits7d}
          icon={<Activity className="h-3.5 w-3.5 text-rain" aria-hidden />}
        />
        <StatCard label="累计浏览" value={stats.visitsTotal} />
        <StatCard
          label="独立访客"
          value={stats.sessionsTotal}
          hint="按浏览器会话去重，不是真实人数"
        />
      </div>

      {/* ---------------- 内容概览 ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="树洞待审"
          value={stats.treeholePending}
          hint={`共 ${stats.treeholeTotal} 封${
            stats.treeholeFlagged > 0 ? ` · ${stats.treeholeFlagged} 封有敏感词标记` : ''
          }`}
          icon={<Mailbox className="h-3.5 w-3.5 text-neon" aria-hidden />}
        />
        <StatCard
          label="手帐"
          value={stats.diariesTotal}
          hint={`其中 ${stats.diariesPublic} 页公开`}
          icon={<NotebookPen className="h-3.5 w-3.5 text-lamp" aria-hidden />}
        />
        <StatCard
          label="唱片"
          value={stats.tracksTotal}
          hint={`其中 ${stats.tracksPublic} 首公开`}
          icon={<Disc3 className="h-3.5 w-3.5 text-rain" aria-hidden />}
        />
        <StatCard
          label="总播放"
          value={stats.playTotal}
          icon={<Play className="h-3.5 w-3.5 text-lamp" aria-hidden />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------- 最近树洞 ---------------- */}
        <Section
          title="最近的树洞"
          description="点进去审核、回复或者隐藏。"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/treehole">全部</Link>
            </Button>
          }
        >
          {treeholeList.length === 0 ? (
            <p className="text-xs text-dust">还没有人往抽屉里放东西。</p>
          ) : (
            <ul className="space-y-3">
              {treeholeList.map((message) => {
                const mood = message.mood ? MOOD_MAP[message.mood] : undefined
                return (
                  <li key={message.id} className="border-b border-white/[0.05] pb-3 last:border-0 last:pb-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-display text-xs text-paper/85">{message.nickname}</span>
                      {mood && <span className="text-[11px] text-dust">{mood.emoji}</span>}
                      {message.is_approved ? (
                        <Tag tone="lamp">已通过</Tag>
                      ) : (
                        <Tag tone="neon">待审</Tag>
                      )}
                      {message.is_flagged && (
                        <Tag tone="neon">
                          <AlertTriangle className="mr-1 h-2.5 w-2.5" aria-hidden />
                          敏感词
                        </Tag>
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {message.content}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        {/* ---------------- 最近手帐 ---------------- */}
        <Section
          title="最近的手帐"
          description="草稿、私密、口令都只有你看得到。"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/journal">全部</Link>
            </Button>
          }
        >
          {diaryList.length === 0 ? (
            <p className="text-xs text-dust">本子还是新的。</p>
          ) : (
            <ul className="space-y-2.5">
              {diaryList.map((diary) => (
                <li key={diary.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-xs text-paper/85">{diary.title}</span>
                  <span className="shrink-0">
                    {diary.visibility === 'public' ? (
                      <Tag tone="lamp">公开</Tag>
                    ) : diary.visibility === 'draft' ? (
                      <Tag>草稿</Tag>
                    ) : diary.visibility === 'password' ? (
                      <Tag tone="neon">口令</Tag>
                    ) : (
                      <Tag tone="rain">私密</Tag>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ---------------- 播放排行 ---------------- */}
        <Section title="播放最多的歌" description="统计的是前台真实的播放次数。">
          {stats.topTracks.length === 0 ? (
            <p className="text-xs text-dust">还没有播放记录。</p>
          ) : (
            <ul className="space-y-2.5">
              {stats.topTracks.map((track, index) => (
                <li key={track.id} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 font-display text-xs text-dust">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-paper/85">
                    {track.title}
                  </span>
                  <span className="shrink-0 font-display text-xs text-lamp">
                    {track.playCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ---------------- 内容池 ---------------- */}
        <Section title="内容池" description="房间的性格由这些东西决定。">
          <ul className="space-y-2.5 text-xs">
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-paper/85">
                <Wand2 className="h-3.5 w-3.5 text-lamp" aria-hidden />
                事件池
              </span>
              <span className="flex items-center gap-2">
                <span className="font-display text-lamp">{stats.eventsTotal} 条</span>
                <Link href="/admin/events" className="text-dust underline-offset-4 hover:underline">
                  管理
                </Link>
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-paper/85">
                <Sparkles className="h-3.5 w-3.5 text-lamp" aria-hidden />
                成就
              </span>
              <span className="flex items-center gap-2">
                <span className="font-display text-lamp">{stats.achievementsTotal} 个</span>
                <Link
                  href="/admin/achievements"
                  className="text-dust underline-offset-4 hover:underline"
                >
                  管理
                </Link>
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-paper/85">媒体文件</span>
              <span className="flex items-center gap-2">
                <span className="font-display text-lamp">{stats.mediaTotal} 个</span>
                <Link href="/admin/media" className="text-dust underline-offset-4 hover:underline">
                  管理
                </Link>
              </span>
            </li>
          </ul>
        </Section>
      </div>

      {/* ---------------- 数据导出 ---------------- */}
      <Section
        title="数据导出"
        description="导出成 JSON。建议定期存一份到本地 —— 这是你写下的东西，不该只存在别人服务器上。"
      >
        <div className="flex flex-wrap gap-2">
          {EXPORTS.map((item) => (
            <Button key={item.kind} asChild variant="outline" size="sm">
              <a href={`/api/admin/export?kind=${item.kind}`} download>
                <Download className="h-3.5 w-3.5" />
                导出{item.label}
              </a>
            </Button>
          ))}
        </div>
      </Section>
    </AdminPage>
  )
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={
          ok ? 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lamp' : 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neon'
        }
      />
      <span className={ok ? 'text-paper/85' : 'text-neon'}>
        {label}
        {!ok && <span className="text-dust"> · 还没配</span>}
      </span>
    </li>
  )
}
