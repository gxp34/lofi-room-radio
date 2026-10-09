import { cn } from '@/lib/utils'

/** 加载占位块，带一点微弱的呼吸感 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-white/[0.06]', className)}
      {...props}
    />
  )
}

export { Skeleton }
