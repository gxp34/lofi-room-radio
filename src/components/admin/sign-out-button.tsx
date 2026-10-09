'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/** 退出登录：清掉会话并回到首页 */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function signOut() {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    setPending(true)
    try {
      await supabase.auth.signOut()
      router.replace('/')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={signOut}
      disabled={pending}
    >
      <LogOut className="h-3.5 w-3.5" />
      退出登录
    </Button>
  )
}
