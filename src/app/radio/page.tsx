import type { Metadata } from 'next'

import { RadioClient } from '@/components/radio/radio-client'

export const metadata: Metadata = {
  title: '电台',
  description: '外面的实时电台。SomaFM 和几个中文台，点一下才出声。',
}

/**
 * 电台页。
 *
 * 页面本身是服务端组件（为了 metadata），真正干活的 RadioClient 是客户端组件 ——
 * 它要拉 /api/radio/channels、要操作播放器，这些只能在浏览器里做。
 *
 * 频道数据**不在服务端预取**：这样切到这个页面时不会因为外部服务慢而卡住首屏
 * （SomaFM 偶尔要一两秒），先出一张空列表和"正在收台…"，数据回来再填上。
 */
export default function RadioPage() {
  return (
    <div className="container py-8 sm:py-12">
      <header className="mb-6">
        <p className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-dust">
          {'// 外面'}
        </p>
        <h1 className="font-display text-2xl text-paper sm:text-3xl">电台</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          唱片架上是自己放上去的，这里是别人的频率 —— 几十个一直在播的台，
          还有几个中文台。点一下才开始响。
        </p>
      </header>

      <RadioClient />
    </div>
  )
}
