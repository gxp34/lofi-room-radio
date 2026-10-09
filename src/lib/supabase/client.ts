import { createBrowserClient } from '@supabase/ssr'

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * 带类型的 Supabase 客户端别名，全站统一用它。
 * 用 ReturnType 而不是写死 SupabaseClient<Database>：
 * 后者在 supabase-js 最近的版本里泛型参数变多了，手写容易错位。
 */
export type TypedSupabaseClient = ReturnType<typeof createBrowserClient<Database>>

/** 浏览器端只保留一个实例（单例），避免每次渲染都新建 WebSocket 连接 */
let browserClient: TypedSupabaseClient | null = null

/**
 * 拿浏览器端 Supabase 客户端。
 * 没配置环境变量时返回 null —— 调用方需要处理「演示模式」，
 * 而不是让整个页面白屏。
 */
export function getSupabaseBrowserClient(): TypedSupabaseClient | null {
  if (!isSupabaseConfigured) return null

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  }

  return browserClient
}

/**
 * 确认已经配置好 Supabase 再取客户端；没配置就直接抛错。
 * 适合那些「没有数据库就完全没意义」的操作，比如后台登录。
 */
export function requireSupabaseBrowserClient(): TypedSupabaseClient {
  const client = getSupabaseBrowserClient()
  if (!client) {
    throw new Error(
      'Supabase 还没配置：请把 .env.example 复制为 .env.local，填好 NEXT_PUBLIC_SUPABASE_URL 与 NEXT_PUBLIC_SUPABASE_ANON_KEY 后重启开发服务器。',
    )
  }
  return client
}
