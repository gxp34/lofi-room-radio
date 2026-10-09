'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, LockKeyhole, Mail } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isSupabaseConfigured } from '@/lib/env'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/** 表单校验：邮箱 + 密码 */
const loginSchema = z.object({
  email: z.string().min(1, '请填邮箱').email('邮箱格式看起来不对'),
  password: z.string().min(6, '密码至少 6 位'),
})

type LoginValues = z.infer<typeof loginSchema>

const ERROR_TEXT: Record<string, string> = {
  'not-admin': '这个账号不是站长，进不去这扇门。',
}

/**
 * 登录表单（客户端组件）。
 * 因为用到 useSearchParams，必须被 Suspense 包住，所以拆成独立文件，
 * 由 page.tsx 负责包边界 —— 否则 next build 会报错。
 */
export function AdminLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') || '/admin'
  const urlError = searchParams.get('error')

  const [mode, setMode] = React.useState<'signin' | 'signup'>('signin')
  const [message, setMessage] = React.useState<string | null>(
    urlError ? ERROR_TEXT[urlError] ?? '登录失败，请重试。' : null,
  )
  const [notice, setNotice] = React.useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginValues) {
    setMessage(null)
    setNotice(null)

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setMessage('还没配置 Supabase，无法登录。请先填好 .env.local 里的两个变量并重启。')
      return
    }

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
        })
        if (error) throw error

        setNotice(
          '账号已创建。如果 Supabase 开了邮箱验证，请先去邮箱点确认链接；' +
            '然后到 SQL Editor 执行一次提权语句把 role 改成 admin。',
        )
        return
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      })
      if (error) throw error

      // 刷新一次让服务端重新读取会话 Cookie
      router.replace(nextPath)
      router.refresh()
    } catch (error) {
      const text = error instanceof Error ? error.message : '未知错误'
      setMessage(
        text.includes('Invalid login credentials') ? '邮箱或密码不对。' : `登录失败：${text}`,
      )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lamp">
          <LockKeyhole className="h-4 w-4" aria-hidden />
          站长后台
        </CardTitle>
        <CardDescription>
          只有站长能进来。第一次使用请先「注册账号」，再去 Supabase 执行一次提权 SQL。
        </CardDescription>
      </CardHeader>

      <CardContent>
        {!isSupabaseConfigured && (
          <p className="mb-4 rounded-md border border-neon/30 bg-neon/10 p-3 text-xs leading-relaxed text-neon">
            还没检测到 Supabase 配置。请在项目根目录的 <code>.env.local</code> 里填好
            <code> NEXT_PUBLIC_SUPABASE_URL </code>与
            <code> NEXT_PUBLIC_SUPABASE_ANON_KEY</code>，重启 <code>npm run dev</code> 后再登录。
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dust"
                aria-hidden
              />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="pl-9"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
            </div>
            {errors.email && <p className="text-xs text-neon">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="至少 6 位"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
            {errors.password && <p className="text-xs text-neon">{errors.password.message}</p>}
          </div>

          {message && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed text-paper"
            >
              {message}
            </p>
          )}

          {notice && (
            <p
              role="status"
              className="rounded-md border border-rain/30 bg-rain/10 p-3 text-xs leading-relaxed text-rain"
            >
              {notice}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {mode === 'signin' ? '开门' : '注册站长账号'}
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs text-dust">
          <button
            type="button"
            className="underline-offset-4 hover:text-lamp hover:underline"
            onClick={() => {
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
              setMessage(null)
              setNotice(null)
            }}
          >
            {mode === 'signin' ? '还没有账号？去注册' : '已有账号？去登录'}
          </button>
          <Link href="/" className="underline-offset-4 hover:text-lamp hover:underline">
            回到房间
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
