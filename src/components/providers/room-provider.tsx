'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { DEFAULT_ACHIEVEMENTS, DEFAULT_SITE_SETTINGS, GLOBAL_EVENT_MIN_MS, GLOBAL_EVENT_MAX_MS } from '@/lib/constants'
import { resolveEvent, type EventLedger } from '@/lib/events/engine'
import { DEFAULT_EVENT_POOL } from '@/lib/events/pool'
import { playSfx } from '@/lib/audio/sfx'
import { isSupabaseConfigured } from '@/lib/env'
import {
  rowToAchievement,
  rowToRoomEvent,
  settingArray,
  settingBoolean,
  settingNumber,
  settingString,
  settingsToMap,
} from '@/lib/mappers'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { consecutiveDays, touchVisit } from '@/lib/visits'
import { useAchievementStore } from '@/stores/achievement-store'
import { useEventStore } from '@/stores/event-store'
import { BACK_TEXTS, useJournalStore } from '@/stores/journal-store'
import { usePlayerStore } from '@/stores/player-store'
import { useRoomStore } from '@/stores/room-store'
import type {
  EventAction,
  EventContext,
  EventResolution,
  RoomEvent,
  SiteSettings,
  SocialLink,
  TriggerType,
  VisitRecord,
} from '@/types'

/**
 * 房间的总调度。
 *
 * 它负责三件事：
 *   1. 页面一打开就把 localStorage 里的东西恢复出来，并记一次访问；
 *   2. 提供 triggerEvent()：任何物件被点，都走这里查事件、放动画、发成就；
 *   3. 空闲时每 3–10 分钟抛一条全局随机事件（猫叫、灯泡闪、车灯扫过……）。
 *
 * 之所以放在 Provider 而不是各个组件里：事件会产生副作用
 * （换歌、跳页面、让猫消失三秒），这些必须只有一个地方说了算。
 */

interface RoomContextValue {
  /** 当前可用的事件池（数据库优先，读不到就用内置的） */
  events: RoomEvent[]
  /** 站点设置（后台可改；读不到用内置默认值） */
  settings: SiteSettings
  /** 是否已经完成本地状态恢复 */
  ready: boolean
  /**
   * 触发一次事件。
   * @param objectType 物件 id，例如 'lamp' / 'cat' / 'record'，全局事件用 'global'
   * @param trigger    触发方式
   * @param overrides  覆盖上下文（例如告诉引擎「台灯现在是关着的」）
   */
  triggerEvent: (
    objectType: string,
    trigger: TriggerType,
    overrides?: Partial<EventContext>,
  ) => EventResolution
}

const RoomContext = React.createContext<RoomContextValue | null>(null)

/** 取房间上下文；必须在 <RoomProvider> 里用 */
export function useRoom(): RoomContextValue {
  const context = React.useContext(RoomContext)
  if (!context) {
    throw new Error('useRoom() 必须在 <RoomProvider> 内部使用')
  }
  return context
}

