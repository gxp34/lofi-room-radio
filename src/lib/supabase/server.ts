import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/env'
import type { Database } from '@/types/database'

/** 服务端客户端类型（用 ReturnType 推导，避免手写泛型出错） */
export type TypedSupabaseServerClient = ReturnType<typeof createServerClient<Database>>

/**
 * 服务端 Supabase 客户端（带当前登录用户的会话 Cookie）。
 * 适用于：Server Component、Route Handler、Server Action。
 *
 * 注意：在 Server Component 里调用时，Next.js 不允许写 Cookie，
 * 所以 setAll 用 try/catch 包住；会话刷新交给 middleware 处理。
 */
export function createSupabaseServerClient(): TypedSupabaseServerClient | null {
  if (!isSupabaseConfigured) return null

  const cookieStore = cookies()

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // 在 Server Component 中调用 set 会抛错，这里静默忽略：
          // middleware 已经负责刷新会话，用户不会因此掉登录。
        }
      },
    },
  })
}

/** 同上的简写，没配置好时抛错（用于必须依赖数据库的服务端逻辑） */
export function requireSupabaseServerClient(): TypedSupabaseServerClient {
  const client = createSupabaseServerClient()
  if (!client) {
    throw new Error(
      'Supabase 还没配置：请在 .env.local 或 Vercel 环境变量里补上 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY。',
    )
  }
  return client
}
