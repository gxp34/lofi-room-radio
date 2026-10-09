'use client'

import * as React from 'react'
import { CloudRain, Moon } from 'lucide-react'

import { RoomObjectButton } from '@/components/room/room-object-button'
import { ROOM_OBJECTS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useRoomStore } from '@/stores/room-store'
import type { RoomZone } from '@/types'

/**
 * 房间的窄屏版本。
 *
 * 手机上硬塞一个 16:10 的全景，东西会小到点不中，也没法看。
 * 所以窄屏改成「按房间分区排成纵向卡片」：
 * 墙上 / 架子上 / 桌面上 / 地上各是一条台面，东西摆在这条台面上。
 * 保留了房间的空间感（台面的木质边缘、地板透视），但每个东西都是能点的大卡片。
 */

const ZONES: Array<{ id: RoomZone; label: string; hint: string }> = [
  { id: 'wall', label: '墙上', hint: '抬眼就能看见的地方' },
  { id: 'shelf', label: '架子上', hint: '落了一层灰' },
  { id: 'desk', label: '桌面上', hint: '台灯照着的一小块' },
  { id: 'sofa', label: '沙发上', hint: '坐下去会陷进去' },
  { id: 'floor', label: '地上', hint: '猫的地盘' },
]

export function RoomBands() {
  const lights = useRoomStore((state) => state.lights)

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#241d2b] via-[#201a28] to-[#161220]">
      {/* 墙面纹理 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.014) 0px, rgba(255,255,255,0.014) 1px, transparent 1px, transparent 22px)',
        }}
      />

      {/* 台灯光晕 */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -right-16 -top-24 h-96 w-96 rounded-full blur-3xl transition-opacity duration-700',
          lights === 'on' ? 'opacity-100' : lights === 'moon' ? 'opacity-40' : 'opacity-0',
        )}
        style={{
          background:
            lights === 'moon'
              ? 'radial-gradient(circle, rgba(127,200,216,0.30) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(247,200,115,0.30) 0%, transparent 70%)',
        }}
      />

      {/* 地板透视 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 opacity-60"
        style={{
          background:
            'linear-gradient(to bottom, transparent, rgba(0,0,0,0.45)), repeating-linear-gradient(90deg, rgba(247,200,115,0.05) 0px, rgba(247,200,115,0.05) 1px, transparent 1px, transparent 64px)',
        }}
      />

      <div className="relative p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <p className="font-display text-[11px] uppercase tracking-[0.2em] text-dust">
            我的房间 · 深夜档
          </p>
          <p className="font-display text-[11px] text-dust">
            {lights === 'on' ? '灯开着' : lights === 'moon' ? '月光色' : '灯关着'}
          </p>
        </div>

        <div className="space-y-3">
          {ZONES.map((zone) => (
            <ZoneBand key={zone.id} zone={zone} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ZoneBand({ zone }: { zone: { id: RoomZone; label: string; hint: string } }) {
  const objects = React.useMemo(
    () =>
      ROOM_OBJECTS.filter((object) => object.zone === zone.id).sort(
        (a, b) => a.position.x - b.position.x,
      ),
    [zone.id],
  )

  return (
    <section
      aria-label={`${zone.label}的物件`}
      className={cn(
        'relative rounded-xl px-2 pb-2.5 pt-2 sm:px-3',
        zone.id === 'wall' && 'bg-white/[0.012]',
        zone.id === 'shelf' && 'border-b-2 border-[#3a2b23]/70 bg-[#2b2230]/40',
        zone.id === 'desk' && 'border-b-4 border-[#3a2b23] bg-[#2b2230]/55',
        zone.id === 'sofa' && 'border-b-2 border-[#2f4440] bg-[#25352f]/50',
        zone.id === 'floor' && 'border-b-2 border-black/40 bg-[#1b1622]/60',
      )}
    >
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-display text-[10px] uppercase tracking-[0.18em] text-dust">
          {zone.label}
        </span>
        <span className="hidden text-[10px] text-dust/60 sm:inline">{zone.hint}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {zone.id === 'wall' && <WindowProp />}
        {zone.id === 'floor' && <RugProp />}

        {objects.map((object) => (
          <RoomObjectButton key={object.id} object={object} variant="chip" />
        ))}
      </div>
    </section>
  )
}

/** 窗（窄屏的简化版布景） */
function WindowProp() {
  const moonShift = useRoomStore((state) => state.ambient.moonShift)
  const rain = useRoomStore((state) => state.ambient.rain)

  const streaks = React.useMemo(
    () => [12, 28, 44, 61, 78].map((left, index) => ({ left, delay: index * 0.7 })),
    [],
  )

  return (
    <div
      aria-hidden
      className="relative h-[62px] w-[104px] shrink-0 overflow-hidden rounded-lg border-2 border-[#3a2b23] bg-gradient-to-b from-[#0f1520] to-[#131a26] sm:h-[54px] sm:w-[92px]"
    >
      <span
        className="absolute top-2 h-4 w-4 rounded-full bg-paper/80 shadow-[0_0_18px_rgba(244,238,231,0.55)] transition-[left] duration-1000"
        style={{ left: `${20 + moonShift}%` }}
      />
      {streaks.map((streak) => (
        <span
          key={streak.left}
          className="animate-rainfall absolute top-0 w-px bg-gradient-to-b from-transparent via-rain/60 to-transparent"
          style={{
            left: `${streak.left}%`,
            height: rain === 'heavy' ? '26px' : '16px',
            animationDelay: `${streak.delay}s`,
            animationDuration: rain === 'light' ? '1.5s' : rain === 'heavy' ? '0.55s' : '0.95s',
          }}
        />
      ))}
      <span className="absolute bottom-1 left-1.5 flex items-center gap-1 text-[9px] text-dust/70">
        <CloudRain className="h-2.5 w-2.5" />
        雨
      </span>
      <span className="absolute bottom-1 right-1.5 text-dust/50">
        <Moon className="h-2.5 w-2.5" />
      </span>
    </div>
  )
}

/** 地毯（窄屏的简化版布景） */
function RugProp() {
  return (
    <div
      aria-hidden
      className="relative h-[62px] w-[104px] shrink-0 rounded-lg border border-white/[0.05] bg-[#3a2b23]/45 sm:h-[54px] sm:w-[92px]"
      style={{
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(247,200,115,0.06) 0px, rgba(247,200,115,0.06) 4px, transparent 4px, transparent 10px)',
      }}
    >
      <span className="absolute inset-x-0 bottom-1 text-center text-[9px] text-dust/70">地毯</span>
    </div>
  )
}
