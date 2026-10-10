/**
 * 领域类型：前台/后台共用。
 * 数据库原始行类型在 ./database.ts，这里放「加工过、带业务含义」的类型。
 */

import type {
  DiaryVisibilityDb,
  TreeholeVisibilityDb,
  TrackVisibilityDb,
  Tables,
  EventRarityDb,
  EventTriggerDb,
} from './database'

export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
  DbFunctions,
  UserRole,
} from './database'

/* ==========================================================================
   1. 基础枚举
   ========================================================================== */

/** 歌曲可见性（与数据库一致，另起别名方便业务层读） */
export type TrackVisibility = TrackVisibilityDb
/** 日记可见性 */
export type DiaryVisibility = DiaryVisibilityDb
/** 树洞可见范围 */
export type TreeholeVisibility = TreeholeVisibilityDb
/** 事件稀有度 */
export type Rarity = EventRarityDb
/** 事件触发方式 */
export type TriggerType = EventTriggerDb

/** 唱片架标签 */
export type TrackTag = '深夜' | '雨' | '通勤' | '开心' | '难过' | '随便听听'

/** 小游戏 slug */
export type GameSlug =
  | '2048'
  | 'snake'
  | 'memory'
  | 'tarot'
  | 'puzzle'
  | 'radio'
  | 'fishing'
  | 'virtual-cat'

/* ==========================================================================
   2. 导航与房间物件
   ========================================================================== */

export interface NavItem {
  href: string
  /** 中文名，如「书桌手记」 */
  label: string
  /** lucide-react 的图标名 */
  icon: string
  description?: string
}

/** 房间分区：墙 / 桌子 / 架子 / 地面 */
export type RoomZone = 'wall' | 'desk' | 'shelf' | 'sofa' | 'floor'

export interface RoomObject {
  /** 唯一 id，与 events.object_type 对应 */
  id: string
  name: string
  /** lucide-react 图标名 */
  icon: string
  /** 手机端 / 兜底用的 emoji */
  emoji: string
  /** 桌面端全景中的百分比坐标 */
  position: { x: number; y: number }
  /** 鼠标悬停时的小提示 */
  hint: string
  zone: RoomZone
  /**
   * 点它就去的页面。
   * 有 link 的物件是「门」—— 点完既会弹事件气泡，也会跳过去
   * （气泡是全局的，跳页之后还在，所以两件事不冲突）。
   */
  link?: string
}

/* ==========================================================================
   3. 选项类型
   ========================================================================== */

export interface MoodOption {
  value: string
  label: string
  emoji: string
}

export interface WeatherOption {
  value: string
  label: string
  emoji: string
}

/* ==========================================================================
   4. 音乐
   ========================================================================== */

/** 前台播放器用的歌曲对象（已经把存储路径解析成可播放的 URL） */
export interface Track {
  id: string
  title: string
  artist: string | null
  /** 可直接放进 <audio src> 的地址（私密歌曲是带签名的临时地址） */
  audioUrl: string
  /** 封面地址，没有就返回 null，前端显示默认黑胶 */
  coverUrl: string | null
  /** 存储桶内的原始路径，后台编辑时用 */
  audioPath: string
  coverPath: string | null
  duration: number | null
  /** 标签：常用的是 TrackTag 里那几种，但也允许自定义 */
  tags: string[]
  note: string | null
  visibility: TrackVisibility
  sort: number
  playCount: number
  createdAt: string
  /** 是不是内置的演示曲目（程序合成、无版权，上传第一首真歌后会自动消失） */
  isDemo?: boolean
}

export interface TrackFormValues {
  title: string
  artist: string
  tags: string[]
  note: string
  visibility: TrackVisibility
  sort: number
}

/* ==========================================================================
   5. 日记
   ========================================================================== */

