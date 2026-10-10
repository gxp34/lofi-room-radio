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
  const liveStation = usePlayerStore((state) => state.liveStation)

  const track = liveStation ? null : (tracks[currentIndex] ?? null)

  /**
   * hls.js 的实例。只在"真的是 HLS 且浏览器原生放不了"时才创建。
   *
   * 为什么要判断原生：Safari（含 iOS 全部浏览器）原生就能放 m3u8，
   * 再套一层 hls.js 反而会出问题。Chrome/Firefox 才需要它。
   */
  const hlsRef = React.useRef<{ destroy: () => void } | null>(null)

  const destroyHls = React.useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy()
      } catch {
        // 销毁失败无所谓，元素马上会被换掉
      }
      hlsRef.current = null
    }
  }, [])

  /** 上一次因为「外星电台」而暂停时的 alienUntil，用来判断效果是否结束 */
  const alienUntil = usePlayerStore((state) => state.alienUntil)
  const [alienActive, setAlienActive] = React.useState(false)

  /* ------------------------------------------------------------------
     1. 换音源：唱片 or 直播流
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    /* ---- 直播流 ---- */
    if (liveStation) {
      if (audio.dataset.streamId === liveStation.id && audio.src) return

      destroyHls()
      audio.dataset.streamId = liveStation.id
      delete audio.dataset.trackId

      /**
       * ⚠️ 直播流必须**去掉 crossOrigin**。
       *
       * 这个元素对唱片一直挂着 crossOrigin="anonymous"（历史原因）。
       * 那个属性一旦存在，浏览器就会用 CORS 模式去取音频 ——
       * 而外面的电台服务器基本不会给 `Access-Control-Allow-Origin`，
       * 结果就是所有直播流都加载失败。
       * 我们只是播放，不做波形分析，本来就不需要 CORS。
       */
      audio.removeAttribute('crossorigin')

      const nativeHls =
        liveStation.format === 'hls' &&
        Boolean(audio.canPlayType('application/vnd.apple.mpegurl'))

      if (liveStation.format === 'hls' && !nativeHls) {
        // 动态 import：只有真的碰到 HLS 频道的访客才会下载 hls.js
        void import('hls.js')
          .then((mod) => {
            const Hls = mod.default
            if (!Hls.isSupported()) throw new Error('这个浏览器不支持 MSE')

            const hls = new Hls({ enableWorker: true })
            hls.loadSource(liveStation.streamUrl)
            hls.attachMedia(audio)
            hlsRef.current = hls
          })
          .catch((error: unknown) => {
            console.warn('[player] HLS 加载失败：', error)
            usePlayerStore.getState().setStreamError('信号丢失：这个台是 HLS，当前浏览器放不了。')
          })
        return
      }

      audio.src = liveStation.streamUrl
      audio.load()
      return
    }

    /* ---- 唱片 ---- */
    destroyHls()
    delete audio.dataset.streamId
    if (audio.dataset.trackId !== undefined) {
      audio.setAttribute('crossorigin', 'anonymous')
    }

    if (!track || !track.audioUrl) {
      audio.removeAttribute('src')
      audio.load()
      return
    }

    if (audio.dataset.trackId === track.id && audio.src) return

    audio.dataset.trackId = track.id
    audio.src = track.audioUrl
    audio.load()
  }, [destroyHls, liveStation, track])

  /* 卸载时一定要销毁 hls 实例，否则它会在后台继续拉分片 */
  React.useEffect(() => destroyHls, [destroyHls])

  /* ------------------------------------------------------------------
     2. 播放 / 暂停
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const source = liveStation ? liveStation.streamUrl : track?.audioUrl
    if (!source) return

    if (!isPlaying) {
      audio.pause()
      return
    }

    const promise = audio.play()
    if (promise) {
      promise.catch((error: unknown) => {
        console.info('[player] 播放被拦下或音源不可用：', error)

        /**
         * ⚠️ 这里必须分清两种失败，第一版没分，结果把"浏览器拦了自动播放"
         * 也显示成「信号丢失」—— 明明流是好的，只是要用户再点一下。
         *
         *   NotAllowedError  = 自动播放策略（用户手势过期、或者浏览器就是不让）
         *                      → 安静地停住，别说信号丢失
         *   其它（NotSupportedError / 网络…）= 流真的放不了
         *                      → 直播报信号丢失；唱片跳下一首
         */
        const name = error instanceof Error ? error.name : ''

        if (name === 'NotAllowedError') {
          usePlayerStore.getState().pause()
          return
        }

        if (usePlayerStore.getState().liveStation) {
          usePlayerStore.getState().setStreamError('信号丢失')
        } else {
          usePlayerStore.getState().pause()
        }
      })
    }
  }, [isPlaying, liveStation, track])

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
     4. 拖动进度条（直播没有进度，直接跳过）
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    const audio = audioRef.current
    if (!audio || seekToken === 0) return
    if (usePlayerStore.getState().liveStation) return

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

    const session = navigator.mediaSession

    /**
     * 直播也要上锁屏信息 —— 否则手机上锁屏之后会一直显示上一首唱片的封面，
     * 明明在听电台却写着别的歌名。直播没有作者和封面，就用站名顶上。
     */
    const title = liveStation ? liveStation.name : track?.title
    if (!title) return

    const artwork = liveStation
      ? liveStation.coverUrl
        ? [{ src: liveStation.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
        : undefined
      : track?.coverUrl
        ? [{ src: track.coverUrl, sizes: '512x512', type: 'image/jpeg' }]
        : undefined

    try {
      session.metadata = new MediaMetadata({
        title,
        artist: liveStation ? liveStation.subtitle : (track?.artist ?? 'Lo-fi 房间电台'),
        album: 'Lo-fi 房间电台',
        artwork,
      })

      session.setActionHandler('play', () => usePlayerStore.getState().play())
      session.setActionHandler('pause', () => usePlayerStore.getState().pause())
      // 直播没有"上一首/下一首/跳转"，这些按钮要摘掉，
      // 否则锁屏上会出现按了没反应的按键
      session.setActionHandler('previoustrack', liveStation ? null : () => usePlayerStore.getState().prev())
      session.setActionHandler('nexttrack', liveStation ? null : () => usePlayerStore.getState().next())
      session.setActionHandler('seekto', liveStation ? null : (details) => {
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
  }, [liveStation, track])

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
      onEnded={() => {
        /**
         * 直播流理论上不该 ended（它是无限长的）。
         * 真的结束了说明对面断流了 —— 这时候不能走 next(true)
         * （那会把唱片跳下一首，很莫名），而是报「信号丢失」。
         */
        if (usePlayerStore.getState().liveStation) {
          usePlayerStore.getState().setStreamError('信号丢失：这个台断流了。')
          return
        }
        usePlayerStore.getState().handleEnded()
      }}
      onError={() => {
        if (usePlayerStore.getState().liveStation) {
          console.warn('[player] 直播流加载失败')
          usePlayerStore.getState().setStreamError('信号丢失')
          return
        }
        // 唱片的音源坏了就跳下一首，别卡死在这里
        console.warn('[player] 音源加载失败，跳到下一首')
        usePlayerStore.getState().next(true)
      }}
      data-alien={alienActive ? 'true' : undefined}
      /*
        ⚠️ 这里**故意不写 crossOrigin**。
        它由上面第 1 个 effect 按音源类型动态设置：
        唱片用 anonymous（Supabase 的存储有 CORS），直播流必须没有 ——
        否则浏览器会拿 CORS 模式去请求电台服务器，而它们基本不给
        Access-Control-Allow-Origin，结果是所有直播都放不出来。
        写成 JSX 属性的话 React 会在重渲染时把它加回去。
      */
    />
  )
}
