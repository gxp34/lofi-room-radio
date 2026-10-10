import { NextResponse } from 'next/server'

import { loadRadioChannels, resolveStream } from '@/lib/external/radio'
import { loadRadioSettings } from '@/lib/external/radio-settings'
import type { RadioStreamPayload } from '@/types/radio'

/**
 * 解析某个频道的播放列表，返回真正能播的流地址。
 *
 * 为什么单独一个接口、而不是在频道列表里一次全解析：
 *   列表有 50 多个频道，一次全解析就是 50 多个外部请求（几百毫秒起），
 *   而访客通常只点一个。所以"点哪个解析哪个"，各自缓存 1 小时。
 *
 * 同样**永远返回 200**：解析不出来就是 ok:false + 「信号丢失」，
 * 前端据此显示那句话，不需要处理 HTTP 错误。
 *
 * 查询参数：
 *   ?id=somafm:groovesalad   频道 id（必填）
 *   ?fresh=1                 绕过缓存
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const fresh = url.searchParams.get('fresh') === '1'

  const fail = (error: string): NextResponse<RadioStreamPayload> =>
    NextResponse.json(
      { ok: false, stationId: id ?? '', streamUrl: null, format: null, error },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    )

  if (!id) return fail('没说要放哪个台。')

  try {
    const settings = await loadRadioSettings()
    if (!settings.enabled) return fail('电台在后台关着。')

    // 从列表里找回这个频道 —— 不信任前端传过来的地址，
    // 否则这个接口就成了一个"帮我请求任意 URL"的跳板。
    const payload = await loadRadioChannels({
      enabled: settings.enabled,
      customText: settings.channelsText,
      defaultStationId: settings.defaultChannelId,
    })

    const station = payload.stations.find((item) => item.id === id)
    if (!station) return fail('没有这个频道。')

    const resolved = await resolveStream(station, { fresh })

    return NextResponse.json(
      {
        ok: resolved.ok,
        stationId: station.id,
        streamUrl: resolved.streamUrl,
        format: resolved.format,
        error: resolved.error,
      } satisfies RadioStreamPayload,
      { status: 200, headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    console.error('[api/radio/stream] 彻底失败：', error)
    return fail('信号丢失')
  }
}
