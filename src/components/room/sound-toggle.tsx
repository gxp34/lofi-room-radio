'use client'

import * as React from 'react'
import { Volume2, VolumeX } from 'lucide-react'

import { playAmbient, playSfx, stopAmbient } from '@/lib/audio/sfx'
import { cn } from '@/lib/utils'
import { useRoomStore } from '@/stores/room-store'

/**
 * 声音开关。
 *
 * 默认**静音**，必须由用户点这一下才会出声 ——
 * 既是浏览器的自动播放策略要求，也是对深夜访客的基本礼貌。
 */
export function SoundToggle({ className }: { className?: string }) {
  const soundEnabled = useRoomStore((state) => state.soundEnabled)
  const toggleSound = useRoomStore((state) => state.toggleSound)
  const [mounted, setMounted] = React.useState(false)

  // 服务端渲染时不知道用户上次的选择，挂载后再显示真实状态，避免 hydration 不一致
  React.useEffect(() => setMounted(true), [])

  const enabled = mounted && soundEnabled

  const handleToggle = () => {
    const next = toggleSound()
    if (next) {
      // 开启了：放一声咔哒当反馈，并把雨声垫底
      void playSfx('click')
      void playAmbient('rain', 0.22)
    } else {
      stopAmbient()
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-pressed={enabled}
      aria-label={enabled ? '关掉房间里的声音' : '打开房间里的声音'}
      title={enabled ? '关掉声音' : '这间房间默认是静音的，点一下才有声音'}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
        enabled
          ? 'border-lamp/35 bg-lamp/10 text-lamp'
          : 'border-white/[0.09] bg-white/[0.02] text-dust hover:text-paper',
        className,
      )}
    >
      {enabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      <span className="font-display">{enabled ? '声音开' : '静音中'}</span>
    </button>
  )
}
