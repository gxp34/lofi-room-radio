import { RADIO_ENABLED_FALLBACK } from '@/lib/env.server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * 电台的开关和频道配置（从 site_settings 读）。
 *
 * 为什么不跟天气那几个放在 external/settings.ts 里：
 * 电台的自定义频道是一整块**多行文本**，形状和那边几个布尔/数字差很远，
 * 而且这两个功能是不同时间加的，放一起会让那个文件变成一个杂物间。
 *
 * 读不到（没配 Supabase / 迁移没跑）时给保守的默认值：
 * 开关跟随环境变量，频道列表为空（那就只有 SomaFM 的频道可用）。
 */

export const RADIO_SETTING_KEYS = {
  enabled: 'radio_enabled',
  channels: 'radio_channels',
  defaultChannel: 'radio_default_channel',
} as const

export interface RadioSettings {
  /** 后台开关 * 环境变量总闸 */
  enabled: boolean
  /** 自定义频道的多行文本（每行 `名称 | 地址 | 标签`） */
  channelsText: string
  defaultChannelId: string | null
}

export const RADIO_SETTINGS_DEFAULT: RadioSettings = {
  enabled: RADIO_ENABLED_FALLBACK,
  // 空字符串 = 没有自定义频道，页面只列 SomaFM 的。
  // 真正的列表由 0014_radio.sql 灌进 site_settings，后台可改。
  channelsText: '',
  defaultChannelId: null,
}

export async function loadRadioSettings(): Promise<RadioSettings> {
  const supabase = createSupabaseServerClient()
  if (!supabase) return RADIO_SETTINGS_DEFAULT

  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', Object.values(RADIO_SETTING_KEYS))

    if (error || !data) return RADIO_SETTINGS_DEFAULT

    const map = new Map<string, unknown>(data.map((row) => [row.key, row.value]))

    const enabledRow = map.get(RADIO_SETTING_KEYS.enabled)
    const channelsRow = map.get(RADIO_SETTING_KEYS.channels)
    const defaultRow = map.get(RADIO_SETTING_KEYS.defaultChannel)

    // 后台开关只负责"能不能关"，环境变量是总闸 —— 两个都开才开
    const settingsEnabled = typeof enabledRow === 'boolean' ? enabledRow : true

    return {
      enabled: RADIO_ENABLED_FALLBACK && settingsEnabled,
      channelsText: typeof channelsRow === 'string' ? channelsRow : '',
      defaultChannelId:
        typeof defaultRow === 'string' && defaultRow.trim() !== '' ? defaultRow.trim() : null,
    }
  } catch (error) {
    console.warn('[radio] 读站点设置失败，用默认值：', error)
    return RADIO_SETTINGS_DEFAULT
  }
}
