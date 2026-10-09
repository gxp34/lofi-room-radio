'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, VolumeX, X } from 'lucide-react'

import { Icon } from '@/components/icon'
import { useRoom } from '@/components/providers/room-provider'
import { Button } from '@/components/ui/button'
import { NAV_ITEMS } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * 顶部导航。
 * 手机端折叠成汉堡菜单；桌面上是一排横向链接，当前页用台灯色下划线标出。
 */
export function SiteHeader() {
  const pathname = usePathname()
  const { settings } = useRoom()
  const siteName = settings.roomName
  const [open, setOpen] = React.useState(false)

  // 路由变化时自动收起手机菜单
  React.useEffect(() => {
    setOpen(false)
  }, [pathname])

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-night/80 backdrop-blur-md">
      <div className="container flex h-14 items-center justify-between gap-3">
        {/* 左：房间名 + 直播小圆点 */}
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2.5"
          aria-label={`回到房间首页：${siteName}`}
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon/60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-neon" />
          </span>
          <span className="truncate font-display text-sm tracking-wide text-lamp transition-colors group-hover:text-lamp/80">
            {siteName}
          </span>
          <span className="hidden font-display text-xs text-dust sm:inline">
            ON AIR
            <span className="animate-blink">_</span>
          </span>
        </Link>

        {/* 中：桌面导航 */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'relative rounded-md px-3 py-1.5 text-sm transition-colors',
                isActive(item.href)
                  ? 'text-lamp'
                  : 'text-paper/70 hover:bg-white/[0.05] hover:text-paper',
              )}
            >
              {item.label}
              {isActive(item.href) && (
                <span className="absolute inset-x-3 -bottom-px h-px bg-lamp/70" />
              )}
            </Link>
          ))}
        </nav>

        {/* 右：静音说明 + 手机菜单按钮 */}
        <div className="flex items-center gap-1">
          <span
            className="hidden items-center gap-1.5 rounded-full border border-white/[0.07] px-2.5 py-1 text-[11px] text-dust lg:flex"
            title="本站所有声音都需要你亲手点一下才会响"
          >
            <VolumeX className="h-3 w-3" aria-hidden />
            默认静音
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? '收起菜单' : '展开菜单'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* 手机端展开的导航面板 */}
      {open && (
        <nav
          id="mobile-nav"
          aria-label="主导航"
          className="border-t border-white/[0.06] bg-night/95 md:hidden"
        >
          <ul className="container grid grid-cols-2 gap-2 py-3">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                    isActive(item.href)
                      ? 'border-lamp/30 bg-lamp/10 text-lamp'
                      : 'border-white/[0.07] bg-white/[0.02] text-paper/80',
                  )}
                >
                  <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
