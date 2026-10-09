'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Disc3,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'

import { cn, formatDuration } from '@/lib/utils'
import { usePlayerStore } from '@/stores/player-store'

/**
 * 常驻底部的播放条。
 *
 * 放在根布局里，所以切页面音乐不会断。
 * 手机上自动收成一行（封面 + 歌名 + 播放键），进度条压成一条细线；
 * 桌面上展开完整控件（随机 / 循环 / 上一首 / 下一首 / 音量）。
 */
export function PlayerBar() {
  const tracks = usePlayerStore((state) => state.tracks)
  const currentIndex = usePlayerStore((state) => state.currentIndex)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const currentTime = usePlayerStore((state) => state.currentTime)
  const duration = usePlayerStore((state) => state.duration)
  const volume = usePlayerStore((state) => state.volume)
  const muted = usePlayerStore((state) => state.muted)
  const shuffle = usePlayerStore((state) => state.shuffle)
  const repeat = usePlayerStore((state) => state.repeat)
  const radioChannel = usePlayerStore((state) => state.radioChannel)
  const glitchUntil = usePlayerStore((state) => state.glitchUntil)

  const hydrated = usePlayerStore((state) => state.hydrated)
  const track = tracks[currentIndex] ?? null
  const openRadio = usePlayerStore((state) => Boolean(state.radioChannel))

  // 挂载前不渲染，避免服务端和客户端不一致
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  /** 跳针效果：进度条会抖一下 */
  const [glitching, setGlitching] = React.useState(false)
  React.useEffect(() => {
    if (glitchUntil <= Date.now()) return
    setGlitching(true)
    const timer = window.setTimeout(() => setGlitching(false), Math.max(0, glitchUntil - Date.now()))
    return () => window.clearTimeout(timer)
  }, [glitchUntil])

  if (!mounted || !hydrated || tracks.length === 0 || !track) return null

  const safeDuration = duration > 0 ? duration : (track.duration ?? 0)
  const progress = safeDuration > 0 ? (currentTime / safeDuration) * 100 : 0

  return (
    <>
      {/* 占位，避免内容被固定条挡住 */}
      <div className="h-24 sm:h-20" aria-hidden />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-night/92 backdrop-blur-md">
        {/* 移动端：一条细进度线 */}
        <div className="h-0.5 w-full bg-white/[0.07] sm:hidden">
          <div
            className="h-full bg-lamp transition-[width] duration-500"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>

        <div className="container flex items-center gap-3 py-2.5 sm:py-3">
          {/* ---------- 左：封面 + 歌名 ---------- */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-roomDeep">
              {track.coverUrl ? (
                <Image
                  src={track.coverUrl}
                  alt={`${track.title} 的封面`}
                  width={40}
                  height={40}
                  className={cn('h-full w-full object-cover', isPlaying && 'animate-vinyl-slow')}
                />
              ) : (
                <Disc3
                  className={cn('h-5 w-5 text-dust', isPlaying && 'animate-vinyl-slow')}
                  aria-hidden
                />
              )}
              {/* 黑胶中间那个小孔 */}
              <span
                aria-hidden
                className="absolute h-1.5 w-1.5 rounded-full bg-night ring-1 ring-white/20"
              />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-xs text-paper sm:text-sm">
                {glitching ? '跳针了…' : openRadio ? '调频中…' : track.title}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {openRadio
                  ? radioChannel
                  : (track.artist ?? '未知艺术家')}
              </p>
            </div>
          </div>

          {/* ---------- 中：桌面端的完整控件 ---------- */}
          <div className="hidden flex-1 flex-col items-center gap-1 sm:flex">
            <div className="flex items-center gap-1">
              <ControlButton
                label={shuffle ? '取消随机播放' : '随机播放'}
                active={shuffle}
                onClick={() => usePlayerStore.getState().setShuffle(!shuffle)}
              >
                <Shuffle className="h-4 w-4" />
              </ControlButton>

              <ControlButton label="上一首" onClick={() => usePlayerStore.getState().prev()}>
                <SkipBack className="h-4 w-4" />
              </ControlButton>

              <button
                type="button"
                onClick={() => usePlayerStore.getState().toggle()}
                aria-label={isPlaying ? '暂停' : '播放'}
                className="mx-1 flex h-9 w-9 items-center justify-center rounded-full bg-lamp text-night transition-transform hover:scale-105 active:scale-95"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="ml-0.5 h-4 w-4" />
                )}
              </button>

              <ControlButton label="下一首" onClick={() => usePlayerStore.getState().next()}>
                <SkipForward className="h-4 w-4" />
              </ControlButton>

              <ControlButton
                label={
                  repeat === 'off' ? '循环播放' : repeat === 'all' ? '单曲循环' : '关闭循环'
                }
                active={repeat !== 'off'}
                onClick={() =>
                  usePlayerStore
                    .getState()
                    .setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')
                }
              >
                {repeat === 'one' ? (
                  <Repeat1 className="h-4 w-4" />
                ) : (
                  <Repeat className="h-4 w-4" />
                )}
              </ControlButton>
            </div>

            {/* 进度条 */}
            <div className="flex w-full max-w-md items-center gap-2">
              <span className="w-10 shrink-0 text-right font-display text-[10px] text-dust">
                {formatDuration(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(safeDuration))}
                step={1}
                value={Math.min(Math.floor(currentTime), Math.floor(safeDuration))}
                onChange={(event) => usePlayerStore.getState().seek(Number(event.target.value))}
                aria-label="播放进度"
                className={cn(
                  'h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-lamp',
                  glitching && 'animate-flicker',
                )}
              />
              <span className="w-10 shrink-0 font-display text-[10px] text-dust">
                {formatDuration(safeDuration)}
              </span>
            </div>
          </div>

          {/* ---------- 右：手机播放键 + 桌面音量 ---------- */}
          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
            <button
              type="button"
              onClick={() => usePlayerStore.getState().toggle()}
              aria-label={isPlaying ? '暂停' : '播放'}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-lamp text-night sm:hidden"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
            </button>

            <Link
              href="/music"
              className="hidden rounded-md px-2 py-1 font-display text-xs text-dust transition-colors hover:text-lamp lg:block"
            >
              唱片架
            </Link>

            <div className="hidden items-center gap-1.5 sm:flex">
              <button
                type="button"
                onClick={() => usePlayerStore.getState().toggleMute()}
                aria-label={muted ? '取消静音' : '静音'}
                className="rounded p-1 text-dust transition-colors hover:text-paper"
              >
                {muted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : volume < 0.5 ? (
                  <Volume1 className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round((muted ? 0 : volume) * 100)}
                onChange={(event) =>
                  usePlayerStore.getState().setVolume(Number(event.target.value) / 100)
                }
                aria-label="音量"
                className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/15 accent-lamp"
              />
            </div>

            {/* 手机端：进度（极小） */}
            <span className="shrink-0 font-display text-[10px] text-dust sm:hidden">
              {formatDuration(currentTime)}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

function ControlButton({
  children,
  label,
  active = false,
  onClick,
}: {
  children: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
        active ? 'text-lamp' : 'text-dust hover:text-paper',
      )}
    >
      {children}
    </button>
  )
}
