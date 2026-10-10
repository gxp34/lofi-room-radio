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

/* --------------------------------------------------------------------------
   天气（Open-Meteo，免费无密钥）
   -------------------------------------------------------------------------- */

/**
 * 固定城市的经纬度。
 *
 * 这几项**只是兜底**：真正生效的值优先取后台「站点设置」里的，
 * 只有后台没填（比如刚部署、迁移还没跑）才用这里的默认值。
 * 所以改城市不用重新部署 —— 去后台改就行。
 *
 * 默认给了上海：不填也不会算出奇怪的日出日落。
 */
export const WEATHER_FALLBACK_LAT = pick(
  z.coerce.number().min(-90).max(90),
  process.env.WEATHER_LAT,
  31.2304,
)

export const WEATHER_FALLBACK_LON = pick(
  z.coerce.number().min(-180).max(180),
  process.env.WEATHER_LON,
  121.4737,
)

export const WEATHER_FALLBACK_CITY = pick(
  z.string().min(1).max(40),
  process.env.WEATHER_CITY,
  '上海',
)

/* --------------------------------------------------------------------------
   功能开关
   -------------------------------------------------------------------------- */

/**
 * 从环境变量读布尔值。
 *
 * ⚠️ **不能写 `z.coerce.boolean()`**：`Boolean('false')` 是 `true`，
 * 于是 `RADIO_ENABLED=false` 会被理解成"打开"。这个坑很隐蔽 ——
 * 只有明确列举出"假"的那几个词才对。
 */
function booleanFromEnv(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback

  const normalized = value.trim().toLowerCase()
  if (normalized === '') return fallback
  if (['false', '0', 'off', 'no', 'disabled'].includes(normalized)) return false
  if (['true', '1', 'on', 'yes', 'enabled'].includes(normalized)) return true

  return fallback
}

/**
 * 实时电台的**总闸**。
 *
 * 默认开。它是给"先关掉、以后再开"准备的：
 * 关掉之后连 SomaFM 都不会去请求，适合在不想让站点发外部请求的时候用。
 * 后台「站点设置」里还有一个单独的开关，两个都开才会真的去拉频道。
 */
export const RADIO_ENABLED_FALLBACK = booleanFromEnv(process.env.RADIO_ENABLED, true)

/** 星空图的总闸。默认开。纯本地计算，关掉只是不渲染 */
export const CELESTIAL_ENABLED_FALLBACK = booleanFromEnv(process.env.CELESTIAL_ENABLED, true)
