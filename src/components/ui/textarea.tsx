import * as React from 'react'

import { cn } from '@/lib/utils'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[96px] w-full rounded-md border border-white/10 bg-night/60 px-3 py-2 text-sm leading-relaxed text-paper shadow-inner transition-colors',
        'placeholder:text-muted-foreground/70',
        'focus-visible:border-lamp/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lamp/50',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export { Textarea }
