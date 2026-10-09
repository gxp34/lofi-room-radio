import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '后台',
  robots: { index: false, follow: false },
}

/**
 * /admin 这一段的最小外壳。
 *
 * 注意：**鉴权不在这里做**。
 * 因为 /admin/login 也在这一段下面，如果在这里 requireAdmin，
 * 未登录访问登录页会被重定向到登录页 → 死循环。
 * 真正的守卫放在 (panel) 那个路由组的 layout 里。
 */
export default function AdminSegmentLayout({ children }: { children: React.ReactNode }) {
  return children
}
