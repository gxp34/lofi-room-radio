'use client'

import * as React from 'react'

import { RoomObjectButton } from '@/components/room/room-object-button'
import { useRoomObject } from '@/components/room/use-room-object'
import { ROOM_OBJECT_MAP, ROOM_OBJECTS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useRoomStore } from '@/stores/room-store'
import type { RoomObject } from '@/types'

/**
 * 房间全景（大屏用）。
 *
 * 这一版的目标是「像一张画」，不只是「像一张示意图」。靠四件事撑起来：
 *
 *   1. **所有东西都是自己画的**（家具 + 物件，见 room-props.tsx）。
 *      不用 emoji —— emoji 是别人设计的彩色字形，混进哑光木色的家具里
 *      会像「贴纸贴在画上」，整间屋子立刻廉价。
 *   2. **灯光是有来源的**：台灯在墙上打出一团暖光、窗户往地板上淌一片冷月光、
 *      灯下有一块光斑。关灯之后这些全部消失，房间是真的会暗下来。
 *   3. **每样家具都有落地阴影**，物件下面都有接触阴影 ——
 *      有影子才像「放着」，没影子就是浮着。
 *   4. **地板有透视**：地板缝越往远处越密，再叠一层靠近天花板的暗角，
 *      画面就有了纵深。
 */

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 台灯在容器里的位置（百分比）——所有灯光都以它为原点 */
const LAMP = { x: 54, y: 43 }

/**
 * 可点的「画出来的家具」——这些本身就是可点物件。
 */
const DRAWN: Record<string, Rect> = {
  window: { x: 4, y: 12, w: 21, h: 34 },
  corkboard: { x: 31, y: 10, w: 16, h: 18 },
  painting: { x: 54, y: 6, w: 15, h: 18 },
  notes: { x: 77, y: 6, w: 16, h: 15 },
  rug: { x: 14, y: 80, w: 32, h: 14 },
  lamp: { x: 51, y: 38, w: 7, h: 12 },
  drawer: { x: 58, y: 52, w: 12, h: 7 },
}

/**
 * 纯布景：**不可点**的大件家具。
 *
 * 床和沙发原本也是可点物件，现在去掉了。原因很实际：
 * 它们的可点区域太大，而猫坐在床上、热茶和掌机摆在沙发上 ——
 * 点那些小东西时会先打到床和沙发。与其做层级优先级，不如让大件家具当背景。
 */
const DECOR: Record<string, Rect> = {
  bed: { x: 11, y: 49, w: 38, h: 26 },
  sofa: { x: 77, y: 48, w: 22, h: 22 },
  nightstand: { x: 1, y: 63, w: 10, h: 12 },
}

/** 桌子 / 架子这类纯布景 */
const DESK: Rect = { x: 50, y: 50, w: 26, h: 18 }
const SHELF: Rect = { x: 51, y: 32, w: 24, h: 3 }

/** 摆在家具上的小东西 */
const ITEM_POS: Record<string, { x: number; y: number }> = {
  clock: { x: 50, y: 7 },
  // 架子上
  radio: { x: 54, y: 29 },
  books: { x: 62, y: 29 },
  headphone: { x: 70, y: 29 },
  // 桌面上（桌面在 y=50）
  phone: { x: 61, y: 44 },
  record: { x: 67.5, y: 44 },
  diary: { x: 73, y: 44 },
  // 沙发上：故意分开放到两端，中间留给沙发本体 ——
  // 两样东西挤在正中间的话，这一整块就只剩它们俩能点，沙发自己点不到了
  tea: { x: 82, y: 55 },
  handheld: { x: 93, y: 54 },
  // 床上（床垫面在 y≈63）
  cat: { x: 30, y: 59 },
  // 床头柜上
  plant: { x: 6, y: 59 },
}

export function RoomPanorama() {
  const lights = useRoomStore((state) => state.lights)
  const moonShift = useRoomStore((state) => state.ambient.moonShift)

  const items = React.useMemo(
    () => ROOM_OBJECTS.filter((object) => !DRAWN[object.id] && !DECOR[object.id]),
    [],
  )

  return (
    /* container-type: inline-size 是给里面的物件用的 ——
       ART_SIZE 里那些「照 1130px 宽调的像素」要靠 cqw 换算，
       手机上的房间变窄时物件才会跟着等比缩小（详见 room-props.tsx 的 scalable）。 */
    <div className="relative aspect-[16/11] w-full select-none overflow-hidden rounded-2xl border border-white/[0.08] bg-[#191322] shadow-[0_30px_80px_-40px_rgba(0,0,0,1)] [container-type:inline-size]">
      {/* ================= 墙 ================= */}
      <Wall lights={lights} />

      {/* ================= 地板 ================= */}
      <Floor />

      {/* ================= 踢脚线 ================= */}
      <div className="absolute inset-x-0 top-[62%] h-[1.6%]">
        <div className="h-full bg-gradient-to-b from-[#4a3628] via-[#3a2b23] to-[#2a1f1a]" />
        <div className="h-[1px] w-full bg-white/10" />
        <div className="h-3 w-full bg-gradient-to-b from-black/45 to-transparent" />
      </div>

      {/* ================= 家具与布景 ================= */}
      {/* 地毯先画，这样床和沙发是「压在地毯上」的 */}
      <FurnitureSpot object="rug" rect={DRAWN.rug as Rect}>
        <Rug />
      </FurnitureSpot>

      {/* 纯布景：只为了让画面不空，不能点 */}
      <HangingPlant />
      <Nightstand rect={DECOR.nightstand as Rect} />
      <Prop rect={DECOR.bed as Rect}>
        <Bed />
      </Prop>

      <Desk rect={DESK} />
      <Shelf rect={SHELF} />

      {/* 电线要在桌子后面画，才能垂在桌面前脸上 */}
      <LampCord />

      <FurnitureSpot object="window" rect={DRAWN.window as Rect}>
        <Window moonShift={moonShift} />
      </FurnitureSpot>

      {/* 沙发压在书桌前面，做出前后关系 */}
      <Prop rect={DECOR.sofa as Rect}>
        <Sofa />
      </Prop>

      <FurnitureSpot object="corkboard" rect={DRAWN.corkboard as Rect}>
        <Corkboard />
      </FurnitureSpot>

      <FurnitureSpot object="painting" rect={DRAWN.painting as Rect}>
        <Painting />
      </FurnitureSpot>

      <FurnitureSpot object="notes" rect={DRAWN.notes as Rect}>
        <NoteWall />
      </FurnitureSpot>

      <FurnitureSpot object="drawer" rect={DRAWN.drawer as Rect}>
        <DrawerFront />
      </FurnitureSpot>

      <FurnitureSpot object="lamp" rect={DRAWN.lamp as Rect}>
        <DeskLamp lit={lights === 'on'} />
      </FurnitureSpot>

      {/* ================= 摆在家具上的东西 ================= */}
      {items.map((object) => {
        const position = ITEM_POS[object.id] ?? object.position
        return (
          <RoomObjectButton
            key={object.id}
            object={object}
            variant="scene"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
          />
        )
      })}

      {/* ================= 灯光 ================= */}
      <Lighting lights={lights} />

      <p className="pointer-events-none absolute bottom-3 right-4 font-display text-[10px] tracking-[0.18em] text-paper/20">
        深夜档 · ON AIR
      </p>
    </div>
  )
}

