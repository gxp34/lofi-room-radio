'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { VolumeX } from 'lucide-react'

import { Icon } from '@/components/icon'
import { useRoom } from '@/components/providers/room-provider'
import { NAV_ITEMS } from '@/lib/constants'
import { cn } from '@/lib/utils'

/**
 * 顶部导航。
 *
 * 两种宽度下是**两套不同的东西**，不是同一套的缩放：
 *
 *   桌面（≥ md）：一行「图标 + 文字」。八个入口平铺得下，文字让人一眼看懂。
 *   手机（< md）：一行**只有图标**。八个「图标+文字」在 360px 里挤不下，
 *                而只留文字又太密；图标加 aria-label 是这里最省地方的解法。
 *
 * 原来手机端是个汉堡菜单（点开一个两列面板）。换成图标条的原因：
 *   导航一共八项，其中「电台 / 星空」是会被频繁来回切的，
 *   每次切都先展开再收起多两次点击。图标条一次点击到位，也始终看得见自己在哪。
 */
export function SiteHeader() {
  const pathname = usePathname()
  const { settings } = useRoom()
  const siteName = settings.roomName

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

        {/* 中：桌面导航（图标 + 文字）。
            断点用 lg（1024）而不是 md（768）：八个「图标+文字」大约要 740px，
            加上左边的房间名就接近 950px —— 768 到 1024 这一段会**换行**，
            挤成两三行（截图里看到的）。这一段交给下面的图标条。 */}
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors',
                isActive(item.href)
                  ? 'text-lamp'
                  : 'text-paper/70 hover:bg-white/[0.05] hover:text-paper',
              )}
            >
              <Icon name={item.icon} className="h-3.5 w-3.5 shrink-0" />
              {item.label}
              {isActive(item.href) && (
                <span className="absolute inset-x-2.5 -bottom-px h-px bg-lamp/70" />
              )}
            </Link>
          ))}
        </nav>

        {/* 右：静音说明。只在 xl 以上显示 —— 1024~1280 这段要优先留给导航 */}
        <span
          className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.07] px-2.5 py-1 text-[11px] text-dust xl:flex"
          title="本站所有声音都需要你亲手点一下才会响"
        >
          <VolumeX className="h-3 w-3" aria-hidden />
          默认静音
        </span>
      </div>

      {/* 图标条：手机和平板（< 1024）都走这个。只有图标，label 走 aria-label */}
      <nav
        className="border-t border-white/[0.06] bg-night/60 lg:hidden"
        aria-label="主导航"
      >
        <ul className="container flex items-center justify-between py-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                  title={item.description}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                    active ? 'bg-lamp/10 text-lamp' : 'text-paper/60 active:bg-white/[0.06]',
                  )}
                >
                  <Icon name={item.icon} className="h-[18px] w-[18px]" />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </header>
  )
}
