'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { useRoom } from '@/components/providers/room-provider'
import { playSfx } from '@/lib/audio/sfx'
import { LONG_PRESS_MS } from '@/lib/constants'
import { isDeepNight } from '@/lib/utils'
import { useEventStore } from '@/stores/event-store'
import { useRoomStore } from '@/stores/room-store'
import type { RoomObject } from '@/types'

/**
 * 一个房间物件的交互逻辑。
 *
 * 抽成 hook 是因为「物件」在视觉上有两种形态：
 *   - 摆在桌面上的小东西（emoji + 影子）
 *   - 本身就是一件家具的东西（窗户、门、地毯、衣柜……这些要画出来才像房间）
 * 两种形态长得完全不一样，但**戳它们的反应必须一模一样**，
 * 所以逻辑只能有一份，放在这里。
 *
 * 支持的触发方式：
 *   first（首次互动）→ night（深夜）→ click（常规），先命中先用；
 *   另外还有 combo（连点）、longpress（长按）、dblclick（双击，只有配了事件的物件才有）。
 */
export interface RoomObjectInteraction {
  /** 这个物件有没有配双击事件（没有的话单击要立刻响应，不能等） */
  hasDoubleClick: boolean
  /** 累计被点过多少次（用来画「没探索过」的小圆点） */
  clickCount: number
  /** 还没点过 */
  isUnvisited: boolean
  /** 鼠标悬停 / 键盘聚焦中 */
  active: boolean
  handlers: {
    onClick: () => void
    onDoubleClick?: () => void
    onPointerDown: () => void
    onPointerUp: () => void
    onPointerLeave: () => void
    onPointerCancel: () => void
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void
    onMouseEnter: () => void
    onMouseLeave: () => void
    onFocus: () => void
    onBlur: () => void
  }
}

export function useRoomObject(object: RoomObject): RoomObjectInteraction {
  const { events, triggerEvent } = useRoom()
  const router = useRouter()

  const bumpClick = useEventStore((state) => state.bumpClick)
  const bumpCombo = useEventStore((state) => state.bumpCombo)
  const hydrated = useEventStore((state) => state.hydrated)
  const clickCount = useEventStore((state) => state.clickCount[object.id] ?? 0)

  const [active, setActive] = React.useState(false)

  const hasDoubleClick = React.useMemo(
    () => events.some((event) => event.objectType === object.id && event.trigger === 'dblclick'),
    [events, object.id],
  )

  const singleClickTimer = React.useRef<number | null>(null)
  const longPressTimer = React.useRef<number | null>(null)
  const longPressFired = React.useRef(false)

  React.useEffect(() => {
    return () => {
      if (singleClickTimer.current) window.clearTimeout(singleClickTimer.current)
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current)
    }
  }, [])

  /* ------------------------------------------------------------------
     真正干活的逻辑
     ------------------------------------------------------------------ */
  const interact = React.useCallback(
    (trigger: 'click' | 'dblclick' | 'longpress') => {
      const store = useEventStore.getState()
      const clicksBefore = store.clickCount[object.id] ?? 0
      const totalClicks = bumpClick(object.id)
      const isFirst = clicksBefore === 0
      const lampOn = useRoomStore.getState().lights === 'on'
      const now = new Date()

      const attempts: Array<() => ReturnType<typeof triggerEvent>> = []

      if (isFirst) attempts.push(() => triggerEvent(object.id, 'first', { lampOn, now }))
      if (isDeepNight(now)) attempts.push(() => triggerEvent(object.id, 'night', { lampOn, now }))
      attempts.push(() => triggerEvent(object.id, trigger, { lampOn, now }))

      let matched = false
      for (const attempt of attempts) {
        const resolution = attempt()
        if (!resolution.silent) {
          matched = true
          // 事件自己没有副作用的话，至少给一声咔哒
          if (!resolution.action) void playSfx('click')
          break
        }
      }

      if (!matched) void playSfx('click')

      // 连点：从第二次开始每次都问一次引擎，
      // 引擎只会返回「要求次数已经满足」的那条（连点 3 次、7 次各有专门文案）
      if (trigger === 'click' && totalClicks > 0) {
        const combo = bumpCombo(object.id)
        if (combo >= 2) triggerEvent(object.id, 'combo', { combo, lampOn, now })
      }

      /**
       * 「门」类物件：日记本、抽屉、掌机、唱片机。
       * 弹完气泡再跳页 —— 气泡是全局的（存在 Provider 里），跳过去之后还挂在屏幕上，
       * 所以「进去」和「听到一句话」两件事不会互相打断。
       */
      if (object.link) {
        router.push(object.link)
      }
    },
    [bumpClick, bumpCombo, object.id, object.link, router, triggerEvent],
  )

  /* ------------------------------------------------------------------
     单击 / 双击 / 长按
     ------------------------------------------------------------------ */
  const handleClick = React.useCallback(() => {
    // 长按已经处理过了，这次 click 是抬手时浏览器补发的，忽略掉
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }

    if (!hasDoubleClick) {
      interact('click')
      return
    }

    // 有双击事件的物件：等 240ms，看会不会来第二下
    if (singleClickTimer.current) return
    singleClickTimer.current = window.setTimeout(() => {
      singleClickTimer.current = null
      interact('click')
    }, 240)
  }, [hasDoubleClick, interact])

  const handleDoubleClick = React.useCallback(() => {
    if (singleClickTimer.current) {
      window.clearTimeout(singleClickTimer.current)
      singleClickTimer.current = null
    }
    interact('dblclick')
  }, [interact])

  const startLongPress = React.useCallback(() => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current)
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null
      longPressFired.current = true
      interact('longpress')
    }, LONG_PRESS_MS)
  }, [interact])

  const cancelLongPress = React.useCallback(() => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  /** 键盘：回车 / 空格 = 单击；Shift + 回车 = 长按（键盘用户也能摸猫） */
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()

      if (event.shiftKey) {
        interact('longpress')
        return
      }
      if (hasDoubleClick) interact('click')
      else handleClick()
    },
    [hasDoubleClick, handleClick, interact],
  )

  return {
    hasDoubleClick,
    clickCount,
    // hydrated 之前不画小圆点，避免服务端和客户端不一致
    isUnvisited: hydrated && clickCount === 0,
    active,
    handlers: {
      onClick: handleClick,
      onDoubleClick: hasDoubleClick ? handleDoubleClick : undefined,
      onPointerDown: startLongPress,
      onPointerUp: cancelLongPress,
      onPointerLeave: cancelLongPress,
      onPointerCancel: cancelLongPress,
      onKeyDown: handleKeyDown,
      onMouseEnter: () => setActive(true),
      onMouseLeave: () => setActive(false),
      onFocus: () => setActive(true),
      onBlur: () => setActive(false),
    },
  }
}