/* ==========================================================================
   墙与地板
   ========================================================================== */

function Wall({ lights }: { lights: 'on' | 'off' | 'moon' }) {
  const warm = lights !== 'off'
  const tint = lights === 'moon' ? '127,200,216' : '247,200,115'

  return (
    <div className="absolute inset-x-0 top-0 h-[62%]">
      {/* 底色：暖紫棕，比之前亮一档 —— 太暗会让整间屋子显脏 */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, #2f2440 0%, #3d2f4c 48%, #4a3a52 100%)',
        }}
      />
      {/* 墙纸竖条纹 */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.028) 0px, rgba(255,255,255,0.028) 1px, transparent 1px, transparent 30px)',
        }}
      />
      {/* 台灯打在墙上的一大团暖光 —— 房间「亮不亮」主要靠它 */}
      {warm && (
        <div
          className="absolute inset-0 transition-opacity duration-700"
          style={{
            background: `radial-gradient(48% 54% at ${LAMP.x + 6}% ${LAMP.y - 10}%, rgba(${tint},0.46) 0%, rgba(${tint},0.17) 40%, transparent 76%)`,
          }}
        />
      )}
      {/* 窗边淌进来的冷月光 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(30% 36% at 14% 28%, rgba(127,200,216,0.22) 0%, transparent 72%)',
        }}
      />
      {/* 靠近天花板的暗角 */}
      <div
        className="absolute inset-x-0 top-0 h-1/4"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.38), transparent)' }}
      />
    </div>
  )
}

function Floor() {
  return (
    <div className="absolute inset-x-0 bottom-0 h-[38%]">
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, #382b42 0%, #2b2135 58%, #211a2b 100%)' }}
      />
      {/* 地板缝：横向，越远越密 */}
      <div
        className="absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(247,200,115,0.07) 0px, rgba(247,200,115,0.07) 1px, transparent 1px, transparent 96px)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(180deg, rgba(0,0,0,0.2) 0px, rgba(0,0,0,0.2) 1px, transparent 1px, transparent 26px)',
          maskImage: 'linear-gradient(to bottom, black, transparent 92%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 92%)',
        }}
      />
      {/* 靠墙那一条最暗 */}
      <div
        className="absolute inset-x-0 top-0 h-1/3"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }}
      />
    </div>
  )
}

/* ==========================================================================
   可点击的家具
   ========================================================================== */

function FurnitureSpot({
  object: objectId,
  rect,
  children,
}: {
  object: string
  rect: Rect
  children: React.ReactNode
}) {
  const object = ROOM_OBJECT_MAP[objectId]
  if (!object) return null

  return (
    <FurnitureInner object={object} rect={rect}>
      {children}
    </FurnitureInner>
  )
}

function FurnitureInner({
  object,
  rect,
  children,
}: {
  object: RoomObject
  rect: Rect
  children: React.ReactNode
}) {
  const { isUnvisited, active, handlers } = useRoomObject(object)

  return (
    <button
      type="button"
      {...handlers}
      title={`${object.name} —— ${object.hint}`}
      aria-label={`${object.name}：${object.hint}`}
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
      }}
      className={cn(
        'group absolute transition-transform duration-300 focus-visible:outline-none',
        active && 'z-20',
      )}
    >
      {children}

      {/* 悬停时的柔光与描边 */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-1.5 rounded-lg border transition-opacity duration-200',
          active ? 'border-lamp/50 opacity-100' : 'opacity-0',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-4 rounded-xl transition-opacity duration-300',
          active ? 'opacity-100' : 'opacity-0',
        )}
        style={{ background: 'radial-gradient(circle, rgba(247,200,115,0.14), transparent 70%)' }}
      />

      {/* 名字只在悬停时出现 */}
      <span
        className={cn(
          'pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border px-1.5 py-0.5',
          'border-lamp/30 bg-night/95 font-display text-[10px] text-lamp shadow-lg transition-opacity duration-200',
          active ? 'opacity-100' : 'opacity-0',
        )}
      >
        {object.name}
      </span>

      {isUnvisited && !active && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-1 w-1 rounded-full bg-lamp/90 shadow-[0_0_6px_rgba(247,200,115,0.9)]"
        />
      )}
    </button>
  )
}

