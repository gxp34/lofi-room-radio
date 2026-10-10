'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, CloudRain, Hand, Radio } from 'lucide-react'

import { Icon } from '@/components/icon'
import { useRoom } from '@/components/providers/room-provider'
import { AchievementBoard } from '@/components/room/achievement-board'
import { DailyQuoteCard } from '@/components/room/daily-quote'
import { RoomScene } from '@/components/room/room-scene'
import { SoundToggle } from '@/components/room/sound-toggle'
import { WeatherPanel } from '@/components/room/weather-panel'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { NAV_ITEMS, ROOM_OBJECTS } from '@/lib/constants'
import { isDeepNight } from '@/lib/utils'

/**
 * 首页 = 房间全景。
 *
 * 所有内容都要等本地状态恢复（ready）之后才稳定，
 * 但为了不闪，正文直接渲染默认值，只有依赖 localStorage 的部分用 ready 控制。
 */
export default function HomePage() {
  const { settings, ready } = useRoom()

  /**
   * 「现在是不是深夜」必须在挂载之后才算。
   * 服务端渲染发生在构建时（可能在凌晨 3 点），访客可能在下午 2 点打开 ——
   * 直接渲染 isDeepNight() 会 hydration 不一致。
   */
  const [timeLabel, setTimeLabel] = React.useState<string>('夜里')
  React.useEffect(() => {
    setTimeLabel(isDeepNight() ? '深夜档' : '夜里')
  }, [])

  return (
    <div className="container py-6 sm:py-10">
      {/* ================= 门口 ================= */}
      <section className="mb-6 sm:mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Badge variant="muted" className="mb-3">
              <Radio className="mr-1.5 h-3 w-3" aria-hidden />
              现在时刻 · {timeLabel}
            </Badge>

            <h1 className="text-balance font-display text-2xl leading-tight text-paper sm:text-4xl">
              {settings.roomName}
              <span className="animate-blink ml-1 text-lamp">_</span>
            </h1>

            <p className="mt-2.5 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground">
              {settings.tagline}
            </p>

            <p className="mt-2 flex items-center gap-1.5 text-xs text-rain">
              <CloudRain className="h-3.5 w-3.5" aria-hidden />
              {settings.weather} · {settings.weatherNote}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <SoundToggle />
            <p className="max-w-[13rem] text-right text-[11px] leading-relaxed text-dust">
              这里的一切都要你亲手点一下才会动。
            </p>
          </div>
        </div>

        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <Hand className="h-3.5 w-3.5 shrink-0 text-lamp" aria-hidden />
            房间里每样东西都能点。单击、双击、长按、连点，反应都不一样。
          </span>
          <span className="flex items-center gap-1.5 text-dust">
            <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-lamp" aria-hidden />
            亮着小点的是你还没碰过的东西
          </span>
          {!ready && <span className="text-dust">（正在恢复房间状态…）</span>}
        </p>
      </section>

      {/* ================= 公告（后台可配） ================= */}
      {settings.announcement && (
        <p className="mb-6 rounded-lg border border-neon/25 bg-neon/[0.06] px-4 py-3 text-sm leading-relaxed text-paper/90">
          {settings.announcement}
        </p>
      )}

      {/* ================= 窗外 · 今日一句 =================
          两个都从我们自己的 Route Handler 取数（前端不直连外部服务），
          拿不到就各自降级，所以这一块永远不会是空白。
          房间的雨势和光线也由 WeatherPanel 写进 store。 */}
      <section className="mb-8 grid gap-4 sm:grid-cols-2">
        <WeatherPanel />
        <DailyQuoteCard />
      </section>

      {/* ================= 房间全景 ================= */}
      <section aria-labelledby="room-heading" className="mb-10">
        <h2 id="room-heading" className="sr-only">
          房间全景，{ROOM_OBJECTS.length} 个可以点的东西
        </h2>
        <RoomScene />

        {/* 小图例：解释房间里为什么会有点，以及关灯之后会发生什么 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[11px] text-dust">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-lamp" aria-hidden />
            没碰过
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rain" aria-hidden />
            稀有事件
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-neon" aria-hidden />
            隐藏事件
          </span>
          <span className="text-dust/70">
            试试把那盏台灯关掉 —— 整间屋子会跟着暗下来。
          </span>
        </div>
      </section>

      {/* ================= 软木板 · 成就 ================= */}
      <AchievementBoard className="mb-10" />

      {/* ================= 房间地图 ================= */}
      <section aria-labelledby="rooms-heading">
        <h2 id="rooms-heading" className="mb-4 font-display text-lg text-lamp">
          {'// 房间地图'}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_ITEMS.filter((item) => item.href !== '/').map((item) => (
            <Link key={item.href} href={item.href} className="group">
              <Card className="h-full transition-colors group-hover:border-lamp/25 group-hover:bg-room/80">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-paper">
                    <Icon name={item.icon} className="h-4 w-4 text-lamp" />
                    {item.label}
                  </CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <span className="inline-flex items-center gap-1 text-xs text-dust transition-colors group-hover:text-lamp">
                    推门进去
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
