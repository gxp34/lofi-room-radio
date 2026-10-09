'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { DEFAULT_EVENT_POOL } from '@/lib/events/pool'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { eventSchema } from '@/lib/validators'
import type { ActionResult, Json } from '@/types'

import { describeError, guardAdmin } from './guard'

/**
 * 事件池管理的写操作。
 *
 * 几个必须知道的点：
 *   1. 前台是「启动时读一次事件池」，所以这里改完要等**下一次刷新**才生效；
 *      revalidatePath 只能让后台页面自己看到新数据。
 *   2. `DEFAULT_EVENT_POOL` 里的 `action` 是 union 类型，写库前统一转成 string。
 *   3. `events.event_key` 在 0001_schema.sql 里**只有索引、没有 unique 约束**，
 *      所以导入内置池不能用 upsert(onConflict) —— 只能「先查已存在的 key，再筛掉」。
 */

/**
 * 表单/客户端入口的入参：字段与 eventSchema 一致，
 * 但把 `z.coerce` 的输入放宽成 number | string（表单里拿到的可能是字符串）。
 */
export type EventInput = {
  object_type: string
  event_key: string
  text: string
  action?: string | null
  trigger: z.input<typeof eventSchema>['trigger']
  rarity: z.input<typeof eventSchema>['rarity']
  weight?: number | string | null
  cooldown_seconds?: number | string | null
  once?: boolean | null
  deep_night_only?: boolean | null
  consecutive_days?: number | string | null
  conditions?: Record<string, unknown> | null
  enabled?: boolean | null
  sort?: number | string | null
}

/** 每个写操作最后都要刷这两个路径 */
function revalidateEventPaths() {
  revalidatePath('/admin/events')
  revalidatePath('/')
}

/** 把校验过的数据摊平成数据库列（避免三处重复写同样的映射） */
function toColumns(data: z.output<typeof eventSchema>) {
  const conditions = (data.conditions ?? {}) as Json

  return {
    object_type: data.object_type,
    event_key: data.event_key,
    text: data.text,
    action: data.action ?? null,
    trigger: data.trigger,
    rarity: data.rarity,
    weight: data.weight,
    cooldown_seconds: data.cooldown_seconds,
    once: data.once,
    conditions,
    deep_night_only: data.deep_night_only,
    consecutive_days: data.consecutive_days ?? null,
    enabled: data.enabled,
    sort: data.sort,
  }
}

/** 新建一条事件 */
export async function createEvent(input: EventInput): Promise<ActionResult<{ id: string }>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '表单内容不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { data, error } = await supabase
      .from('events')
      .insert(toColumns(parsed.data))
      .select('id')
      .single()

    if (error) throw error

    revalidateEventPaths()
    return { ok: true, data: { id: data.id } }
  } catch (error) {
    return { ok: false, error: describeError(error, '这条事件没写进去。') }
  }
}

/** 改一条事件（含文案、触发方式、稀有度、权重、冷却、conditions 等全部字段） */
export async function updateEvent(
  id: string,
  input: EventInput,
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '表单内容不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase.from('events').update(toColumns(parsed.data)).eq('id', id)
    if (error) throw error

    revalidateEventPaths()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '改动没保存上。') }
  }
}

/** 删除一条事件 */
export async function deleteEvent(id: string): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) throw error

    revalidateEventPaths()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '没能删掉这条事件。') }
  }
}

/** 只切换启用状态（列表里的快捷开关） */
export async function toggleEvent(
  id: string,
  enabled: boolean,
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase.from('events').update({ enabled }).eq('id', id)
    if (error) throw error

    revalidateEventPaths()
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '开关没拨动。') }
  }
}

/**
 * 把内置事件池（DEFAULT_EVENT_POOL，60 条）灌进 events 表。
 *
 * 冲突处理：event_key 没有 unique 约束，所以不能 upsert 忽略重复，
 * 这里先查出已经存在的 key（分页拉全，Supabase 默认单次最多 1000 行），
 * 再把内置池里「key 已经存在」的条目整条跳过。
 * 返回插入 / 跳过各多少条，方便界面上给个准确的回执。
 */
export async function importBuiltinEvents(): Promise<
  ActionResult<{ inserted: number; skipped: number }>
> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { data: existing, error: readError } = await supabase.from('events').select('event_key')
    if (readError) throw readError

    const existingKeys = new Set((existing ?? []).map((row) => row.event_key))
    const rows = DEFAULT_EVENT_POOL.filter((event) => !existingKeys.has(event.eventKey)).map(
      (event) => ({
        object_type: event.objectType,
        event_key: event.eventKey,
        text: event.text,
        action: event.action ?? null,
        trigger: event.trigger,
        rarity: event.rarity,
        weight: event.weight,
        cooldown_seconds: event.cooldownSeconds,
        once: event.once,
        conditions: event.conditions as Json,
        deep_night_only: event.deepNightOnly,
        consecutive_days: event.consecutiveDays ?? null,
        enabled: event.enabled,
        sort: event.sort,
      }),
    )

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('events').insert(rows)
      if (insertError) throw insertError
    }

    revalidateEventPaths()
    return {
      ok: true,
      data: { inserted: rows.length, skipped: DEFAULT_EVENT_POOL.length - rows.length },
    }
  } catch (error) {
    return { ok: false, error: describeError(error, '内置事件池没导入成功。') }
  }
}
