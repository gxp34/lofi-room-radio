'use client'

import * as React from 'react'

import { RoomObjectButton } from '@/components/room/room-object-button'
import { ROOM_OBJECTS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useRoomStore } from '@/stores/room-store'
import type { RoomZone } from '@/types'

/**
 * 房间的窄屏版本。
 *
 * 手机上硬塞一个 16:10 的全景，东西会小到点不中，所以窄屏另给一份
 * 「按房间分区排成纵向卡片」：墙上 / 架子上 / 桌面上 / 沙发上 / 地上。
 * 保留了房间的空间感（台面的木质边缘、地板透视），但每个东西都是能点的大卡片。
 *
 * ⚠️ **这里不要再加布景装饰。**
 *
 * 曾经在墙上放过一个会下雨的窗、在地上放过一块地毯，本意是别让这一条太空。
 * 但那两样**本来就是可点物件**（ROOM_OBJECTS 里的 window 和 rug），
 * 于是同一个东西在一条里出现了两次：一次是点不动的装饰、一次是能点的卡片，
 * 看起来像"这里怎么多了一块空的"。
 *
 * 而且现在全景在所有屏幕都显示了（见 room-scene.tsx），
 * 真正带雨的窗、真正的地毯都在全景里，这边不需要再演一遍。
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
        {objects.map((object) => (
          <RoomObjectButton key={object.id} object={object} variant="chip" />
        ))}
      </div>
    </section>
  )
}

