import { createClient } from '@supabase/supabase-js'

import { SUPABASE_URL } from '@/lib/env'
import { SUPABASE_SERVICE_ROLE_KEY, hasServiceRole } from '@/lib/env.server'
import type { Database } from '@/types/database'

/** 超级权限客户端类型（ReturnType 推导，自动跟随 supabase-js 的泛型变化） */
export type TypedSupabaseAdminClient = ReturnType<typeof createClient<Database>>

/**
 * 超级权限客户端（service_role）：
 * 绕过所有 RLS，用于上传文件、签发私密音频地址、后台审核等。
 *
 * ⚠️ 安全红线：
 *   1. 这个文件只能被服务端代码导入（env.server.ts 里有运行时守卫）；
 *   2. 永远不要把它传给客户端组件，也不要把含密钥的对象序列化出去；
 *   3. 一旦怀疑泄漏，立刻去 Supabase 控制台轮换 service_role 密钥。
 */
let adminClient: TypedSupabaseAdminClient | null = null

export function getSupabaseAdminClient(): TypedSupabaseAdminClient | null {
  if (!SUPABASE_URL || !hasServiceRole) return null

  if (!adminClient) {
    adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: { 'x-lofi-client': 'admin' },
      },
    })
  }

  return adminClient
}

export function requireSupabaseAdminClient(): TypedSupabaseAdminClient {
  const client = getSupabaseAdminClient()
  if (!client) {
    throw new Error(
      '缺少 service_role 配置：请设置 SUPABASE_SERVICE_ROLE_KEY（本地写在 .env.local，线上写在 Vercel 环境变量）。',
    )
  }
  return client
}
