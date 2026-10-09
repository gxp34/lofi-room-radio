import type { Metadata } from 'next'
import { Suspense } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

import { AdminLoginForm } from './login-form'

export const metadata: Metadata = {
  title: '站长登录',
  robots: { index: false, follow: false },
}

export default function AdminLoginPage() {
  return (
    <div className="container flex min-h-[70vh] max-w-md flex-col justify-center py-12">
      {/* useSearchParams 必须包在 Suspense 里，否则 next build 会报错 */}
      <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-xl" />}>
        <AdminLoginForm />
      </Suspense>
    </div>
  )
}
