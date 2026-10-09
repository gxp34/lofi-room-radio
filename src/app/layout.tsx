import type { Metadata, Viewport } from 'next'

import { RainLayer } from '@/components/layout/rain-layer'
import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { AudioEngine } from '@/components/player/audio-engine'
import { PlayerBar } from '@/components/player/player-bar'
import { TracksLoader } from '@/components/player/tracks-loader'
import { RoomProvider } from '@/components/providers/room-provider'
import { VisitTracker } from '@/components/providers/visit-tracker'
import { AchievementToaster } from '@/components/room/achievement-toaster'
import { EventToaster } from '@/components/room/event-toaster'
import { RoomEffects } from '@/components/room/room-effects'
import { SITE_DESCRIPTION, SITE_TAGLINE } from '@/lib/constants'
import { SITE_NAME, SITE_URL } from '@/lib/env'

import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} · 一间只在深夜营业的房间`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: ['Lo-fi', '个人网站', '深夜电台', '日记', '树洞', '黑胶', '小游戏'],
  authors: [{ name: SITE_NAME }],
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    siteName: SITE_NAME,
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: '#16131f',
  width: 'device-width',
  initialScale: 1,
  // 允许用户缩放（无障碍要求，绝对不要锁死）
  maximumScale: 5,
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="relative min-h-dvh overflow-x-hidden">
        {/* 键盘用户跳过导航 */}
        <a
          href="#main"
          className="sr-only-focusable absolute left-3 top-3 z-50 rounded-md bg-lamp px-3 py-2 text-sm text-night"
        >
          跳到主要内容
        </a>

        {/*
          整个站点都包在 RoomProvider 里 ——
          它负责恢复本地状态、记访问、查事件池、执行事件副作用。
        */}
        <RoomProvider>
          {/* 雨窗层：纯装饰，pointer-events 为 none */}
          <RainLayer />

          <div className="relative z-10 flex min-h-dvh flex-col">
            <SiteHeader />

            <main id="main" className="flex-1">
              {children}
            </main>

            <SiteFooter />

            {/* 常驻播放条（没有歌的时候自己不渲染） */}
            <PlayerBar />
          </div>

          {/* 房间状态 → DOM（灯的明暗）+ 环境特效层 */}
          <RoomEffects />

          {/* 全站唯一的 <audio>，切页面音乐不断 */}
          <AudioEngine />

          {/* 歌单加载（公开歌曲 + 站长可见的私密歌曲） */}
          <TracksLoader />

          {/* 访问打点（后台仪表盘的访问量就是数它写下的日志） */}
          <VisitTracker />

          {/* 事件气泡与成就提示 */}
          <EventToaster />
          <AchievementToaster />
        </RoomProvider>
      </body>
    </html>
  )
}
