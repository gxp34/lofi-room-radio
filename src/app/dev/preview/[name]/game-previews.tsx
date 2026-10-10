'use client'

import { GameTarot } from '@/components/games/game-tarot'
import { GamePuzzle } from '@/components/games/game-puzzle'
import { GameRadio } from '@/components/games/game-radio'

/**
 * dev 预览专用的适配层（仅开发环境）。
 *
 * 为什么需要单独一个文件：
 *   预览页 `page.tsx` 是**服务端组件**，而 `reportScore` 是个函数。
 *   Next.js 不允许把函数从服务端组件传给客户端组件，会直接报
 *     Error: Functions cannot be passed directly to Client Components
 *   所以要有一个 'use client' 的中间层，在客户端这边把函数补上。
 *
 * 不给游戏组件的 prop 加必需约束、靠「传了才用」绕过报错也不行：
 *   其它几个游戏都需要 reportScore，那是游戏插槽的契约；
 *   为了让预览能跑就把契约放松，等于让产品代码迁就开发工具。
 *
 * 这三个是游戏厅里需要点击切卡带才看得到的（截图脚本点不了），
 * 单独给入口才能直接看到、也方便调样式。
 */

export function TarotPreview() {
  return <GameTarot highScore={0} reportScore={() => {}} />
}

export function PuzzlePreview() {
  return <GamePuzzle highScore={0} reportScore={() => {}} />
}

export function RadioPreview() {
  return (
    <GameRadio
      highScore={0}
      reportScore={() => {}}
      dynamic={{
        tracks: ['台灯下的和弦', '雨声采样', '凌晨四点的鼓点'],
        echoes: ['今天没做什么，但也没觉得浪费。', '希望明天不要下雨。'],
      }}
    />
  )
}
