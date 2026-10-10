'use client'

import { GameTarot } from '@/components/games/game-tarot'

/**
 * dev 预览专用的适配层（仅开发环境）。
 *
 * 为什么需要单独一个文件：
 *   预览页 `page.tsx` 是**服务端组件**，而 `reportScore` 是个函数。
 *   Next.js 不允许把函数从服务端组件传给客户端组件，会直接报
 *     Error: Functions cannot be passed directly to Client Components
 *   所以要有一个 'use client' 的中间层，在客户端这边把函数补上。
 *
 * 不给 `GameTarot` 的 prop 加可选（虽然那样也能绕过报错）：
 *   其它三个游戏都需要 reportScore，那是游戏插槽的契约；
 *   为了让预览能跑就把契约放松，等于让产品代码迁就开发工具。
 */
export function TarotPreview() {
  return <GameTarot highScore={0} reportScore={() => {}} />
}
