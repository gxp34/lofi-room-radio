'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Disc3, Music4, Play, Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TRACK_TAGS, SITE_TAGLINE } from '@/lib/constants'
import { cn, formatDuration } from '@/lib/utils'
import { usePlayerStore } from '@/stores/player-store'
import type { Track } from '@/types'

/**
 * 唱片架 / 点唱机。
 *
 * 点击任意一张唱片就把它换到唱针下；正在放的那张会一直转。
 * 标签可以作为筛选，深夜 0–5 点时播放器会自动把「深夜」那几张排到前面。
 */
export function TrackShelf({ shelfNote, copyrightNotice }: { shelfNote: string; copyrightNotice: string }) {
  const tracks = usePlayerStore((state) => state.tracks)
  const currentIndex = usePlayerStore((state) => state.currentIndex)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const hydrated = usePlayerStore((state) => state.hydrated)

  const [tag, setTag] = React.useState<string>('全部')

  const filtered = React.useMemo(() => {
    if (tag === '全部') return tracks
    return tracks.filter((track) => track.tags.includes(tag))
  }, [tracks, tag])

  const currentTrack = tracks[currentIndex] ?? null

  /* ---------------- 还没恢复本地状态：先摆个骨架，别闪一下空架子 ---------------- */
  if (!hydrated && tracks.length === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-room/30 p-3"
          >
            <span className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
            <span className="flex-1 space-y-2">
              <span className="block h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
              <span className="block h-2.5 w-1/3 animate-pulse rounded bg-white/[0.05]" />
            </span>
          </div>
        ))}
      </div>
    )
  }

  /* ---------------- 空状态：架子还是空的 ---------------- */
  if (hydrated && tracks.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-room/40 p-8 text-center">
        {/* 一张空白的黑胶，点它就去看怎么上架 */}
        <Link
          href="/admin"
          className="group mx-auto flex h-32 w-32 items-center justify-center rounded-full border border-white/10 bg-[conic-gradient(from_0deg,#0b0f13,#2b2230,#0b0f13,#2b2230,#0b0f13)] transition-transform hover:scale-105"
          aria-label="唱片架还是空的，去后台上传第一张"
        >
          <span className="flex flex-col items-center gap-1 text-dust transition-colors group-hover:text-lamp">
            <Plus className="h-5 w-5" />
            <span className="font-display text-[10px]">上架第一张</span>
          </span>
        </Link>

        <p className="mt-6 font-display text-sm text-paper">架子还是空的</p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
          登录后台就能上传音频和封面。只放自己创作、免版权或已获得授权的音乐 ——
          商业歌曲请不要公开传播。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ---------------- 标签筛选 ---------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <TagChip active={tag === '全部'} onClick={() => setTag('全部')}>
          全部
        </TagChip>
        {TRACK_TAGS.map((item) => (
          <TagChip key={item} active={tag === item} onClick={() => setTag(item)}>
            {item}
          </TagChip>
        ))}
      </div>

      {/* ---------------- 货架 ---------------- */}
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
          「{tag}」标签下还没有歌。
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((track) => (
            <li key={track.id}>
              <TrackCard
                track={track}
                isCurrent={currentTrack?.id === track.id}
                isPlaying={isPlaying && currentTrack?.id === track.id}
                onPlay={() => {
                  const index = tracks.findIndex((item) => item.id === track.id)
                  if (index >= 0) usePlayerStore.getState().playTrackAt(index)
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {/* ---------------- 架子边上的一句话 + 版权提醒 ---------------- */}
      <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">{shelfNote || SITE_TAGLINE}</p>
        <p className="text-xs leading-relaxed text-dust">{copyrightNotice}</p>
        {tracks.some((track) => track.isDemo) && (
          <p className="text-xs leading-relaxed text-rain">
            架子上带「演示」标记的三段是程序合成的示例音频（`scripts/generate-demo-audio.py`
            生成，无版权），你上传第一首歌之后它们就会自动消失。
          </p>
        )}
      </div>
    </div>
  )
}

function TagChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active
          ? 'border-lamp/40 bg-lamp/12 text-lamp'
          : 'border-white/[0.08] bg-white/[0.02] text-dust hover:text-paper',
      )}
    >
      {children}
    </button>
  )
}

function TrackCard({
  track,
  isCurrent,
  isPlaying,
  onPlay,
}: {
  track: Track
  isCurrent: boolean
  isPlaying: boolean
  onPlay: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPlay}
      onDoubleClick={() => {
        onPlay()
        // 双击 = 立刻换下一首（和房间里的唱片机行为一致）
        window.setTimeout(() => usePlayerStore.getState().next(), 120)
      }}
      aria-current={isCurrent ? 'true' : undefined}
      aria-label={`播放 ${track.title}${track.artist ? ` - ${track.artist}` : ''}`}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
        isCurrent
          ? 'border-lamp/40 bg-lamp/[0.07]'
          : 'border-white/[0.07] bg-room/40 hover:border-lamp/25 hover:bg-room/70',
      )}
    >
      {/* 封面 / 黑胶 */}
      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-roomDeep">
        {track.coverUrl ? (
          <Image
            src={track.coverUrl}
            alt=""
            width={56}
            height={56}
            className={cn('h-full w-full object-cover', isPlaying && 'animate-vinyl-slow')}
          />
        ) : (
          <Disc3
            className={cn('h-6 w-6 text-dust', isPlaying && 'animate-vinyl-slow')}
            aria-hidden
          />
        )}
        <span
          aria-hidden
          className="absolute h-2 w-2 rounded-full bg-night ring-1 ring-white/20"
        />
        {/* 悬停时露出的播放角标 */}
        {!isPlaying && (
          <span className="absolute inset-0 flex items-center justify-center bg-night/60 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="h-5 w-5 text-lamp" />
          </span>
        )}
      </span>

      {/* 信息 */}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-sm text-paper">{track.title}</span>
          {track.isDemo && (
            <Badge variant="rain" className="shrink-0 text-[10px]">
              演示
            </Badge>
          )}
          {track.visibility === 'private' && (
            <Badge variant="muted" className="shrink-0 text-[10px]">
              私密
            </Badge>
          )}
        </span>

        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {track.artist ?? '未知艺术家'}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-dust">
          <span className="font-display">{formatDuration(track.duration)}</span>
          {track.tags.slice(0, 2).map((item) => (
            <span key={item} className="rounded bg-white/[0.06] px-1.5 py-0.5">
              {item}
            </span>
          ))}
          {track.playCount > 0 && (
            <span className="flex items-center gap-1">
              <Music4 className="h-2.5 w-2.5" aria-hidden />
              {track.playCount}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