/* ==========================================================================
   纯布景（不可点，只为了让画面不空）
   ========================================================================== */

/** 吊在天花板上的绿萝：填掉左上角那块空墙 */
function HangingPlant() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{ left: '4%', top: '-1%', width: '7%', height: '22%' }}
    >
      {/* 吊绳 */}
      <span className="absolute left-1/2 top-0 h-[16%] w-px -translate-x-1/2 bg-[#c9c3ba]/50" />
      <span className="absolute left-[26%] top-0 h-[14%] w-px rotate-[14deg] bg-[#c9c3ba]/40" />
      <span className="absolute left-[72%] top-0 h-[14%] w-px -rotate-[14deg] bg-[#c9c3ba]/40" />
      {/* 花盆 */}
      <div className="absolute inset-x-0 top-[14%] h-[26%] rounded-b-[40%] bg-gradient-to-b from-[#d97a5c] to-[#a8563f] shadow-[0_8px_16px_-6px_rgba(0,0,0,0.7)]" />
      <div className="absolute inset-x-[-6%] top-[12%] h-[7%] rounded-full bg-[#e89073]" />
      {/* 垂下来的藤蔓 */}
      <div className="absolute inset-x-0 top-[36%] bottom-0">
        {[10, 34, 58, 82].map((left, index) => (
          <span
            key={left}
            className="absolute top-0 w-[3px] rounded-full bg-[#5f8a5a]"
            style={{ left: `${left}%`, height: `${56 + index * 12}%` }}
          />
        ))}
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <span
            key={index}
            className="absolute h-[10%] w-[42%] rounded-[50%] bg-[#6ba05e]"
            style={{
              left: `${8 + (index % 3) * 30}%`,
              top: `${18 + index * 14}%`,
              transform: `rotate(${index % 2 === 0 ? -24 : 24}deg)`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * 沙发：原来这里是桌前的一张木凳。
 * 换成沙发之后，热茶和掌机就有了地方放 —— 房间里多了一个「你会待着的地方」，
 * 而不只是「你会经过的地方」。
 */
function Sofa() {
  return (
    <div className="relative h-full w-full">
      {/* 墙上的投影 */}
      <span
        aria-hidden
        className="absolute left-[4%] top-[4%] h-[80%] w-[94%] rounded-[10px] bg-black/35 blur-[8px]"
      />

      {/* 四条木腿（先画，会被底座压住顶端） */}
      <span className="absolute bottom-0 left-[10%] h-[16%] w-[4%] rounded-b-sm bg-gradient-to-b from-[#5b4433] to-[#2f231b]" />
      <span className="absolute bottom-0 left-[26%] h-[16%] w-[4%] rounded-b-sm bg-gradient-to-b from-[#5b4433] to-[#2f231b]" />
      <span className="absolute bottom-0 right-[26%] h-[16%] w-[4%] rounded-b-sm bg-gradient-to-b from-[#5b4433] to-[#2f231b]" />
      <span className="absolute bottom-0 right-[10%] h-[16%] w-[4%] rounded-b-sm bg-gradient-to-b from-[#5b4433] to-[#2f231b]" />

      {/* 靠背 */}
      <div className="absolute inset-x-[6%] top-0 h-[56%] rounded-t-[10px] bg-gradient-to-b from-[#5b7f77] via-[#45645d] to-[#2f4440] shadow-[inset_-10px_0_18px_rgba(0,0,0,0.25)]">
        {/* 两个靠垫的分缝 */}
        <span className="absolute inset-y-[12%] left-1/2 w-[2px] -translate-x-1/2 bg-black/25" />
        {/* 靠背顶上的高光 */}
        <span className="absolute inset-x-0 top-0 h-[6%] rounded-t-[10px] bg-[#7fa79e]/80" />
        {/* 靠垫的起伏 */}
        <span className="absolute left-[9%] top-[26%] h-[54%] w-[32%] rounded-[7px] bg-white/[0.055]" />
        <span className="absolute right-[9%] top-[26%] h-[54%] w-[32%] rounded-[7px] bg-white/[0.04]" />
      </div>

      {/* 座位底下那一块 */}
      <div className="absolute inset-x-[4%] top-[62%] h-[24%] rounded-b-[6px] bg-gradient-to-b from-[#3c5751] to-[#253835] shadow-[inset_0_-8px_14px_rgba(0,0,0,0.35)]" />

      {/* 坐垫 */}
      <div className="absolute inset-x-[10%] top-[44%] h-[22%] rounded-[7px] bg-gradient-to-b from-[#7fa79e] via-[#6a938a] to-[#4e706a] shadow-[inset_0_3px_0_rgba(255,255,255,0.18),0_6px_14px_-6px_rgba(0,0,0,0.7)]">
        <span className="absolute inset-x-[4%] top-[46%] h-px bg-black/15" />
      </div>

      {/* 两个扶手：压在坐垫两边 */}
      <div className="absolute left-0 top-[34%] h-[50%] w-[16%] rounded-[8px] bg-gradient-to-b from-[#6a938a] via-[#4e706a] to-[#2f4440] shadow-[inset_-6px_0_12px_rgba(0,0,0,0.3)]">
        <span className="absolute inset-x-0 top-0 h-[8%] rounded-t-[8px] bg-[#8fb5ac]/80" />
      </div>
      <div className="absolute right-0 top-[34%] h-[50%] w-[16%] rounded-[8px] bg-gradient-to-b from-[#5b7f77] via-[#45645d] to-[#2b3f3b] shadow-[inset_6px_0_12px_rgba(0,0,0,0.3)]">
        <span className="absolute inset-x-0 top-0 h-[8%] rounded-t-[8px] bg-[#7fa79e]/70" />
      </div>

      {/* 落地阴影 */}
      <span className="absolute -bottom-1 left-[2%] h-2.5 w-[96%] rounded-[50%] bg-black/55 blur-[5px]" />
    </div>
  )
}

/** 台灯的电线：从桌面垂下来，一个很小但很「真」的细节 */
function LampCord() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute"
      style={{ left: '51%', top: '48%', width: '12%', height: '16%' }}
    >
      <path
        d="M18 2 q16 18 6 40 q-8 16 8 28"
        stroke="#1b1520"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  )
}

