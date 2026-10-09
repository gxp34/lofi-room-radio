import type { User } from '@supabase/supabase-js'
import { unstable_noStore as noStore } from 'next/cache'
import { redirect } from 'next/navigation'

import { ADMIN_EMAIL } from '@/lib/env.server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/env'

/**
 * 鉴权相关的服务端工具。
 *
 * 站长判定采用「二选一」：
 *   1. 数据库里 profiles.role = 'admin'（推荐，RLS 也认这个）
 *   2. 登录邮箱 === 环境变量 ADMIN_EMAIL（兜底，防止忘了提权）
 */

/** 判断某个登录用户是不是站长 */
export async function isAdminUser(user: User | null): Promise<boolean> {
  if (!user) return false

  if (ADMIN_EMAIL && user.email?.toLowerCase() === ADMIN_EMAIL) return true

  if (!isSupabaseConfigured) return false

  const supabase = createSupabaseServerClient()
  if (!supabase) return false

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.warn('[auth] 读取 profiles 失败：', error.message)
    return false
  }

  return data?.role === 'admin'
}

/** 拿当前登录用户（没配置 Supabase 时返回 null） */
export async function getCurrentUser(): Promise<User | null> {
  // 明确告诉 Next：这里依赖每个请求的 Cookie，别在构建时静态化。
  // 否则「还没配 Supabase」的那次构建会把后台页固化成静态页面。
  noStore()

  if (!isSupabaseConfigured) return null

  const supabase = createSupabaseServerClient()
  if (!supabase) return null

  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user ?? null
}

/**
 * 后台页面专用的守卫：不是站长就踢走。
 * 放在 /admin 的 layout 里调用一次，整个后台就都安全了。
 */
export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/admin/login')
  }

  if (!(await isAdminUser(user))) {
    redirect('/admin/login?error=not-admin')
  }

  return user
}
