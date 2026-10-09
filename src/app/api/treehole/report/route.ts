import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { isSupabaseConfigured } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getClientIp, hashIp } from '@/lib/treehole'
import { reportSchema } from '@/lib/validators'

/**
 * 举报一条树洞留言。
 *
 * 数据库函数 report_treehole_message 内部会：
 *   - 只允许举报「已通过且未隐藏」的留言
 *   - 累计到 3 次自动打上 is_flagged，进后台待审
 *
 * 这里再加一层进程内的限流：同一个 IP 一分钟最多举报 5 次。
 * （Serverless 实例会重建，所以这只是「顺手挡一下」，真正的防线是那个 3 次阈值。）
 */

const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 5
const attempts = new Map<string, number[]>()

function tooManyReports(key: string): boolean {
  const now = Date.now()
  const history = (attempts.get(key) ?? []).filter((time) => now - time < WINDOW_MS)

  if (history.length >= MAX_PER_WINDOW) {
    attempts.set(key, history)
    return true
  }

  history.push(now)
  attempts.set(key, history)

  // 顺手清一下过期条目，避免 Map 无限长大
  if (attempts.size > 500) {
    for (const [mapKey, times] of attempts) {
      if (times.every((time) => now - time >= WINDOW_MS)) attempts.delete(mapKey)
    }
  }

  return false
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ ok: false, error: 'DEMO_MODE' }, { status: 503 })
  }

  let parsed: z.infer<typeof reportSchema>
  try {
    parsed = reportSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 })
  }

  const ipKey = hashIp(getClientIp(request.headers))
  if (tooManyReports(ipKey)) {
    return NextResponse.json(
      { ok: false, error: 'TOO_MANY', message: '举报太频繁了，先歇一会儿。' },
      { status: 429 },
    )
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'NOT_CONFIGURED' }, { status: 503 })
  }

  const { error } = await supabase.rpc('report_treehole_message', { p_id: parsed.id })

  if (error) {
    console.warn('[treehole] 举报失败：', error.message)
    return NextResponse.json(
      { ok: false, error: 'RPC_ERROR', message: '这条留言现在不能被举报。' },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true })
}
