import { z } from 'zod'

/**
 * 服务端专用环境变量（含密钥）。
 * ⚠️ 这个文件只能被 Server Component / Route Handler / Server Action 导入，
 *    一旦被客户端组件导入，下面的运行时守卫会立刻报错，避免密钥被打进浏览器包。
 */

if (typeof window !== 'undefined') {
  throw new Error(
    '[env.server] 这个模块包含 service_role 密钥，绝不能在客户端调用。请把相关逻辑移到 Route Handler 或 Server Action。',
  )
}

const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

function pick<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const result = schema.safeParse(blankToUndefined(value))
  return result.success ? result.data : fallback
}

/** service_role 密钥：只有服务端能用它绕过 RLS */
export const SUPABASE_SERVICE_ROLE_KEY = pick(
  z.string().min(20),
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  '',
)

/** 站长邮箱：登录后邮箱匹配它即视为管理员 */
export const ADMIN_EMAIL = pick(z.string().email(), process.env.ADMIN_EMAIL, '').toLowerCase()

/** 给访客 IP 做哈希用的盐 */
export const TREEHOLE_IP_SALT = pick(
  z.string().min(1),
  process.env.TREEHOLE_IP_SALT,
  'lofi-room-default-salt',
)

/** 树洞两次投递之间的最小间隔（秒） */
export const TREEHOLE_MIN_INTERVAL_SECONDS = pick(
  z.coerce.number().int().positive(),
  process.env.TREEHOLE_MIN_INTERVAL_SECONDS,
  60,
)

/** 树洞每日投递上限 */
export const TREEHOLE_DAILY_LIMIT = pick(
  z.coerce.number().int().positive(),
  process.env.TREEHOLE_DAILY_LIMIT,
  10,
)

/** 服务端能不能用「超级权限」（上传、私密音频签名、审核等都要它） */
export const hasServiceRole = Boolean(SUPABASE_SERVICE_ROLE_KEY)
