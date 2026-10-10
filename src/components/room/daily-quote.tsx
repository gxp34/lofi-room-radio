'use client'

import * as React from 'react'
import { Quote, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DailyQuote } from '@/types/external'

/**
 * 今日一句。
 *
 * 按钮叫「刷新」而不是「换一句」是故意的：
 * 服务端**每天只抓一次**，点它只会重新请求一次网络，
 * 句子当天不会变（除非后台手动覆盖了）。
 * 叫「换一句」的话，点完发现没变会以为是坏的。
 *
 * 拿不到就让 /api/daily-quote 返回本地句子库里的那句 —— 接口永远 200，
 * 所以这里也没有错误分支。
 */
export function DailyQuoteCard({ className }: { className?: string }) {
  const [quote, setQuote] = React.useState<DailyQuote | null>(null)
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async (fresh: boolean) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/daily-quote${fresh ? '?fresh=1' : ''}`, {
        cache: 'no-store',
      })
      if (!response.ok) return
      setQuote((await response.json()) as DailyQuote)
    } catch {
      // 离线：保持上一次拿到的（或者干脆不显示），不影响页面其它部分
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load(false)
  }, [load])

  const sourceLabel =
    quote?.source === 'manual'
      ? '房东写的'
      : quote?.source === 'hitokoto'
        ? '一言 · 今日'
        : '房间里的句子'

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 sm:p-4',
        className,
      )}
    >
      {/* 左上角一个大引号，纯装饰 */}
      <Quote
        className="pointer-events-none absolute -right-2 -top-2 h-14 w-14 text-lamp/[0.07]"
        aria-hidden
      />

      <p className="flex items-center justify-between gap-2 font-display text-[11px] uppercase tracking-[0.18em] text-dust">
        今日一句
        <span className="font-normal normal-case tracking-normal text-dust/60">
          {quote ? sourceLabel : ''}
        </span>
      </p>

      <p className="relative mt-2.5 text-[13px] leading-[1.95] text-paper/85">
        {quote ? quote.text : '……'}
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
        <p className="min-w-0 truncate text-[11px] text-dust/80">
          {quote?.from ? `—— ${quote.from}` : '每天只自动换一次'}
        </p>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-[11px]"
          disabled={loading}
          onClick={() => void load(true)}
          title="重新请求一次。句子当天不会变——要换得等明天，或者去后台手动改。"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          刷新
        </Button>
      </div>
    </div>
  )
}
