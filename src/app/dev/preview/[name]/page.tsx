import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AchievementManager } from '@/components/admin/achievement-manager'
import { EventManager } from '@/components/admin/event-manager'
import { GameManager, type AdminGameCard } from '@/components/admin/game-manager'
import { JournalManager, JournalEditor } from '@/components/admin/journal-manager'
import { MediaManager } from '@/components/admin/media-manager'
import { SettingsForm } from '@/components/admin/settings-form'
import { TrackManager } from '@/components/admin/track-manager'
import { TreeholeManager } from '@/components/admin/treehole-manager'
import { AdminPage } from '@/components/admin/ui'
import { JournalList } from '@/components/journal/journal-list'
import { DEFAULT_SITE_SETTINGS } from '@/lib/constants'
import type { MediaBucketSnapshot } from '@/lib/admin/media'
import type { JournalEntry, LockedJournalEntry, Track, TreeholeMessage } from '@/types'
import type { Tables } from '@/types/database'

/**
 * 后台组件的离线预览（**仅开发环境可用**）。
 *
 * 为什么需要它：后台页面在没配 Supabase 时会直接显示「还没连上数据库」，
 * 配了又需要真的登录。结果就是「改完样式/布局，没法看」。
 * 这里用假数据把每个管理组件单独渲染一遍，
 * 既能肉眼调样式，也能当作一次「组件不会崩」的冒烟测试。
 *
 * 生产环境访问返回 404。
 */

export const dynamic = 'force-dynamic'

const PREVIEWS = [
  { name: 'journal-front', label: '手帐（前台）' },
  { name: 'journal', label: '图文手帐（后台）' },
  { name: 'music', label: '音乐管理' },
  { name: 'treehole', label: '树洞审核' },
  { name: 'events', label: '事件池' },
  { name: 'achievements', label: '成就' },
  { name: 'games', label: '小游戏' },
  { name: 'media', label: '媒体库' },
  { name: 'settings', label: '站点设置' },
] as const

type PreviewName = (typeof PREVIEWS)[number]['name']

