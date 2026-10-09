'use client'

import * as React from 'react'

import { AmbientOverlay, PowerTripOverlay } from '@/components/room/ambient-overlay'
import { useRoomStore } from '@/stores/room-store'

/**
 * 把房间状态同步到 DOM，并挂上环境特效层。
 *
 * 灯的状态写在 <html data-lights="..."> 上，让 globals.css 里那条
 * 「关灯 = 整页压暗」的规则生效 —— 比在每个组件里传 prop 干净得多。
 */
export function RoomEffects() {
  const lights = useRoomStore((state) => state.lights)
  const powerTrip = useRoomStore((state) => state.powerTrip)

  React.useEffect(() => {
    const root = document.documentElement
    root.dataset.lights = powerTrip ? 'off' : lights

    return () => {
      delete root.dataset.lights
    }
  }, [lights, powerTrip])

  return (
    <>
      <AmbientOverlay />
      <PowerTripOverlay />
    </>
  )
}
