import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { getCurrentUser, isAdminUser } from '@/lib/auth'
import { STORAGE_BUCKETS, SIGNED_URL_TTL_SECONDS } from '@/lib/constants'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * 给私密音频签发临时地址。
 *
 * 为什么必须走服务端：
 *   私密桶（private-music）的 RLS 只允许站长直接读，
 *   但前台播放需要给 <audio> 一个可访问的 URL。
 *   用 service_role 签一个 1 小时后过期的地址，是最小权限的做法 ——
 *   链接过期就失效，也不暴露存储路径的权限。
 *
 * 安全：这个接口本身也要检查「你是不是站长」，否则等于把私密音乐公开了。
 */

const bodySchema = z.object({
  paths: z.array(z.string().min(1).max(400)).min(1).max(50),
})

export async function POST(request: NextRequest) {
  // 1. 先确认身份
  const user = await getCurrentUser()
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 })
  }

  // 2. 校验请求体
  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 })
  }

  // 3. 签发
  const admin = getSupabaseAdminClient()
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'SERVICE_ROLE_MISSING' }, { status: 503 })
  }

  const { data, error } = await admin.storage
    .from(STORAGE_BUCKETS.privateMusic)
    .createSignedUrls(parsed.paths, SIGNED_URL_TTL_SECONDS)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const urls: Record<string, string> = {}
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) {
      urls[item.path] = item.signedUrl
    }
  }

  return NextResponse.json({ ok: true, urls })
}
