import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { DEFAULT_BANNED_WORDS } from '@/lib/constants'
import { isSupabaseConfigured } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  getClientIp,
  hashIp,
  looksLikeSpam,
  normalizeContent,
  normalizeNickname,
  scanBannedWords,
} from '@/lib/treehole'

/**
 * 树洞投递。
 *
 * 为什么走服务端而不是让前端直接写库：
 *   1. ip_hash 必须在服务端算（浏览器算出来的不可信，而且会暴露盐）；
 *   2. 敏感词扫描需要一个统一的地方，改词库不用发版；
 *   3. 蜜罐字段、垃圾内容判断这些反刷逻辑放在服务端才有意义。
 *
 * 真正的限流在数据库触发器里（同 IP 10 分钟 5 条 / 24 小时 20 条），
 * 这里只是把数据库抛出的错误码翻译成人话。
 */

const bodySchema = z.object({
  nickname: z.string().max(24).optional(),
  content: z
    .string()
    .min(1, '总得写点什么吧')
    .max(2000, '最多 2000 字，太长了抽屉关不上'),
  mood: z.string().max(20).optional(),
  visibility: z.enum(['public', 'admin', 'private']),
  /** 蜜罐：正常访客看不到这个输入框，填了就是机器人 */
  website: z.string().max(0).optional(),
})

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      {
        ok: false,
        error: 'DEMO_MODE',
        message: '这个站点还没连上数据库，抽屉暂时打不开。',
      },
      { status: 503 },
    )
  }

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch (error) {
    const message =
      error instanceof z.ZodError ? (error.issues[0]?.message ?? '内容格式不对') : '内容格式不对'
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST', message }, { status: 400 })
  }

  // 蜜罐被填 → 假装成功，不写库（让机器人以为自己成功了）
  if (parsed.website) {
    return NextResponse.json({ ok: true })
  }

  const content = normalizeContent(parsed.content)

  if (content.length === 0) {
    return NextResponse.json({ ok: false, error: 'EMPTY', message: '内容不能是空的。' }, { status: 400 })
  }

  if (looksLikeSpam(content)) {
    return NextResponse.json(
      { ok: false, error: 'SPAM', message: '这段内容看起来不太像手写的，换个说法试试？' },
      { status: 400 },
    )
  }

  const ipHash = hashIp(getClientIp(request.headers))
  const bannedHits = scanBannedWords(content, DEFAULT_BANNED_WORDS)

  const supabase = createSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'NOT_CONFIGURED' }, { status: 503 })
  }

  const { error } = await supabase.from('treehole_messages').insert({
    nickname: normalizeNickname(parsed.nickname),
    content,
    mood: parsed.mood ?? null,
    visibility: parsed.visibility,
    // 这两项即使被伪造也没用：RLS 的 with check 会把它们按回去
    is_approved: false,
    is_flagged: bannedHits.length > 0,
    ip_hash: ipHash,
  })

  if (error) {
    // 数据库触发器抛出的两个限流错误
    if (error.message.includes('TOO_FAST')) {
      return NextResponse.json(
        { ok: false, error: 'TOO_FAST', message: '刚投过一封，让抽屉喘口气，过几分钟再来。' },
        { status: 429 },
      )
    }
    if (error.message.includes('DAILY_LIMIT')) {
      return NextResponse.json(
        {
          ok: false,
          error: 'DAILY_LIMIT',
          message: '今天就先到这里吧。抽屉塞太满，明天的心事就没地方放了。',
        },
        { status: 429 },
      )
    }

    console.warn('[treehole] 写入失败：', error.message)
    return NextResponse.json(
      { ok: false, error: 'DB_ERROR', message: '抽屉卡住了，稍后再试一次。' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    // 命中敏感词时温柔提醒一句（但不拦截）
    flagged: bannedHits.length > 0,
  })
}
