'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Disc3,
  Gauge,
  Gamepad2,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  Settings,
  Sparkles,
  Upload,
  Wand2,
  X,
} from 'lucide-react'

import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/**
 * 后台侧边栏。
 *
 * 手机端收成顶部一条横向可滚动的标签，桌面上是左侧固定栏 ——
 * 后台在手机上也要能用（审核树洞经常是躺着做的）。
 */

const NAV = [
  { href: '/admin', label: '仪表盘', icon: LayoutDashboard },
  { href: '/admin/music', label: '音乐', icon: Disc3 },
  { href: '/admin/journal', label: '图文手帐', icon: NotebookPen },
  { href: '/admin/treehole', label: '树洞', icon: Upload },
  { href: '/admin/events', label: '事件池', icon: Wand2 },
  { href: '/admin/achievements', label: '成就', icon: Sparkles },
  { href: '/admin/games', label: '小游戏', icon: Gamepad2 },
  { href: '/admin/media', label: '媒体库', icon: ImageIcon },
  { href: '/admin/settings', label: '站点设置', icon: Settings },
] as const

export function AdminShell({
  email,
  children,
}: {
  email: string | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [signingOut, setSigningOut] = React.useState(false)

  React.useEffect(() => {
    setOpen(false)
  }, [pathname])

  async function signOut() {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setSigningOut(true)
    try {
      await supabase.auth.signOut()
      router.replace('/')
      router.refresh()
    } finally {
      setSigningOut(false)
    }
  }

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  return (
    <div className="container flex flex-col gap-6 py-6 lg:flex-row lg:py-8">
      {/* ---------- 手机端顶栏 ---------- */}
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <span className="flex items-center gap-2 font-display text-sm text-lamp">
          <Gauge className="h-4 w-4" aria-hidden />
          后台
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="admin-nav"
          aria-label={open ? '收起菜单' : '展开菜单'}
          className="rounded-md border border-white/10 p-2 text-dust"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {/* ---------- 导航 ---------- */}
      <nav
        id="admin-nav"
        aria-label="后台导航"
        className={cn(
          'shrink-0 lg:block lg:w-52',
          open ? 'block' : 'hidden',
        )}
      >
        <div className="lg:sticky lg:top-20">
          <ul className="flex gap-1.5 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map((item) => (
              <li key={item.href} className="shrink-0 lg:shrink">
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                    isActive(item.href)
                      ? 'border-lamp/30 bg-lamp/10 text-lamp'
                      : 'border-transparent text-paper/70 hover:bg-white/[0.04] hover:text-paper',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 hidden border-t border-white/[0.06] pt-4 lg:block">
            <p className="truncate px-3 text-[11px] text-dust">{email ?? '（没有邮箱）'}</p>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-dust transition-colors hover:bg-white/[0.04] hover:text-paper"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {signingOut ? '正在退出…' : '退出登录'}
            </button>
            <Link
              href="/"
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-dust transition-colors hover:bg-white/[0.04] hover:text-paper"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden />
              回到房间
            </Link>
          </div>
        </div>
      </nav>

      {/* ---------- 内容 ---------- */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
