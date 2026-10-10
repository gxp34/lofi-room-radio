/**
 * 实时电台的类型。
 *
 * 单独一个文件而不是塞进 types/index.ts：那边是房间、手帐、树洞这些
 * 业务的类型，电台是完全独立的一块，混在一起只会让那个文件更长。
 */

/** 流的容器格式。hls 需要额外处理（见 audio-engine 里的 hls.js 分支） */
export type RadioFormat = 'mp3' | 'aac' | 'hls'

/** 频道从哪来 */
export type RadioSource = 'somafm' | 'custom'

/** 一个频道（服务端整理好之后交给前端的样子） */
export interface RadioStation {
  /** 稳定 id：`somafm:groovesalad` / `custom:huayu500` */
  id: string
  name: string
  /** 一句话介绍 */
  description: string
  /** 标签，中文搜索用 */
  tags: string[]
  source: RadioSource
  /**
   * 播放列表地址（.pls / .m3u / .m3u8），也可能直接就是一个流地址。
   * 注意这里给的是**播放列表**，不是最终的流 —— 真正解析在
   * /api/radio/stream 里做，因为那一步要发网络请求、要缓存。
   */
  endpoint: string
  /**
   * 已知的格式提示。服务端解析出来之后以解析结果为准 ——
   * 这个字段只是让界面在还没解析时就能显示一个大概。
   */
  formatHint: RadioFormat | null
  coverUrl: string | null
}

/** /api/radio/channels 的返回 */
export interface RadioChannelsPayload {
  /** 能不能播（后台开关 + 环境变量都开着） */
  enabled: boolean
  /** 关掉/拿不到时说一句为什么 */
  note: string | null
  stations: RadioStation[]
  /** 打开页面时默认选中的频道 id */
  defaultStationId: string | null
  /** 服务端整理这份列表的时间 */
  fetchedAt: string
}

/** /api/radio/stream 的返回 */
export interface RadioStreamPayload {
  /** 能不能放 */
  ok: boolean
  stationId: string
  /** 真正交给 <audio> 的地址 */
  streamUrl: string | null
  format: RadioFormat | null
  /** ok 为 false 时，界面显示这句（例如「信号丢失」） */
  error: string | null
}

/**
 * 正在播的实时电台 —— 播放列表已经解析完、可以直接交给 <audio> 的东西。
 *
 * 和 RadioStation 的区别：那个是"一个可以点的台"（带 endpoint 播放列表地址），
 * 这个是"已经在响的流"（带 streamUrl）。混成一个类型的话，
 * 播放器里得到处判空。
 */
export interface LiveStation {
  id: string
  name: string
  /** 副标题：来源 / 标签，播放条上显示 */
  subtitle: string
  streamUrl: string
  format: RadioFormat
  coverUrl: string | null
}
