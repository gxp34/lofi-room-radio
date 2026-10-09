import type { User } from '@supabase/supabase-js'

import { getCurrentUser, isAdminUser } from '@/lib/auth'

/**
 * 后台操作的鉴权守卫。
 *
 * 为什么每个 Server Action 都要单独调一次：
 * Server Action 是可以被直接 POST 调用的端点（不经过页面），
 * 只靠在 layout 里 requireAdmin 是不够的 —— 那是页面级的保护，拦不住直接调接口。
 *
 * 所以规则很简单：**任何写操作的第一行都必须是这个守卫**。
 */
export type AdminGuard =
  | { ok: true; user: User }
  | { ok: false; error: string }

export async function guardAdmin(): Promise<AdminGuard> {
  const user = await getCurrentUser()

  if (!user) {
    return { ok: false, error: '没有登录，或者登录已经过期。刷新页面重新登录一次。' }
  }

  if (!(await isAdminUser(user))) {
    return { ok: false, error: '这个账号不是站长，改不了房间里的东西。' }
  }

  return { ok: true, user }
}

/**
 * 把任意异常转成给用户看的一句话。
 *
 * ⚠️ 这里有个容易踩的坑：Supabase 的 `PostgrestError` **不是 `Error` 的实例**，
 * 它只是个带 message / details / hint / code 的普通对象。
 * 如果只写 `error instanceof Error`，所有数据库错误都会被吞掉，
 * 站长看到的永远是那句没用的「操作失败了」。
 */
export function describeError(error: unknown, fallback = '操作失败了，再试一次。'): string {
  const raw = extractMessage(error)
  if (!raw) return fallback

  const message = raw.toLowerCase()

  // 把几种常见的数据库错误翻译成人话
  if (message.includes('too_fast')) return '操作太频繁了，先歇一下。'
  if (message.includes('duplicate key value') || message.includes('unique constraint')) {
    return '这个 key 已经存在了，换一个。'
  }
  if (message.includes('violates row-level security') || message.includes('permission denied')) {
    return '没有权限做这个操作。确认你是站长，并且 0002_rls.sql 已经执行过。'
  }
  if (message.includes('foreign key constraint')) {
    return '还有别的数据引用着它，先删掉那些再试。'
  }
  if (message.includes('forbidden')) return '这个账号不是站长。'

  return raw
}

/** 从各种形状的错误里把 message 抠出来 */
function extractMessage(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error

  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
  }

  if (error instanceof Error) return error.message

  return ''
}
