'use client'

import { useRoom } from '@/components/providers/room-provider'
import { TrackShelf } from '@/components/player/track-shelf'

/**
 * 唱片架。
 *
 * 歌单是客户端加载的（TracksLoader 在根布局里），
 * 所以这一页本身是静态的，切换过来几乎瞬间可见；
 * 播放条常驻底部，切到别的页面音乐也不会停。
 */
export default function MusicPage() {
  const { settings } = useRoom()

  return (
    <div className="container py-8 sm:py-12">
      <header className="mb-8">
        <p className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-dust">
          {'// 唱片架'}
        </p>
        <h1 className="font-display text-2xl text-paper sm:text-3xl">点唱机</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          点一张唱片就换到唱针下面。双击可以直接跳下一张。
          手机锁屏之后，歌名和封面也还在。
        </p>
      </header>

      <TrackShelf
        shelfNote={settings.shelfNote}
        copyrightNotice={settings.musicCopyrightNotice}
      />
    </div>
  )
}
