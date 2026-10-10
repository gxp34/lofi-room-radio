import { NextResponse } from 'next/server'

import { loadCelestialEnabled } from '@/lib/external/celestial-settings'
import { loadExternalSettings } from '@/lib/external/settings'
import { resolveWeatherLocation } from '@/lib/external/weather'

/**
 * 星空图的「参数」（不是星图数据本身）。
 *
 * ⚠️ 这个接口**故意不返回星表**。
 *   原因：星表（975 颗亮星 + 星座连线，约 37 KB）是页面自己 import 的，
 *   走接口的话不但多一次往返，还多一份缓存要管。星图是**纯本地计算**，
 *   服务端唯一能提供的、客户端拿不到的东西只有两样：
 *     1. 经纬度（站长在后台填的，后台设置访客读起来麻烦）
 *     2. 「现在几点」—— 服务端的时钟比访客设备可靠，
 *        而星图对时间很敏感（差一小时星空就转 15°）。
 *
 * 所以这里只回这两样 + 开关状态。接口永远 200，拿不到就是一份兜底值。
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const now = new Date()

  try {
    const [celestialEnabled, settings] = await Promise.all([
      loadCelestialEnabled(),
      loadExternalSettings(),
    ])

    const location = resolveWeatherLocation(settings)

    return NextResponse.json(
      {
        enabled: celestialEnabled,
        /** 服务端此刻的时间（ISO）。客户端用它做星图的"当前时刻锚点" */
        serverNow: now.toISOString(),
        /** 观测点的经纬度（后台设置优先，其次是 WEATHER_LAT / WEATHER_LON 兜底） */
        latitude: location.lat,
        longitude: location.lon,
        /** 城市名，只用于显示 */
        city: location.city,
      },
      // 星图每一刻都不一样，没有任何理由让浏览器或 CDN 缓存这一份
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    // 连设置都读不到（理论上不会 —— 上面每个都自己兜住了）：
    // 给一份能用的兜底值，让页面至少能画出一张静态星图，而不是白屏
    console.warn('[api/sky] 取星空参数失败，用兜底值：', error)

    return NextResponse.json(
      {
        enabled: true,
        serverNow: now.toISOString(),
        latitude: 31.2304,
        longitude: 121.4737,
        city: '上海',
      },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    )
  }
}
