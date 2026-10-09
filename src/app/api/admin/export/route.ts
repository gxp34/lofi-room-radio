import { NextResponse, type NextRequest } from 'next/server'

import { getCurrentUser, isAdminUser } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * 后台数据导出：GET /api/admin/export?kind=diaries
 *
 * 导出的东西里有私密日记、树洞和私密音乐列表，所以这里有两道闸：
 *   1. 先确认「你是不是站长」（不是就直接 403，连参数都不看）；
 *   2. 数据由数据库里的 `admin_export(p_kind)` 聚合，那个函数内部还会再查一次 is_admin()，
 *      而且它是 security invoker，RLS 照常生效 —— 走这个接口不会有越权的可能。
 *
 * 用「下载文件」而不是返回 JSON 给前端处理，是因为导出的是备份：
 * 让浏览器直接存成 .json，比在页面上再包一层靠谱。
 */

/** 允许导出的类型（与 0005_admin_stats.sql 里的 admin_export 保持一致） */
const EXPORT_KINDS = ['diaries', 'treehole', 'tracks', 'events', 'achievements', 'settings'] as const

type ExportKind = (typeof EXPORT_KINDS)[number]

function isExportKind(value: string): value is ExportKind {
  return (EXPORT_KINDS as readonly string[]).includes(value)
}

/** 20240611 这样的日期后缀；用 UTC，和 _meta.exported_at 对得上 */
function dateStamp(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}${month}${day}`
}

export async function GET(request: NextRequest) {
  /* ---------------- 1. 先鉴权 ---------------- */
  const user = await getCurrentUser()
  if (!user || !(await isAdminUser(user))) {
    return NextResponse.json(
      { ok: false, error: 'FORBIDDEN', message: '只有站长能导出数据。' },
      { status: 403 },
    )
  }

  /* ---------------- 2. 再校验 kind ---------------- */
  const kind = request.nextUrl.searchParams.get('kind') ?? ''

  if (!isExportKind(kind)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'BAD_KIND',
        message: `kind 必须是 ${EXPORT_KINDS.join(' / ')} 之一。`,
      },
      { status: 400 },
    )
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: 'NOT_CONFIGURED', message: 'Supabase 还没配置好，导不出来。' },
      { status: 503 },
    )
  }

  /* ---------------- 3. 让数据库把数据聚合好 ---------------- */
  const { data, error } = await supabase.rpc('admin_export', { p_kind: kind })

  if (error) {
    // 数据库的错误信息（比如函数还没建、FORBIDDEN）原样带上，方便排查
    console.warn('[admin/export] 导出失败：', error.message)
    return NextResponse.json(
      { ok: false, error: 'EXPORT_FAILED', message: `数据库导出失败：${error.message}` },
      { status: 500 },
    )
  }

  /* ---------------- 4. 拼一份带 _meta 的 JSON，作为附件下载 ---------------- */
  const exportedAt = new Date()

  const payload = {
    _meta: {
      kind,
      exported_at: exportedAt.toISOString(),
      exported_by: user.email ?? null,
      /** settings 导出的是对象（没有条数），其余都是数组 */
      count: Array.isArray(data) ? data.length : null,
      note: '由 /api/admin/export 生成；data 字段就是导出的内容。',
    },
    data: data ?? null,
  }

  // 文件名必须是纯 ASCII：中文文件名在部分浏览器里会变成乱码或者被截断
  const filename = `lofi-${kind}-${dateStamp(exportedAt)}.json`

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // 导出的是隐私数据，别让浏览器或中间层缓存
      'Cache-Control': 'no-store',
    },
  })
}
