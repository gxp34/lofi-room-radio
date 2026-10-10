'use client'

import * as React from 'react'

import { useRoomStore } from '@/stores/room-store'

/**
 * 雨窗层：盖在整个页面上的一层细雨。
 *
 * 纯 CSS 实现（没有 canvas、没有 JS 定时器），所以：
 *   - 不会造成 hydration 不一致（雨滴位置由索引算出来，不用 Math.random）；
 *   - 系统开启 prefers-reduced-motion 时由 globals.css 直接隐藏；
 *   - pointer-events: none，不挡任何点击。
 *
 * 雨势会跟着房间里的事件变化（「雨声变压了」「雨突然大了一阵」）。
 */

/** 用确定性的算法生成雨滴参数，保证服务端和客户端算出来一模一样 */
const DROPS = Array.from({ length: 48 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: ((i * 13) % 23) / 10,
  duration: 0.65 + ((i * 7) % 11) / 12,
  height: 36 + ((i * 17) % 52),
  opacity: 0.1 + ((i * 5) % 7) / 32,
}))

const RAIN_CONFIG = {
  // 雨停了：一条雨丝都不画（真拿到天气且是晴天时才会走到这里）
  none: { count: 0, speed: 1, opacity: 0 },
  light: { count: 22, speed: 1.6, opacity: 0.6 },
  normal: { count: 34, speed: 1, opacity: 1 },
  heavy: { count: 48, speed: 0.62, opacity: 1.35 },
} as const

export function RainLayer() {
  const rain = useRoomStore((state) => state.ambient.rain)
  const config = RAIN_CONFIG[rain]

  // 雨停的时候整层都不渲染，省掉 forty 多个 span 的合成开销
  if (config.count === 0) return null

  return (
    <div
      className="rain-layer pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {DROPS.slice(0, config.count).map((drop, index) => (
        <span
          key={index}
          className="animate-rainfall absolute top-0 block w-px rounded-full"
          style={{
            left: `${drop.left}%`,
            height: `${drop.height}px`,
            opacity: Math.min(0.6, drop.opacity * config.opacity),
            animationDelay: `${drop.delay}s`,
            animationDuration: `${drop.duration * config.speed}s`,
            background:
              'linear-gradient(to bottom, transparent, rgba(127, 200, 216, 0.85), transparent)',
          }}
        />
      ))}
    </div>
  )
}
