'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ActionResult } from '@/types'

/**
 * 会调用 Server Action 的按钮。
 *
 * 三件事都在这里解决，省得每个页面各写一遍：
 *   1. pending 状态（转圈 + 禁用，防止连点提交两次）；
 *   2. 二次确认（危险操作先变成「确认删除？」，3 秒内再点一次才真的执行）；
 *   3. 结果提示（成功 / 失败都弹一条 toast）。
 *
 * 注意：它**不刷新页面**。Server Action 里用 revalidatePath 让新数据自己流过来，
 * 需要跳转的话由 action 自己 redirect。
 */
export interface ActionButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  /** 要执行的 Server Action */
  action: () => Promise<ActionResult<unknown>>
  children: React.ReactNode
  /** 危险操作：先确认再执行 */
  confirm?: string
  /** 执行中的文案 */
  pendingLabel?: string
  /** 成功后的提示；不传就用 action 返回的默认行为 */
  successMessage?: string
  /** 成功后的回调（比如关掉对话框） */
  onSuccess?: () => void
}

export function ActionButton({
  action,
  children,
  confirm,
  pendingLabel = '处理中…',
  successMessage,
  onSuccess,
  className,
  variant,
  size,
  ...rest
}: ActionButtonProps) {
  const [pending, setPending] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const confirmTimer = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current)
    }
  }, [])

  const run = React.useCallback(async () => {
    setPending(true)
    try {
      const result = await action()

      if (result.ok) {
        if (successMessage) toast.success(successMessage)
        onSuccess?.()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      // Server Action 抛出的异常（比如 redirect）会走到这里
      const message = error instanceof Error ? error.message : '操作失败了'
      // Next 的 redirect 会抛一个带 digest 的特殊错误，不当作失败
      if (!message.includes('NEXT_REDIRECT')) {
        toast.error(message)
      }
    } finally {
      setPending(false)
    }
  }, [action, onSuccess, successMessage])

  const handleClick = React.useCallback(() => {
    if (!confirm) {
      void run()
      return
    }

    if (confirming) {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current)
      setConfirming(false)
      void run()
      return
    }

    setConfirming(true)
    confirmTimer.current = window.setTimeout(() => setConfirming(false), 3000)
  }, [confirm, confirming, run])

  return (
    <Button
      type="button"
      variant={confirming ? 'destructive' : variant}
      size={size}
      className={cn(className)}
      disabled={pending}
      onClick={handleClick}
      {...rest}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending ? pendingLabel : confirming ? confirm : children}
    </Button>
  )
}

/** 表单里的提交按钮：配合 useFormStatus 用，提交期间自动禁用 */
export function SubmitButton({
  children,
  pendingLabel = '保存中…',
  className,
  ...rest
}: Omit<ButtonProps, 'type'> & { pendingLabel?: string }) {
  return (
    <Button type="submit" className={cn(className)} {...rest}>
      {children}
      <span className="sr-only">{pendingLabel}</span>
    </Button>
  )
}
