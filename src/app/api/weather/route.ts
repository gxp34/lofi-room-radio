import { NextResponse } from 'next/server'

import { loadExternalSettings } from '@/lib/external/settings'
import { loadSky, resolveWeatherLocation } from '@/lib/external/weather'

/**
 * 天气 + 天空。
 *
 * 前端**只调这个**，不直接碰 Open-Meteo ——
 * 一是密钥/参数都留在服务端，二是缓存和降级只写一遍。
 *
 * 这个接口**永远不会返回 5xx**：拿不到天气时返回一份 live:false 的兜底数据。
 * 前端因此不需要写错误分支，"天气挂了"和"天气是雨"在界面上是同一件事。
 *
 * 查询参数：
 *   ?fresh=1  绕过缓存（后台预览、手动刷新用）
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const fresh = url.searchParams.get('fresh') === '1'

  try {
    const settings = await loadExternalSettings()
    const location = resolveWeatherLocation(settings)

    const payload = await loadSky({
      enabled: settings.weatherEnabled,
      city: location.city,
      lat: location.lat,
      lon: location.lon,
      fresh,
    })

    return NextResponse.json(payload, {
      headers: {
        // 缓存交给上面那两层自己管，这里不要浏览器/CDN 再插一手
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    // 连 loadSky 都抛了（理论上不会 —— 它内部全兜住了），
    // 也得给前端一个能渲染的东西
    console.error('[api/weather] 彻底失败：', error)

    return NextResponse.json(
      {
        live: false,
        note: '天气服务暂时连不上。',
        city: '',
        observedAt: new Date().toISOString(),
        temperature: null,
        isDay: false,
        weather: { code: 61, label: '雨', kind: 'rain', rain: 'normal' },
        moon: { phase: 0.5, label: '满月', emoji: '🌕', fraction: 1 },
        sky: {
          sunrise: null,
          sunset: null,
          dawn: null,
          dusk: null,
          goldenHour: null,
          goldenHourEnd: null,
          solarNoon: null,
        },
        phase: 'night',
        fetchedAt: new Date().toISOString(),
      },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    )
  }
}
