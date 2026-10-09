import Link from 'next/link'
import { Home, Moon } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** 404：这扇门后面没有房间 */
export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] max-w-lg flex-col items-center justify-center py-16 text-center">
      <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        <Moon className="h-6 w-6 text-dust" aria-hidden />
      </span>

      <h1 className="font-display text-2xl text-paper">这扇门后面没有房间</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        可能是地址打错了，也可能是房东把灯关了。
        走廊有点黑，先回房间里坐会儿吧。
      </p>

      <Button asChild className="mt-7">
        <Link href="/">
          <Home className="h-4 w-4" />
          回房间
        </Link>
      </Button>
    </div>
  )
}
