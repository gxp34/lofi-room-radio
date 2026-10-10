import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * 外部数据源的开关和参数（从 site_settings 读）。
 *
 * 用带匿名身份的服务端客户端就够了 —— site_settings 是公开可读的
 * （前台本来就要读房间名、标语那些），不需要 service_role。
 *
 * 读不到（没配 Supabase / 迁移没跑）时一律给出**保守的默认值**：
 * 天气开、每日一句开、城市留 null（由 env.server 的兜底值接手）。
 * 这样新部署的站不会因为少了几行设置就少一块功能。
 */
export interface ExternalSettings {
  weatherEnabled: boolean
  weatherCity: string | null
  weatherLat: number | null
  weatherLon: number | null
  dailyQuoteEnabled: boolean
  dailyQuoteOverride: string | null
}

export const EXTERNAL_SETTING_KEYS = {
  weatherEnabled: 'weather_enabled',
  weatherCity: 'weather_city',
  weatherLat: 'weather_lat',
  weatherLon: 'weather_lon',
  dailyQuoteEnabled: 'daily_quote_enabled',
  dailyQuoteOverride: 'daily_quote_override',
} as const

export const EXTERNAL_SETTINGS_DEFAULT: ExternalSettings = {
  weatherEnabled: true,
  weatherCity: null,
  weatherLat: null,
  weatherLon: null,
  dailyQuoteEnabled: true,
  dailyQuoteOverride: null,
}

export async function loadExternalSettings(): Promise<ExternalSettings> {
  const supabase = createSupabaseServerClient()
  if (!supabase) return EXTERNAL_SETTINGS_DEFAULT

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', Object.values(EXTERNAL_SETTING_KEYS))

    if (error || !data) return EXTERNAL_SETTINGS_DEFAULT

    const map = new Map<string, unknown>(data.map((row) => [row.key, row.value]))
    const bool = (key: string, fallback: boolean) => {
      const value = map.get(key)
      return typeof value === 'boolean' ? value : fallback
    }
    const num = (key: string) => {
      const value = map.get(key)
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
      }
      return null
    }
    const str = (key: string) => {
      const value = map.get(key)
      return typeof value === 'string' && value.trim() !== '' ? value : null
    }

    return {
      weatherEnabled: bool(EXTERNAL_SETTING_KEYS.weatherEnabled, true),
      weatherCity: str(EXTERNAL_SETTING_KEYS.weatherCity),
      weatherLat: num(EXTERNAL_SETTING_KEYS.weatherLat),
      weatherLon: num(EXTERNAL_SETTING_KEYS.weatherLon),
      dailyQuoteEnabled: bool(EXTERNAL_SETTING_KEYS.dailyQuoteEnabled, true),
      dailyQuoteOverride: str(EXTERNAL_SETTING_KEYS.dailyQuoteOverride),
    }
  } catch (error) {
    console.warn('[external] 读站点设置失败，用默认值：', error)
    return EXTERNAL_SETTINGS_DEFAULT
  }
}
