import type { Database, Json, Tables } from '@/types/database'
import type {
  AchievementDef,
  Diary,
  EventConditions,
  EventAction,
  GameDef,
  JournalEntry,
  JournalPhoto,
  RoomEvent,
  Track,
  TreeholeMessage,
  TriggerType,
} from '@/types'

/**
 * 数据库行 → 业务对象的转换。
 *
 * 全部写成纯函数，服务端组件和客户端都能用，
 * 也方便以后写单元测试（给定一行数据，必须得到确定的对象）。
 */

/* --------------------------------------------------------------------------
   音乐
   -------------------------------------------------------------------------- */

export interface TrackUrls {
  /** 音频的可播放地址（公开桶是 publicUrl，私密桶是 signedUrl） */
  audioUrl: string
  /** 封面地址 */
  coverUrl: string | null
}

export function rowToTrack(row: Tables<'tracks'>, urls: TrackUrls): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    audioUrl: urls.audioUrl,
    coverUrl: urls.coverUrl,
    audioPath: row.audio_path,
    coverPath: row.cover_path,
    duration: row.duration,
    tags: row.tags ?? [],
    note: row.note,
    visibility: row.visibility,
    sort: row.sort,
    playCount: row.play_count,
    createdAt: row.created_at,
  }
}

/* --------------------------------------------------------------------------
   日记
   -------------------------------------------------------------------------- */

export function rowToDiary(row: Tables<'diaries'>, coverUrl: string | null = null): Diary {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    mood: row.mood,
    weather: row.weather,
    tags: row.tags ?? [],
    coverPath: row.cover_path,
    coverUrl,
    coverPhoto: row.cover_photo,
    textColor: row.text_color,
    visibility: row.visibility,
    sort: row.sort,
    isPinned: row.is_pinned,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* --------------------------------------------------------------------------
   图文手帐
   -------------------------------------------------------------------------- */

export function rowToJournalPhoto(
  row: Tables<'journal_photos'>,
  urls: { url: string; thumbUrl?: string | null },
): JournalPhoto {
  return {
    id: row.id,
    entryId: row.entry_id,
    storagePath: row.storage_path,
    thumbPath: row.thumb_path,
    caption: row.caption,
    sort: row.sort,
    width: row.width,
    height: row.height,
    url: urls.url,
    thumbUrl: urls.thumbUrl || urls.url,
  }
}

export function rowToJournalEntry(
  row: Tables<'diaries'>,
  photos: JournalPhoto[],
  options: { coverUrl?: string | null; isLocked?: boolean } = {},
): JournalEntry {
  return {
    ...rowToDiary(row, options.coverUrl ?? null),
    photos,
    isLocked: options.isLocked ?? row.visibility === 'password',
  }
}

/* --------------------------------------------------------------------------
   树洞
   -------------------------------------------------------------------------- */

export function rowToTreeholeMessage(
  row: Tables<'treehole_messages'>,
  replies: Tables<'treehole_replies'>[] = [],
): TreeholeMessage {
  return {
    id: row.id,
    nickname: row.nickname,
    content: row.content,
    mood: row.mood,
    visibility: row.visibility,
    isApproved: row.is_approved,
    isHidden: row.is_hidden,
    isFlagged: row.is_flagged,
    reportCount: row.report_count,
    createdAt: row.created_at,
    replies: replies.map((reply) => ({
      id: reply.id,
      messageId: reply.message_id,
      content: reply.content,
      isAdmin: reply.is_admin,
      createdAt: reply.created_at,
    })),
  }
}

/* --------------------------------------------------------------------------
   事件
   -------------------------------------------------------------------------- */

/** conditions 是 jsonb，读出来是 unknown，这里规整成 EventConditions */
function parseConditions(value: Json): EventConditions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = value as Record<string, Json | undefined>
  const conditions: EventConditions = {}

  const num = (key: string): number | undefined => {
    const v = raw[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }
  const bool = (key: string): boolean | undefined => {
    const v = raw[key]
    return typeof v === 'boolean' ? v : undefined
  }

  conditions.combo = num('combo')
  conditions.visitedDays = num('visitedDays')
  conditions.consecutiveDays = num('consecutiveDays')
  conditions.minClicks = num('minClicks')
  conditions.requiresLampOn = bool('requiresLampOn')
  conditions.requiresLampOff = bool('requiresLampOff')
  conditions.requiresReturning = bool('requiresReturning')
  conditions.firstVisitOnly = bool('firstVisitOnly')

  const range = raw.hourRange
  if (Array.isArray(range) && range.length === 2) {
    const [start, end] = range
    if (typeof start === 'number' && typeof end === 'number') {
      conditions.hourRange = [start, end]
    }
  }

  const achievements = raw.requiresAchievements
  if (Array.isArray(achievements)) {
    conditions.requiresAchievements = achievements.filter(
      (item): item is string => typeof item === 'string',
    )
  }

  return conditions
}

export function rowToRoomEvent(row: Tables<'events'>): RoomEvent {
  return {
    id: row.id,
    objectType: row.object_type,
    eventKey: row.event_key,
    text: row.text,
    action: (row.action as EventAction | null) ?? null,
    trigger: row.trigger as TriggerType,
    rarity: row.rarity,
    weight: row.weight,
    cooldownSeconds: row.cooldown_seconds,
    once: row.once,
    conditions: parseConditions(row.conditions),
    deepNightOnly: row.deep_night_only,
    consecutiveDays: row.consecutive_days,
    enabled: row.enabled,
    sort: row.sort,
  }
}

/* --------------------------------------------------------------------------
   小游戏
   -------------------------------------------------------------------------- */

export function rowToGame(row: Tables<'games'>): GameDef {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    // config 是 jsonb，读出来是 Json；这里规整成普通对象
    config:
      row.config && typeof row.config === 'object' && !Array.isArray(row.config)
        ? (row.config as Record<string, unknown>)
        : {},
    sort: row.sort,
  }
}

