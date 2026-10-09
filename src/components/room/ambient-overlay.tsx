'use client'

import * as React from 'react'

import { useRoomStore } from '@/stores/room-store'

/**
 * 房间的环境特效层。
 *
 * 全部是「计时器 + 一次性动画」：用一个自增的时间戳当 key，
 * 每次触发就重新挂载一次动画元素，播完自动移除。
 * 好处是不需要手动管理一堆 CSS 类名，也不会effect 叠加。
 */

/** 挂载 → 等 ms 毫秒 → 自动卸载 */
function useTransient(ms: number): boolean {
  const [visible, setVisible] = React.useState(true)
  React.useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), ms)
    return () => window.clearTimeout(timer)
  }, [ms])
  return visible
}

export function AmbientOverlay() {
  const { carLightAt, notesFallAt, lightFlickerAt } = useRoomStore((state) => ({
    carLightAt: state.ambient.carLightAt,
    notesFallAt: state.ambient.notesFallAt,
    lightFlickerAt: state.ambient.lightFlickerAt,
  }))

  return (
    <>
      {/* 车灯扫过：从窗户那侧斜着扫过去 */}
      {carLightAt > 0 && <CarLight key={carLightAt} />}

      {/* 便签从墙上掉下来 */}
      {notesFallAt > 0 && <FallingNotes key={notesFallAt} />}

      {/* 灯泡闪一下：整屏极短的一次亮度跳变 */}
      {lightFlickerAt > 0 && <LightFlicker key={lightFlickerAt} />}
    </>
  )
}

/** 车灯：一道暖白的光带从左上扫到右下 */
function CarLight() {
  const visible = useTransient(2000)
  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden>
      <span className="absolute -inset-y-1/2 left-0 w-1/3 animate-car-sweep bg-gradient-to-r from-transparent via-paper/12 to-transparent blur-2xl" />
    </div>
  )
}

/** 便签：几张纸片从上方飘落 */
function FallingNotes() {
  const visible = useTransient(1900)
  if (!visible) return null

  // 固定的横向位置，避免服务端/客户端不一致
  const positions = [18, 32, 47, 61, 76]

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden" aria-hidden>
      {positions.map((left, index) => (
        <span
          key={left}
          className="absolute top-24 block h-8 w-8 animate-note-fall rounded-sm bg-paper/25 shadow-sm"
          style={{
            left: `${left}%`,
            animationDelay: `${index * 0.12}s`,
            transform: `rotate(${(index % 3) * 7 - 7}deg)`,
          }}
        />
      ))}
    </div>
  )
}

/** 灯泡闪：一层白雾快速闪一下 */
function LightFlicker() {
  const visible = useTransient(900)
  if (!visible) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-30 animate-screen-off bg-lamp/10"
      aria-hidden
    />
  )
}

/**
 * 跳闸：黑屏 3 秒，只剩猫的眼睛和电脑屏幕。
 * 这个不是「一闪而过」，所以单独渲染，由 room-store 的 powerTrip 控制。
 */
export function PowerTripOverlay() {
  const powerTrip = useRoomStore((state) => state.powerTrip)

  if (!powerTrip) return null

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[45] animate-screen-off bg-black"
      role="status"
      aria-live="polite"
    >
      {/* 猫的眼睛 */}
      <div className="absolute bottom-1/3 left-[38%] flex gap-6">
        {[0, 1].map((index) => (
          <span
            key={index}
            className="block h-2.5 w-4 animate-cat-eye rounded-full bg-lamp shadow-lamp"
          />
        ))}
      </div>

      {/* 电脑屏幕的微光 */}
      <div className="absolute bottom-1/4 right-[16%] h-24 w-40 rounded-md bg-rain/12 blur-xl" />

      {/* 一句话 */}
      <p className="absolute inset-x-0 top-[42%] text-center font-display text-sm text-paper/40">
        啪。跳闸了。
      </p>
    </div>
  )
}
