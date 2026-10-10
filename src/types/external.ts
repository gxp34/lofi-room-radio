import type { RainLevel } from '@/stores/room-store'

/**
 * 外部数据源的类型（天气 / 天空 / 每日一句）。
 *
 * 单独放一个文件而不是塞进 types/index.ts：
 * 这些类型只在这几个模块之间流转，和房间、手帐那些业务类型没关系。
 */

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'shower' | 'thunder'

export interface WeatherInfo {
  /** WMO weather code */
  code: number
  /** 中文，例如「小雨」 */
  label: string
  kind: WeatherKind
  /**
   * 映射到房间里的雨势。
   * 'none' = 雨停了（房间的 RainLevel 里有这一档）。
   */
  rain: RainLevel
}

export interface SkyTimes {
  sunrise: string | null
  sunset: string | null
  dawn: string | null
  dusk: string | null
  goldenHour: string | null
  goldenHourEnd: string | null
  solarNoon: string | null
}

export type SkyPhase = 'deepNight' | 'night' | 'dawn' | 'morning' | 'afternoon' | 'evening' | 'dusk'

export interface MoonInfo {
  /** 0 = 新月，0.5 = 满月 */
  phase: number
  label: string
  emoji: string
  /** 被照亮的比例 0–1 */
  fraction: number
}

/** /api/weather 的返回 */
export interface SkyPayload {
  /** 数据是不是真的拿到了（false = 降级） */
  live: boolean
  /** 降级原因，给界面显示一句话 */
  note: string | null
  city: string
  /** 观测时间（ISO） */
  observedAt: string
  temperature: number | null
  /** 白天 / 夜里（Open-Meteo 的 is_day） */
  isDay: boolean
  weather: WeatherInfo
  moon: MoonInfo
  sky: SkyTimes
  phase: SkyPhase
  /** 服务端算这次结果的时间（ISO），客户端用它显示"多久前更新的" */
  fetchedAt: string
}

/** 每日一句 */
export interface DailyQuote {
  text: string
  /** 出处，例如「—— 某某」；本地句子库这一项是 null */
  from: string | null
  /** 来源：hitokoto / local / manual（后台手动覆盖） */
  source: 'hitokoto' | 'local' | 'manual'
  /** 这一句属于哪一天（YYYY-MM-DD，按服务器时区） */
  day: string
}