/* --------------------------------------------------------------------------
   成就
   -------------------------------------------------------------------------- */

export function rowToAchievement(row: Tables<'achievements'>): AchievementDef {
  return {
    key: row.key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    secret: row.secret,
    sort: row.sort,
  }
}

/* --------------------------------------------------------------------------
   站点设置
   -------------------------------------------------------------------------- */

/** site_settings 是 key-value 表，这里转成一个好用的对象 */
export function settingsToMap(
  rows: Pick<Tables<'site_settings'>, 'key' | 'value'>[],
): Record<string, Json> {
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

/** 从设置里取字符串；类型不对或没有就返回默认值 */
export function settingString(
  map: Record<string, Json>,
  key: string,
  fallback: string,
): string {
  const value = map[key]
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

/** 从设置里取布尔 */
export function settingBoolean(
  map: Record<string, Json>,
  key: string,
  fallback: boolean,
): boolean {
  const value = map[key]
  return typeof value === 'boolean' ? value : fallback
}

/** 从设置里取 JSON 数组 */
export function settingArray<T>(map: Record<string, Json>, key: string, fallback: T[]): T[] {
  const value = map[key]
  return Array.isArray(value) ? (value as T[]) : fallback
}

/**
 * 从设置里取一个可选的数字（取不到返回 null，**不是** fallback）。
 *
 * 为什么单独有这个：经纬度这类值「没填」和「填了 0」是两回事
 * （经度 0 是格林尼治，是个合法的值）。所以缺行时返回 null，
 * 让调用方去接环境变量的兜底值，而不是硬塞一个默认纬度进去。
 *
 * 数据库里存过 number（后台升级前的写法），表单存的是字符串，两种都认。
 */
export function settingNumber(map: Record<string, Json>, key: string): number | null {
  const value = map[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/** 只是为了让类型检查器知道 Database 被用到了（表名补全依赖它） */
export type Schema = Database['public']
