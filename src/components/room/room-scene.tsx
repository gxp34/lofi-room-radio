'use client'

import { RoomBands } from '@/components/room/room-bands'
import { RoomPanorama } from '@/components/room/room-panorama'

/**
 * 房间。
 *
 * 两套版式，用 CSS 控制显示，取决于屏幕宽度：
 *   - lg 及以上：房间全景（画出来的墙、地板、家具，东西摆在家具上）
 *   - lg 以下：按房间分区排成纵向卡片 —— 手机上硬塞全景会小到点不中
 *
 * 为什么不写成一个自适应版式：两者的定位方式根本不同
 * （绝对定位的百分比坐标 vs 文档流的弹性布局），
 * 硬凑在一起两边都会做不好。两份 DOM 的代价可以接受，
 * 而且被 display:none 藏起来的那份不参与点击和 Tab 顺序。
 */
export function RoomScene() {
  return (
    <>
      <div className="hidden lg:block">
        <RoomPanorama />
      </div>
      <div className="lg:hidden">
        <RoomBands />
      </div>
    </>
  )
}
