'use client'

import * as React from 'react'
import { Flag, MailOpen, MessageCircleHeart } from 'lucide-react'

import { MOOD_MAP } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { TreeholeMessage } from '@/types'

/**
 * 树洞墙。
 *
 * 只展示站长审核通过、且访客选了「可以贴到墙上」的留言。
 * 每条留言下面可以带「回音」（站长的回复）—— 名字叫回音，因为写信的人不会再来看了，
 * 它更像是房间里自己荡回来的声音。
 */
export function TreeholeWall({ messages }: { messages: TreeholeMessage[] }) {
  const [reported, setReported] = React.useState<Record<string, boolean>>({})
  const [pending, setPending] = React.useState<string | null>(null)

  const handleReport = React.useCallback(async (id: string) => {
    setPending(id)
    try {
      const response = await fetch('/api/treehole/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (response.ok) {
        setReported((previous) => ({ ...previous, [id]: true }))
      }
    } catch {
      // 举报失败就算了，不打扰访客
    } finally {
      setPending(null)
    }
  }, [])

  if (messages.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-room/35 p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-night/50">
          <MailOpen className="h-6 w-6 text-dust" aria-hidden />
        </span>
        <p className="mt-5 font-display text-sm text-paper">墙上还空着</p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
          审核通过的信会贴在这里，匿名出现。
          如果你愿意，第一封可以是你的。
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-3">
      {messages.map((message) => {
        const mood = message.mood ? MOOD_MAP[message.mood] : undefined
        const isReported = reported[message.id]

        return (
          <li key={message.id}>
            <article className="rounded-xl border border-white/[0.07] bg-room/40 p-4">
              {/* 头部 */}
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-night/60 font-display text-[10px] text-lamp">
                    {message.nickname.slice(0, 1)}
                  </span>
                  <span className="truncate font-display text-xs text-paper/85">
                    {message.nickname}
                  </span>
                  {mood && (
                    <span className="shrink-0 text-[11px] text-dust">
                      {mood.emoji} {mood.label}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <time
                    dateTime={message.createdAt}
                    // 相对时间是「此刻」算出来的，服务端和客户端可能差几秒/几分钟，
                    // 用这个属性告诉 React：这里文字不一致是正常的，别报警告
                    suppressHydrationWarning
                    className="font-display text-[10px] text-dust"
                  >
                    {formatRelative(message.createdAt)}
                  </time>

                  <button
                    type="button"
                    onClick={() => handleReport(message.id)}
                    disabled={isReported || pending === message.id}
                    aria-label={isReported ? '已经举报过了' : '举报这条留言'}
                    title={isReported ? '已经举报过了' : '举报'}
                    className={cn(
                      'rounded p-1 transition-colors',
                      isReported ? 'text-lamp/60' : 'text-dust hover:text-neon',
                    )}
                  >
                    <Flag className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* 正文 */}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-paper/90">
                {message.content}
              </p>

              {/* 回音 */}
              {message.replies.length > 0 && (
                <div className="mt-3 space-y-2 border-l-2 border-lamp/25 pl-3">
                  {message.replies.map((reply) => (
                    <div key={reply.id} className="rounded-lg bg-night/40 p-2.5">
                      <p className="mb-1 flex items-center gap-1.5 font-display text-[10px] text-lamp">
                        <MessageCircleHeart className="h-3 w-3" aria-hidden />
                        房东的回音
                      </p>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-paper/80">
                        {reply.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {isReported && (
                <p role="status" className="mt-2 text-[11px] text-dust">
                  已经记下了。如果有多人反映，我会重新看一遍。
                </p>
              )}
            </article>
          </li>
        )
      })}
    </ul>
  )
}

/** 相对时间：刚投的显示「刚刚 / 3 分钟前」，久一点的显示日期 */
function formatRelative(iso: string): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''

  const diff = Date.now() - time
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`

  const date = new Date(time)
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}
