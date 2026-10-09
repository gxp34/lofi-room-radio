'use client'

import * as React from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Mailbox,
  MailOpen,
  MessageCircleHeart,
  Send,
  Trash2,
  Undo2,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'

import { ActionButton } from '@/components/admin/action-button'
import { Section, Tag } from '@/components/admin/ui'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTimeCN } from '@/lib/admin/format'
import { MOOD_MAP, TREEHOLE_VISIBILITY_LABEL } from '@/lib/constants'
import {
  approveMessage,
  deleteMessage,
  deleteReply,
  replyToMessage,
  setMessageHidden,
  setMessageVisibility,
  unapproveMessage,
} from '@/lib/admin/treehole'
import { cn } from '@/lib/utils'
import type { ActionResult, TreeholeMessage, TreeholeVisibility } from '@/types'

/**
 * 树洞审核 —— 翻信。
 *
 * 一次只摊开一封，看完做决定，然后自动翻到下一封。
 * 不做无限滚动的列表，是因为审核这件事需要「停下来」：
 * 滑得越顺，看得越快，而这里躺着的是别人的心事。
 *
 * 一封信的处置流程：
 *   拆开 → 读 → 回一句（可选）→ 通过 / 只通过 / 隐藏 / 删除 → 自动翻下一封
 *
 * 键盘：← → 翻信，A 通过并公开，H 隐藏，R 聚焦回音框。
 * 打开「减少动态效果」时翻页动画会自动降级成直接切换。
 */

