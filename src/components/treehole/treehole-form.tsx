'use client'

import * as React from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Check, Loader2, Send, ShieldCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'

import { useRoom } from '@/components/providers/room-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MOOD_OPTIONS, TREEHOLE_LIMITS, TREEHOLE_PRIVACY_NOTICE, TREEHOLE_VISIBILITY_HINT, TREEHOLE_VISIBILITY_LABEL } from '@/lib/constants'
import { playSfx } from '@/lib/audio/sfx'
import { cn } from '@/lib/utils'
import { treeholeSchema, type TreeholeInput } from '@/lib/validators'
import { useAchievementStore } from '@/stores/achievement-store'
import { useEventStore } from '@/stores/event-store'
import type { TreeholeVisibility } from '@/types'

/** 本地冷却，防止手抖连点两下投出两封一样的信 */
const LOCAL_COOLDOWN_MS = 60_000
const COOLDOWN_KEY = 'lofi:treehole-last-sent'

const VISIBILITY_ORDER: TreeholeVisibility[] = ['public', 'admin', 'private']

/**
 * 树洞投递表单。
 *
 * 三件事按这个顺序做：
 *   1. 先提醒你别写能定位到自己的信息（在输入框上方，不是勾选框）；
 *   2. 投稿走 /api/treehole，那边做敏感词扫描、蜜罐判断和限流；
 *   3. 投完给一个明确的「信放进去了」的状态，而不是一句冷冰冰的成功提示。
 */
