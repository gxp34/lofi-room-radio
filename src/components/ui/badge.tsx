import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-lamp/15 text-lamp',
        neon: 'border-transparent bg-neon/15 text-neon',
        rain: 'border-transparent bg-rain/15 text-rain',
        outline: 'border-white/12 text-paper/80',
        muted: 'border-transparent bg-white/[0.06] text-muted-foreground',
        /** 稀有 / 隐藏事件的标记 */
        rare: 'border-rain/40 bg-rain/10 text-rain',
        hidden: 'border-neon/40 bg-neon/10 text-neon',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