type Filter = 'pending' | 'approved' | 'hidden' | 'all'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'pending', label: '待审' },
  { id: 'approved', label: '已通过' },
  { id: 'hidden', label: '已隐藏' },
  { id: 'all', label: '全部' },
]

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function TreeholeManager({ messages }: { messages: TreeholeMessage[] }) {
  const [filter, setFilter] = React.useState<Filter>('pending')
  const [index, setIndex] = React.useState(0)
  /** 翻页方向：1 往后，-1 往前。只影响动画从哪边滑进来 */
  const [direction, setDirection] = React.useState(1)
  const [replyText, setReplyText] = React.useState('')
  const [pending, setPending] = React.useState(false)

  const reduceMotion = useReducedMotion()
  const replyRef = React.useRef<HTMLTextAreaElement>(null)

  /* ---------------- 筛选与计数 ---------------- */
  const counts = React.useMemo(
    () => ({
      pending: messages.filter((item) => !item.isApproved && !item.isHidden).length,
      approved: messages.filter((item) => item.isApproved && !item.isHidden).length,
      hidden: messages.filter((item) => item.isHidden).length,
      all: messages.length,
    }),
    [messages],
  )

  const visible = React.useMemo(() => {
    switch (filter) {
      case 'pending':
        return messages.filter((item) => !item.isApproved && !item.isHidden)
      case 'approved':
        return messages.filter((item) => item.isApproved && !item.isHidden)
      case 'hidden':
        return messages.filter((item) => item.isHidden)
      default:
        return messages
    }
  }, [messages, filter])

  /**
   * 关键的一行：翻完一封之后，这封信会因为 revalidatePath 从当前筛选里消失，
   * 于是「同一个下标」自然就指向了下一封 —— 不需要手动 +1，
   * 这也正是「翻信」该有的手感。只在越界时往回收一下。
   */
  const safeIndex = visible.length === 0 ? 0 : clamp(index, 0, visible.length - 1)
  const current: TreeholeMessage | null = visible[safeIndex] ?? null

  React.useEffect(() => {
    if (index !== safeIndex) setIndex(safeIndex)
  }, [index, safeIndex])

  // 换筛选条件就回到第一封
  React.useEffect(() => {
    setIndex(0)
    setDirection(1)
    setReplyText('')
  }, [filter])

  // 换了一封信就把回音框清空，免得上一封写的话串到这一封
  React.useEffect(() => {
    setReplyText('')
  }, [current?.id])

  /* ---------------- 翻页 ---------------- */
  const go = React.useCallback(
    (delta: number) => {
      if (visible.length === 0) return
      setDirection(delta > 0 ? 1 : -1)
      setIndex((value) => clamp(value + delta, 0, visible.length - 1))
    },
    [visible.length],
  )

  const jumpTo = React.useCallback((target: number) => {
    setDirection(target > safeIndex ? 1 : -1)
    setIndex(target)
  }, [safeIndex])

  /* ---------------- 执行一个动作 ---------------- */
  const run = React.useCallback(
    async (
      action: () => Promise<ActionResult<unknown>>,
      successMessage: string,
      options: { clearReply?: boolean } = {},
    ) => {
      setPending(true)
      try {
        const result = await action()
        if (result.ok) {
          toast.success(successMessage)
          if (options.clearReply !== false) setReplyText('')
        } else {
          toast.error(result.error)
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '操作失败了。')
      } finally {
        setPending(false)
      }
    },
    [],
  )

  /* ---------------- 键盘快捷键 ---------------- */
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // 正在输入框里打字的时候，任何快捷键都不该抢键
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return

      switch (event.key) {
        case 'ArrowLeft':
        case 'k':
          event.preventDefault()
          go(-1)
          break
        case 'ArrowRight':
        case 'j':
          event.preventDefault()
          go(1)
          break
        case 'a':
        case 'A':
          if (current && !current.isApproved) {
            event.preventDefault()
            void run(() => approveMessage(current.id, true), '通过了，会出现在树洞墙上。')
          }
          break
        case 'h':
        case 'H':
          if (current && !current.isHidden) {
            event.preventDefault()
            void run(() => setMessageHidden(current.id, true), '从墙上拿下来了。')
          }
          break
        case 'r':
        case 'R':
          if (current) {
            event.preventDefault()
            replyRef.current?.focus()
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [current, go, run])

  /* ---------------- 一封信都没有 ---------------- */
  if (messages.length === 0) {
    return (
      <Section title="深夜抽屉" description="还从来没有人往这里放过东西。">
        <div className="rounded-xl border border-dashed border-white/[0.09] p-10 text-center">
          <Mailbox className="mx-auto h-8 w-8 text-dust" aria-hidden />
          <p className="mt-4 font-display text-sm text-paper">抽屉是空的</p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
            等有人投了信，这里会变成一沓信纸，一封一封翻。
          </p>
        </div>
      </Section>
    )
  }

  return (
    <Section
      title="深夜抽屉"
      description="一次摊开一封。做完决定会自动翻到下一封。"
    >
      {/* ---------------- 筛选 ---------------- */}
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              filter === item.id
                ? 'border-lamp/40 bg-lamp/12 text-lamp'
                : 'border-white/[0.08] bg-white/[0.02] text-dust hover:text-paper',
            )}
          >
            {item.label}
            <span className="ml-1.5 font-display opacity-70">{counts[item.id]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 || !current ? (
        /* ---------------- 这一档翻完了 ---------------- */
        <div className="rounded-xl border border-dashed border-white/[0.09] p-10 text-center">
          <MailOpen className="mx-auto h-8 w-8 text-lamp" aria-hidden />
          <p className="mt-4 font-display text-sm text-paper">
            {filter === 'pending' ? '抽屉空了' : '这一档没有信'}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {filter === 'pending'
              ? `看完了。${counts.approved > 0 ? `墙上现在有 ${counts.approved} 封。` : ''}`
              : '换个标签看看别的地方。'}
          </p>
          {filter === 'pending' && counts.approved > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setFilter('approved')}
            >
              去墙上看看
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* ---------------- 进度 ---------------- */}
          <div className="mb-3 flex items-center gap-3">
            <span className="shrink-0 font-display text-xs text-dust">
              第 {safeIndex + 1} 封 / 共 {visible.length} 封
            </span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
              <span
                className="block h-full rounded-full bg-lamp/70 transition-[width] duration-300"
                style={{ width: `${((safeIndex + 1) / visible.length) * 100}%` }}
              />
            </span>
          </div>

          {/* ---------------- 信 ---------------- */}
          <div className="relative">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.id}
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: direction * 48, rotate: direction * 0.6 }
                }
                animate={{ opacity: 1, x: 0, rotate: 0 }}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: direction * -40, rotate: direction * -0.6 }
                }
                transition={{ duration: reduceMotion ? 0.12 : 0.28, ease: 'easeOut' }}
              >
                <LetterCard
                  message={current}
                  pending={pending}
                  replyText={replyText}
                  replyRef={replyRef}
                  onReplyChange={setReplyText}
                  onReply={() =>
                    run(() => replyToMessage(current.id, replyText), '回音发出去了。')
                  }
                  onApprove={() =>
                    run(() => approveMessage(current.id, true), '通过了，会出现在树洞墙上。')
                  }
                  onApproveOnly={() =>
                    run(() => approveMessage(current.id, false), '已通过（保留原可见范围）。')
                  }
                  onUnapprove={() => run(() => unapproveMessage(current.id), '已撤回待审。')}
                  onHide={() => run(() => setMessageHidden(current.id, true), '从墙上拿下来了。')}
                  onUnhide={() => run(() => setMessageHidden(current.id, false), '恢复显示了。')}
                  onVisibilityChange={(visibility) =>
                    run(() => setMessageVisibility(current.id, visibility), '可见范围改好了。')
                  }
                  onDeleteReply={(replyId) =>
                    run(() => deleteReply(replyId), '回音删掉了。')
                  }
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ---------------- 翻页 ---------------- */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={safeIndex === 0}
              onClick={() => go(-1)}
              aria-label="上一封"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              上一封
            </Button>

            <p className="hidden text-[11px] text-dust sm:block">
              ← → 翻信 · A 通过 · H 隐藏 · R 回音
            </p>

            <Button
              variant="outline"
              size="sm"
              disabled={safeIndex >= visible.length - 1}
              onClick={() => go(1)}
              aria-label="下一封"
            >
              下一封
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* ---------------- 一叠信的侧面 ---------------- */}
          {visible.length > 1 && (
            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <p className="mb-2 font-display text-[10px] uppercase tracking-[0.18em] text-dust">
                这一叠
              </p>
              <div className="flex flex-wrap gap-1.5">
                {visible.map((message, position) => (
                  <button
                    key={message.id}
                    type="button"
                    onClick={() => jumpTo(position)}
                    aria-label={`第 ${position + 1} 封：${message.nickname}`}
                    aria-current={position === safeIndex ? 'true' : undefined}
                    title={message.content.slice(0, 40)}
                    className={cn(
                      'h-7 w-7 rounded-md border font-display text-[10px] transition-colors',
                      position === safeIndex
                        ? 'border-lamp/50 bg-lamp/15 text-lamp'
                        : message.isFlagged
                          ? 'border-neon/30 bg-neon/[0.08] text-neon/80 hover:text-neon'
                          : 'border-white/[0.08] bg-white/[0.02] text-dust hover:text-paper',
                    )}
                  >
                    {position + 1}
                  </button>
                ))}
              </div>
              <p className="mt-2 flex items-center gap-3 text-[10px] text-dust">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm border border-neon/40 bg-neon/20" aria-hidden />
                  有敏感词标记
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm border border-lamp/50 bg-lamp/20" aria-hidden />
                  正在看
                </span>
              </p>
            </div>
          )}
        </>
      )}
    </Section>
  )
}

