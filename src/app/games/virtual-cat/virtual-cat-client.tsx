'use client'

import { GameVirtualCat } from '@/components/games/game-virtual-cat'

/**
 * 独立页面的适配层。
 *
 * `/games/virtual-cat` 是一个**独立的页面**（不只是游戏厅里的一个卡带），
 * 但页面本身是服务端组件（要导 metadata），而 `reportScore` 是函数 ——
 * 函数不能从服务端组件传给客户端组件。所以要这一层 'use client'。
 * 和 dev 预览里那层是同一个原因。
 */
export function VirtualCatClient() {
  return <GameVirtualCat highScore={0} reportScore={() => {}} />
}
