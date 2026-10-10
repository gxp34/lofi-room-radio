'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { readJSON, writeJSON } from '@/lib/storage'

/**
 * 小游戏存档：本地 + 云端。
 *
 * 两条原则：
 *
 *   1. **先本地，后云端。** 本地是同步读的，界面第一帧就有数据；
 *      云端要等网络，只用来「发现另一台设备上更新的进度」。
 *      没登录的话整个云端流程跳过，游戏照常玩。
 *
 *   2. **云端不作数的时候不能覆盖本地。** 两边都带 updatedAt，
 *      谁新用谁。否则会出现：你在手机上玩到一半，回电脑打开发现进度被
 *      云端一份更旧的记录盖回去了。
 *
 * 存档的形状由每个游戏自己定，这一层只当它是 JSON。
 */

/** 一份存档：状态 + 写入时间 */
export interface GameSaveEnvelope<T> {
  state: T
  updatedAt: string
}

const LOCAL_PREFIX = 'lofi:game-save:'

const localKey = (slug: string) => `${LOCAL_PREFIX}${slug}`

/** 读本地存档（同步，立即返回） */
export function readLocalSave<T>(slug: string, fallback: T): GameSaveEnvelope<T> {
  const raw = readJSON<GameSaveEnvelope<T> | null>(localKey(slug), null)

  // 老版本或者手工改坏的数据都可能缺字段，逐项兜住
  if (!raw || typeof raw !== 'object' || !('state' in raw)) {
    return { state: fallback, updatedAt: new Date(0).toISOString() }
  }

  return {
    state: raw.state ?? fallback,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
  }
}

/** 写本地存档 */
export function writeLocalSave<T>(slug: string, state: T, updatedAt = new Date().toISOString()) {
  writeJSON(localKey(slug), { state, updatedAt } satisfies GameSaveEnvelope<T>)
}

/** 时间戳比较，坏值当成「很旧」 */
function timeOf(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

/**
 * 从云端拉一份。
 * 没配置 Supabase、没登录、表还不存在（迁移没跑）—— 一律返回 null，
 * 让调用方安静地退回本地，而不是抛错把游戏打断。
 */
export async function readCloudSave<T>(slug: string): Promise<GameSaveEnvelope<T> | null> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return null

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) return null

    const { data, error } = await supabase
      .from('game_saves')
      .select('state_json, updated_at')
      .eq('game_slug', slug)
      .maybeSingle()

    if (error) {
      // 表不存在（0009 没跑）是最常见的情况，不必吵闹
      console.warn('[game-save] 读云端存档失败：', error.message)
      return null
    }
    if (!data) return null

    return { state: data.state_json as T, updatedAt: data.updated_at }
  } catch (error) {
    console.warn('[game-save] 读云端存档异常：', error)
    return null
  }
}

/**
 * 推一份到云端。
 * 返回是否真的写成功了 —— 没登录返回 false，调用方据此决定要不要提示。
 */
export async function writeCloudSave<T>(slug: string, state: T): Promise<boolean> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return false

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) return false

    const { error } = await supabase.from('game_saves').upsert(
      {
        user_id: session.user.id,
        game_slug: slug,
        // jsonb 列：把普通对象当成 Json 塞进去
        state_json: state as never,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,game_slug' },
    )

    if (error) {
      console.warn('[game-save] 写云端存档失败：', error.message)
      return false
    }
    return true
  } catch (error) {
    console.warn('[game-save] 写云端存档异常：', error)
    return false
  }
}

/**
 * 完整流程，给游戏用：
 *   1. 同步拿到本地存档（界面立刻可用）
 *   2. 后台问一次云端，如果那边更新，用云端覆盖本地并回调通知
 *
 * 返回本地那一份，onCloudNewer 只在云端确实更新时调用。
 */
export async function hydrateSave<T>(
  slug: string,
  fallback: T,
  onCloudNewer?: (state: T) => void,
): Promise<GameSaveEnvelope<T>> {
  const local = readLocalSave(slug, fallback)
  const cloud = await readCloudSave<T>(slug)

  if (cloud && timeOf(cloud.updatedAt) > timeOf(local.updatedAt)) {
    writeLocalSave(slug, cloud.state, cloud.updatedAt)
    onCloudNewer?.(cloud.state)
    return cloud
  }

  return local
}

/** 存一次：本地立刻写，云端异步推（不阻塞界面） */
export function persistSave<T>(slug: string, state: T): void {
  writeLocalSave(slug, state)
  void writeCloudSave(slug, state)
}
