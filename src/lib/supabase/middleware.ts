import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/env'
import type { Database } from '@/types/database'

export interface SessionResult {
  /** 必须原样返回给浏览器的响应（里面带着刷新后的会话 Cookie） */
  response: NextResponse
  /** 当前登录用户，未登录为 null */
  user: User | null
}

/**
 * 刷新 Supabase 会话（middleware 专用）。
 *
 * 为什么需要它：Supabase 的 access_token 有效期只有 1 小时，
 * 前台是 Server Component 拿不到写 Cookie 的权限，
 * 所以必须在 middleware 里统一续期，否则后台用着用着就掉线。
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let response = NextResponse.next({ request })

  // 没配置 Supabase 时直接放行，保证「本地演示模式」也能正常浏览
  if (!isSupabaseConfigured) {
    return { response, user: null }
  }

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        // 先写回 request（让本次渲染就能读到新 Cookie），再写进 response
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  let user: User | null = null
  try {
    // getUser() 会顺带触发 token 刷新，比 getSession() 更安全（服务端校验过签名）
    const { data } = await supabase.auth.getUser()
    user = data.user ?? null
  } catch (error) {
    // 网络抖动 / Supabase 临时不可用时不要让整站 500，降级成「未登录」
    console.warn('[middleware] 刷新会话失败：', error instanceof Error ? error.message : error)
  }

  return { response, user }
}