/** 环境音 / 音效的随机小工具 */
function pickOne<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T
}

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  const [events, setEvents] = React.useState<RoomEvent[]>(DEFAULT_EVENT_POOL)
  const [settings, setSettings] = React.useState<SiteSettings>(DEFAULT_SITE_SETTINGS)
  const [ready, setReady] = React.useState(false)
  /** 访问记录放在 ref 里，避免每次触发事件都读一遍 localStorage */
  const visitsRef = React.useRef<VisitRecord | null>(null)
  const eventsRef = React.useRef<RoomEvent[]>(DEFAULT_EVENT_POOL)

  React.useEffect(() => {
    eventsRef.current = events
  }, [events])

  /* ------------------------------------------------------------------
     1a. 本地状态恢复 + 记一次访问
     ------------------------------------------------------------------ */
  /**
   * 为什么要用 ref 挡一道：
   * 开发模式下 React StrictMode 会把 effect 跑两遍（挂载 → 卸载 → 再挂载）。
   * 不挡的话 touchVisit() 会被调用两次，第一次来的人被记成「第 2 次」，
   * 新手问候就被跳过、直接变成「你又来了」。
   */
  const initializedRef = React.useRef(false)

  React.useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const room = useRoomStore.getState()
    const eventStore = useEventStore.getState()
    const achievements = useAchievementStore.getState()
    const player = usePlayerStore.getState()

    room.hydrate()
    eventStore.hydrate()
    achievements.hydrate()
    player.hydrate()

    // 记一次访问（同一天只算一天，visits 会累加）
    visitsRef.current = touchVisit()

    setReady(true)
  }, [])

  /* ------------------------------------------------------------------
     1b. 有 Supabase 的话，从数据库拉事件池 / 成就定义 / 站点设置
     ------------------------------------------------------------------
     单独一个 effect，是因为它**故意不**受上面那个 ref 保护：
     写状态的操作要幂等（跑一次就够），而读数据库是幂等的（多跑一次没关系）。
     如果把它塞进带 ref 的那段里，StrictMode 第一次卸载时取消掉的请求会连累第二次 ——
     结果就是开发模式下事件池永远加载不出来。
  */
  React.useEffect(() => {
    if (!isSupabaseConfigured) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    let cancelled = false

    void (async () => {
      try {
        const [eventsResult, achievementsResult, settingsResult] = await Promise.all([
          supabase.from('events').select('*').eq('enabled', true).order('sort'),
          supabase.from('achievements').select('*').order('sort'),
          supabase.from('site_settings').select('key, value'),
        ])

        if (cancelled) return

        if (!eventsResult.error && eventsResult.data && eventsResult.data.length > 0) {
          setEvents(eventsResult.data.map(rowToRoomEvent))
        }

        if (!achievementsResult.error && achievementsResult.data?.length) {
          useAchievementStore
            .getState()
            .setDefinitions(achievementsResult.data.map(rowToAchievement))
        }

        if (!settingsResult.error && settingsResult.data?.length) {
          setSettings((previous) => mergeSiteSettings(settingsResult.data ?? [], previous))
        }
      } catch (error) {
        console.warn('[room] 读取数据库配置失败，改用内置配置：', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  /* ------------------------------------------------------------------
     2. 副作用执行器
     ------------------------------------------------------------------ */
  const runAction = React.useCallback(
    (action: EventAction | null) => {
      const room = useRoomStore.getState()
      const player = usePlayerStore.getState()

      switch (action) {
        /* ---- 台灯 ---- */
        case 'toggle_lamp': {
          room.toggleLights()
          void playSfx('click')
          break
        }
        case 'lamp_on': {
          room.setLights('on')
          void playSfx('click')
          break
        }
        case 'lamp_off': {
          room.setLights('off')
          void playSfx('click')
          break
        }
        case 'lamp_moon': {
          // 月光色持续 10 秒，然后自己变回来
          room.setLights('moon')
          window.setTimeout(() => {
            if (useRoomStore.getState().lights === 'moon') {
              useRoomStore.getState().setLights('on')
            }
          }, 10_000)
          break
        }
        case 'power_trip': {
          // 跳闸：黑屏 3 秒，只剩猫眼和电脑屏幕
          room.setPowerTrip(true)
          room.setLights('off')
          window.setTimeout(() => {
            useRoomStore.getState().setPowerTrip(false)
          }, 3000)
          break
        }

        /* ---- 猫 ---- */
        case 'cat_purr': {
          void playSfx('purr')
          break
        }
        case 'cat_leave': {
          room.setCatPresent(false)
          window.setTimeout(() => {
            useRoomStore.getState().setCatPresent(true)
          }, 3000)
          break
        }
        case 'cat_gift': {
          void playSfx('click')
          break
        }
        case 'cat_key': {
          // 隐藏抽屉：第三批会在后台加「隐藏抽屉」内容，这里先把声音和状态给上
          void playSfx('click')
          break
        }
        case 'cat_glitch': {
          // 猫踩键盘：往日记里插一行乱码（日记页会读到）
          room.setDiaryGlitch("asdfghjkl;'")
          break
        }

        /* ---- 唱片机 ---- */
        case 'record_play_pause': {
          player.toggle()
          break
        }
        case 'record_next': {
          player.next()
          break
        }
        case 'record_radio': {
          const channel = usePlayerStore.getState().tuneRadio()
          void playSfx('static')
          useEventStore.getState().pushToast(channel, 'common', 'record')
          break
        }
        case 'record_glitch': {
          usePlayerStore.getState().stutter(2400)
          void playSfx('crackle')
          break
        }
        case 'record_alien': {
          usePlayerStore.getState().playAlien(5000)
          void playSfx('static')
          break
        }

        /* ---- 图文手帐 ---- */
        case 'journal_paw': {
          // 猫踩到手帐：页面上盖一枚爪印
          useJournalStore.getState().triggerPaw()
          void playSfx('page')
          break
        }
        case 'journal_photo_fall': {
          // 翻页掉出一张旧照片
          useJournalStore.getState().triggerPhotoFall()
          void playSfx('page')
          break
        }
        case 'journal_photo_back': {
          // 照片背面有字：随机挑一句
          const text = BACK_TEXTS[Math.floor(Math.random() * BACK_TEXTS.length)] ?? BACK_TEXTS[0]
          useJournalStore.getState().triggerBackText(text)
          break
        }
        case 'journal_dim': {
          // 雨夜照片变暗：暗一阵子自己恢复
          useJournalStore.getState().triggerDim()
          break
        }
        case 'journal_old_find': {
          // 抽屉里翻出旧手帐：前台会把最旧的一篇高亮出来
          useJournalStore.getState().triggerOldFind()
          void playSfx('page')
          break
        }

        /* ---- 环境 ---- */
        case 'rain_change': {
          room.setRain(pickOne(['light', 'normal', 'heavy'] as const))
          break
        }
        case 'light_flicker': {
          room.triggerAmbient('light_flicker')
          break
        }
        case 'car_light': {
          room.triggerAmbient('car_light')
          break
        }
        case 'phone_buzz': {
          room.triggerAmbient('phone_buzz')
          break
        }
        case 'notes_fall': {
          room.triggerAmbient('notes_fall')
          break
        }
        case 'moon_move': {
          room.triggerAmbient('moon_move')
          break
        }

        /* ---- 跳转 ---- */
        case 'open_music':
          router.push('/music')
          break
        case 'open_diary':
        case 'open_journal':
          router.push('/journal')
          break
        case 'open_treehole':
          router.push('/treehole')
          break
        case 'open_games':
          router.push('/games')
          break
        case 'open_about':
          router.push('/about')
          break

        default:
          break
      }
    },
    [router],
  )

  /* ------------------------------------------------------------------
     3. 触发事件
     ------------------------------------------------------------------ */
  const triggerEvent = React.useCallback<RoomContextValue['triggerEvent']>(
    (objectType, trigger, overrides = {}) => {
      const eventStore = useEventStore.getState()
      const achievementStore = useAchievementStore.getState()
      const room = useRoomStore.getState()

      // 事件可能在任何一次点击里发生，所以这里兜一下底：没 hydrate 就先 hydrate
      if (!eventStore.hydrated) eventStore.hydrate()
      if (!achievementStore.hydrated) achievementStore.hydrate()
      if (!visitsRef.current) visitsRef.current = touchVisit()

      const visits = visitsRef.current
      const now = overrides.now ?? new Date()

      const ledger: EventLedger = {
        fired: eventStore.fired,
        cooldowns: eventStore.cooldowns,
      }

      const context: EventContext = {
        objectType,
        trigger,
        combo: overrides.combo,
        visitedDays: visits.days.length,
        consecutiveDays: consecutiveDays(visits.days, now),
        visits: visits.visits,
        clickCount: eventStore.clickCount,
        lampOn: overrides.lampOn ?? room.lights === 'on',
        unlockedAchievements: Object.keys(achievementStore.unlocked),
        now,
        ...overrides,
      }

      const resolution = resolveEvent(context, ledger, {
        // 点击类必须有反馈；随机 / 全局类允许安静
        allowSilence: trigger === 'random' || trigger === 'global',
        pool: eventsRef.current,
      })

      if (resolution.event && resolution.text) {
        eventStore.commitEvent(resolution.event, now)
        eventStore.pushToast(resolution.text, resolution.rarity ?? 'common', objectType)
        runAction(resolution.action)
      }

      // 每次交互都顺手判一次成就（纯函数，很便宜）
      achievementStore.evaluate({
        eventKey: resolution.event?.eventKey ?? null,
        action: resolution.action,
        rarity: resolution.rarity,
        objectType,
        clickCount: eventStore.clickCount,
        tracksPlayed: achievementStore.playedTrackIds.length,
        visits,
        streak: context.consecutiveDays,
        treeholeCount: achievementStore.treeholeCount,
        now,
      })

      return resolution
    },
    [runAction],
  )

  /* ------------------------------------------------------------------
     4. 进门的问候：第一次来 / 又来了 / 深夜还醒着
     ------------------------------------------------------------------ */
  const greetedRef = React.useRef(false)
  React.useEffect(() => {
    if (!ready || greetedRef.current) return
    greetedRef.current = true

    // 先试「第一次来」，没命中再试「深夜」
    const first = triggerEvent('global', 'first')
    if (first.silent) {
      triggerEvent('global', 'night')
    }
  }, [ready, triggerEvent])

  /* ------------------------------------------------------------------
     5. 全局随机事件：每 3–10 分钟一条
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    if (!ready) return

    let timer: number | undefined
    let stopped = false

    const scheduleNext = () => {
      const delay =
        GLOBAL_EVENT_MIN_MS + Math.random() * (GLOBAL_EVENT_MAX_MS - GLOBAL_EVENT_MIN_MS)
      timer = window.setTimeout(() => {
        if (stopped) return
        // 页面切到后台时不打扰（省电，也避免回来一堆气泡）
        if (document.visibilityState === 'visible') {
          triggerEvent('global', 'global')
        }
        scheduleNext()
      }, delay)
    }

    scheduleNext()

    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
    }
  }, [ready, triggerEvent])

  const value = React.useMemo<RoomContextValue>(
    () => ({ events, settings, ready, triggerEvent }),
    [events, settings, ready, triggerEvent],
  )

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
}

/**
 * 把数据库里的 key-value 设置合并到默认值上。
 * 数据库里没有的键保持默认，类型不对的也保持默认 —— 不会因为一条脏数据把页面搞坏。
 */
function mergeSiteSettings(
  rows: Array<{ key: string; value: unknown }>,
  fallback: SiteSettings,
): SiteSettings {
  const map = settingsToMap(rows as Array<{ key: string; value: never }>)

  return {
    roomName: settingString(map, 'room_name', fallback.roomName),
    hostName: settingString(map, 'host_name', fallback.hostName),
    tagline: settingString(map, 'tagline', fallback.tagline),
    about: settingString(map, 'about', fallback.about),
    weather: settingString(map, 'weather', fallback.weather),
    weatherNote: settingString(map, 'weather_note', fallback.weatherNote),
    backgroundAudio:
      typeof map.background_audio === 'string' ? (map.background_audio as string) : fallback.backgroundAudio,
    announcement:
      typeof map.announcement === 'string' ? (map.announcement as string) : fallback.announcement,
    socialLinks: settingArray<SocialLink>(map, 'social_links', fallback.socialLinks),
    gamesEnabled: settingBoolean(map, 'games_enabled', fallback.gamesEnabled),
    treeholeNotice: settingString(map, 'treehole_notice', fallback.treeholeNotice),
    treeholeBannedWords: settingArray<string>(
      map,
      'treehole_banned_words',
      fallback.treeholeBannedWords,
    ),
    musicCopyrightNotice: settingString(
      map,
      'music_copyright_notice',
      fallback.musicCopyrightNotice,
    ),
    musicNightTag: settingString(map, 'music_night_tag', fallback.musicNightTag),
    shelfNote: settingString(map, 'shelf_note', fallback.shelfNote),
    // ---- 外部数据源 ----
    // 开关走 settingBoolean（缺行 → 返回 fallback，也就是默认 true）。
    // 经纬度在数据库里可能是 number（后台存过）也可能是 '' （表单清空过），
    // 所以用 settingNumber 兜两种，认不出就 null，让 env.server 的兜底值接手。
    weatherEnabled: settingBoolean(map, 'weather_enabled', fallback.weatherEnabled),
    weatherCity: settingString(map, 'weather_city', '') || null,
    weatherLat: settingNumber(map, 'weather_lat'),
    weatherLon: settingNumber(map, 'weather_lon'),
    dailyQuoteEnabled: settingBoolean(map, 'daily_quote_enabled', fallback.dailyQuoteEnabled),
    dailyQuoteOverride: settingString(map, 'daily_quote_override', '') || null,
    // 星空图开关。key 名必须与后台 settings-form.tsx / lib/admin/settings.ts
    // 的 toRows() / admin settings 页的 mergeSettings() 完全一致，
    // 否则前台会静默退回默认值（默认是开）。
    celestialEnabled: settingBoolean(map, 'celestial_enabled', fallback.celestialEnabled),
    // ---- 实时电台 ----
    // 这三个 key 必须和 lib/external/radio-settings.ts 里读的完全一致，
    // 否则后台改了前台不生效（而且是静默的）。
    radioEnabled: settingBoolean(map, 'radio_enabled', fallback.radioEnabled),
    radioChannels: settingString(map, 'radio_channels', ''),
    radioDefaultChannel: settingString(
      map,
      'radio_default_channel',
      fallback.radioDefaultChannel,
    ),
  }
}

export { DEFAULT_ACHIEVEMENTS }