export default function DevPreviewPage({ params }: { params: { name: string } }) {
  if (process.env.NODE_ENV === 'production') notFound()

  const name = params.name as PreviewName
  if (!PREVIEWS.some((item) => item.name === name)) notFound()

  return (
    <div className="container py-8">
      <div className="mb-6 rounded-xl border border-neon/25 bg-neon/[0.06] p-3">
        <p className="font-display text-xs text-neon">开发预览 · 假数据 · 不会真的写数据库</p>
        <p className="mt-1 text-[11px] leading-relaxed text-paper/70">
          按钮点了会调用真实的 Server Action，但没登录会被拦下 —— 这里只看布局和样式。
        </p>
        <nav className="mt-2 flex flex-wrap gap-2">
          {PREVIEWS.map((item) => (
            <Link
              key={item.name}
              href={`/dev/preview/${item.name}`}
              className={
                item.name === name
                  ? 'rounded-full border border-lamp/40 bg-lamp/12 px-3 py-1 text-[11px] text-lamp'
                  : 'rounded-full border border-white/10 px-3 py-1 text-[11px] text-dust hover:text-paper'
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* 前台手帐：用假数据把拍立得排版、图文混排、标签筛选、上锁卡片都渲染一遍 */}
      {name === 'journal-front' && (
        <AdminPage title="图文手帐（前台）" description="预览数据">
          <JournalList entries={MOCK_JOURNAL} locked={MOCK_LOCKED} />
        </AdminPage>
      )}

      {name === 'journal' && (
        <AdminPage title="图文手帐" description="预览数据">
          <div className="space-y-6">
            {/* 列表 + 编辑器分开渲染：编辑器平时要点「新建」才出现，预览里直接摊开 */}
            <JournalManager entries={MOCK_JOURNAL} />

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
              <p className="mb-3 font-display text-[10px] uppercase tracking-[0.18em] text-dust">
                编辑器（编辑态）
              </p>
              <JournalEditor mode="edit" entry={MOCK_JOURNAL[0]!} />
            </div>
          </div>
        </AdminPage>
      )}

      {name === 'music' && (
        <AdminPage title="音乐" description="预览数据">
          <TrackManager tracks={MOCK_TRACKS} />
        </AdminPage>
      )}

      {name === 'treehole' && (
        <AdminPage title="树洞" description="预览数据">
          <TreeholeManager messages={MOCK_MESSAGES} />
        </AdminPage>
      )}

      {name === 'events' && (
        <AdminPage title="事件池" description="预览数据">
          <EventManager events={MOCK_EVENTS} />
        </AdminPage>
      )}

      {name === 'achievements' && (
        <AdminPage title="成就" description="预览数据">
          <AchievementManager achievements={MOCK_ACHIEVEMENTS} unlockedTotal={7} />
        </AdminPage>
      )}

      {name === 'games' && (
        <AdminPage title="小游戏" description="预览数据">
          <GameManager games={MOCK_GAMES} />
        </AdminPage>
      )}

      {name === 'media' && (
        <AdminPage title="媒体库" description="预览数据">
          <MediaManager buckets={MOCK_BUCKETS} notice="预览：其中一条是「Storage 里有、表里没登记」的情况。" />
        </AdminPage>
      )}

      {name === 'settings' && (
        <AdminPage title="站点设置" description="预览数据">
          <SettingsForm initial={DEFAULT_SITE_SETTINGS} />
        </AdminPage>
      )}
    </div>
  )
}

/* ==========================================================================
   假数据
   ========================================================================== */

const NOW = '2024-06-11T03:24:00.000Z'

/** 预览用的占位图：内联 SVG，离线也能显示 */
function placeholder(label: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 42% 44%)"/><stop offset="1" stop-color="hsl(${hue + 40} 28% 18%)"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="308" cy="74" r="32" fill="rgba(244,238,231,0.45)"/><text x="22" y="272" fill="rgba(244,238,231,0.75)" font-size="19" font-family="monospace">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** 上锁的手帐（只有标题和日期） */
const MOCK_LOCKED: LockedJournalEntry[] = [
  {
    id: 'j9',
    title: '那件不想写在公开地方的事',
    mood: 'rainy',
    weather: 'rain',
    tags: ['碎碎念'],
    createdAt: NOW,
    publishedAt: NOW,
  },
]

const MOCK_JOURNAL: JournalEntry[] = [
  {
    id: 'j1',
    title: '某个下雨的下午',
    content: [
      '雨从中午一直下到天黑，哪儿也没去。',
      '',
      '[[photo:p1|窗上的水痕，拍了很多张都差不多]]',
      '',
      '把唱片机擦了一遍，针还是钝的。猫在键盘上睡了一下午。',
      '',
      '> 后来发现这张其实拍歪了，但懒得重拍。',
      '',
      '[[photo:p2]]',
    ].join('\n'),
    mood: 'calm',
    weather: 'rain',
    tags: ['雨夜', '碎碎念'],
    coverPath: null,
    coverUrl: null,
    coverPhoto: 'entries/j1/cover.webp',
    visibility: 'public',
    sort: 10,
    isPinned: true,
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    photos: [
      {
        id: 'p1',
        entryId: 'j1',
        storagePath: 'entries/j1/a.webp',
        thumbPath: 'entries/j1/a-thumb.webp',
        caption: '窗上的水痕，拍了很多张都差不多',
        sort: 10,
        width: 1200,
        height: 900,
        url: placeholder('A', 195),
        thumbUrl: placeholder('A', 195),
      },
      {
        id: 'p2',
        entryId: 'j1',
        storagePath: 'entries/j1/b.webp',
        thumbPath: 'entries/j1/b-thumb.webp',
        caption: null,
        sort: 20,
        width: 900,
        height: 1200,
        url: placeholder('B', 30),
        thumbUrl: placeholder('B', 30),
      },
    ],
    isLocked: false,
  },
  {
    id: 'j2',
    title: '（草稿）还没写完的一页',
    content: '只写了一句，先放着。',
    mood: 'lost',
    weather: 'cloudy',
    tags: ['梦'],
    coverPath: null,
    coverUrl: null,
    coverPhoto: null,
    visibility: 'draft',
    sort: 20,
    isPinned: false,
    publishedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    photos: [],
    isLocked: false,
  },
]

const MOCK_TRACKS: Track[] = [
  {
    id: 't1',
    title: '台灯下的和弦',
    artist: '房间电台',
    audioUrl: '',
    coverUrl: null,
    audioPath: 'public/demo.wav',
    coverPath: null,
    duration: 8,
    tags: ['深夜', '随便听听'],
    note: '听起来像有人在隔壁房间按着钢琴键不肯放。',
    visibility: 'public',
    sort: 10,
    playCount: 42,
    createdAt: NOW,
  },
  {
    id: 't2',
    title: '还没命名的东西',
    artist: null,
    audioUrl: '',
    coverUrl: null,
    audioPath: 'private/sketch.wav',
    coverPath: null,
    duration: 137,
    tags: ['深夜'],
    note: null,
    visibility: 'private',
    sort: 20,
    playCount: 3,
    createdAt: NOW,
  },
]

const MOCK_MESSAGES: TreeholeMessage[] = [
  {
    id: 'm1',
    nickname: '匿名',
    content: '今天在地铁上突然很想哭，但是忍住了。不知道为什么写这个，可能只是想有人知道。',
    mood: 'sad',
    visibility: 'public',
    isApproved: false,
    isHidden: false,
    isFlagged: true,
    reportCount: 0,
    createdAt: NOW,
    replies: [],
  },
  {
    id: 'm2',
    nickname: '夜班的人',
    content: '谢谢你上次的回复。我换了工作，虽然累但好多了。',
    mood: 'warm',
    visibility: 'public',
    isApproved: true,
    isHidden: false,
    isFlagged: false,
    reportCount: 0,
    createdAt: NOW,
    replies: [
      {
        id: 'r1',
        messageId: 'm2',
        content: '看到这条我很高兴。累的时候记得早点睡，房间的灯我给你留着。',
        isAdmin: true,
        createdAt: NOW,
      },
    ],
  },
  {
    id: 'm3',
    nickname: '匿名',
    content: '有些话只想让你一个人看到。',
    mood: 'calm',
    visibility: 'admin',
    isApproved: false,
    isHidden: false,
    isFlagged: false,
    reportCount: 2,
    createdAt: NOW,
    replies: [],
  },
]

const MOCK_EVENTS: Tables<'events'>[] = [
  {
    id: 'e1',
    object_type: 'lamp',
    event_key: 'lamp.first.on',
    text: '咔哒。房间亮了一点。',
    action: 'lamp_on',
    trigger: 'first',
    rarity: 'common',
    weight: 10,
    cooldown_seconds: 0,
    once: true,
    conditions: { requiresLampOff: true },
    deep_night_only: false,
    consecutive_days: null,
    enabled: true,
    sort: 10,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: 'e2',
    object_type: 'cat',
    event_key: 'cat.streak.key',
    text: '猫吐出一把小钥匙。抽屉最里面，咔哒一声开了。',
    action: 'cat_key',
    trigger: 'click',
    rarity: 'rare',
    weight: 50,
    cooldown_seconds: 0,
    once: true,
    conditions: { consecutiveDays: 3 },
    deep_night_only: false,
    consecutive_days: 3,
    enabled: true,
    sort: 180,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: 'e3',
    object_type: 'global',
    event_key: 'global.moon.move',
    text: '月亮往左挪了一点。',
    action: 'moon_move',
    trigger: 'global',
    rarity: 'hidden',
    weight: 8,
    cooldown_seconds: 300,
    once: false,
    conditions: {},
    deep_night_only: false,
    consecutive_days: null,
    enabled: false,
    sort: 0,
    created_at: NOW,
    updated_at: NOW,
  },
]

const MOCK_ACHIEVEMENTS: Tables<'achievements'>[] = [
  {
    id: 'a1',
    key: 'cat_patience',
    name: '猫的耐心是有限的',
    description: '点猫 100 次。',
    icon: 'Cat',
    secret: false,
    sort: 70,
    created_at: NOW,
  },
  {
    id: 'a2',
    key: 'room_secret',
    name: '房间的秘密',
    description: '触发过一次稀有事件。',
    icon: 'Sparkles',
    secret: true,
    sort: 60,
    created_at: NOW,
  },
]

const MOCK_GAMES: AdminGameCard[] = [
  {
    slug: '2048',
    name: '2048',
    description: '把数字推到一起去。适合发呆的时候玩。',
    enabled: true,
    sort: 10,
    bestScore: 2096,
    scoreCount: 2,
    recentScores: [
      { id: 's1', playerName: '路过的猫', score: 2096, createdAtLabel: '2024-06-10 23:12' },
      { id: 's2', playerName: '匿名', score: 512, createdAtLabel: '2024-06-09 02:40' },
    ],
  },
  {
    slug: 'snake',
    name: '贪吃蛇',
    description: '房间里的蛇不吃苹果，吃台灯的光点。',
    enabled: false,
    sort: 20,
    bestScore: 0,
    scoreCount: 0,
    recentScores: [],
  },
]

const MOCK_BUCKETS: MediaBucketSnapshot[] = [
  {
    bucket: 'public-music',
    files: [
      {
        path: 'public/20240611-a3f9-台灯下的和弦.wav',
        size: 352844,
        type: 'audio/wav',
        createdAt: NOW,
        recordId: 'md1',
      },
      {
        path: 'public/20240612-b7c1-还没命名的东西.mp3',
        size: 2411000,
        type: 'audio/mpeg',
        createdAt: NOW,
        recordId: null,
      },
    ],
    orphans: [
      {
        id: 'md9',
        path: 'public/20240601-0000-已经不在桶里的文件.mp3',
        size: 1200000,
        type: 'audio/mpeg',
        createdAt: NOW,
      },
    ],
    error: null,
  },
  {
    bucket: 'covers',
    files: [
      {
        path: 'covers/20240611-ff02-封面.webp',
        size: 88000,
        type: 'image/webp',
        createdAt: NOW,
        recordId: 'md2',
      },
    ],
    orphans: [],
    error: null,
  },
  { bucket: 'private-music', files: [], orphans: [], error: null },
  { bucket: 'diary-images', files: [], orphans: [], error: '读取这个桶失败了：预览数据' },
]
