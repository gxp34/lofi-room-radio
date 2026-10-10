'use client'

import * as React from 'react'

import { RoomBands } from '@/components/room/room-bands'
import { RoomPanorama } from '@/components/room/room-panorama'
import { SKY_PHASE_META } from '@/lib/external/sky-meta'
import { useRoomStore } from '@/stores/room-store'

/**
 * 房间。
 *
 * 全景**在所有屏幕上都显示** —— 这是这个站的核心，不该为了「好点」就藏起来。
 *
 * 早先的做法是窄屏只给文字卡片，理由是「手机上硬塞全景会小到点不中」。
 * 那个理由本身没错，但结论错了：真正的问题是物件的尺寸写死成了像素，
 * 而它是照桌面端的房间宽度（约 1130px）调的。手机里房间只有约 358px 宽，
 * 92px 的猫占了房间宽度的四分之一，东西全挤在一起。
 *
 * 现在做了两件事：
 *
 *   1. 尺寸改用 cqw（容器宽度百分比）换算，物件跟着房间等比缩放（见 room-props.tsx）。
 *   2. 窄屏让房间**比屏幕宽一些、可以左右滑**。按屏幕宽度铺满的话，
 *      即使缩放正确，猫也只有 29px —— 房间会变成一张看不清的小图。
 *      拉到 185% 之后猫约 54px，既能看清也点得中。
 *
 * 窄屏下面另外保留一份按分区排的卡片：全景负责「像不像一个房间」，
 * 卡片负责「一眼看清有哪些东西、每个是什么」。两份都在，不冲突。
 */
export function RoomScene() {
  /**
   * 一天里的时段 → 房间上盖一层什么颜色的光。
   *
   * 盖在**最外层**而不是画进全景里：这样不用碰那些手工对齐的家具坐标，
   * 而且它是一层纯粹的 filter: 色调，关灯、跳闸那些逻辑完全不受影响。
   *
   * skyPhase 拿不到（天气功能关着 / 还没请求回来）时是 null，
   * 这一层就不渲染 —— 房间保持原本的夜色。
   */
  const skyPhase = useRoomStore((state) => state.ambient.skyPhase)
  const meta = skyPhase ? SKY_PHASE_META[skyPhase] : null

  return (
    <>
      {/* 只在**手机**上（< 640px）把房间加宽到 185%，装在横向滚动容器里。
          为什么只限手机：平板宽度下按容器铺满，猫就已经有 49px，
          够看清也够点；再加宽反而要滑很久，得不偿失。
          注意 cqw 是相对**房间自己的宽度**算的，所以加宽之后物件会同比放大。 */}
      <div className="overflow-x-auto sm:overflow-visible">
        <div className="relative w-[185%] sm:w-full">
          <RoomPanorama />

          {/* 时段色偏：清晨偏蓝、午后偏暖、黄昏偏橙、深夜压暗 */}
          {meta && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[inherit] transition-colors duration-1000"
              style={{ backgroundColor: meta.tint, opacity: meta.tintOpacity }}
            />
          )}
        </div>
      </div>

      {/* 滑动提示：只在真的能滑的手机宽度出现 */}
      <p className="mt-2 text-center font-display text-[10px] tracking-[0.18em] text-dust/60 sm:hidden">
        ← 左右滑动看整个房间 →
      </p>

      <div className="mt-5 lg:hidden">
        <RoomBands />
      </div>
    </>
  )
}