export function TreeholeForm() {
  const { settings } = useRoom()

  const [status, setStatus] = React.useState<'idle' | 'sending' | 'done'>('idle')
  const [message, setMessage] = React.useState<string | null>(null)
  const [errorText, setErrorText] = React.useState<string | null>(null)
  const [flagged, setFlagged] = React.useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TreeholeInput>({
    resolver: zodResolver(treeholeSchema),
    defaultValues: {
      nickname: '',
      content: '',
      mood: '',
      visibility: 'admin',
    },
  })

  const content = watch('content') ?? ''
  const visibility = (watch('visibility') ?? 'admin') as TreeholeVisibility
  const mood = watch('mood') ?? ''

  const onSubmit = handleSubmit(async (values) => {
    setErrorText(null)
    setMessage(null)

    // 本地冷却
    if (typeof window !== 'undefined') {
      const last = Number(window.localStorage.getItem(COOLDOWN_KEY) ?? 0)
      if (last && Date.now() - last < LOCAL_COOLDOWN_MS) {
        const remain = Math.ceil((LOCAL_COOLDOWN_MS - (Date.now() - last)) / 1000)
        setErrorText(`刚投过一封，等 ${remain} 秒再来吧。`)
        return
      }
    }

    setStatus('sending')

    try {
      const response = await fetch('/api/treehole', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: values.nickname,
          content: values.content,
          mood: values.mood,
          visibility: values.visibility,
          // 蜜罐字段，人不会填
          website: (values as { website?: string }).website ?? '',
        }),
      })

      const payload = (await response.json()) as {
        ok: boolean
        message?: string
        flagged?: boolean
      }

      if (!response.ok || !payload.ok) {
        setErrorText(payload.message ?? '抽屉卡住了，稍后再试一次。')
        setStatus('idle')
        return
      }

      window.localStorage.setItem(COOLDOWN_KEY, String(Date.now()))

      // 成就：把心事放进抽屉
      useAchievementStore.getState().incrementTreehole()
      useAchievementStore.getState().unlock('drawer_heart')

      // 房间事件：投信咚
      void playSfx('letter')
      useEventStore
        .getState()
        .pushToast('抽屉轻轻响了一声。', 'common', 'drawer')

      setFlagged(Boolean(payload.flagged))
      setStatus('done')
      reset({ nickname: '', content: '', mood: '', visibility: 'admin' })
    } catch (error) {
      console.warn('[treehole] 投递异常：', error)
      setErrorText('网络好像断了，信没送出去。')
      setStatus('idle')
    }
  })

  /* ---------------- 投递成功 ---------------- */
  if (status === 'done') {
    return (
      <Card className="border-lamp/25 bg-lamp/[0.04]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lamp">
            <Check className="h-4 w-4" aria-hidden />
            信放进抽屉了
          </CardTitle>
          <CardDescription>
            {visibility === 'public'
              ? '我会先读一遍，确认没问题再贴到树洞墙上。'
              : visibility === 'admin'
                ? '只有我能看到。我会读完的。'
                : '已经压到抽屉最底下了，不会有人翻出来。'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {flagged && (
            <p className="flex gap-2 rounded-md border border-rain/25 bg-rain/[0.07] p-3 text-xs leading-relaxed text-rain">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              内容里有一些个人信息的痕迹，我审核时会特别小心。如果那是别人的隐私，建议你撤回来重写。
            </p>
          )}

          <Button variant="outline" onClick={() => setStatus('idle')}>
            再写一封
          </Button>
        </CardContent>
      </Card>
    )
  }

  /* ---------------- 表单 ---------------- */
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lamp">往抽屉里塞点什么</CardTitle>
        <CardDescription>{settings.treeholeNotice}</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {/* 隐私提醒：写在最上面，而不是藏在勾选框里 */}
          <p className="flex gap-2 rounded-md border border-neon/25 bg-neon/[0.06] p-3 text-xs leading-relaxed text-paper/85">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon" aria-hidden />
            {TREEHOLE_PRIVACY_NOTICE}
          </p>

          {/* 昵称 */}
          <div className="space-y-2">
            <Label htmlFor="nickname">昵称（可以不填）</Label>
            <Input
              id="nickname"
              placeholder="匿名"
              maxLength={TREEHOLE_LIMITS.nicknameMax}
              aria-invalid={Boolean(errors.nickname)}
              {...register('nickname')}
            />
            {errors.nickname && <p className="text-xs text-neon">{errors.nickname.message}</p>}
          </div>

          {/* 正文 */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="content">想说的话</Label>
              <span
                className={cn(
                  'font-display text-[11px]',
                  content.length > TREEHOLE_LIMITS.contentMax * 0.9 ? 'text-neon' : 'text-dust',
                )}
              >
                {content.length} / {TREEHOLE_LIMITS.contentMax}
              </span>
            </div>
            <Textarea
              id="content"
              rows={7}
              placeholder="今天发生了什么？或者什么都不说，写一句「我很累」也可以。"
              maxLength={TREEHOLE_LIMITS.contentMax}
              aria-invalid={Boolean(errors.content)}
              {...register('content')}
            />
            {errors.content && <p className="text-xs text-neon">{errors.content.message}</p>}
          </div>

          {/* 心情 */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-paper/90">现在的心情（选填）</legend>
            <div className="flex flex-wrap gap-2">
              {MOOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={mood === option.value}
                  onClick={() => setValue('mood', mood === option.value ? '' : option.value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    mood === option.value
                      ? 'border-lamp/40 bg-lamp/12 text-lamp'
                      : 'border-white/[0.08] bg-white/[0.02] text-dust hover:text-paper',
                  )}
                >
                  <span aria-hidden className="mr-1">
                    {option.emoji}
                  </span>
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          {/* 可见范围 */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-paper/90">这封信给谁看</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {VISIBILITY_ORDER.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={visibility === value}
                  onClick={() => setValue('visibility', value)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    visibility === value
                      ? 'border-lamp/40 bg-lamp/[0.08]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20',
                  )}
                >
                  <span
                    className={cn(
                      'block font-display text-xs',
                      visibility === value ? 'text-lamp' : 'text-paper/85',
                    )}
                  >
                    {TREEHOLE_VISIBILITY_LABEL[value]}
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                    {TREEHOLE_VISIBILITY_HINT[value]}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* 蜜罐：屏幕阅读器和真人都看不到，只有机器人会填 */}
          <div className="hidden" aria-hidden>
            <label htmlFor="website">个人网站</label>
            <input id="website" tabIndex={-1} autoComplete="off" {...register('website')} />
          </div>

          {errorText && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-paper">
              {errorText}
            </p>
          )}

          {message && (
            <p role="status" className="text-xs text-rain">
              {message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={status === 'sending'} size="lg">
              {status === 'sending' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              投进抽屉
            </Button>
            <p className="text-[11px] leading-relaxed text-dust">
              不用登录、不用邮箱。投出去之后，只有我能看到原文。
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
