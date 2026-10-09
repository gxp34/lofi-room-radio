import { z } from 'zod'

/**
 * 公开环境变量（可以安全地出现在浏览器里）。
 *
 * 设计原则：**没有一个变量是必填的**。
 * 缺配置时不做「启动即崩」，而是降级成「本地演示模式」，
 * 这样 `npm run dev` 在任何一台机器上第一次跑就能起来。
 * 注意：Next.js 只会静态替换 `process.env.NEXT_PUBLIC_XXX` 这种字面量写法，
 * 所以下面必须一个一个写出来，不能用循环或动态 key。
 */

/** 把空字符串当成「没填」 */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

/** 单个字段解析，失败就退回默认值，绝不抛错 */
function pick<T>(schema: z.ZodType<T>, value: unknown, fallback: T, label: string): T {
  const result = schema.safeParse(blankToUndefined(value))
  if (result.success) return result.data
  if (blankToUndefined(value) !== undefined) {
    console.warn(
      `[env] ${label} 的值看起来不太对，已回退到默认值：${result.error.issues[0]?.message ?? '未知原因'}`,
    )
  }
  return fallback
}

/** Supabase 项目地址，形如 https://xxxx.supabase.co */
export const SUPABASE_URL = pick(
  z.string().url(),
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  '',
  'NEXT_PUBLIC_SUPABASE_URL',
)

/** Supabase 匿名公钥（anon key），会暴露给浏览器，这是设计如此 */
export const SUPABASE_ANON_KEY = pick(
  z.string().min(20),
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  '',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
)

/** 站点名称 */
export const SITE_NAME = pick(
  z.string().min(1).max(40),
  process.env.NEXT_PUBLIC_SITE_NAME,
  'Lo-fi 房间电台',
  'NEXT_PUBLIC_SITE_NAME',
)

/** 站点地址，用于 metadata / OG / sitemap */
export const SITE_URL = pick(
  z.string().url(),
  process.env.NEXT_PUBLIC_SITE_URL,
  'http://localhost:3000',
  'NEXT_PUBLIC_SITE_URL',
).replace(/\/$/, '')

/** 音频大小上限（MB） */
export const MAX_AUDIO_MB = pick(
  z.coerce.number().int().positive().max(200),
  process.env.NEXT_PUBLIC_MAX_AUDIO_MB,
  25,
  'NEXT_PUBLIC_MAX_AUDIO_MB',
)

/** 图片大小上限（MB） */
export const MAX_IMAGE_MB = pick(
  z.coerce.number().int().positive().max(50),
  process.env.NEXT_PUBLIC_MAX_IMAGE_MB,
  5,
  'NEXT_PUBLIC_MAX_IMAGE_MB',
)

/**
 * Supabase 是否已经配置好。
 * false 时全站进入「本地演示模式」：不联网、用内置示例数据渲染。
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/** 开发环境第一次用到时才提醒一句，而不是抛异常；用全局标记避免每个请求都刷屏 */
if (!isSupabaseConfigured && process.env.NODE_ENV !== 'production') {
  const flags = globalThis as typeof globalThis & { __lofiEnvNoticeShown?: boolean }
  if (!flags.__lofiEnvNoticeShown) {
    flags.__lofiEnvNoticeShown = true
    console.info(
      '[env] 还没配置 Supabase，当前运行在本地演示模式。\n' +
        '      把 .env.example 复制成 .env.local 并填好 URL / ANON KEY 后重启即可连上数据库。',
    )
  }
}

/** 组装站点元信息时用的小工具 */
export const absoluteUrl = (path = '/') => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
