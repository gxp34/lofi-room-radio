import * as React from 'react'

import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-md border border-white/10 bg-night/60 px-3 py-2 text-sm text-paper shadow-inner transition-colors',
      'placeholder:text-muted-foreground/70',
      'focus-visible:border-lamp/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lamp/50',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-lamp',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
