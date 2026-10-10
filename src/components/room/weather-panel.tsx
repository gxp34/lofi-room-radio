'use client'

import * as React from 'react'
import { CloudRain, Compass, Moon, RefreshCw, Sunrise, Sunset, Thermometer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SKY_PHASE_META } from '@/lib/external/sky-meta'
import { cn } from '@/lib/utils'
import { useRoomStore } from '@/stores/room-store'
import type { SkyPayload } from '@/types/external'

/**
 * 天气 / 时间 / 月相面板。
 *
 * 它同时干两件事：
 *   1. 显示（城市、温度、天气、日出日落、月相、当前时间）
 *   2. **把结果写进房间 store** —— 房间的雨势和色调跟着变
 *
 * 数据只从 `/api/weather` 来（前端不直连 Open-Meteo）。
 * 那个接口**永远返回 200**，拿不到就是一份 live:false 的兜底数据，
 * 所以这里不需要写错误分支，只需要在界面上说明"这是兜底的"。
 */

/** 时间每 30 秒走一次就够了：显示精度是分钟，秒针只会浪费重渲染 */
const CLOCK_MS = 30_000

export function WeatherPanel({ className }: { className?: string }) {
  const [payload, setPayload] = React.useState<SkyPayload | null>(null)
  const [now, setNow] = React.useState<Date | null>(null)
  const [loading, setLoading] = React.useState(false)

  const setExternalSky = useRoomStore((state) => state.setExternalSky)

  /* ---------------- 拉数据 + 写进房间 ---------------- */

  const load = React.useCallback(
    async (fresh: boolean) => {
      setLoading(true)
      try {
        const response = await fetch(`/api/weather${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' })
        if (!response.ok) return

        const data = (await response.json()) as SkyPayload
        setPayload(data)

        // 关键的一步：房间跟着天气和时间变。
        // 降级时 data.weather.rain 已经是 'normal'（雨），所以失败 = 回到默认样子。
        setExternalSky({
          rain: data.weather.rain,
          skyPhase: data.phase,
          temperature: data.temperature,
          weatherLive: data.live,
        })
      } catch {
        // 连自己的接口都拿不到（离线）：房间保持默认的雨夜，什么都不用做
      } finally {
        setLoading(false)
      }
    },
    [setExternalSky],
  )

  React.useEffect(() => {
    void load(false)
  }, [load])

  /* ---------------- 本地时钟 ---------------- */

  React.useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), CLOCK_MS)
    return () => window.clearInterval(id)
  }, [])

  const phase = payload?.phase ?? null
  const meta = phase ? SKY_PHASE_META[phase] : null

  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 sm:p-4',
        className,
      )}
    >
      {/* ---------------- 第一行：城市 / 温度 / 天气 ---------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-display text-[11px] uppercase tracking-[0.18em] text-dust">
            <Compass className="h-3 w-3" aria-hidden />
            窗外
          </p>

          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-display text-2xl text-paper">
              {payload ? payload.weather.label : '—'}
            </span>
            {payload?.temperature !== null && payload?.temperature !== undefined && (
              <span className="flex items-center gap-1 font-display text-lg text-lamp">
                <Thermometer className="h-3.5 w-3.5" aria-hidden />
                {payload.temperature}°
              </span>
            )}
            {payload?.city && <span className="text-xs text-dust">{payload.city}</span>}
          </p>

          <p className="mt-1 text-[11px] text-dust/80">
            {meta ? `${meta.label} · ${meta.hint}` : '正在看窗外…'}
          </p>
        </div>

        {/* ---------------- 当前时间 ---------------- */}
        <div className="text-right">
          <p className="font-display text-xl tabular-nums text-paper">
            {now ? formatClock(now) : '--:--'}
          </p>
          <p className="mt-0.5 text-[10px] text-dust/70">
            {now ? formatDate(now) : ''}
          </p>
        </div>
      </div>

      {/* ---------------- 日出日落 / 月相 ---------------- */}
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3">
        <Stat
          icon={<Sunrise className="h-3.5 w-3.5 text-lamp" aria-hidden />}
          label="日出"
          value={payload?.sky.sunrise ? formatTime(payload.sky.sunrise) : '—'}
        />
        <Stat
          icon={<Sunset className="h-3.5 w-3.5 text-neon" aria-hidden />}
          label="日落"
          value={payload?.sky.sunset ? formatTime(payload.sky.sunset) : '—'}
        />
        <Stat
          icon={<Moon className="h-3.5 w-3.5 text-rain" aria-hidden />}
          label="月相"
          value={payload ? `${payload.moon.emoji} ${payload.moon.label}` : '—'}
        />
      </div>

      {/* ---------------- 数据来源 / 刷新 ---------------- */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
        <p className="flex items-center gap-1.5 text-[10px] leading-relaxed text-dust/70">
          <CloudRain className="h-3 w-3 shrink-0" aria-hidden />
          {!payload
            ? '正在取数据…'
            : payload.live
              ? `Open-Meteo · 更新于 ${formatTime(payload.fetchedAt)}`
              : (payload.note ?? '数据是兜底的')}
        </p>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          disabled={loading}
          onClick={() => void load(true)}
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          刷新
        </Button>
      </div>
    </div>
  )
}

/* ==========================================================================
   小零件 + 时间格式化
   ========================================================================== */

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] text-dust">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 font-display text-[13px] tabular-nums text-paper/85">{value}</p>
    </div>
  )
}

function formatClock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDate(date: Date): string {
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()] ?? ''
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${week}`
}

/** ISO → 本地 HH:mm */
function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
