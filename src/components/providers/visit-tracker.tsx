'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'

import { STORAGE_KEYS } from '@/lib/constants'
import { isSupabaseConfigured } from '@/lib/env'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { createSessionId } from '@/lib/utils'
import { readString, writeString } from '@/lib/storage'

/**
 * 访问打点。
 *
 * 每次换页面往 event_logs 写一行（event_key = 'page_view'），
 * 后台仪表盘的「访问量」就是数这些行。
 *
 * 三个设计决定：
 *   1. session_id 存在 localStorage 里，只用来区分「同一个人」，
 *      不采集任何设备信息、不存 IP（IP 只在树洞那边用于限流，而且是哈希过的）；
 *   2. 后台自己的页面不打点 —— 那些不是「访客」；
 *   3. 打点失败完全静默，绝不因为统计把页面搞坏。
 */
export function VisitTracker() {
  const pathname = usePathname()

  React.useEffect(() => {
    if (!isSupabaseConfigured) return
    if (!pathname || pathname.startsWith('/admin')) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    // 会话 id：第一次访问时生成，之后一直复用
    let sessionId = readString(STORAGE_KEYS.sessionId)
    if (!sessionId) {
      sessionId = createSessionId()
      writeString(STORAGE_KEYS.sessionId, sessionId)
    }

    // 不 await、不 catch 到界面上：统计失败不是用户的问题
    void supabase
      .rpc('log_visit', { p_session_id: sessionId, p_path: pathname })
      .then(({ error }) => {
        if (error) console.info('[visit] 打点失败（不影响使用）：', error.message)
      })
  }, [pathname])

  return null
}
