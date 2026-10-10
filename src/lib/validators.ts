import { z } from 'zod'

import { TREEHOLE_LIMITS } from '@/lib/constants'

/**
 * 前后端共用的校验规则。
 *
 * 同一份 schema 在前端给即时提示、在后端做最后把关 ——
 * 两边规则永远一致，不会出现「前端放过了、后端拒绝」的怪事。
 */

/* --------------------------------------------------------------------------
   树洞
   -------------------------------------------------------------------------- */

export const treeholeSchema = z.object({
  nickname: z
    .string()
    .max(TREEHOLE_LIMITS.nicknameMax, `昵称最多 ${TREEHOLE_LIMITS.nicknameMax} 个字`)
    .optional(),
  content: z
    .string()
    .min(TREEHOLE_LIMITS.contentMin, '总得写点什么吧')
    .max(TREEHOLE_LIMITS.contentMax, `最多 ${TREEHOLE_LIMITS.contentMax} 字，太长了抽屉关不上`),
  mood: z.string().max(20).optional(),
  visibility: z.enum(['public', 'admin', 'private']),
  /** 蜜罐字段：正常访客看不见这个输入框 */
  website: z.string().max(0).optional(),
})

export type TreeholeInput = z.infer<typeof treeholeSchema>

export const treeholeReplySchema = z.object({
  messageId: z.string().uuid('留言 id 不对'),
  content: z.string().min(1, '回复不能是空的').max(1000, '回复最多 1000 字'),
})

export const reportSchema = z.object({
  id: z.string().uuid('留言 id 不对'),
})

/* --------------------------------------------------------------------------
   日记
   -------------------------------------------------------------------------- */

export const diarySchema = z.object({
  title: z.string().min(1, '给这篇起个名字吧').max(120, '标题最多 120 字'),
  content: z.string().min(1, '正文不能是空的').max(50000, '太长了'),
  mood: z.string().max(20).optional(),
  weather: z.string().max(20).optional(),
  tags: z.array(z.string().max(20)).max(8, '标签最多 8 个').default([]),
  visibility: z.enum(['draft', 'public', 'private', 'password']),
})

export type DiaryInput = z.infer<typeof diarySchema>

/* --------------------------------------------------------------------------
   图文手帐
   -------------------------------------------------------------------------- */

export const journalSchema = diarySchema.extend({
  /** 置顶 */
  isPinned: z.boolean().default(false),
  /** 手动排序，数字小的在前 */
  sort: z.coerce.number().int().min(-9999).max(9999).default(0),
  /** 口令手帐的口令；留空表示不改（编辑时）或没有口令（新建时） */
  password: z.string().max(64, '口令最多 64 个字').optional(),
  /** 封面照片的路径 */
  coverPhoto: z.string().max(400).nullable().optional(),
  /**
   * 正文墨水颜色。
   *
   * 只接受 #rrggbb —— 这个值最终会进到 style={{ color }} 里，
   * 在后端就卡死格式，不让任何别的东西流过去。
   * 数据库那一层还有一道 check 约束（见 0008_journal_ink.sql）。
   */
  textColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, '颜色要写成 #rrggbb')
    .nullable()
    .optional(),
})

export type JournalInput = z.infer<typeof journalSchema>

export const journalPhotoSchema = z.object({
  storagePath: z.string().min(1).max(400),
  thumbPath: z.string().max(400).nullable().optional(),
  caption: z.string().max(300, '照片说明最多 300 字').nullable().optional(),
  sort: z.coerce.number().int().min(-9999).max(9999).default(0),
  width: z.coerce.number().int().positive().nullable().optional(),
  height: z.coerce.number().int().positive().nullable().optional(),
})

export type JournalPhotoInput = z.infer<typeof journalPhotoSchema>

export const journalUnlockSchema = z.object({
  id: z.string().uuid('手帐 id 不对'),
  password: z.string().min(1, '请输入口令').max(64, '口令最多 64 个字'),
})

/* --------------------------------------------------------------------------
   音乐
   -------------------------------------------------------------------------- */

export const trackMetaSchema = z.object({
  title: z.string().min(1, '歌名不能空着').max(120, '歌名最多 120 字'),
  artist: z.string().max(120, '艺术家名太长了').optional(),
  tags: z.array(z.string().max(20)).max(6, '标签最多 6 个').default([]),
  note: z.string().max(2000, '深夜笔记最多 2000 字').optional(),
  visibility: z.enum(['public', 'private']),
  sort: z.coerce.number().int().min(-9999).max(9999).default(0),
})

export type TrackMetaInput = z.infer<typeof trackMetaSchema>

/* --------------------------------------------------------------------------
   房间事件
   -------------------------------------------------------------------------- */

export const eventSchema = z.object({
  object_type: z.string().min(1).max(40),
  event_key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9._-]+$/, '事件 key 只能用小写字母、数字、点、下划线、连字符'),
  text: z.string().min(1, '总得说点什么').max(300, '文案最多 300 字'),
  action: z.string().max(40).optional().nullable(),
  trigger: z.enum(['click', 'dblclick', 'longpress', 'combo', 'night', 'first', 'random', 'global']),
  rarity: z.enum(['common', 'rare', 'hidden']),
  weight: z.coerce.number().int().min(0).max(1000).default(10),
  cooldown_seconds: z.coerce.number().int().min(0).max(86400).default(0),
  once: z.boolean().default(false),
  deep_night_only: z.boolean().default(false),
  consecutive_days: z.coerce.number().int().min(1).max(365).nullable().optional(),
  conditions: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
  sort: z.coerce.number().int().default(0),
})

export type EventInput = z.infer<typeof eventSchema>

/* --------------------------------------------------------------------------
   站点设置
   --------------------------------------------------------------------------
   说明：站点设置的校验 schema 写在 `src/lib/admin/settings.ts` 里（驼峰命名，
   与后台表单一一对应）。这里不再放一份蛇形的重复定义 —— 两份 schema 是 bug 温床。
*/

/* --------------------------------------------------------------------------
   上传前的前置校验（文件本身）
   -------------------------------------------------------------------------- */

/** 校验音频文件：类型 + 大小 */
export function validateAudioFile(
  file: File,
  maxMb: number,
  allowedTypes: readonly string[],
  allowedExtensions: readonly string[],
): string | null {
  const sizeMb = file.size / 1024 / 1024
  if (sizeMb > maxMb) return `文件有点大（${sizeMb.toFixed(1)}MB），上限是 ${maxMb}MB`

  const lower = file.name.toLowerCase()
  const extensionOk = allowedExtensions.some((extension) => lower.endsWith(extension))
  const typeOk = allowedTypes.includes(file.type)

  if (!extensionOk && !typeOk) {
    return `不支持的音频格式。可用：${allowedExtensions.join(' / ')}`
  }

  return null
}

/** 校验图片文件 */
export function validateImageFile(
  file: File,
  maxMb: number,
  allowedTypes: readonly string[],
  allowedExtensions: readonly string[],
): string | null {
  const sizeMb = file.size / 1024 / 1024
  if (sizeMb > maxMb) return `图片有点大（${sizeMb.toFixed(1)}MB），上限是 ${maxMb}MB`

  const lower = file.name.toLowerCase()
  const extensionOk = allowedExtensions.some((extension) => lower.endsWith(extension))
  const typeOk = allowedTypes.includes(file.type)

  if (!extensionOk && !typeOk) {
    return `不支持的图片格式。可用：${allowedExtensions.join(' / ')}`
  }

  return null
}
