'use client'

import * as React from 'react'
import Link from 'next/link'
import { Loader2, Pause, Play, RadioTower, RefreshCw, Search, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { usePlayerStore } from '@/stores/player-store'
import type { RadioChannelsPayload, RadioStation, RadioStreamPayload } from '@/types/radio'

/**
 * 电台页面。
 *
 * 两段网络交互，都在服务端完成（前端不直连 SomaFM）：
 *   1. 进页面拉一次频道列表 → /api/radio/channels（服务端缓存 1 小时）
 *   2. 点某个台时解析它的播放列表 → /api/radio/stream?id=xxx（各自缓存 1 小时）
 *
 * 为什么第 2 步不放在列表里一次做完：50 多个台就是 50 多个外部请求，
 * 而访客通常只点一个。
 *
 * 声音交给**全站唯一的那个 <audio>**（player-store 的 liveStation），
 * 所以切到别的页面音乐不会断，底部的播放条也会自动变成直播的样子。
 * 绝不自动播放：进页面只拉列表，不出声。
 */

export function RadioClient() {
  const [payload, setPayload] = React.useState<RadioChannelsPayload | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [query, setQuery] = React.useState('')
  /** 正在解析播放列表的那个台 */
  const [resolvingId, setResolvingId] = React.useState<string | null>(null)
  /** 解析失败的一句话（点某个台之后出现的） */
  const [failMessage, setFailMessage] = React.useState<string | null>(null)

  const liveStation = usePlayerStore((state) => state.liveStation)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const streamError = usePlayerStore((state) => state.streamError)

  /* ---------------- 拉频道列表 ---------------- */

  const loadChannels = React.useCallback(async (fresh: boolean) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/radio/channels${fresh ? '?fresh=1' : ''}`, {
        cache: 'no-store',
      })
      if (!response.ok) return
      setPayload((await response.json()) as RadioChannelsPayload)
    } catch {
      // 离线：保持现状。列表为空时下面会显示「信号丢失」
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadChannels(false)
  }, [loadChannels])

  /* ---------------- 点一个台 ---------------- */

  const playStation = async (station: RadioStation) => {
    // 已经在放这个台 → 点一下就是暂停 / 继续，不再重新解析
    if (liveStation?.id === station.id) {
      usePlayerStore.getState().toggle()
      return
    }

    setResolvingId(station.id)
    setFailMessage(null)

    try {
      const response = await fetch(`/api/radio/stream?id=${encodeURIComponent(station.id)}`, {
        cache: 'no-store',
      })
      const data = (await response.json()) as RadioStreamPayload

      if (!data.ok || !data.streamUrl) {
        setFailMessage(data.error ?? '信号丢失')
        return
      }

      usePlayerStore.getState().playLiveStation({
        id: station.id,
        name: station.name,
        subtitle: station.tags.length > 0 ? station.tags.join(' · ') : station.description,
        streamUrl: data.streamUrl,
        format: data.format ?? 'mp3',
        coverUrl: station.coverUrl,
      })
    } catch {
      setFailMessage('信号丢失')
    } finally {
      setResolvingId(null)
    }
  }

  /* ---------------- 搜索 ---------------- */

  /**
   * ⚠️ 必须包一层 useMemo。
   *
   * 直接写 `const stations = payload?.stations ?? []` 的话，
   * `?? []` 每次渲染都会造一个新数组 —— 于是下面那个筛选用 useMemo
   * 反而完全失效（依赖每次都变），等于白写。
   * eslint 的 react-hooks/exhaustive-deps 正好会报这一条。
   */
  const stations = React.useMemo(() => payload?.stations ?? [], [payload])

  const filtered = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (keyword === '') return stations

    return stations.filter((station) => {
      // 中文搜索：直接对名字、描述、标签做包含匹配。
      // 不做拼音/分词 —— 这个规模（几十个台）用不上，反而容易搜出莫名其妙的结果。
      const haystack = [station.name, station.description, ...station.tags].join(' ').toLowerCase()
      return haystack.includes(keyword)
    })
  }, [query, stations])

  const currentIsLive = Boolean(liveStation)

  return (
    <div className="space-y-5">
      {/* ---------------- 状态条 ---------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-display text-sm text-paper">
            <RadioTower className="h-4 w-4 text-lamp" aria-hidden />
            {currentIsLive ? `正在收听：${liveStation?.name}` : '选一个台'}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-dust">
            {streamError
              ? streamError
              : failMessage
                ? failMessage
                : currentIsLive
                  ? '留在这个页面或者去别的页面都行，声音不会断。'
                  : '所有声音都要你亲手点一下才会响 —— 这里不自动播放。'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentIsLive && (
            <Button size="sm" variant="outline" onClick={() => usePlayerStore.getState().stopLiveStation()}>
              <Square className="h-3.5 w-3.5" />
              关掉
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={loading}
            onClick={() => void loadChannels(true)}
            title="重新拉一次频道列表（服务端缓存 1 小时）"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            刷新
          </Button>
        </div>
      </div>

      {/* ---------------- 后台关掉了 / 拿不到 ---------------- */}
      {payload && !payload.enabled && (
        <p className="rounded-lg border border-neon/25 bg-neon/[0.06] px-3.5 py-3 text-sm leading-relaxed text-paper/85">
          {payload.note ?? '电台关着。'}
          你可以去
          <Link href="/music" className="mx-1 text-lamp underline-offset-2 hover:underline">
            唱片架
          </Link>
          听自己的歌。
        </p>
      )}

      {payload?.note && payload.enabled && (
        <p className="rounded-lg border border-lamp/20 bg-lamp/[0.05] px-3.5 py-2.5 text-[11px] leading-relaxed text-dust">
          {payload.note}
        </p>
      )}

      {/* ---------------- 搜索 ---------------- */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dust"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜台名、流派、标签……"
          aria-label="搜索电台"
          className="pl-9"
        />
      </div>

      {/* ---------------- 列表 ---------------- */}
      {loading && stations.length === 0 ? (
        <p className="flex items-center gap-2 py-10 text-sm text-dust">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          正在收台…
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-sm leading-relaxed text-dust">
          {stations.length === 0
            ? '信号丢失：一个台都没收到。稍后再试，或者去唱片架听点自己的。'
            : `没有找到跟「${query}」有关的台。`}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((station) => {
            const active = liveStation?.id === station.id
            const resolving = resolvingId === station.id
            const playing = active && isPlaying

            return (
              <li key={station.id}>
                <button
                  type="button"
                  onClick={() => void playStation(station)}
                  disabled={resolving}
                  aria-pressed={active}
                  className={cn(
                    'group flex h-full w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                    active
                      ? 'border-lamp/40 bg-lamp/[0.07]'
                      : 'border-white/[0.07] bg-white/[0.02] hover:border-lamp/25 hover:bg-white/[0.04]',
                  )}
                >
                  {/* 图标位：放封面，没有就用天线 */}
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-roomDeep">
                    {station.coverUrl ? (
                      // 这里用原生 img 而不是 next/image：
                      // SomaFM 的封面域名没有在我们的 next.config 里登记过，
                      // 走 next/image 会被拦下来。一张 44px 的图不值得为它改配置。
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={station.coverUrl}
                        alt=""
                        width={44}
                        height={44}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <RadioTower
                        className={cn('h-5 w-5', active ? 'text-lamp' : 'text-dust')}
                        aria-hidden
                      />
                    )}

                    {/* 正在放的小动效 */}
                    {playing && (
                      <span
                        className="absolute inset-0 ring-1 ring-inset ring-lamp/50"
                        aria-hidden
                      />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'truncate font-display text-sm',
                          active ? 'text-lamp' : 'text-paper',
                        )}
                      >
                        {station.name}
                      </span>
                      {station.source === 'custom' && (
                        <span className="shrink-0 rounded-full border border-white/15 px-1.5 py-px text-[9px] text-dust">
                          自建
                        </span>
                      )}
                    </span>

                    <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-muted-foreground">
                      {station.description}
                    </span>

                    <span className="mt-1.5 flex items-center gap-1.5 text-[10px] text-dust">
                      {resolving ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                          正在调频…
                        </>
                      ) : active ? (
                        <>
                          {isPlaying ? (
                            <Pause className="h-3 w-3" aria-hidden />
                          ) : (
                            <Play className="h-3 w-3" aria-hidden />
                          )}
                          {isPlaying ? '点一下暂停' : '点一下继续'}
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3" aria-hidden />
                          播放
                        </>
                      )}
                      {station.formatHint && (
                        <span className="ml-auto uppercase opacity-60">{station.formatHint}</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="pt-2 text-[11px] leading-relaxed text-dust/70">
        英文频道来自
        <a
          href="https://somafm.com"
          target="_blank"
          rel="noreferrer noopener"
          className="mx-1 text-dust underline-offset-2 hover:text-lamp hover:underline"
        >
          SomaFM
        </a>
        （听众赞助的公共电台）。中文频道的地址由站长发在后台里 ——
        网络电台的地址会变，所以它们不写死在代码里。
      </p>
    </div>
  )
}
