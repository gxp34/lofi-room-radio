'use client'

import Link from 'next/link'
import { Heart, Home, ShieldAlert } from 'lucide-react'

import { useRoom } from '@/components/providers/room-provider'
import { NAV_ITEMS } from '@/lib/constants'

/** 页脚：导航、版权提醒、心理援助提示 */
export function SiteFooter() {
  const { settings } = useRoom()
  const siteName = settings.roomName
  const year = new Date().getFullYear()

  return (
    <footer className="relative z-10 mt-16 border-t border-white/[0.06] bg-night/70">
      <div className="container grid gap-8 py-10 md:grid-cols-3">
        {/* 1. 站点 */}
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-display text-sm text-lamp">
            <Home className="h-4 w-4" aria-hidden />
            {siteName}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            一间只在深夜营业的小房间。所有声音默认静音，需要你亲手点一下才会响。
          </p>
          <p className="text-xs text-muted-foreground">
            © {year} {siteName} · 保留所有权利
          </p>
        </div>

        {/* 2. 导航 */}
        <nav aria-label="页脚导航">
          <p className="mb-3 font-display text-xs uppercase tracking-widest text-dust">房间地图</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-paper/70 transition-colors hover:text-lamp"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* 3. 版权 */}
        <div className="space-y-3">
          <p className="mb-3 font-display text-xs uppercase tracking-widest text-dust">说点正经的</p>
          <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <Heart className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon" aria-hidden />
            <span>这里只播放本人创作、免版权或已获授权的音乐，不传播商业歌曲。</span>
          </p>
          <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rain" aria-hidden />
            <span>树洞里的心事会被认真读完。投进来的每一封，都不会被拿去别处用。</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