export interface Diary {
  id: string
  title: string
  content: string
  mood: string | null
  weather: string | null
  tags: string[]
  coverPath: string | null
  /** 有签名后的可访问地址 */
  coverUrl?: string | null
  /** 封面照片（手帐用）在存储桶里的路径 */
  coverPhoto: string | null
  /**
   * 正文的墨水颜色（#rrggbb）。null = 用默认墨黑。
   * 只有手帐用得上，但放在 Diary 上 —— 手帐就是日记的扩展，不多立一层类型。
   */
  textColor: string | null
  visibility: DiaryVisibility
  sort: number
  isPinned: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DiaryFormValues {
  title: string
  content: string
  mood: string
  weather: string
  tags: string[]
  visibility: DiaryVisibility
}

/* ==========================================================================
   5.2 图文手帐
   ========================================================================== */

/** 一张手帐照片 */
export interface JournalPhoto {
  id: string
  entryId: string
  /** 原图在桶里的路径 */
  storagePath: string
  /** 缩略图路径；可能为空 */
  thumbPath: string | null
  caption: string | null
  sort: number
  width: number | null
  height: number | null
  /** 原图地址（公开桶是 publicUrl，私有桶是签名地址） */
  url: string
  /** 列表用的缩略图地址；没有缩略图时退化成 url */
  thumbUrl: string
}

/** 一条手帐 = 正文 + 若干照片 */
export interface JournalEntry extends Diary {
  photos: JournalPhoto[]
  /** 口令手帐且还没解锁 —— 正文和照片都拿不到 */
  isLocked: boolean
}

/** 正文解析出来的块：一段文字，或者一张照片 */
export type JournalBlock =
  | { type: 'text'; key: string; text: string }
  | { type: 'photo'; key: string; photo: JournalPhoto; caption: string | null }

/** 上锁手帐的清单项（只有标题和日期，没有正文） */
export interface LockedJournalEntry {
  id: string
  title: string
  mood: string | null
  weather: string | null
  tags: string[]
  createdAt: string
  publishedAt: string | null
}

/* ==========================================================================
   6. 树洞
   ========================================================================== */

export interface TreeholeReply {
  id: string
  messageId: string
  content: string
  isAdmin: boolean
  createdAt: string
}

export interface TreeholeMessage {
  id: string
  nickname: string
  content: string
  mood: string | null
  visibility: TreeholeVisibility
  isApproved: boolean
  isHidden: boolean
  isFlagged: boolean
  reportCount: number
  createdAt: string
  replies: TreeholeReply[]
}

export interface TreeholeFormValues {
  nickname: string
  content: string
  mood: string
  visibility: TreeholeVisibility
}

/* ==========================================================================
   7. 事件系统
   ========================================================================== */

/** 事件触发的副作用：由事件池里的 action 字段指定，前端按 id 执行对应逻辑 */
export type EventAction =
  | 'toggle_lamp'
  | 'lamp_off'
  | 'lamp_on'
  | 'lamp_moon'
  | 'power_trip'
  | 'cat_purr'
  | 'cat_leave'
  | 'cat_gift'
  | 'cat_key'
  | 'cat_glitch'
  | 'record_play_pause'
  | 'record_next'
  | 'record_radio'
  | 'record_glitch'
  | 'record_alien'
  | 'open_music'
  | 'open_diary'
  | 'open_journal'
  | 'open_treehole'
  | 'open_games'
  | 'open_about'
  /* ---- 手帐相关 ---- */
  | 'journal_paw'
  | 'journal_photo_fall'
  | 'journal_photo_back'
  | 'journal_dim'
  | 'journal_old_find'
  | 'rain_change'
  | 'phone_buzz'
  | 'notes_fall'
  | 'moon_move'
  | 'light_flicker'
  | 'car_light'
  | 'nothing'

/** 事件池里的一条事件（前端运行时的形态） */
export interface RoomEvent {
  id: string
  /** 所属物件 id，全局事件用 'global' */
  objectType: string
  eventKey: string
  text: string
  action: EventAction | null
  trigger: TriggerType
  rarity: Rarity
  weight: number
  cooldownSeconds: number
  /** 只触发一次 */
  once: boolean
  conditions: EventConditions
  deepNightOnly: boolean
  /** 需要连续访问几天 */
  consecutiveDays: number | null
  enabled: boolean
  sort: number
}

/** conditions 字段的结构 */
export interface EventConditions {
  /** 需要在时间窗内连点几次 */
  combo?: number
  /** 累计访问过几天 */
  visitedDays?: number
  /** 连续访问几天（与 events.consecutive_days 等价，二选一填） */
  consecutiveDays?: number
  /** 仅在某个小时区间内触发，如 [0, 5] */
  hourRange?: [number, number]
  /** 需要台灯是开着的 */
  requiresLampOn?: boolean
  /** 需要台灯是关着的 */
  requiresLampOff?: boolean
  /** 某个物件至少被点过多少次，例如点猫 100 次 */
  minClicks?: number
  /** 玩家已解锁的成就里必须包含这些 key */
  requiresAchievements?: string[]
  /** 需要访客已经来过（第二次及以后访问） */
  requiresReturning?: boolean
  /** 需要访客是第一次来 */
  firstVisitOnly?: boolean
}

/** 触发一次事件时传给事件引擎的上下文 */
export interface EventContext {
  objectType: string
  trigger: TriggerType
  /** 当前连点次数（trigger = combo 时使用） */
  combo?: number
  /** 累计访问天数 */
  visitedDays: number
  /** 连续访问天数 */
  consecutiveDays: number
  /** 一共来过几次（刷新也算一次） */
  visits: number
  /** 各物件被点过的累计次数，例如 { cat: 100 } */
  clickCount: Record<string, number>
  /** 是否是首次与这个物件互动 */
  isFirstInteraction?: boolean
  /** 台灯当前是否开着 */
  lampOn?: boolean
  /** 已解锁成就 */
  unlockedAchievements: string[]
  /** 覆盖「现在」的时间，方便测试 */
  now?: Date
}

/** 事件引擎的返回结果 */
export interface EventResolution {
  /** 命中哪条事件；null 表示这次什么都没发生 */
  event: RoomEvent | null
  /** 要给访客看的话 */
  text: string | null
  /** 附加的界面动作 */
  action: EventAction | null
  rarity: Rarity | null
  /** 是否命中了「这次真的什么都不发生」 */
  silent: boolean
}

/** 页面上飘过的一条事件气泡 */
export interface EventToastItem {
  id: string
  text: string
  rarity: Rarity
  objectType: string
  createdAt: number
}

/* ==========================================================================
   8. 成就
   ========================================================================== */

export interface AchievementDef {
  key: string
  name: string
  description: string | null
  icon: string | null
  secret: boolean
  sort: number
}

/** 本地记录的成就状态 */
export interface AchievementState {
  /** achievement key → 解锁时间（ISO 字符串） */
  unlocked: Record<string, string>
}

/* ==========================================================================
   9. 小游戏
   ========================================================================== */

export interface GameDef {
  slug: string
  name: string
  description: string | null
  enabled: boolean
  config: Record<string, unknown>
  sort: number
}

export interface GameScoreRecord {
  slug: string
  score: number
  at: string
}

/* ==========================================================================
   10. 访问与本地状态
   ========================================================================== */

export interface VisitRecord {
  /** 去重后的访问日期，YYYY-MM-DD */
  days: string[]
  /** 总访问次数（刷新也 +1） */
  visits: number
  /** 首次访问时间 */
  firstSeen: string
  /** 最近一次访问时间 */
  lastSeen: string
}

export interface PlayerPrefs {
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'
  lastTrackId: string | null
}

/** 房间灯光 */
export type LightsMode = 'on' | 'off' | 'moon'

/* ==========================================================================
   11. 站点设置
   ========================================================================== */

export interface SocialLink {
  label: string
  href: string
  icon?: string
}

export interface SiteSettings {
  roomName: string
  hostName: string
  tagline: string
  about: string
  weather: string
  weatherNote: string
  backgroundAudio: string | null
  announcement: string | null
  socialLinks: SocialLink[]
  gamesEnabled: boolean
  treeholeNotice: string
  treeholeBannedWords: string[]
  musicCopyrightNotice: string
  musicNightTag: string
  shelfNote: string
}

/* ==========================================================================
   12. 后台通用
   ========================================================================== */

/** 后台列表页统一的分页结果 */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** 后台仪表盘统计 */
export interface DashboardStats {
  visitsToday: number
  visitsTotal: number
  uniqueSessions: number
  pendingTreehole: number
  totalTreehole: number
  totalDiaries: number
  totalTracks: number
  totalPlayCount: number
  topTracks: { id: string; title: string; playCount: number }[]
  recentTreehole: TreeholeMessage[]
  recentDiaries: Tables<'diaries'>[]
}

/** 服务端 action 的统一返回格式 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
