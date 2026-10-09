'use client'

import * as React from 'react'

import { useRoom } from '@/components/providers/room-provider'
import { PLAY_REMINDER_MS } from '@/lib/constants'
import { isDeepNight } from '@/lib/utils'
import { consecutiveDays, readVisits } from '@/lib/visits'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { useAchievementStore } from '@/stores/achievement-store'
import { useEventStore } from '@/stores/event-store'
import { usePlayerStore } from '@/stores/player-store'

/**
 * 全站唯一的 <audio> 元素。
 *
 * 为什么只放一个、而且放在根布局：切页面时音乐不能断。
 * 所有播放控制都写进 player-store，这里只负责「把状态变成声音」，
 * 再把 audio 的事件回写进 store —— 单向数据流，不会出现两个真相。
 *
 * 顺带承担三件事：
 *   - Media Session（手机锁屏能看到歌名和封面）
 *   - 40 分钟休息提醒
 *   - 播放中的随机事件（跳针、猫选曲……）
 */
export function AudioEngine() {
  const { triggerEvent } = useRoom()

  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = React.useRef<string | null>(null)

  const tracks = usePlayerStore((state) => state.tracks)
  const currentIndex = usePlayerStore((state) => state.currentIndex)
  const isPlaying = usePlayerStore((state) => state.isPlaying)
  const volume = usePlayerStore((state) => state.volume)
  const muted = usePlayerStore((state) => state.muted)
  const seekToken = usePlayerStore((state) => state.seekToken)

  const track = tracks[currentIndex] ?? null

  /** 上一次因为「外星电台」而暂停时的 alienUntil，用来判断效果是否结束 */
  const alienUntil = usePlayerStore((state) => state.alienUntil)
  const [alienActive, setAlienActive] = React.useState(false)

  /* ------------------------------------------------------------------
     1. 换歌：设置音源
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (!track || !track.audioUrl) {
      audio.removeAttribute('src')
      audio.load()
      return
    }

    if (audio.dataset.trackId === track.id && audio.src) return

    audio.dataset.trackId = track.id
    audio.src = track.audioUrl
    audio.load()
  }, [track])

  /* ------------------------------------------------------------------
     2. 播放 / 暂停
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio || !track?.audioUrl) return

    if (!isPlaying) {
      audio.pause()
      return
    }

    const promise = audio.play()
    if (promise) {
      promise.catch((error: unknown) => {
        // 浏览器拦截（用户还没交互过）或音源有问题：安静地停住，不要弹错误
        console.info('[player] 播放被拦下或音源不可用：', error)
        usePlayerStore.getState().pause()
      })
    }
  }, [isPlaying, track])

  /* ------------------------------------------------------------------
     3. 音量
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = Math.min(Math.max(muted ? 0 : volume, 0), 1)
    audio.muted = muted
  }, [volume, muted])

  /* ------------------------------------------------------------------
     4. 拖动进度条
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio || seekToken === 0) return

    const target = usePlayerStore.getState().currentTime
    if (Number.isFinite(target) && Math.abs(audio.currentTime - target) > 0.4) {
      try {
        audio.currentTime = target
      } catch {
        // 有些浏览器在 metadata 还没加载时不允许设置 currentTime
      }
    }
  }, [seekToken])

  /* ------------------------------------------------------------------
     5. 外星电台：5 秒噪音期间不播音乐
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    if (alienUntil === 0) return

    setAlienActive(true)
    audioRef.current?.pause()

    const timer = window.setTimeout(() => {
      setAlienActive(false)
      usePlayerStore.getState().clearEffects()
    }, Math.max(0, alienUntil - Date.now()))

    return () => window.clearTimeout(timer)
  }, [alienUntil])

  /* ------------------------------------------------------------------
     6. Media Session：手机锁屏 / 耳机线控
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (!track) return

    const session = navigator.mediaSession

    const artwork = track.coverUrl
      ? [{ src: track.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
      : undefined

    try {
      session.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist ?? 'Lo-fi 房间电台',
        album: 'Lo-fi 房间电台',
        artwork,
      })

      session.setActionHandler('play', () => usePlayerStore.getState().play())
      session.setActionHandler('pause', () => usePlayerStore.getState().pause())
      session.setActionHandler('previoustrack', () => usePlayerStore.getState().prev())
      session.setActionHandler('nexttrack', () => usePlayerStore.getState().next())
      session.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') {
          usePlayerStore.getState().seek(details.seekTime)
        }
      })
    } catch (error) {
      console.info('[player] Media Session 不可用：', error)
    }

    return () => {
      try {
        session.setActionHandler('play', null)
        session.setActionHandler('pause', null)
        session.setActionHandler('previoustrack', null)
        session.setActionHandler('nexttrack', null)
        session.setActionHandler('seekto', null)
      } catch {
        // 忽略
      }
    }
  }, [track])

  React.useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])

  /* ------------------------------------------------------------------
     7. 累计收听时长 + 40 分钟提醒
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    if (!isPlaying) return

    const timer = window.setInterval(() => {
      const store = usePlayerStore.getState()
      store.addListeningTime(5000)

      const state = usePlayerStore.getState()
      if (state.listeningMs >= PLAY_REMINDER_MS && !state.restReminded) {
        state.markRestReminded()
        state.pause()
        useEventStore
          .getState()
          .pushToast('已经连着听了四十分钟。起来倒杯水吧。', 'common', 'record')
      }
    }, 5000)

    return () => window.clearInterval(timer)
  }, [isPlaying])

  /* ------------------------------------------------------------------
     8. 播放中的随机事件（跳针、猫选曲、这首歌适合凌晨两点……）
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    if (!isPlaying) return

    let timer: number | undefined

    const schedule = () => {
      const delay = 90_000 + Math.random() * 70_000
      timer = window.setTimeout(() => {
        if (usePlayerStore.getState().isPlaying) {
          triggerEvent('record', 'random')
        }
        schedule()
      }, delay)
    }

    schedule()
    return () => {
      if (timer) window.clearTimeout(timer)
    }
  }, [isPlaying, triggerEvent])

  /* ------------------------------------------------------------------
     9. 深夜自动切到「深夜」歌单 + 听歌成就
     ------------------------------------------------------------------ */
  const nightAppliedRef = React.useRef(false)

  React.useEffect(() => {
    if (tracks.length === 0 || nightAppliedRef.current) return
    if (!isDeepNight()) return

    nightAppliedRef.current = true

    const nightSongs = tracks.filter((item) => item.tags.includes('深夜'))
    if (nightSongs.length === 0 || nightSongs.length === tracks.length) return

    const others = tracks.filter((item) => !item.tags.includes('深夜'))
    usePlayerStore.getState().setTracks([...nightSongs, ...others])

    useEventStore
      .getState()
      .pushToast('这个点，自动换成「深夜」那几张。', 'common', 'record')
  }, [tracks])

  /* 每换一首歌就顺手判一次成就（黑胶旅人 = 听满 10 首） */
  React.useEffect(() => {
    if (!track) return

    const achievements = useAchievementStore.getState()
    const visits = readVisits()

    achievements.evaluate({
      objectType: 'record',
      clickCount: useEventStore.getState().clickCount,
      tracksPlayed: achievements.playedTrackIds.length,
      visits,
      streak: consecutiveDays(visits.days),
      treeholeCount: achievements.treeholeCount,
    })
  }, [track])

  /* ------------------------------------------------------------------
     10. 播放计数：一首歌每被真正播一次，就给它的 play_count +1
     ------------------------------------------------------------------ */
  const countedTrackRef = React.useRef<string | null>(null)

  const countPlay = React.useCallback(() => {
    const current = usePlayerStore.getState()
    const playing = current.tracks[current.currentIndex]
    if (!playing) return
    // 演示曲目不在数据库里，没有可以累加的行
    if (playing.isDemo) return
    // 同一首歌只在「换歌」之后计一次，暂停再播不会重复计
    if (countedTrackRef.current === playing.id) return

    countedTrackRef.current = playing.id

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    void supabase.rpc('increment_play_count', { p_track_id: playing.id }).then(({ error }) => {
      if (error) console.info('[player] 播放计数失败（不影响播放）：', error.message)
    })
  }, [])

  /* ------------------------------------------------------------------
     11. 组件卸载时释放 Blob 地址（演示音源用过就回收）
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [])

  return (
    <audio
      ref={audioRef}
      preload="metadata"
      crossOrigin="anonymous"
      className="hidden"
      aria-hidden
      onPlay={countPlay}
      onTimeUpdate={(event) => {
        const audio = event.currentTarget
        usePlayerStore.getState().syncProgress(audio.currentTime, audio.duration)
      }}
      onLoadedMetadata={(event) => {
        const audio = event.currentTarget
        usePlayerStore.getState().syncProgress(audio.currentTime, audio.duration)
      }}
      onEnded={() => usePlayerStore.getState().handleEnded()}
      onError={() => {
        // 音源坏了就跳下一首，别卡死在这里
        console.warn('[player] 音源加载失败，跳到下一首')
        usePlayerStore.getState().next(true)
      }}
      data-alien={alienActive ? 'true' : undefined}
    />
  )
}
