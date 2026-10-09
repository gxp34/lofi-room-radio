import { Toaster } from 'sonner'

import { AdminShell } from '@/components/admin/admin-shell'
import { requireAdmin } from '@/lib/auth'

/**
 * 后台面板的守卫层。
 *
 * 放在路由组 (panel) 里，URL 上不体现，但 /admin、/admin/music 这些页面都会经过它。
 * requireAdmin() 不是站长就直接 redirect 到 /admin/login。
 */
export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin()

  return (
    <>
      <AdminShell email={user.email ?? null}>{children}</AdminShell>
      <Toaster
        theme="dark"
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#241d2b',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#f4eee7',
          },
        }}
      />
    </>
  )
}
