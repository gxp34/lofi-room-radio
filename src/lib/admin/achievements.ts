'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { DEFAULT_ACHIEVEMENTS } from '@/lib/constants'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/types'

import { describeError, guardAdmin } from './guard'

/**
 * 成就管理的写操作。
 *
 * 两个容易踩的坑，都写在这里免得以后忘：
 *   1. achievements 的主键是 uuid `id`，但业务键是唯一的 text `key`；
 *      `user_achievements.achievement_key` 外键指向的正是 `key`。
 *      所以**改 key 等于换了一条成就**：老的解锁记录会被外键 on delete cascade 带走。
 *      为了不静默丢掉玩家数据，这里的编辑**不允许改 key**，要换就新建一条。
 *   2. 删除会连带删掉 user_achievements 里对应的解锁记录，界面上必须提醒。
 */

const achievementSchema = z.object({
  key: z
    .string()
    .min(1, 'key 不能是空的')
    .max(60, 'key 最多 60 个字符')
    .regex(/^[a-z0-9_]+$/, 'key 只能用小写字母、数字、下划线，例如 lamp_keeper'),
  name: z.string().min(1, '成就得有个名字').max(40, '名字最多 40 字'),
  description: z.string().max(200, '描述最多 200 字').nullable().optional(),
  /** lucide 图标名；不在 src/components/icon.tsx 白名单里的会显示成默认图标 */
  icon: z.string().max(40, '图标名最多 40 个字符').nullable().optional(),
  secret: z.boolean().default(false),
  sort: z.coerce.number().int().min(-9999).max(9999).default(0),
})

/** 客户端入口入参（sort 允许传字符串，交给 z.coerce 处理） */
export type AchievementInput = {
  key: string
  name: string
  description?: string | null
  icon?: string | null
  secret?: boolean | null
  sort?: number | string | null
}

function revalidateAchievementPaths() {
  revalidatePath('/admin/achievements')
  // 首页软木板会展示成就
  revalidatePath('/')
}

/** 空字符串统一存成 null，免得数据库里混着 '' 和 null 两种「没有」 */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

/** 新建一个成就 */
export async function createAchievement(
  input: AchievementInput,
): Promise<ActionResult<{ key: string }>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = achievementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '表单内容不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  const data = parsed.data

  try {
    // 先查一次，好给「key 重复」一个人话解释（数据库报唯一冲突的信息太原始）
    const { data: existing, error: readError } = await supabase
      .from('achievements')
      .select('key')
      .eq('key', data.key)
      .maybeSingle()

    if (readError) throw readError
    if (existing) return { ok: false, error: `key「${data.key}」已经有一条成就了。` }

    const { error } = await supabase.from('achievements').insert({
      key: data.key,
      name: data.name,
      description: blankToNull(data.description),
      icon: blankToNull(data.icon),
      secret: data.secret,
      sort: data.sort,
    })

    if (error) throw error

    revalidateAchievementPaths()
    return { ok: true, data: { key: data.key } }
  } catch (error) {
    return { ok: false, error: describeError(error, '这个成就没建起来。') }
  }
}

/**
 * 改一个成就（按 key 定位）。
 * key 本身不可改：它是 user_achievements 的外键目标，改了等于把玩家的解锁记录删掉。
 */
export async function updateAchievement(
  key: string,
  input: AchievementInput,
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = achievementSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '表单内容不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  const data = parsed.data

  try {
    const { error } = await supabase
      .from('achievements')
      .update({
        name: data.name,
        description: blankToNull(data.description),
        icon: blankToNull(data.icon),
        secret: data.secret,
        sort: data.sort,
      })
      .eq('key', key)

    if (error) throw error

    revalidateAchievementPaths()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '改动没保存上。') }
  }
}

/**
 * 删一个成就。
 * 注意：`user_achievements.achievement_key` 是 on delete cascade，
 * 删掉之后所有人对应的解锁记录会一起消失 —— 界面上必须提醒，这里不做别的补偿。
 */
export async function deleteAchievement(key: string): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase.from('achievements').delete().eq('key', key)
    if (error) throw error

    revalidateAchievementPaths()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '没能删掉这个成就。') }
  }
}

/**
 * 补全内置成就：把 DEFAULT_ACHIEVEMENTS 里数据库还没有的 key 插进去。
 * 已有的整条跳过（不动你改过的名字和描述）。
 */
export async function seedBuiltInAchievements(): Promise<
  ActionResult<{ inserted: number; skipped: number }>
> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { data: existing, error: readError } = await supabase.from('achievements').select('key')
    if (readError) throw readError

    const existingKeys = new Set((existing ?? []).map((row) => row.key))
    const rows = DEFAULT_ACHIEVEMENTS.filter((item) => !existingKeys.has(item.key)).map((item) => ({
      key: item.key,
      name: item.name,
      description: item.description,
      icon: item.icon,
      secret: item.secret,
      sort: item.sort,
    }))

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('achievements').insert(rows)
      if (insertError) throw insertError
    }

    revalidateAchievementPaths()
    return {
      ok: true,
      data: { inserted: rows.length, skipped: DEFAULT_ACHIEVEMENTS.length - rows.length },
    }
  } catch (error) {
    return { ok: false, error: describeError(error, '内置成就没补全成功。') }
  }
}
