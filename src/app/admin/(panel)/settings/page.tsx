import { SettingsForm } from '@/components/admin/settings-form'
import { AdminPage, EmptyState } from '@/components/admin/ui'
import { DEFAULT_SITE_SETTINGS } from '@/lib/constants'
import { isSupabaseConfigured } from '@/lib/env'
import { settingArray, settingBoolean, settingString, settingsToMap } from '@/lib/mappers'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { SiteSettings, SocialLink } from '@/types'
import type { Tables } from '@/types/database'

/**
 * 后台 · 站点设置。
 *
 * 读的时候把 site_settings 的 key-value 合并到 DEFAULT_SITE_SETTINGS 上，
 * 合并规则与前台 room-provider.tsx 的 mergeSiteSettings() 完全一样
 * （见下面 mergeSettings 的注释）—— 后台看到的就是访客看到的。
 */

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage() {
  if (!isSupabaseConfigured) {
    return (
      <AdminPage title="站点设置" description="房间名、天气、公告、树洞、音乐与社交链接都在这里改。">
        <EmptyState
          title="还没连上数据库"
          description="请在 .env.local 里填好 NEXT_PUBLIC_SUPABASE_URL 与 ANON KEY，并执行 0001–0005 的 SQL。"
        />
      </AdminPage>
    )
  }

  const settings = await loadSiteSettings()

  return (
    <AdminPage
      title="站点设置"
      description="改完点保存，前台刷新一次就会用上新设置。留空的公告与背景音会存成 null，表示「没有」。"
    >
      <SettingsForm initial={settings} />
    </AdminPage>
  )
}

/** 读全部设置；读不到就用内置默认值，绝不让页面崩掉 */
async function loadSiteSettings(): Promise<SiteSettings> {
  const supabase = createSupabaseServerClient()
  if (!supabase) return DEFAULT_SITE_SETTINGS

  try {
    const { data, error } = await supabase.from('site_settings').select('key, value')

    if (error) {
      console.warn('[admin/settings] 读取失败：', error.message)
      return DEFAULT_SITE_SETTINGS
    }

    return mergeSettings(data ?? [])
  } catch (error) {
    console.warn('[admin/settings] 读取异常：', error)
    return DEFAULT_SITE_SETTINGS
  }
}

/**
 * 数据库行 → SiteSettings。
 *
 * 与 room-provider.tsx 的 mergeSiteSettings() 用同一套 key 名与同一套兜底规则：
 * 数据库里没有的键保持默认，类型不对的也保持默认（一条脏数据不该把页面搞坏）。
 */
function mergeSettings(
  rows: Array<Pick<Tables<'site_settings'>, 'key' | 'value'>>,
): SiteSettings {
  const map = settingsToMap(rows)
  const fallback = DEFAULT_SITE_SETTINGS

  return {
    roomName: settingString(map, 'room_name', fallback.roomName),
    hostName: settingString(map, 'host_name', fallback.hostName),
    tagline: settingString(map, 'tagline', fallback.tagline),
    about: settingString(map, 'about', fallback.about),
    weather: settingString(map, 'weather', fallback.weather),
    weatherNote: settingString(map, 'weather_note', fallback.weatherNote),
    // 这两个是「可以为 null」的字符串：数据库里是 null 或缺键都当成没有
    backgroundAudio: settingString(map, 'background_audio', '') || null,
    announcement: settingString(map, 'announcement', '') || null,
    socialLinks: settingArray<SocialLink>(map, 'social_links', fallback.socialLinks),
    gamesEnabled: settingBoolean(map, 'games_enabled', fallback.gamesEnabled),
    treeholeNotice: settingString(map, 'treehole_notice', fallback.treeholeNotice),
    treeholeBannedWords: settingArray<string>(
      map,
      'treehole_banned_words',
      fallback.treeholeBannedWords,
    ),
    musicCopyrightNotice: settingString(
      map,
      'music_copyright_notice',
      fallback.musicCopyrightNotice,
    ),
    musicNightTag: settingString(map, 'music_night_tag', fallback.musicNightTag),
    shelfNote: settingString(map, 'shelf_note', fallback.shelfNote),
  }
}
