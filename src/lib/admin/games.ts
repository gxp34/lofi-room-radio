'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { DEFAULT_GAMES } from '@/lib/constants'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { ActionResult, Json } from '@/types'

import { describeError, guardAdmin } from './guard'

/**
 * 小游戏管理的写操作。
 *
 * 关于排行榜（很重要，别误会后台坏了）：
 *   前台的最高分是存在访客浏览器 localStorage 里的（/games 页面目前只写本地），
 *   所以 game_scores 里的记录**只会来自访客主动提交**，条数很少甚至一直是 0。
 *   后台能做的只是：开关游戏、改名字和说明、删掉某条记录、整档清空。
 *
 * games.config 是 jsonb，前台现在并没有读它（掌机参数写在代码里），
 * 但种子数据里有，所以 ensureGames() 会把它一起补上，方便以后真的从数据库读。
 */

const slugSchema = z.string().trim().min(1, '游戏标识不对').max(40, '游戏标识太长了')

const scoreIdSchema = z.string().uuid('这条记录的 id 不对')

const gameConfigSchema = z.object({
  name: z.string().trim().min(1, '游戏名不能空').max(40, '游戏名最多 40 字'),
  description: z.string().trim().max(200, '说明最多 200 字').nullable().optional(),
  sort: z.coerce.number().int().min(-9999).max(9999),
})

/** updateGameConfig 的入参 */
export type GameConfigInput = z.infer<typeof gameConfigSchema>

/** 每个写操作都要刷后台页和前台游戏页 */
function revalidateGamePages() {
  revalidatePath('/admin/games')
  revalidatePath('/games')
}

/** 开 / 关某个游戏 */
export async function toggleGame(slug: string, enabled: boolean): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsedSlug = slugSchema.safeParse(slug)
  if (!parsedSlug.success) {
    return { ok: false, error: parsedSlug.error.issues[0]?.message ?? '游戏标识不对' }
  }

  const parsedEnabled = z.boolean().safeParse(enabled)
  if (!parsedEnabled.success) return { ok: false, error: '开关的取值不对' }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase
      .from('games')
      .update({ enabled: parsedEnabled.data })
      .eq('slug', parsedSlug.data)

    if (error) throw error

    revalidateGamePages()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '开关没切换成功。') }
  }
}

/** 改游戏的名字 / 说明 / 排序（不动 config，也不动开关） */
export async function updateGameConfig(
  slug: string,
  input: GameConfigInput,
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsedSlug = slugSchema.safeParse(slug)
  if (!parsedSlug.success) {
    return { ok: false, error: parsedSlug.error.issues[0]?.message ?? '游戏标识不对' }
  }

  const parsed = gameConfigSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '表单内容不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase
      .from('games')
      .update({
        name: parsed.data.name,
        // 空说明存 null，别留一堆空字符串
        description: parsed.data.description && parsed.data.description.length > 0
          ? parsed.data.description
          : null,
        sort: parsed.data.sort,
      })
      .eq('slug', parsedSlug.data)

    if (error) throw error

    revalidateGamePages()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '改动没保存上。') }
  }
}

/**
 * 把 DEFAULT_GAMES 里缺失的 slug 补进 games 表。
 * 用 ignoreDuplicates，已存在的行原封不动 —— 不会把你在后台改过的名字和说明冲掉。
 */
export async function ensureGames(): Promise<ActionResult<{ inserted: number }>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { data: existing, error: readError } = await supabase.from('games').select('slug')
    if (readError) throw readError

    const known = new Set((existing ?? []).map((row) => row.slug))
    const missing = DEFAULT_GAMES.filter((game) => !known.has(game.slug))

    if (missing.length === 0) {
      revalidateGamePages()
      return { ok: true, data: { inserted: 0 } }
    }

    const rows = missing.map((game) => ({
      slug: game.slug,
      name: game.name,
      description: game.description,
      enabled: game.enabled,
      // GameDef.config 是 Record<string, unknown>，与 jsonb 的 Json 天然对不上；
      // 里面的值都是普通 JSON 基本类型，这里断言一下就够了。
      config: game.config as unknown as Json,
      sort: game.sort,
    }))

    const { error } = await supabase
      .from('games')
      .upsert(rows, { onConflict: 'slug', ignoreDuplicates: true })

    if (error) throw error

    revalidateGamePages()
    return { ok: true, data: { inserted: rows.length } }
  } catch (error) {
    return { ok: false, error: describeError(error, '内置游戏没补上。') }
  }
}

/** 删掉一条排行榜记录（访客提交的脏数据、重复记录都靠它） */
export async function deleteScore(id: string): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = scoreIdSchema.safeParse(id)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '这条记录的 id 不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase.from('game_scores').delete().eq('id', parsed.data)
    if (error) throw error

    revalidateGamePages()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '这条记录没删掉。') }
  }
}

/** 清空某个游戏的排行榜（危险操作，UI 上要 confirm） */
export async function clearScores(slug: string): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = slugSchema.safeParse(slug)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '游戏标识不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase.from('game_scores').delete().eq('game_slug', parsed.data)
    if (error) throw error

    revalidateGamePages()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '排行榜没清掉。') }
  }
}
