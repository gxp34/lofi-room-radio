/**
 * 小游戏的公共类型。
 * 三个游戏（2048 / 贪吃蛇 / 翻牌记忆）由不同文件实现，但接口完全一致，
 * 这样游戏厅页面可以用同一套渲染逻辑。
 */

export interface GameProps {
  /** 本地历史最高分（hydration 完成后才是真实值，服务端渲染时是 0） */
  highScore: number
  /**
   * 上报本局分数。
   * 上层会判断是否刷新纪录、是否解锁「摸鱼大师」成就。
   */
  reportScore: (score: number) => void
}

/** 游戏注册表：slug → 元信息与组件加载方式 */
export interface GameMeta {
  slug: string
  name: string
  /** 掌机屏幕上的一句话 */
  tagline: string
  /** 操作说明 */
  instructions: string[]
}
