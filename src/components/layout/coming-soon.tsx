import Link from 'next/link'
import { ArrowLeft, Hammer } from 'lucide-react'

import { Icon } from '@/components/icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface ComingSoonProps {
  title: string
  subtitle: string
  icon: string
  /** 计划在这一批实现 */
  batch: '第二批' | '第三批'
  features: string[]
  children?: React.ReactNode
}

/**
 * 未完工页面的统一骨架。
 * 第二批 / 第三批会把每个页面的真实内容替换进来，这个组件只用于过渡。
 */
export function ComingSoon({ title, subtitle, icon, batch, features, children }: ComingSoonProps) {
  return (
    <div className="container max-w-3xl py-12 sm:py-16">
      <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2 text-dust hover:text-lamp">
        <Link href="/">
          <ArrowLeft className="h-3.5 w-3.5" />
          回房间
        </Link>
      </Button>

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-lamp/20 bg-lamp/10">
          <Icon name={icon} className="h-5 w-5 text-lamp" />
        </span>
        <div>
          <h1 className="font-display text-2xl text-paper">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <Badge variant="muted" className="mt-6">
        <Hammer className="mr-1.5 h-3 w-3" aria-hidden />
        {batch}开工
      </Badge>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm text-dust">{'// 这一页会有什么'}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-paper/80">
            {features.map((feature) => (
              <li key={feature} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-lamp" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {children}
    </div>
  )
}
