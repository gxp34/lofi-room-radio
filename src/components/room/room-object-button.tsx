'use client'

import * as React from 'react'

import { Icon } from '@/components/icon'
import { ART_SIZE, HIT_PAD, ObjectArt, hasArt, scalable } from '@/components/room/room-props'
import { useRoomObject } from '@/components/room/use-room-object'
import { cn } from '@/lib/utils'
import { usePlayerStore } from '@/stores/player-store'
import { useRoomStore } from '@/stores/room-store'
import type { RoomObject } from '@/types'

/**
 * 房间物件的两种样子。
 *
 * - `scene`：放在房间全景里的样子 —— 就是那个东西本身（emoji + 接触阴影），
 *   名字只在鼠标悬停时浮出来。这样房间看起来是房间，而不是一张标签列表。
 * - `chip`：窄屏（手机 / 平板）上用的胶囊卡片，名字和提示都直接写出来，
 *   因为小屏上「藏起来等悬停」等于永远看不到。
 *
 * 两种形态共用 useRoomObject() 的交互逻辑。
 */
export interface RoomObjectButtonProps {
  object: RoomObject
  variant?: 'scene' | 'chip'
  className?: string
  style?: React.CSSProperties
}

export function RoomObjectButton({
  object,
  variant = 'chip',
  className,
  style,
}: RoomObjectButtonProps) {
  const { isUnvisited, active, handlers } = useRoomObject(object)

  const lights = useRoomStore((state) => state.lights)
  const catPresent = useRoomStore((state) => state.catPresent)
  const phoneBuzzAt = useRoomStore((state) => state.ambient.phoneBuzzAt)

  const isCatGone = object.id === 'cat' && !catPresent
  const buzzing = object.id === 'phone' && Date.now() - phoneBuzzAt < 1200
  /** 手绘图形的显示尺寸；没有手绘的（比如偶尔加的新物件）用手绘的默认值 */
  const artSize = ART_SIZE[object.id] ?? 42
  /** 透明点击加宽：见 room-props.tsx 的 HIT_PAD 说明 */
  const hitPad = HIT_PAD[object.id] ?? 0

  if (variant === 'scene') {
    return (
      <button
        type="button"
        {...handlers}
        title={`${object.name} —— ${object.hint}`}
        aria-label={`${object.name}：${object.hint}`}
        style={style}
        className={cn(
          'group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center',
          'transition-[transform,opacity] duration-300 ease-out',
          'focus-visible:outline-none',
          isCatGone && 'pointer-events-none scale-90 opacity-0',
          active && 'z-20 -translate-y-[58%]',
          className,
        )}
      >
        {/* 透明的点击加宽区。
            图形的“看不见的留白”不算点击区，所以要让一个透明块把这块补上 ——
            它比按钮本体大，靠 overflow 可见的子孙元素依然能收到点击，
            事件冒泡上来还是这颗按钮。
            尺寸也跟着房间缩放：写死 px 的话，手机上加宽区会大过物件本身，
            把旁边的东西的点击抢走。 */}
        {hitPad > 0 && (
          <span
            aria-hidden
            className="absolute"
            style={{
              top: scalable(-hitPad),
              right: scalable(-hitPad),
              bottom: scalable(-hitPad),
              left: scalable(-hitPad),
            }}
          />
        )}
        {/* 东西本身：优先用手绘图形，没有的话退回 emoji */}
        <span
          className={cn(
            'relative block select-none transition-transform duration-300',
            'drop-shadow-[0_7px_9px_rgba(0,0,0,0.6)]',
            active && 'scale-110',
            buzzing && 'animate-flicker',
          )}
          style={{ width: scalable(artSize), height: scalable(artSize) }}
          aria-hidden
        >
          {hasArt(object.id) ? (
            <ObjectArt id={object.id} />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center leading-none"
              style={{ fontSize: scalable(30) }}
            >
              {object.emoji}
            </span>
          )}
        </span>

        {/* 接触阴影：有了它东西才像「放在」桌面上，而不是浮着 */}
        <span
          aria-hidden
          className={cn(
            'mt-[-4px] block h-[5px] rounded-[50%] bg-black/55 blur-[2px] transition-all duration-300',
            active && 'bg-black/65',
          )}
          style={{ width: scalable(artSize * 0.62) }}
        />

        {/* 名字：平时藏起来，只有悬停/键盘聚焦时才浮出来。
            这一条很关键 —— 如果让「没点过的」也显示名字，
            首屏就会变成一张 22 行的标签表，又不像房间了。 */}
        <span
          className={cn(
            'pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border px-1.5 py-0.5',
            'border-lamp/30 bg-night/95 font-display text-[10px] text-lamp shadow-lg transition-opacity duration-200',
            active ? 'opacity-100' : 'opacity-0',
          )}
        >
          {object.name}
        </span>

        {/* 还没点过的小圆点：给访客一个「这里还有东西没摸过」的线索。
            它比一整排名字安静得多，但同样能指路。 */}
        {isUnvisited && !active && (
          <span
            aria-hidden
            className="absolute -right-0.5 top-0 h-1 w-1 rounded-full bg-lamp/90 shadow-[0_0_6px_rgba(247,200,115,0.9)]"
          />
        )}

        {/* 悬停时的柔光 */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute -inset-3 -z-10 rounded-full transition-opacity duration-300',
            active ? 'opacity-100' : 'opacity-0',
          )}
          style={{ background: 'radial-gradient(circle, rgba(247,200,115,0.22) 0%, transparent 70%)' }}
        />

        {/* 台灯亮着的时候，它自己也在发光 */}
        {object.id === 'lamp' && lights === 'on' && (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-6 -z-10 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(247,200,115,0.35) 0%, transparent 70%)',
            }}
          />
        )}
      </button>
    )
  }

  /* ------------------------------------------------------------------
     窄屏用的胶囊卡片
     ------------------------------------------------------------------ */
  return (
    <button
      type="button"
      {...handlers}
      title={`${object.name} —— ${object.hint}（按住不放可以摸一下）`}
      aria-label={`${object.name}：${object.hint}`}
      style={style}
      className={cn(
        'group relative flex w-full items-center gap-2.5 rounded-xl border border-white/[0.08] bg-night/55 px-3 py-2.5 backdrop-blur-sm transition-all',
        'hover:border-lamp/35 hover:bg-night/75 active:scale-[0.98]',
        'focus-visible:ring-2 focus-visible:ring-lamp/60',
        isCatGone && 'pointer-events-none scale-95 opacity-0',
        className,
      )}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center transition-transform group-hover:scale-110"
        aria-hidden
      >
        {hasArt(object.id) ? (
          <ObjectArt id={object.id} />
        ) : (
          <span className="text-lg leading-none">{object.emoji}</span>
        )}
      </span>

      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-display text-sm text-paper/95">{object.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{object.hint}</span>
      </span>

      <Decoration objectId={object.id} />

      {isUnvisited && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 animate-breathe rounded-full bg-lamp"
        />
      )}
    </button>
  )
}

/** 几个物件的专属小动效（窄屏卡片用） */
function Decoration({ objectId }: { objectId: string }) {
  const isPlaying = usePlayerStore((state) => state.isPlaying)

  switch (objectId) {
    case 'record':
      return (
        <span
          aria-hidden
          className={cn(
            'h-5 w-5 shrink-0 rounded-full border border-night/60',
            'bg-[conic-gradient(from_0deg,#0b0f13,#2b2230,#0b0f13,#2b2230,#0b0f13)]',
            isPlaying && 'animate-vinyl-slow',
          )}
        />
      )
    case 'tea':
      return (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-3 left-1/2 h-3 w-1 -translate-x-1/2 animate-steam rounded-full bg-paper/25"
        />
      )
    default:
      return null
  }
}

export { Icon }
