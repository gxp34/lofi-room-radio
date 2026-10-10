import type { RainLevel } from '@/stores/room-store'
import type { SkyPhase, WeatherInfo, WeatherKind } from '@/types/external'

/**
 * 天空的**纯常量与纯函数**。
 *
 * 为什么从 sky.ts 里拆出来：
 *   sky.ts 顶层 `import * as SunCalc from 'suncalc'`，
 *   而 room-scene.tsx / weather-panel.tsx 都是**客户端组件**，
 *   它们只需要 SKY_PHASE_META 这一张颜色表。
 *   不拆的话 suncalc 会被打进浏览器包（白给十几 KB，而且它纯属服务端的东西）。
 *
 *   这个文件不 import 任何东西（除了类型），所以谁都能安全引用。
 *   加东西进来之前先问一句：它需不需要网络/Node？需要就别放这儿。
 */

/* --------------------------------------------------------------------------
   时段
   -------------------------------------------------------------------------- */

/** 时段的中文名 + 房间该偏什么色 */
export const SKY_PHASE_META: Record<
  SkyPhase,
  { label: string; tint: string; tintOpacity: number; hint: string }
> = {
  deepNight: { label: '深夜', tint: '#0b0a18', tintOpacity: 0.42, hint: '只剩台灯' },
  night: { label: '夜', tint: '#140f28', tintOpacity: 0.3, hint: '外面全黑了' },
  dawn: { label: '天快亮', tint: '#2a3a6b', tintOpacity: 0.24, hint: '偏蓝，雾还没散' },
  morning: { label: '上午', tint: '#3a5a8a', tintOpacity: 0.14, hint: '光有点冷' },
  afternoon: { label: '下午', tint: '#c98a3f', tintOpacity: 0.12, hint: '光是暖的' },
  evening: { label: '傍晚', tint: '#a05a2a', tintOpacity: 0.16, hint: '开始暗下来' },
  dusk: { label: '黄昏', tint: '#d2703a', tintOpacity: 0.22, hint: '橙色的那一段' },
}

/* --------------------------------------------------------------------------
   天气代码
   -------------------------------------------------------------------------- */

/**
 * WMO weather code → 中文 + 归类 + 房间里的雨势。
 *
 * 分组按 Open-Meteo 文档：
 *   0 晴 / 1–3 多云 / 45,48 雾 / 51–67 雨 / 71–77 雪 / 80–82 阵雨 / 95–99 雷雨
 *
 * 雨势那一列是给房间用的：这个站的房间设定原本是"窗外在下雨"，
 * 所以晴天对应的是**雨停了**（RainLevel 里的 'none'）。
 * 只有真拿到天气才会变成 none —— 拿不到就退回默认的中雨，
 * 保住这个站原本的样子（见 weather.ts 的降级）。
 */
export function weatherFromCode(code: number): WeatherInfo {
  const row = WEATHER_TABLE.find((item) => item.match(code))

  if (!row) {
    return { code, label: '不知道什么天气', kind: 'cloudy', rain: 'light' }
  }

  return { code, label: row.label, kind: row.kind, rain: row.rain }
}

const WEATHER_TABLE: Array<{
  match: (code: number) => boolean
  label: string
  kind: WeatherKind
  rain: RainLevel
}> = [
  { match: (c) => c === 0, label: '晴', kind: 'clear', rain: 'none' },
  { match: (c) => c >= 1 && c <= 3, label: '多云', kind: 'cloudy', rain: 'none' },
  { match: (c) => c === 45 || c === 48, label: '雾', kind: 'fog', rain: 'light' },
  { match: (c) => c >= 51 && c <= 57, label: '毛毛雨', kind: 'rain', rain: 'light' },
  { match: (c) => c >= 61 && c <= 65, label: '雨', kind: 'rain', rain: 'normal' },
  { match: (c) => c === 66 || c === 67, label: '冻雨', kind: 'rain', rain: 'normal' },
  { match: (c) => c >= 71 && c <= 77, label: '雪', kind: 'snow', rain: 'light' },
  { match: (c) => c >= 80 && c <= 82, label: '阵雨', kind: 'shower', rain: 'heavy' },
  { match: (c) => c >= 85 && c <= 86, label: '阵雪', kind: 'snow', rain: 'light' },
  { match: (c) => c >= 95, label: '雷雨', kind: 'thunder', rain: 'heavy' },
]

/** 天气种类 → 一个大致的样子（给界面上的图标用） */
export const WEATHER_KIND_LABEL: Record<WeatherKind, string> = {
  clear: '晴',
  cloudy: '多云',
  fog: '雾',
  rain: '雨',
  snow: '雪',
  shower: '阵雨',
  thunder: '雷雨',
}
