import * as React from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * 后台的公共版式。
 * 全部是服务端组件（没有 hooks），所以页面里可以直接用。
 */

export interface AdminPageProps {
  title: string
  description?: string
  /** 右上角的操作区（新建按钮之类） */
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function AdminPage({ title, description, actions, children, className }: AdminPageProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl text-paper sm:text-2xl">{title}</h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>

      {children}
    </div>
  )
}

export interface StatCardProps {
  label: string
  value: React.ReactNode
  hint?: string
  icon?: React.ReactNode
}

export function StatCard({ label, value, hint, icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs">
          {icon}
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="font-display text-2xl text-paper">{value}</p>
        {hint && <p className="mt-1 text-[11px] text-dust">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export interface SectionProps {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-sm">{title}</CardTitle>
          {description && <CardDescription className="mt-1 text-xs">{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.09] bg-white/[0.015] p-8 text-center">
      <p className="font-display text-sm text-paper">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/** 表单里的一行：标签 + 控件 + 错误提示 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-paper/90">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] leading-relaxed text-dust">{hint}</p>}
      {error && <p className="text-[11px] text-neon">{error}</p>}
    </div>
  )
}

/** 只读的小标签，用来在列表里标状态 */
export function Tag({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode
  tone?: 'muted' | 'lamp' | 'rain' | 'neon'
}) {
  const tones: Record<string, string> = {
    muted: 'border-white/10 bg-white/[0.04] text-dust',
    lamp: 'border-lamp/30 bg-lamp/10 text-lamp',
    rain: 'border-rain/30 bg-rain/10 text-rain',
    neon: 'border-neon/30 bg-neon/10 text-neon',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 font-display text-[10px]',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}