/* ==========================================================================
   一封信
   ========================================================================== */

interface LetterCardProps {
  message: TreeholeMessage
  pending: boolean
  replyText: string
  replyRef: React.RefObject<HTMLTextAreaElement>
  onReplyChange: (value: string) => void
  onReply: () => void
  onApprove: () => void
  onApproveOnly: () => void
  onUnapprove: () => void
  onHide: () => void
  onUnhide: () => void
  onVisibilityChange: (visibility: TreeholeVisibility) => void
  onDeleteReply: (replyId: string) => void
}

function LetterCard({
  message,
  pending,
  replyText,
  replyRef,
  onReplyChange,
  onReply,
  onApprove,
  onApproveOnly,
  onUnapprove,
  onHide,
  onUnhide,
  onVisibilityChange,
  onDeleteReply,
}: LetterCardProps) {
  const mood = message.mood ? MOOD_MAP[message.mood] : undefined

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.09] bg-night/50">
      {/* ---------- 信封口：状态与来源 ---------- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
        <Mail className="h-3.5 w-3.5 shrink-0 text-dust" aria-hidden />
        <span className="font-display text-xs text-paper/90">{message.nickname}</span>
        {mood && (
          <span className="text-[11px] text-dust">
            {mood.emoji} {mood.label}
          </span>
        )}
        {message.isApproved ? <Tag tone="lamp">已通过</Tag> : <Tag tone="neon">待审</Tag>}
        {message.isHidden && <Tag>已隐藏</Tag>}
        <Tag tone="muted">{TREEHOLE_VISIBILITY_LABEL[message.visibility]}</Tag>
        {message.reportCount > 0 && <Tag tone="neon">被举报 {message.reportCount} 次</Tag>}
        <time className="ml-auto font-display text-[10px] text-dust" dateTime={message.createdAt}>
          {formatDateTimeCN(message.createdAt)}
        </time>
      </div>

      {/* ---------- 敏感词提醒：放在最显眼的位置 ---------- */}
      {message.isFlagged && (
        <p className="flex items-start gap-2 border-b border-neon/20 bg-neon/[0.07] px-4 py-2.5 text-[11px] leading-relaxed text-neon">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          这封信里出现了敏感词。提醒只是提醒 —— 提到「银行卡」的人可能正在被诈骗，
          先读完再决定。
        </p>
      )}

      {/* ---------- 信纸 ---------- */}
      <div className="paper px-5 py-6 sm:px-8 sm:py-7">
        <p className="whitespace-pre-wrap text-[15px] leading-[1.95] text-[#2b2230]">
          {message.content}
        </p>

        {/* 回音写在信纸下面，像后来补上去的一行 */}
        {message.replies.length > 0 && (
          <div className="mt-5 space-y-2 border-t border-[#2b2230]/12 pt-4">
            {message.replies.map((reply) => (
              <div key={reply.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="mb-1 flex items-center gap-1.5 font-display text-[10px] text-[#2b2230]/60">
                    <MessageCircleHeart className="h-3 w-3" aria-hidden />
                    回音 · {formatDateTimeCN(reply.createdAt)}
                  </p>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#2b2230]/85">
                    {reply.content}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteReply(reply.id)}
                  aria-label="删掉这条回音"
                  title="删掉这条回音"
                  className="mt-0.5 rounded p-1 text-[#2b2230]/40 transition-colors hover:text-[#2b2230]"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------- 回音输入 ---------- */}
      <div className="space-y-2 border-t border-white/[0.06] px-4 py-3.5">
        <Textarea
          ref={replyRef}
          rows={2}
          value={replyText}
          onChange={(event) => onReplyChange(event.target.value)}
          placeholder="写一句回音（不会公开，只有写信的人下次来看时能看到）。按 R 可以直接跳到这个框。"
          maxLength={1000}
        />
        <div className="flex items-center justify-between gap-3">
          <Button
            size="sm"
            onClick={onReply}
            disabled={pending || replyText.trim().length === 0}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            回复
          </Button>
          <span className="font-display text-[10px] text-dust">{replyText.length} / 1000</span>
        </div>
      </div>

      {/* ---------- 决定 ---------- */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] bg-white/[0.015] px-4 py-3">
        {message.isApproved ? (
          <Button variant="outline" size="sm" onClick={onUnapprove} disabled={pending}>
            <Undo2 className="h-3.5 w-3.5" />
            撤回
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={onApprove} disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              通过并公开
            </Button>
            <Button variant="outline" size="sm" onClick={onApproveOnly} disabled={pending}>
              <Check className="h-3.5 w-3.5" />
              只通过不公开
            </Button>
          </>
        )}

        {message.isHidden ? (
          <Button variant="outline" size="sm" onClick={onUnhide} disabled={pending}>
            <Eye className="h-3.5 w-3.5" />
            恢复显示
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onHide} disabled={pending}>
            <EyeOff className="h-3.5 w-3.5" />
            隐藏
          </Button>
        )}

        <select
          aria-label="可见范围"
          value={message.visibility}
          disabled={pending}
          onChange={(event) => onVisibilityChange(event.target.value as TreeholeVisibility)}
          className="h-8 rounded-md border border-white/10 bg-night/60 px-2 text-xs text-paper"
        >
          <option value="public">可上墙</option>
          <option value="admin">只给我看</option>
          <option value="private">私密保存</option>
        </select>

        <ActionButton
          action={() => deleteMessage(message.id)}
          confirm="确认彻底删除？"
          successMessage="删掉了。"
          variant="ghost"
          size="sm"
          className="ml-auto text-dust hover:text-neon"
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </ActionButton>
      </div>
    </div>
  )
}
