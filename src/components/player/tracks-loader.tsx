'use client'

import * as React from 'react'

import { isSupabaseConfigured } from '@/lib/env'
import { DEMO_TRACKS } from '@/lib/demo-tracks'
import { rowToTrack } from '@/lib/mappers'
import { STORAGE_BUCKETS } from '@/lib/constants'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { usePlayerStore } from '@/stores/player-store'
import type { Track } from '@/types'

/**
 * 歌单加载器。
 *
 * 放在根布局里，所以任何页面都能直接放歌（在房间里戳唱片机也算）。
 *
 * 三条路径：
 *   1. 公开歌曲 —— 浏览器直接查表，音频走 public-music 的 publicUrl；
 *   2. 私密歌曲 —— 只有站长登录后才查得到（RLS 兜底），
 *      音频路径交给 /api/music/signed-urls 签一个 1 小时的临时地址；
 *   3. 没配 Supabase —— 什么都不做，歌单保持为空（唱片架会显示演示提示）。
 */
export function TracksLoader() {
  const setTracks = usePlayerStore((state) => state.setTracks)
  const loadedRef = React.useRef(false)

  React.useEffect(() => {
    if (loadedRef.current) return

    // 情况一：还没配 Supabase —— 直接用内置的演示曲目，让播放器有东西可放
    if (!isSupabaseConfigured) {
      loadedRef.current = true
      setTracks(DEMO_TRACKS)
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    loadedRef.current = true

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('tracks')
          .select('*')
          .order('sort', { ascending: true })
          .order('created_at', { ascending: false })

        if (error) throw error

        // 情况二：连上了数据库，但架子上还空着 —— 还是给三段演示曲目垫着
        if (!data || data.length === 0) {
          setTracks(DEMO_TRACKS)
          return
        }

        // 1. 先用公开地址拼一版（公开桶的音频、封面的公开地址）
        const partial: Track[] = data.map((row) =>
          rowToTrack(row, {
            audioUrl: supabase.storage.from(STORAGE_BUCKETS.publicMusic).getPublicUrl(row.audio_path)
              .data.publicUrl,
            coverUrl: row.cover_path
              ? supabase.storage.from(STORAGE_BUCKETS.covers).getPublicUrl(row.cover_path).data
                  .publicUrl
              : null,
          }),
        )

        // 2. 私密歌曲：请服务端签发临时地址
        const privatePaths = partial
          .filter((track) => track.visibility === 'private')
          .map((track) => track.audioPath)

        if (privatePaths.length > 0) {
          try {
            const response = await fetch('/api/music/signed-urls', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paths: privatePaths }),
            })

            if (response.ok) {
              const payload = (await response.json()) as {
                ok: boolean
                urls?: Record<string, string>
              }
              const urls = payload.urls ?? {}

              for (const track of partial) {
                const signed = urls[track.audioPath]
                if (signed) track.audioUrl = signed
              }
            }
          } catch (error) {
            // 签名失败不影响公开歌曲，静默跳过
            console.info('[tracks] 私密音频签名失败：', error)
          }
        }

        // 过滤掉拿不到地址的（比如私密歌曲但没登录）
        const usable = partial.filter((track) => Boolean(track.audioUrl))

        if (usable.length > 0) {
          setTracks(usable)
        }
      } catch (error) {
        console.warn('[tracks] 读取歌单失败：', error)
      }
    })()
  }, [setTracks])

  return null
}
