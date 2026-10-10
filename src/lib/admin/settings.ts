'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { DEFAULT_SITE_SETTINGS } from '@/lib/constants'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { ActionResult, Json, SiteSettings } from '@/types'

import { describeError, guardAdmin } from './guard'

/**
 * 站点设置的写操作。
 *
 * 表结构是 key-value（site_settings: key text / value jsonb / updated_at），
 * 前台由 room-provider.tsx 里的 mergeSiteSettings() 按 key 读出来 ——
 * 所以下面 toRows() 里的 key 名**必须**和 0004_seed.sql、room-provider.tsx 完全一致，
 * 改错一个字母前台就静默退回默认值了。
 * 加字段的唯一入口就是 toRows()，别的地方不要再手写 key 字符串。
 *
 * value 一律是 jsonb：Supabase 客户端会把 JS 的 string / boolean / array / object
 * 自动序列化成 JSON 再写进去，所以这里只要保证值本身是合法的 Json 就行。
 */

/* --------------------------------------------------------------------------
   校验：前台显示什么，这里就限制什么，避免一张超长公告把导航挤爆
   -------------------------------------------------------------------------- */

/**
 * 经纬度的输入。
 *
 * 在表单里是文本框（"留空就用环境变量的兜底值"比一个必须填的数字输入更好用），
 * 所以这里按字符串收，再在 saveSettings 里转成 number | null。
 * 范围校验放在这儿，免得把一个手滑打出来的 999 存进数据库，
 * 然后 suncalc 拿它算出一堆 Invalid Date。
 */
const optionalCoordinate = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .optional()
    .default('')
    .refine((value) => {
      if (value === '') return true
      const parsed = Number(value)
      return Number.isFinite(parsed) && parsed >= min && parsed <= max
    }, `${label}要填 ${min} 到 ${max} 之间的数字，或者留空`)

