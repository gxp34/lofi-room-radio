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
  const rain = useRoomStore((state) => state.ambient.rain)
  const [mounted, setMounted] = React.useState(false)

  // 服务端渲染时不知道用户上次的选择，挂载后再显示真实状态，避免 hydration 不一致
  React.useEffect(() => setMounted(true), [])

  const enabled = mounted && soundEnabled

  /**
   * 雨声跟着天气走。
   *
   * 真拿到天气且是晴天时 rain 是 'none' —— 那就不该放雨声。
   * 注意仍然要 playSfx('click')：那一下是"你按了按钮"的反馈，和天气无关；
   * 而且它也是用户主动点击触发的，不算自动播放。
   */
  const handleToggle = () => {
    const next = toggleSound()
    if (next) {
      void playSfx('click')
      if (rain !== 'none') {
        void playAmbient(rain === 'heavy' ? 'rainHeavy' : 'rain', 0.22)
      }
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
      title={
        rain === 'none'
          ? '窗外没在下雨，所以没有雨声可放'
          : enabled
            ? '关掉声音'
            : '这间房间默认是静音的，点一下才有声音'
      }
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
