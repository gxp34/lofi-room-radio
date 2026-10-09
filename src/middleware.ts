import { NextResponse, type NextRequest } from 'next/server'

import { updateSession } from '@/lib/supabase/middleware'

/**
 * 中间件：刷新登录会话 + 看住后台入口。
 *
 * 只对后台相关路由生效，前台页面完全不经过它 —— 少一次网络请求，
 * 首屏会快一点（Supabase 官方模板是匹配所有路由的）。
 */
export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request)
  const { pathname, search } = request.nextUrl

  const isAdminArea =
    pathname.startsWith('/admin') && pathname !== '/admin/login'
  const isAdminApi = pathname.startsWith('/api/admin')

  if ((isAdminArea || isAdminApi) && !user) {
    // 接口返回 401，页面重定向到登录页并记住原本要去哪
    if (isAdminApi) {
      return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
    }

    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/admin/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  // 已经登录的人再访问登录页就没必要了
  if (pathname === '/admin/login' && user) {
    const adminUrl = request.nextUrl.clone()
    adminUrl.pathname = '/admin'
    adminUrl.search = ''
    return NextResponse.redirect(adminUrl)
  }

  return response
}

export const config = {
  /**
   * 只匹配后台与鉴权回调，前台走静态优先，不额外增加延迟。
   * 说明：这里排除了 _next/static、图片、音频等静态资源。
   */
  matcher: ['/admin/:path*', '/api/admin/:path*', '/auth/:path*'],
}
