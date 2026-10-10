import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { VirtualCatClient } from '@/app/games/virtual-cat/virtual-cat-client'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: '电子猫',
  description: '掌机里养一只。会饿，会不高兴，也会长大。',
}

/**
 * 电子猫的独立页面。
 *
 * 游戏厅里也有一盘同名的卡带，进的是同一个组件、用同一份存档
 * （slug 都是 `virtual-cat`）—— 所以两边看到的是同一只猫，
 * 不会出现"在页面里喂过了、回卡带里又是饿的"。
 */
export default function VirtualCatPage() {
  return (
    <div className="container py-8 sm:py-12">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-dust">
            {'// 摸鱼掌机 · 卡带'}
          </p>
          <h1 className="font-display text-2xl text-paper sm:text-3xl">电子猫</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            掌机里的这一只和房间里那只
            <strong className="font-normal text-paper/80">没有关系</strong>
            。它只认你按的这几个按钮，也只记得你多久没来。
          </p>
        </div>

        <Button asChild variant="outline" size="sm">
          <Link href="/games">
            <ArrowLeft className="h-3.5 w-3.5" />
            回游戏厅
          </Link>
        </Button>
      </header>

      <VirtualCatClient />
    </div>
  )
}
