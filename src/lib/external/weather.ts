import {
  WEATHER_FALLBACK_CITY,
  WEATHER_FALLBACK_LAT,
  WEATHER_FALLBACK_LON,
} from '@/lib/env.server'
import { fetchWithTimeout, readCachedSetting, writeCachedSetting, readMemory, writeMemory } from '@/lib/external/cache'
import { computeMoon, computeSkyTimes, estimateUtcOffsetSeconds, skyPhaseAt } from '@/lib/external/sky'
import { weatherFromCode } from '@/lib/external/sky-meta'
import type { SkyPayload } from '@/types/external'

/**
 * 天气 + 天空（合成一份给前端）。
 *
 * 数据源：Open-Meteo，**免费、不需要密钥**。
 *   https://api.open-meteo.com/v1/forecast
 *
 * 缓存 30 分钟，两级（内存 + site_settings，见 cache.ts）。
 *
 * 降级策略是这个文件的重点：
 *   任何一步失败（超时、DNS 挂了、返回的形状不对、根本没网）
 *   都会退回到一份**「雨」的兜底数据**，`live: false`。
 *   因为日出日落和月相是本地算的，即使天气拿不到，时间那一半照样是准的 ——
 *   所以降级之后页面仍然有东西可显示，而不是整块消失。
 */

const CACHE_KEY = 'weather_cache'
const CACHE_TTL_MS = 30 * 60 * 1000
const FETCH_TIMEOUT_MS = 6000

interface OpenMeteoResponse {
  /** 城市相对 UTC 的偏移（秒）。请求里带了 timezone=auto 就会有 */
  utc_offset_seconds?: number
  current?: {
    time?: string
    temperature_2m?: number
    weather_code?: number
    is_day?: number
  }
}

export interface WeatherOptions {
  enabled: boolean
  city: string
  lat: number
  lon: number
  /** 绕过缓存（后台预览用） */
  fresh?: boolean
}

/** 从后台设置里取经纬度和城市，取不到就用环境变量的兜底值 */
export function resolveWeatherLocation(settings: {
  weatherCity?: string | null
  weatherLat?: number | null
  weatherLon?: number | null
}): { city: string; lat: number; lon: number } {
  return {
    city: settings.weatherCity?.trim() || WEATHER_FALLBACK_CITY,
    lat: typeof settings.weatherLat === 'number' ? settings.weatherLat : WEATHER_FALLBACK_LAT,
    lon: typeof settings.weatherLon === 'number' ? settings.weatherLon : WEATHER_FALLBACK_LON,
  }
}

/**
 * 拿一份天空数据。
 *
 * 注意返回的对象**永远不是 null** —— 调用方不需要写 if，
 * 只需要看 `live` 决定要不要在界面上说一句"这是兜底的"。
 */
export async function loadSky(options: WeatherOptions): Promise<SkyPayload> {
  const now = new Date()
  const base = localSky(now, options.lat, options.lon)

  if (!options.enabled) {
    return {
      ...base,
      live: false,
      note: '天气功能在后台关着，用的是房间自己的天气。',
      city: options.city,
      temperature: null,
      isDay: base.phase !== 'deepNight' && base.phase !== 'night',
      weather: weatherFromCode(61), // 雨
      fetchedAt: now.toISOString(),
    }
  }

  // ---- 缓存 ----
  if (!options.fresh) {
    const hit = readMemory<SkyPayload>(CACHE_KEY, CACHE_TTL_MS)
    if (hit) return hit
  }

  const cached = options.fresh ? null : await readCachedSetting<SkyPayload>(CACHE_KEY, CACHE_TTL_MS)
  if (cached) {
    writeMemory(CACHE_KEY, cached)
    return cached
  }

  // ---- 真去拿 ----
  const payload = await fetchSky(options, now, base)

  writeMemory(CACHE_KEY, payload)
  void writeCachedSetting(CACHE_KEY, payload)

  return payload
}

/**
 * 只有本地计算的那一半（日出日落 / 月相 / 时段）。
 *
 * 经纬度要传进来 —— 后台改过城市的话，兜底数据里的日出日落也得按新城市算，
 * 不然会出现"天气拿不到，连日落时间都是旧城市的"。
 */
function localSky(
  now: Date,
  lat: number,
  lon: number,
): Omit<
  SkyPayload,
  'live' | 'note' | 'city' | 'temperature' | 'isDay' | 'weather'
> {
  const sky = computeSkyTimes(now, lat, lon)
  // 没有网络时拿不到城市的真实时区，按经度估一个（见 estimateUtcOffsetSeconds）
  const offset = estimateUtcOffsetSeconds(lon)
  return {
    observedAt: now.toISOString(),
    moon: computeMoon(now),
    sky,
    phase: skyPhaseAt(now, sky, offset),
    fetchedAt: now.toISOString(),
  }
}

async function fetchSky(
  options: WeatherOptions,
  now: Date,
  base: ReturnType<typeof localSky>,
): Promise<SkyPayload> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(options.lat))
  url.searchParams.set('longitude', String(options.lon))
  url.searchParams.set('current', 'temperature_2m,weather_code,is_day')
  url.searchParams.set('timezone', 'auto')

  try {
    const response = await fetchWithTimeout(url.toString(), FETCH_TIMEOUT_MS, {
      headers: { accept: 'application/json' },
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = (await response.json()) as OpenMeteoResponse
    const current = data.current
    if (!current || typeof current.weather_code !== 'number') {
      throw new Error('返回里没有 weather_code')
    }

    // 天空那半重新算一次 —— 用真实经纬度，日出日落才准
    const sky = computeSkyTimes(now, options.lat, options.lon)

    /**
     * 时区偏移：优先用 Open-Meteo 给的（它知道这个城市真正的时区，
     * 包括夏令时）；没给就按经度估。
     * 这个值决定「现在算不算深夜」，用服务器本地时间会差好几个时区。
     */
    const offset =
      typeof data.utc_offset_seconds === 'number'
        ? data.utc_offset_seconds
        : estimateUtcOffsetSeconds(options.lon)

    return {
      live: true,
      note: null,
      city: options.city,
      observedAt: current.time ? new Date(current.time).toISOString() : now.toISOString(),
      temperature:
        typeof current.temperature_2m === 'number' ? Math.round(current.temperature_2m * 10) / 10 : null,
      isDay: current.is_day === 1,
      weather: weatherFromCode(current.weather_code),
      moon: computeMoon(now),
      sky,
      phase: skyPhaseAt(now, sky, offset),
      fetchedAt: now.toISOString(),
    }
  } catch (error) {
    console.warn('[weather] 拿不到天气，降级成「雨」：', error)

    return {
      ...base,
      live: false,
      note: '拿不到实时天气，先按窗外在下雨算。',
      city: options.city,
      temperature: null,
      isDay: base.phase !== 'deepNight' && base.phase !== 'night',
      // 降级成「雨」——这个站原本的样子
      weather: weatherFromCode(61),
      fetchedAt: now.toISOString(),
    }
  }
}
