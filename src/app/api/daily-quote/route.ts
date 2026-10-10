import { NextResponse } from 'next/server'

import { loadDailyQuote } from '@/lib/external/quotes'
import { loadExternalSettings } from '@/lib/external/settings'
import { estimateUtcOffsetSeconds } from '@/lib/external/sky'
import { resolveWeatherLocation } from '@/lib/external/weather'

/**
 * 每日一句。
 *
 * 前端刷新只会拿到**今天那一句** —— 服务端按天缓存，
 * 所以"刷新"这个按钮刷的是网络请求，不是句子本身。
 * 想让句子变，得等第二天，或者去后台手动覆盖。
 *
 * 同样**永远返回 200**：拿不到一言就用本地句子库。
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const fresh = url.searchParams.get('fresh') === '1'

  try {
    const settings = await loadExternalSettings()
    const location = resolveWeatherLocation(settings)

    /**
     * 用城市经度估一个时区偏移，交给 loadDailyQuote 决定"今天"从几点开始。
     * 不这么做的话服务器（UTC）会在早上 8 点给国内访客换句子。
     */
    const quote = await loadDailyQuote({
      enabled: settings.dailyQuoteEnabled,
      fresh,
      utcOffsetSeconds: estimateUtcOffsetSeconds(location.lon),
    })

    return NextResponse.json(quote, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('[api/daily-quote] 彻底失败：', error)

    return NextResponse.json(
      {
        text: '雨声之所以让人安心，是因为它什么都不要求你。',
        from: null,
        source: 'local',
        day: new Date().toISOString().slice(0, 10),
      },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    )
  }
}