/**
 * 床头柜：纯布景（不能点）。
 *
 * 它存在的意义是让「床头挨着窗户」这件事看起来是真的 ——
 * 一张床孤零零地摆在窗下，会像没搬完的家；旁边多一个柜子才是有人住的样子。
 * 柜面上摆的那盆植物是**可点的物件**（见 ITEM_POS.plant），不在这里画。
 */
function Nightstand({ rect }: { rect: Rect }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
      }}
    >
      {/* 墙上的投影 */}
      <span className="absolute left-[4%] top-[10%] h-[84%] w-[96%] rounded-[4px] bg-black/30 blur-[6px]" />

      {/* 柜体 */}
      <div className="absolute inset-x-0 bottom-[9%] top-[10%] rounded-[3px] bg-gradient-to-b from-[#9a7551] via-[#7a5c43] to-[#4a3628] shadow-[inset_-5px_0_10px_rgba(0,0,0,0.3)]">
        {/* 抽屉面 */}
        <span className="absolute inset-x-[13%] top-[15%] h-[50%] rounded-[2px] border border-black/25 bg-black/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" />
        {/* 拉手 */}
        <span className="absolute left-1/2 top-[37%] h-[5%] w-[34%] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#e0bb74] to-[#a8843f] shadow-[0_0_6px_rgba(224,187,116,0.4)]" />
      </div>

      {/* 台面 */}
      <div className="absolute inset-x-[-5%] top-[5%] h-[7%] rounded-[2px] bg-gradient-to-b from-[#c8a077] to-[#8a6a4f] shadow-[0_5px_9px_-3px_rgba(0,0,0,0.75)]" />

      {/* 两条短腿 */}
      <span className="absolute bottom-0 left-[12%] h-[9%] w-[9%] rounded-b-sm bg-[#3a2b23]" />
      <span className="absolute bottom-0 right-[12%] h-[9%] w-[9%] rounded-b-sm bg-[#3a2b23]" />

      {/* 落地阴影 */}
      <span className="absolute -bottom-1 left-[5%] h-2 w-[90%] rounded-[50%] bg-black/55 blur-[4px]" />
    </div>
  )
}

/* ==========================================================================
   布景
   ========================================================================== */

/**
 * 纯布景的定位壳子。
 *
 * 和 FurnitureSpot 的区别：这个**不生成 button**，所以它盖不住别的可点物件。
 * 大件家具（床、沙发、床头柜）用它 —— 它们的面积太大，一旦可点，
 * 坐在/摆在它们上面的小东西（猫、热茶、掌机）就点不到了。
 */
function Prop({ rect, children }: { rect: Rect; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
      }}
    >
      {children}
    </div>
  )
}

/**
 * 书桌。
 *
 * 之前它只是一块薄木板加两条细腿，看着像一根搁板。
 * 现在按真实桌子的结构画：
 *   墙面投影 → 台面（受光的顶面 + 背光的前沿，两块拼出厚度）
 *   → 围板（抽屉那一条，抽屉本身是单独的可点物件）→ 两条上粗下细的腿
 *   → 腿间横撑 → 桌下暗部 → 两条腿的落地阴影。
 *
 * 关键在「台面要分两层」：只画一层平涂的话，光从哪来、板子有多厚都看不出来。
 */
function Desk({ rect }: { rect: Rect }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
      }}
      aria-hidden
    >
      {/* 墙上的投影：让桌子「贴着墙」，不是浮在房间中间 */}
      <div className="absolute inset-x-[2%] top-[4%] h-[94%] rounded-[4px] bg-black/30 blur-[7px]" />

      {/* 台面：上面一层是受光的顶面，下面一层是背光的前沿 */}
      <div className="absolute inset-x-0 top-0 h-[13%]">
        <div className="absolute inset-x-0 top-0 h-[62%] rounded-t-[3px] bg-gradient-to-b from-[#c8a077] via-[#a37c56] to-[#8a6a4f]" />
        <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-b from-[#5b4433] to-[#3a2b23]" />
        {/* 台面上靠里的一道暗，做出纵深 */}
        <div className="absolute inset-x-0 top-[52%] h-[16%] bg-black/20" />
        {/* 台面外沿的一点高光 */}
        <div className="absolute inset-x-0 bottom-0 h-[6%] bg-white/[0.07]" />
      </div>

      {/* 围板 */}
      <div className="absolute inset-x-[3%] top-[13%] h-[10%] bg-gradient-to-b from-[#4a3628] to-[#33261c] shadow-[inset_0_-4px_8px_rgba(0,0,0,0.4)]" />

      {/* 两条腿：上粗下细，加一点侧向的明暗，别让腿变成两条死线 */}
      <div className="absolute bottom-0 left-[6%] h-[77%] w-[4.2%] rounded-b-sm bg-gradient-to-r from-[#63492f] via-[#4a3628] to-[#2f231b]" />
      <div className="absolute bottom-0 right-[6%] h-[77%] w-[4.2%] rounded-b-sm bg-gradient-to-r from-[#4a3628] via-[#3a2b23] to-[#241a15]" />

      {/* 腿之间的横撑 */}
      <div className="absolute bottom-[17%] left-[6%] right-[6%] h-[3.5%] rounded-sm bg-gradient-to-b from-[#4a3628] to-[#2f231b] shadow-[0_3px_6px_-3px_rgba(0,0,0,0.8)]" />

      {/* 桌下暗部 */}
      <div className="absolute inset-x-[5%] bottom-0 top-[23%] bg-gradient-to-b from-black/[0.42] to-transparent" />

      {/* 两条腿的落地阴影 */}
      <div className="absolute -bottom-1 left-[3%] h-2 w-[11%] rounded-[50%] bg-black/60 blur-[4px]" />
      <div className="absolute -bottom-1 right-[3%] h-2 w-[11%] rounded-[50%] bg-black/60 blur-[4px]" />
    </div>
  )
}

