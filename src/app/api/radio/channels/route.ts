import { NextResponse } from 'next/server'

import { loadRadioChannels } from '@/lib/external/radio'
import { loadRadioSettings } from '@/lib/external/radio-settings'
import type { RadioChannelsPayload } from '@/types/radio'

/**
 * 电台频道列表。
 *
 * 前端只调这个，不直接碰 SomaFM ——
 * 一是缓存和降级只写一遍，二是以后要换数据源不用动前端。
 *
 * 这个接口**永远返回 200**：SomaFM 挂了就给一份"只有自定义频道"的列表，
 * 连自定义也没有就是空列表 + 一句 note。页面据此显示「信号丢失」，
 * 但不会白屏、不会报错。
 *
 * 查询参数：
 *   ?fresh=1  绕过缓存（手动刷新用）
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const fresh = url.searchParams.get('fresh') === '1'

  try {
    const settings = await loadRadioSettings()
    const payload: RadioChannelsPayload = await loadRadioChannels({
      enabled: settings.enabled,
      customText: settings.channelsText,
      defaultStationId: settings.defaultChannelId,
      fresh,
    })

    return NextResponse.json(payload, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('[api/radio/channels] 彻底失败：', error)

    return NextResponse.json(
      {
        enabled: false,
        note: '信号丢失：电台服务暂时连不上。',
        stations: [],
        defaultStationId: null,
        fetchedAt: new Date().toISOString(),
      } satisfies RadioChannelsPayload,
      { status: 200, headers: { 'cache-control': 'no-store' } },
    )
  }
}
