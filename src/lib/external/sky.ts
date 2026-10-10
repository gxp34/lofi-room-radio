/**
 * ⚠️ 用命名空间导入，不是 `import SunCalc from 'suncalc'`。
 * suncalc 2.x 打包出来的是命名导出（`export function getTimes`），
 * 这个包又是 CJS 的，所以 default 导入在类型上和运行时不都对。
 * 第一版就是那么写的，类型检查会报 "no default export"。
 *
 * ⚠️ 这个文件**只能在服务端引用** —— 它顶层就 import 了 suncalc。
 * 客户端要用的那张颜色表（SKY_PHASE_META）和天气代码映射放在 sky-meta.ts。
 */
import * as SunCalc from 'suncalc'

import type { MoonInfo, SkyPhase, SkyTimes } from '@/types/external'

/**
 * 天空：日出日落、月相、一天里的时段。
 *
 * **全是本地计算**，一次网络请求都没有：
 *   · 日出日落 / 黄金时刻 / 晨昏蒙影 用 suncalc
 *   · 月相也用 suncalc（它按天文公式算，不是查表）
 * 所以这一层永远成功，不存在"超时降级"的问题：
 * 天气接口挂了，时间那一半照样准。
 */

/* --------------------------------------------------------------------------
   日出日落
   -------------------------------------------------------------------------- */

/**
 * 某一天的日升日落。
 *
 * suncalc 在极昼极夜时会返回 null —— 原样转成 null，
 * 让上层决定怎么显示（"今天太阳没落下去"也是一种信息）。
 */
export function computeSkyTimes(date: Date, lat: number, lon: number): SkyTimes {
  const times = SunCalc.getTimes(date, lat, lon)
  // 高纬度极昼极夜时这些字段是 null，注意别只判 undefined
  const iso = (value: Date | null | undefined): string | null =>
    value && !Number.isNaN(value.getTime()) ? value.toISOString() : null

  return {
    sunrise: iso(times.sunrise),
    sunset: iso(times.sunset),
    dawn: iso(times.dawn),
    dusk: iso(times.dusk),
    goldenHour: iso(times.goldenHour),
    goldenHourEnd: iso(times.goldenHourEnd),
    solarNoon: iso(times.solarNoon),
  }
}

/**
 * 现在落在一天里的哪一段。
 *
 * 顺序很重要：先判断"太阳有没有出来"，所以极昼极夜（sunrise/sunset 为 null）
 * 会落到"白天"或"深夜"，而不是因为比较 null 得出奇怪的结果。
 */
export function skyPhaseAt(date: Date, times: SkyTimes): SkyPhase {
  const now = date.getTime()
  const at = (value: string | null) => (value ? Date.parse(value) : null)

  const hour = date.getHours()
  const sunrise = at(times.sunrise)
  const sunset = at(times.sunset)
  const dawn = at(times.dawn)
  const dusk = at(times.dusk)
  const golden = at(times.goldenHour)

  // 深夜：0–5 点，房间只剩台灯
  if (hour >= 0 && hour < 5) return 'deepNight'

  // 太阳没出来（含极夜）
  if (sunrise !== null && now < sunrise) return dawn !== null && now >= dawn ? 'dawn' : 'deepNight'
  if (sunset !== null && now >= sunset) {
    return dusk !== null && now < dusk ? 'dusk' : 'night'
  }

  // 白天：日落前那一段黄金时刻算黄昏
  if (golden !== null && now >= golden) return 'dusk'
  if (hour < 11) return 'morning'
  if (hour < 16) return 'afternoon'
  return 'evening'
}

/* --------------------------------------------------------------------------
   月相
   -------------------------------------------------------------------------- */

const MOON_LABELS: Array<{ max: number; label: string; emoji: string }> = [
  { max: 0.03, label: '新月', emoji: '🌑' },
  { max: 0.22, label: '娥眉月', emoji: '🌒' },
  { max: 0.28, label: '上弦月', emoji: '🌓' },
  { max: 0.47, label: '盈凸月', emoji: '🌔' },
  { max: 0.53, label: '满月', emoji: '🌕' },
  { max: 0.72, label: '亏凸月', emoji: '🌖' },
  { max: 0.78, label: '下弦月', emoji: '🌗' },
  { max: 0.97, label: '残月', emoji: '🌘' },
  { max: 1.01, label: '新月', emoji: '🌑' },
]

/** 月亮现在长什么样 */
export function computeMoon(date: Date): MoonInfo {
  const illumination = SunCalc.getMoonIllumination(date)
  const phase = illumination.phase // 0 = 新月，0.5 = 满月
  const found = MOON_LABELS.find((item) => phase < item.max) ?? MOON_LABELS[0]

  return {
    phase: Number(phase.toFixed(4)),
    label: found.label,
    emoji: found.emoji,
    /** 被照亮的比例，0–1 */
    fraction: Number(illumination.fraction.toFixed(4)),
  }
}