function Shelf({ rect }: { rect: Rect }) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${rect.x}%`,
        top: `${rect.y}%`,
        width: `${rect.w}%`,
        height: `${rect.h}%`,
      }}
      aria-hidden
    >
      {/* 墙上的投影 */}
      <div className="absolute -bottom-4 inset-x-0 h-4 bg-gradient-to-b from-black/45 to-transparent" />
      {/* 板子 */}
      <div className="absolute inset-0 rounded-[2px] bg-gradient-to-b from-[#7a5c43] via-[#5b4433] to-[#3a2b23] shadow-[0_10px_18px_-8px_rgba(0,0,0,0.9)]" />
      <div className="absolute inset-x-0 top-0 h-[28%] rounded-t-[2px] bg-[#9a7551]/70" />
      {/* 托架 */}
      <div className="absolute -bottom-3 left-[10%] h-3 w-[2.6%] rounded-b-sm bg-[#33251d]" />
      <div className="absolute -bottom-3 right-[10%] h-3 w-[2.6%] rounded-b-sm bg-[#33251d]" />
    </div>
  )
}

/* ==========================================================================
   家具
   ========================================================================== */

function DeskLamp({ lit }: { lit: boolean }) {
  return (
    <div className="relative h-full w-full">
      {/* 灯罩 */}
      <div
        className={cn(
          'absolute left-1/2 top-0 h-[46%] w-[76%] -translate-x-1/2 transition-colors duration-500',
          lit ? 'bg-gradient-to-b from-[#ffe3ae] to-[#e8b95f]' : 'bg-gradient-to-b from-[#6a5642] to-[#3d3228]',
        )}
        style={{
          clipPath: 'polygon(20% 0, 80% 0, 100% 100%, 0 100%)',
          filter: lit ? 'drop-shadow(0 0 14px rgba(247,200,115,0.85))' : 'none',
        }}
      />
      {/* 灯罩内壁 */}
      <div
        className="absolute left-1/2 top-[40%] h-[7%] w-[54%] -translate-x-1/2 rounded-b-[50%]"
        style={{
          background: lit ? '#fff1cf' : '#241d1a',
          filter: lit ? 'blur(1px)' : 'none',
        }}
      />
      {/* 灯杆 */}
      <div className="absolute left-1/2 top-[44%] h-[42%] w-[7%] -translate-x-1/2 rounded-b-sm bg-gradient-to-b from-[#5b4433] to-[#33281f]" />
      {/* 底座 */}
      <div className="absolute bottom-0 left-1/2 h-[12%] w-[64%] -translate-x-1/2 rounded-[50%] bg-gradient-to-b from-[#5b4433] to-[#3a2b23] shadow-[0_3px_7px_rgba(0,0,0,0.7)]" />
    </div>
  )
}

function Window({ moonShift }: { moonShift: number }) {
  const streaks = React.useMemo(
    () => [8, 22, 36, 50, 64, 78, 92].map((left, index) => ({ left, delay: index * 0.55 })),
    [],
  )

  return (
    <div className="relative h-full w-full">
      {/* 窗框外面的墙裙与投影 */}
      <div className="absolute -inset-[4%] rounded-[6px] bg-[#4a3628] shadow-[0_14px_28px_-10px_rgba(0,0,0,0.9)]" />

      {/* 玻璃 */}
      <div className="absolute inset-[5%] overflow-hidden rounded-[3px] bg-gradient-to-b from-[#0a111d] via-[#0e1725] to-[#101c2b] shadow-[inset_0_0_26px_rgba(0,0,0,0.9)]">
        {/* 月亮 */}
        <span
          className="absolute top-[10%] h-[15%] w-[19%] rounded-full bg-[#f6f2ea] shadow-[0_0_28px_rgba(244,238,231,0.75)] transition-[left] duration-1000"
          style={{ left: `${12 + moonShift}%` }}
        />
        {/* 云 */}
        <span className="absolute left-[6%] top-[34%] h-[8%] w-[52%] rounded-full bg-white/[0.07] blur-[3px]" />
        <span className="absolute right-[4%] top-[54%] h-[6%] w-[38%] rounded-full bg-white/[0.05] blur-[3px]" />

        {/* 雨 */}
        {streaks.map((streak) => (
          <span
            key={streak.left}
            className="animate-rainfall absolute top-[-12%] w-px bg-gradient-to-b from-transparent via-rain/75 to-transparent"
            style={{
              left: `${streak.left}%`,
              height: '28%',
              animationDelay: `${streak.delay}s`,
              animationDuration: '1.05s',
            }}
          />
        ))}

        {/* 玻璃反光 */}
        <span className="absolute inset-y-0 left-[14%] w-[7%] bg-gradient-to-r from-white/10 to-transparent" />
        <span className="absolute inset-y-0 right-[22%] w-[3%] bg-gradient-to-r from-white/[0.06] to-transparent" />
      </div>

      {/* 窗格 */}
      <span className="absolute inset-y-[5%] left-1/2 w-[3px] -translate-x-1/2 bg-[#4a3628]" />
      <span className="absolute inset-x-[5%] top-1/2 h-[3px] -translate-y-1/2 bg-[#4a3628]" />

      {/* 窗台 */}
      <div className="absolute -bottom-[7%] -left-[7%] -right-[7%] h-[9%] rounded-[2px] bg-gradient-to-b from-[#8a6a4f] to-[#4a3628] shadow-[0_8px_16px_-6px_rgba(0,0,0,0.85)]" />
      {/* 窗台上落的一点月光 */}
      <div className="absolute -bottom-[6%] left-[6%] h-[6%] w-[46%] rounded-full bg-rain/25 blur-[5px]" />

      {/* 窗帘：只挂左边，像被随手拨开 */}
      <div className="absolute -left-[16%] top-[-5%] h-[114%] w-[18%] rounded-b-[45%] bg-gradient-to-b from-[#43304a] to-[#2b2133] shadow-[6px_0_16px_rgba(0,0,0,0.5)]">
        <div className="absolute inset-y-0 left-[30%] w-[2px] bg-white/[0.06]" />
        <div className="absolute inset-y-0 left-[62%] w-[2px] bg-white/[0.05]" />
      </div>
    </div>
  )
}

/**
 * 床：整间屋子里最大的一件家具，左边靠墙，床头朝窗。
 *
 * 历史：这个位置原本是冰箱，后来换成床，再后来按「床要大一些」放到了 37%×42%。
 * 画法（自上而下）：床头板 → 床垫 → 枕头 → 被子 → 床架 → 床腿。
 * 被子故意比床垫宽出一截并垂到床架外面，这是让平涂的方块读成「床」的关键。
 *
 * 内部全部用百分比，所以外面改 DRAWN.bed 的尺寸时它会整体跟着放大。
 */
function Bed() {
  return (
    <div className="relative h-full w-full">
      {/* 墙上的投影 */}
      <span
        aria-hidden
        className="absolute left-[5%] top-[3%] h-[80%] w-[92%] rounded-[8px] bg-black/35 blur-[7px]"
      />

      {/* 床头板：要比墙亮，不然整块糊在暗处，床就只剩一摊被子。
          宽度必须明显大于枕头左移的那一段，否则只露出一根「柱子」。 */}
      <div className="absolute bottom-[12%] left-0 top-0 w-[18%] overflow-hidden rounded-t-[8px] bg-gradient-to-b from-[#d8b083] via-[#b8905f] to-[#7a5c43] shadow-[inset_-8px_0_14px_rgba(0,0,0,0.28)]">
        {/* 板芯 */}
        <span className="absolute inset-x-[20%] top-[22%] h-[54%] rounded-[4px] border border-black/20 bg-black/[0.09] shadow-[inset_0_2px_0_rgba(255,255,255,0.12)]" />
        {/* 顶上的横档：有这一道才像家具，不像一块板 */}
        <span className="absolute inset-x-0 top-[3%] h-[6%] bg-[#e8c9a0] shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
        <span className="absolute inset-x-0 top-0 h-[3%] rounded-t-[8px] bg-[#f0d6b0]" />
        {/* 左侧受光边 */}
        <span className="absolute inset-y-0 left-0 w-[6%] bg-white/[0.1]" />
      </div>

      {/* 床腿 */}
      <span className="absolute bottom-0 left-[8%] h-[13%] w-[3%] rounded-b-sm bg-gradient-to-b from-[#5b4433] to-[#2f231b]" />
      <span className="absolute bottom-0 left-[88%] h-[13%] w-[3%] rounded-b-sm bg-gradient-to-b from-[#5b4433] to-[#2f231b]" />

      {/* 床架 */}
      <div className="absolute bottom-[11%] left-[4%] right-0 h-[19%] rounded-[3px] bg-gradient-to-b from-[#7a5c43] via-[#4a3628] to-[#33261c] shadow-[inset_0_-7px_13px_rgba(0,0,0,0.38)]">
        {/* 横档 */}
        <span className="absolute inset-x-[6%] top-[42%] h-[10%] rounded-sm bg-black/20" />
        {/* 床架顶边的一点高光 */}
        <span className="absolute inset-x-0 top-0 h-[8%] bg-[#8a6a4f]/70" />
      </div>

      {/* 床垫：床单露出来的那一条，是「床」最好认的信号 */}
      <div className="absolute bottom-[29%] left-[5%] right-0 h-[18%] rounded-[3px] bg-gradient-to-b from-[#fbf7f0] via-[#efe7db] to-[#cfc4b2] shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.5)]" />

      {/* 枕头：靠在床头板上，稍微歪一点 */}
      <div className="absolute bottom-[50%] left-[19%] h-[21%] w-[21%] -rotate-[7deg] rounded-[8px] bg-gradient-to-br from-[#f6f1e9] via-[#e6dccb] to-[#c2b6a1] shadow-[0_6px_13px_-5px_rgba(0,0,0,0.6)]">
        {/* 枕头中间的凹 */}
        <span className="absolute inset-x-[24%] top-[44%] h-px bg-black/12" />
        {/* 枕头右上的一小块高光 */}
        <span className="absolute inset-x-[18%] top-[14%] h-[16%] rounded-full bg-white/45" />
      </div>

      {/* 被子：盖住大半张床，比床垫宽出一截 */}
      <div className="absolute bottom-[29%] left-[42%] right-0 h-[32%] rounded-[5px] bg-gradient-to-b from-[#c8839a] via-[#a3647c] to-[#6f4053] shadow-[inset_0_3px_0_rgba(255,255,255,0.18),0_-5px_13px_rgba(0,0,0,0.32)]">
        {/* 翻折出来的被边 */}
        <span className="absolute inset-x-0 top-0 h-[22%] rounded-t-[5px] bg-[#dfa9b8]" />
        <span className="absolute inset-x-0 top-[22%] h-px bg-black/18" />
        {/* 褶皱：竖着的几道，让这一大块平涂不至于死板 */}
        <span className="absolute left-[12%] top-[32%] h-[56%] w-px bg-black/16" />
        <span className="absolute left-[36%] top-[28%] h-[62%] w-px bg-black/14" />
        <span className="absolute left-[58%] top-[36%] h-[50%] w-px bg-black/14" />
        <span className="absolute left-[80%] top-[30%] h-[58%] w-px bg-black/12" />
        {/* 被子底边的一道暗 */}
        <span className="absolute inset-x-0 bottom-0 h-[14%] rounded-b-[5px] bg-black/18" />
      </div>

      {/* 垂在床尾的那一角 */}
      <span className="absolute bottom-[18%] right-0 h-[13%] w-[7%] rounded-b-[5px] bg-gradient-to-b from-[#a3647c] to-[#5e3546]" />

      {/* 落地阴影 */}
      <span className="absolute -bottom-1 left-[2%] h-2.5 w-[98%] rounded-[50%] bg-black/55 blur-[5px]" />
    </div>
  )
}

function Corkboard() {
  return (
    <div className="relative h-full w-full">
      {/* 墙上的投影 */}
      <div className="absolute -right-2 -bottom-2 h-full w-full rounded-[4px] bg-black/35 blur-[6px]" />
      <div
        className="relative h-full w-full overflow-hidden rounded-[4px] border-[5px] border-[#7a5c43] shadow-[0_10px_22px_-10px_rgba(0,0,0,0.9)]"
        style={{
          backgroundColor: '#9a7551',
          backgroundImage:
            'radial-gradient(rgba(0,0,0,0.24) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '6px 6px, 9px 9px',
          backgroundPosition: '0 0, 3px 4px',
        }}
      >
        {/* 钉着的纸条 */}
        <span className="absolute left-[8%] top-[12%] h-[36%] w-[32%] rotate-[-6deg] rounded-[1px] bg-[#efe7db] shadow-md" />
        <span className="absolute left-[46%] top-[8%] h-[30%] w-[28%] rotate-[5deg] rounded-[1px] bg-[#a8d8d0] shadow-md" />
        <span className="absolute left-[24%] top-[54%] h-[32%] w-[40%] rotate-[-3deg] rounded-[1px] bg-[#f2d98c] shadow-md" />
        <span className="absolute right-[7%] top-[50%] h-[26%] w-[22%] rotate-[8deg] rounded-[1px] bg-[#e8a8b8] shadow-md" />
        {/* 便签上的字迹 */}
        <span className="absolute left-[14%] top-[24%] h-[2px] w-[20%] rotate-[-6deg] bg-[#2b2230]/25" />
        <span className="absolute left-[30%] top-[66%] h-[2px] w-[26%] rotate-[-3deg] bg-[#2b2230]/25" />
        {/* 图钉 */}
        {[
          { left: '22%', top: '10%' },
          { left: '58%', top: '6%' },
          { left: '42%', top: '52%' },
        ].map((pin) => (
          <span
            key={pin.left + pin.top}
            className="absolute h-[7%] w-[7%] rounded-full bg-neon shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
            style={pin}
          />
        ))}
      </div>
    </div>
  )
}

function Painting() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute -right-2 -bottom-2 h-full w-full rounded-[2px] bg-black/35 blur-[6px]" />
      <div className="relative h-full w-full overflow-hidden rounded-[2px] border-[6px] border-[#8a6a4f] bg-[#12222e] shadow-[0_10px_22px_-10px_rgba(0,0,0,0.9)]">
        {/* 海面 */}
        <div className="absolute inset-x-0 top-[54%] h-[1px] bg-paper/30" />
        <div className="absolute bottom-0 left-0 h-[46%] w-full bg-gradient-to-b from-[#2c5a6e] to-[#123040]" />
        {/* 月亮倒影 */}
        <div className="absolute bottom-[6%] left-[44%] h-[34%] w-[12%] bg-gradient-to-t from-paper/25 to-transparent blur-[2px]" />
        {/* 天上的月亮 */}
        <span className="absolute left-[16%] top-[14%] h-[15%] w-[15%] rounded-full bg-paper/70" />
        {/* 远山 */}
        <div
          className="absolute inset-x-0 top-[44%] h-[11%] bg-[#1b3a47]"
          style={{ clipPath: 'polygon(0 100%, 18% 30%, 34% 78%, 52% 12%, 70% 66%, 100% 100%)' }}
        />
      </div>
    </div>
  )
}

function NoteWall() {
  const notes = [
    { left: 2, top: 6, rotate: -7, color: '#f2d98c', w: 42, h: 34 },
    { left: 52, top: 2, rotate: 6, color: '#a8d8d0', w: 44, h: 30 },
    { left: 8, top: 44, rotate: 4, color: '#efe7db', w: 40, h: 28 },
    { left: 54, top: 40, rotate: -5, color: '#e8a8b8', w: 42, h: 32 },
    { left: 28, top: 76, rotate: 3, color: '#f2d98c', w: 44, h: 22 },
  ]

  return (
    <div className="relative h-full w-full">
      {notes.map((note) => (
        <span
          key={`${note.left}-${note.top}`}
          className="absolute rounded-[1px] shadow-[0_3px_6px_rgba(0,0,0,0.45)]"
          style={{
            left: `${note.left}%`,
            top: `${note.top}%`,
            width: `${note.w}%`,
            height: `${note.h}%`,
            background: note.color,
            transform: `rotate(${note.rotate}deg)`,
          }}
        >
          {/* 随手划的字迹 */}
          <span
            className="absolute left-[16%] top-[34%] h-[2px] w-[62%] rounded-full bg-[#2b2230]/25"
            style={{ transform: `rotate(${note.rotate / 2}deg)` }}
          />
          <span
            className="absolute left-[16%] top-[62%] h-[2px] w-[40%] rounded-full bg-[#2b2230]/20"
            style={{ transform: `rotate(${note.rotate / 2}deg)` }}
          />
        </span>
      ))}
    </div>
  )
}

function Rug() {
  return (
    <div className="relative h-full w-full">
      {/* 落地阴影 */}
      <div className="absolute -inset-x-[2%] -bottom-[6%] top-[10%] rounded-[50%] bg-black/45 blur-[8px]" />
      <div
        className="relative h-full w-full rounded-[50%] border border-white/[0.08]"
        style={{
          background: 'radial-gradient(ellipse at 50% 40%, #7d5c43 0%, #63472f 55%, #452f22 100%)',
          boxShadow: 'inset 0 0 34px rgba(0,0,0,0.45)',
        }}
      >
        <div className="absolute inset-[8%] rounded-[50%] border border-lamp/22" />
        <div className="absolute inset-[19%] rounded-[50%] border border-lamp/16" />
        <div
          className="absolute inset-[30%] rounded-[50%] border border-lamp/14"
          style={{
            backgroundImage:
              'repeating-conic-gradient(from 0deg, rgba(247,200,115,0.09) 0deg 6deg, transparent 6deg 12deg)',
          }}
        />
        <div
          className="absolute inset-[38%] rounded-[50%] opacity-70"
          style={{ background: 'radial-gradient(circle, rgba(247,200,115,0.14), transparent 70%)' }}
        />
      </div>
      {/* 流苏 */}
      <div className="absolute inset-x-[5%] -bottom-[4%] flex justify-between">
        {Array.from({ length: 13 }).map((_, index) => (
          <span key={index} className="h-2.5 w-px bg-[#7d5c43]/80" />
        ))}
      </div>
    </div>
  )
}

function DrawerFront() {
  return (
    <div className="relative h-full w-full rounded-[2px] bg-gradient-to-b from-[#5b4433] via-[#46351f] to-[#33261c] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <span className="absolute inset-[6%] rounded-[1px] border border-black/25 bg-black/[0.08]" />
      <span className="absolute left-1/2 top-1/2 h-[26%] w-[24%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-[#e0bb74] to-[#a8843f] shadow-[0_0_7px_rgba(224,187,116,0.5)]" />
    </div>
  )
}

/* ==========================================================================
   灯光
   ========================================================================== */

function Lighting({ lights }: { lights: 'on' | 'off' | 'moon' }) {
  // 浮尘的坐标写成「相对台灯的偏移」，这样台灯一挪位置，光柱里的灰跟着挪，
  // 不用再回来手改六个数字。
  const motes = React.useMemo(
    () =>
      [
        { dx: -5, dy: 12, delay: 0, size: 2 },
        { dx: 3, dy: 20, delay: 1.2, size: 1.5 },
        { dx: -9, dy: 27, delay: 2.4, size: 2.5 },
        { dx: 7, dy: 16, delay: 3.1, size: 1.5 },
        { dx: -12, dy: 22, delay: 4.3, size: 2 },
        { dx: -2, dy: 33, delay: 5.2, size: 1.5 },
      ] as const,
    [],
  )

  if (lights === 'off') {
    return (
      <>
        {/* 关灯：整间屋子压暗 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-700"
          style={{ background: 'rgba(5,5,12,0.6)' }}
        />
        {/* 只剩窗外的月色 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(34% 40% at 15% 28%, rgba(127,200,216,0.22) 0%, transparent 72%)',
          }}
        />
        {/* 地板上的月光斑 */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-[2%] h-[34%] w-[36%] opacity-60"
          style={{
            background: 'linear-gradient(to top, rgba(127,200,216,0.14), transparent)',
            clipPath: 'polygon(6% 100%, 40% 0, 100% 0, 62% 100%)',
            filter: 'blur(8px)',
          }}
        />
      </>
    )
  }

  const warm = lights === 'moon'
  const tint = warm ? '127,200,216' : '247,200,115'

  return (
    <>
      {/* 光锥 */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: `${LAMP.x}%`,
          top: `${LAMP.y}%`,
          width: '40%',
          height: '52%',
          transform: 'translate(-50%, 0)',
          clipPath: 'polygon(47.5% 0, 52.5% 0, 100% 100%, 0 100%)',
          background: `linear-gradient(to bottom, rgba(${tint},0.22), rgba(${tint},0.06) 55%, transparent 90%)`,
          filter: 'blur(11px)',
        }}
      />

      {/* 灯泡本体 */}
      <div
        aria-hidden
        className="pointer-events-none absolute h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
        style={{ left: `${LAMP.x}%`, top: `${LAMP.y}%`, background: `rgba(${tint},0.5)` }}
      />

      {/* 地板上的一块光斑（跟着台灯走） */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[3%] h-[24%] w-[38%] rounded-[50%] blur-[10px]"
        style={{ left: `${LAMP.x - 22}%`, background: `rgba(${tint},0.16)` }}
      />

      {/* 光柱里的浮尘 */}
      {motes.map((mote) => (
        <span
          key={`${mote.dx}-${mote.dy}`}
          aria-hidden
          className="animate-mote pointer-events-none absolute rounded-full"
          style={{
            left: `${LAMP.x + mote.dx}%`,
            top: `${LAMP.y + mote.dy}%`,
            width: mote.size,
            height: mote.size,
            background: `rgba(${tint},0.9)`,
            animationDelay: `${mote.delay}s`,
          }}
        />
      ))}

      {/* 整体笼罩一层暖色 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-soft-light"
        style={{
          background: `radial-gradient(72% 62% at 40% 34%, rgba(${tint},0.45) 0%, transparent 74%)`,
        }}
      />

      {/* 四角压暗 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(122% 96% at 44% 36%, transparent 40%, rgba(0,0,0,0.5) 100%)',
        }}
      />
    </>
  )
}
