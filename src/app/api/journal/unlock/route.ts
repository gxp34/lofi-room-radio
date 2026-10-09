import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { isSupabaseConfigured } from '@/lib/env'
import { loadJournalEntryById } from '@/lib/journal-data'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getClientIp, hashIp } from '@/lib/treehole'
import { journalUnlockSchema } from '@/lib/validators'

/**
 * 打开一篇口令手帐。
 *
 * 为什么必须走服务端：
 *   口令手帐的正文**根本没有**进入 RLS 的可见范围 —— 用匿名 key 查是查不到的。
 *   所以流程是「服务端校验口令 → 用 service_role 取回内容 → 签好照片地址返回」。
 *   这样即使有人拿 anon key 直接翻数据库，也看不到一个字。
 *
 * 另外加了限流：同一个 IP 一分钟最多试 8 次，避免被暴力穷举。
 */

const WINDOW_MS = 60_000
const MAX_ATTEMPTS = 8
const attempts = new Map<string, number[]>()

function tooManyAttempts(key: string): boolean {
  const now = Date.now()
  const history = (attempts.get(key) ?? []).filter((time) => now - time < WINDOW_MS)

  if (history.length >= MAX_ATTEMPTS) {
    attempts.set(key, history)
    return true
  }

  history.push(now)
  attempts.set(key, history)

  if (attempts.size > 500) {
    for (const [mapKey, times] of attempts) {
      if (times.every((time) => now - time >= WINDOW_MS)) attempts.delete(mapKey)
    }
  }

  return false
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { ok: false, message: '这个站点还没连上数据库，暂时打不开。' },
      { status: 503 },
    )
  }

  let parsed: z.infer<typeof journalUnlockSchema>
  try {
    parsed = journalUnlockSchema.parse(await request.json())
  } catch (error) {
    const message =
      error instanceof z.ZodError ? (error.issues[0]?.message ?? '请求不对') : '请求不对'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }

  const key = hashIp(getClientIp(request.headers))
  if (tooManyAttempts(key)) {
    return NextResponse.json(
      { ok: false, message: '试得有点频繁，等一分钟再来。' },
      { status: 429 },
    )
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, message: '服务暂时不可用。' }, { status: 503 })
  }

  const { data: passed, error } = await supabase.rpc('journal_check_password', {
    p_id: parsed.id,
    p_password: parsed.password,
  })

  if (error) {
    console.warn('[journal] 口令校验失败：', error.message)
    return NextResponse.json({ ok: false, message: '校验出错了，稍后再试。' }, { status: 500 })
  }

  if (!passed) {
    return NextResponse.json({ ok: false, message: '口令不对。' }, { status: 403 })
  }

  // 校验通过才动用 service_role 取正文
  const entry = await loadJournalEntryById(parsed.id, true)
  if (!entry) {
    return NextResponse.json({ ok: false, message: '这篇手帐已经不在了。' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, entry })
}