/** '' / 乱填 → null（交给 env.server 的兜底值） */
function parseCoordinate(value: string): number | null {
  if (!value || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const socialLinkSchema = z.object({
  label: z.string().trim().min(1, '社交链接要有名字').max(40, '名字最多 40 字'),
  href: z.string().trim().min(1, '社交链接要有地址').max(400, '地址太长了'),
  icon: z.string().trim().max(40, '图标名最多 40 字').optional(),
})

const bannedWordSchema = z.string().trim().min(1, '空的敏感词没有意义').max(40, '单个词最多 40 字')

const settingsSchema = z.object({
  roomName: z.string().trim().min(1, '房间名不能空').max(40, '房间名最多 40 字'),
  hostName: z.string().trim().min(1, '房东称呼不能空').max(20, '房东称呼最多 20 字'),
  tagline: z.string().trim().max(80, '一句话简介最多 80 字'),
  about: z.string().trim().max(2000, '关于最多 2000 字'),
  weather: z.string().trim().max(20, '天气写几个字就好'),
  weatherNote: z.string().trim().max(120, '天气那句话最多 120 字'),
  announcement: z.string().trim().max(300, '公告最多 300 字').nullable(),
  gamesEnabled: z.boolean(),
  treeholeNotice: z.string().trim().max(500, '树洞说明最多 500 字'),
  treeholeBannedWords: z.array(bannedWordSchema).max(200, '敏感词最多 200 条'),
  musicCopyrightNotice: z.string().trim().max(500, '版权提醒最多 500 字'),
  musicNightTag: z.string().trim().max(20, '深夜歌单标签最多 20 字'),
  shelfNote: z.string().trim().max(300, '唱片架那句话最多 300 字'),

  /* ---------------- 外部数据源 ---------------- */

  weatherEnabled: z.boolean().default(true),
  weatherCity: z.string().trim().max(40, '城市名最多 40 字').optional().default(''),
  weatherLat: optionalCoordinate(-90, 90, '纬度'),
  weatherLon: optionalCoordinate(-180, 180, '经度'),
  dailyQuoteEnabled: z.boolean().default(true),
  dailyQuoteOverride: z
    .string()
    .trim()
    .max(200, '手动填的句子最多 200 字')
    .optional()
    .default(''),
  socialLinks: z.array(socialLinkSchema).max(20, '社交链接最多 20 条'),
  backgroundAudio: z.string().trim().max(400, '背景音地址太长了').nullable(),
})

/** 设置表单的入参（与 SettingsForm 的受控字段一一对应） */
export type SettingsInput = z.infer<typeof settingsSchema>

/* --------------------------------------------------------------------------
   数据库行
   -------------------------------------------------------------------------- */

/** jsonb 里那种普通 JSON 对象（写成显式索引签名，省得和 Json 的联合类型绕来绕去） */
type JsonObject = { [key: string]: Json | undefined }

/** 一行 site_settings；value 是 jsonb，所以类型必须是 Json */
interface SettingRow {
  key: string
  value: Json
  updated_at: string
}

/**
 * SiteSettings（驼峰）→ site_settings 的行（蛇形 key）。
 * 这是全站唯一写 key 名的地方，也是「后台写」与「前台读」之间唯一的契约。
 */
function toRows(settings: SiteSettings): SettingRow[] {
  const updatedAt = new Date().toISOString()

  const rows: SettingRow[] = [
    { key: 'room_name', value: settings.roomName, updated_at: updatedAt },
    { key: 'host_name', value: settings.hostName, updated_at: updatedAt },
    { key: 'tagline', value: settings.tagline, updated_at: updatedAt },
    { key: 'about', value: settings.about, updated_at: updatedAt },
    { key: 'weather', value: settings.weather, updated_at: updatedAt },
    { key: 'weather_note', value: settings.weatherNote, updated_at: updatedAt },
    // 留空一律存 null：前台的 types 就是 string | null，用 null 表示「没有」
    {
      key: 'background_audio',
      value: settings.backgroundAudio && settings.backgroundAudio.length > 0 ? settings.backgroundAudio : null,
      updated_at: updatedAt,
    },
    {
      key: 'announcement',
      value: settings.announcement && settings.announcement.length > 0 ? settings.announcement : null,
      updated_at: updatedAt,
    },
    // 数组类的值都在这里摊平成普通对象字面量，保证能当成 Json 序列化
    {
      key: 'social_links',
      value: settings.socialLinks.map<JsonObject>((link) => ({
        label: link.label,
        href: link.href,
        icon: link.icon ?? '',
      })),
      updated_at: updatedAt,
    },
    { key: 'games_enabled', value: settings.gamesEnabled, updated_at: updatedAt },
    { key: 'treehole_notice', value: settings.treeholeNotice, updated_at: updatedAt },
    // string[] 本身就是合法的 Json（Json 里包含 Json[]）
    { key: 'treehole_banned_words', value: settings.treeholeBannedWords, updated_at: updatedAt },
    { key: 'music_copyright_notice', value: settings.musicCopyrightNotice, updated_at: updatedAt },
    { key: 'music_night_tag', value: settings.musicNightTag, updated_at: updatedAt },
    { key: 'shelf_note', value: settings.shelfNote, updated_at: updatedAt },

    /* ---------------- 外部数据源 ----------------
       注意：**不写** weather_cache / daily_quote 这两个 key ——
       那是运行时的缓存，由 lib/external 自己维护。
       后台表单只负责开关和参数，别把缓存覆盖掉。
       （daily_quote_override 不一样，它就是给后台改的。） */
    { key: 'weather_enabled', value: settings.weatherEnabled, updated_at: updatedAt },
    { key: 'weather_city', value: settings.weatherCity ?? '', updated_at: updatedAt },
    { key: 'weather_lat', value: settings.weatherLat, updated_at: updatedAt },
    { key: 'weather_lon', value: settings.weatherLon, updated_at: updatedAt },
    { key: 'daily_quote_enabled', value: settings.dailyQuoteEnabled, updated_at: updatedAt },
    {
      key: 'daily_quote_override',
      value: settings.dailyQuoteOverride ?? '',
      updated_at: updatedAt,
    },
  ]

  return rows
}

/** 写完之后，后台页与首页都要重新渲染 */
function revalidateSettings() {
  revalidatePath('/admin/settings')
  revalidatePath('/')
}

/* --------------------------------------------------------------------------
   Actions
   -------------------------------------------------------------------------- */

/** 一次性把上面所有 key upsert 进 site_settings（缺失的会补上，已有的会更新） */
export async function saveSettings(input: SettingsInput): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = settingsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '表单内容不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  const data = parsed.data

  const settings: SiteSettings = {
    roomName: data.roomName,
    hostName: data.hostName,
    tagline: data.tagline,
    about: data.about,
    weather: data.weather,
    weatherNote: data.weatherNote,
    announcement: data.announcement && data.announcement.length > 0 ? data.announcement : null,
    gamesEnabled: data.gamesEnabled,
    treeholeNotice: data.treeholeNotice,
    treeholeBannedWords: data.treeholeBannedWords,
    musicCopyrightNotice: data.musicCopyrightNotice,
    musicNightTag: data.musicNightTag,
    shelfNote: data.shelfNote,
    weatherEnabled: data.weatherEnabled,
    weatherCity: data.weatherCity.length > 0 ? data.weatherCity : null,
    weatherLat: parseCoordinate(data.weatherLat),
    weatherLon: parseCoordinate(data.weatherLon),
    dailyQuoteEnabled: data.dailyQuoteEnabled,
    dailyQuoteOverride: data.dailyQuoteOverride.length > 0 ? data.dailyQuoteOverride : null,
    socialLinks: data.socialLinks.map((link) => ({
      label: link.label,
      href: link.href,
      icon: link.icon ?? '',
    })),
    backgroundAudio:
      data.backgroundAudio && data.backgroundAudio.length > 0 ? data.backgroundAudio : null,
  }

  try {
    const { error } = await supabase
      .from('site_settings')
      .upsert(toRows(settings), { onConflict: 'key' })

    if (error) throw error

    revalidateSettings()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '设置没保存上。') }
  }
}

/**
 * 恢复默认设置（危险操作，UI 上必须走 ActionButton 的 confirm）。
 * 注意：这里恢复的是 constants.ts 里的 DEFAULT_SITE_SETTINGS，
 * 站长自己写过的房间名、公告、热线都会没有 —— 所以二次确认不是多余的。
 */
export async function resetSettings(): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase
      .from('site_settings')
      .upsert(toRows(DEFAULT_SITE_SETTINGS), { onConflict: 'key' })

    if (error) throw error

    revalidateSettings()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '恢复默认失败了。') }
  }
}
