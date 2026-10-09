/**
 * 全站常量。
 * 这里放「不依赖数据库也存在」的静态数据：
 * 当 Supabase 还没配置时，前台就用这些内置数据跑起来（本地演示模式）。
 */

import type {
  AchievementDef,
  DiaryVisibility,
  GameDef,
  MoodOption,
  NavItem,
  RoomObject,
  Rarity,
  SiteSettings,
  TreeholeVisibility,
  TrackTag,
  TrackVisibility,
  TriggerType,
  WeatherOption,
} from '@/types'

/* ==========================================================================
   1. 站点
   ========================================================================== */

export const SITE_TAGLINE = '推门进来就好，不用敲门。'

export const SITE_DESCRIPTION =
  '一间只在深夜营业的小房间：旧唱片机、一只不太理人的猫、写到一半的日记本，还有会偷偷回话的树洞抽屉。'

/* ==========================================================================
   2. 导航
   ========================================================================== */

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '房间', icon: 'DoorOpen', description: '回到房间全景' },
  { href: '/journal', label: '图文手帐', icon: 'NotebookPen', description: '照片和字写在一起' },
  { href: '/music', label: '唱片架', icon: 'Disc3', description: '点唱机与歌单' },
  { href: '/treehole', label: '深夜抽屉', icon: 'Mailbox', description: '把心事投进来' },
  { href: '/games', label: '摸鱼掌机', icon: 'Gamepad2', description: '2048 / 贪吃蛇 / 翻牌记忆' },
  { href: '/about', label: '主持人档案', icon: 'UserRound', description: '关于房东' },
]

/* ==========================================================================
   3.1 图文手帐
   ========================================================================== */

/** 手帐照片的大小上限（MB）—— 和 0006_journal.sql 里桶的 file_size_limit 对齐 */
export const JOURNAL_PHOTO_MAX_MB = 10

/** 压缩参数：长边 2000 / 缩略图 480，手机直出的照片通常能压到原来的 1/10 */
export const JOURNAL_IMAGE_OPTIONS = {
  maxEdge: 2000,
  thumbEdge: 480,
  quality: 0.82,
  thumbQuality: 0.72,
} as const

/** 手帐可见性的中文说明（后台表单用） */
export const JOURNAL_VISIBILITY_HINT: Record<string, string> = {
  draft: '先放着，谁也不给看。',
  public: '访客能看到，照片走公开桶。',
  private: '只有登录的你能看到，照片走私有桶（签名地址）。',
  password: '知道口令的人才能看。正文和照片都不进公开范围，校验通过才由服务端取回来。',
}

/* ==========================================================================
   3. 房间物件（首页可点击的东西）
   position 是桌面端全景里的百分比坐标（x 从左到右，y 从上到下），
   手机端不看坐标，直接拆成纵向卡片，所以这块只影响大屏。
   ========================================================================== */

/**
 * 房间里的 22 样东西。
 *
 * `position` 是大屏全景里的百分比坐标（x 从左到右，y 从上到下）。
 * 注意：其中 7 样（台灯、窗户、地毯、软木板、便签墙、画、抽屉）
 * 在全景里是**直接画出来的家具**，坐标以 room-panorama.tsx 里的 DRAWN 表为准；
 * 这里的位置主要给窄屏的分区布局排序用，也是全景的兜底值。
 *
 * 床、沙发、床头柜、书桌、架子**不在这个列表里** —— 它们是纯布景，不可点。
 * 大件家具如果有可点区域，会去抢坐在/摆在它们上面的小东西的点击。
 *
 * `zone` 决定它在窄屏的哪条台面上。
 */
export const ROOM_OBJECTS: RoomObject[] = [
  { id: 'lamp', name: '台灯', icon: 'Lamp', emoji: '💡', position: { x: 54, y: 44 }, hint: '咔哒一声，房间亮了一点。', zone: 'desk' },
  { id: 'record', name: '旧唱片机', icon: 'Disc3', emoji: '💿', position: { x: 67.5, y: 44 }, hint: '针落下的声音比音乐还轻。', zone: 'desk', link: '/music' },
  { id: 'cat', name: '猫', icon: 'Cat', emoji: '🐈', position: { x: 30, y: 59 }, hint: '它占着床最好的那块位置。姿势会变 —— 看你解锁了什么。', zone: 'floor' },
  { id: 'diary', name: '日记本', icon: 'NotebookPen', emoji: '📓', position: { x: 73, y: 44 }, hint: '摊开着，照片夹在里面。点它就翻手帐。', zone: 'desk', link: '/journal' },
  { id: 'drawer', name: '抽屉（树洞）', icon: 'Archive', emoji: '🗄️', position: { x: 64, y: 55 }, hint: '深夜抽屉，专门收心事。', zone: 'desk', link: '/treehole' },
  { id: 'handheld', name: '掌机', icon: 'Gamepad2', emoji: '🎮', position: { x: 93, y: 54 }, hint: '扔在沙发上，电量还有 3%。', zone: 'sofa', link: '/games' },
  { id: 'window', name: '窗户', icon: 'AppWindow', emoji: '🪟', position: { x: 14, y: 12 }, hint: '雨点在上面排队往下滑。床头就抵着它的下沿。', zone: 'wall' },
  { id: 'corkboard', name: '软木板', icon: 'StickyNote', emoji: '📌', position: { x: 38, y: 10 }, hint: '钉着票根、便签和没写完的句子。', zone: 'wall' },
  { id: 'tea', name: '热茶', icon: 'CupSoda', emoji: '🍵', position: { x: 82, y: 55 }, hint: '搁在沙发坐垫上，还冒着热气。', zone: 'sofa' },
  { id: 'plant', name: '植物', icon: 'Sprout', emoji: '🪴', position: { x: 6, y: 59 }, hint: '摆在床头柜上，朝着窗户长。', zone: 'floor' },
  { id: 'radio', name: '收音机', icon: 'Radio', emoji: '📻', position: { x: 54, y: 29 }, hint: '旋钮一拧，全是沙沙声。', zone: 'shelf' },
  { id: 'clock', name: '时钟', icon: 'Clock', emoji: '🕰️', position: { x: 50, y: 7 }, hint: '秒针走得比心跳慢一点。', zone: 'wall' },
  { id: 'rug', name: '地毯', icon: 'LayoutPanelTop', emoji: '🧶', position: { x: 30, y: 87 }, hint: '毛绒绒的，铺在床脚前面。', zone: 'floor' },
  { id: 'headphone', name: '耳机', icon: 'Headphones', emoji: '🎧', position: { x: 70, y: 29 }, hint: '挂在架子边上，线缠成一团。', zone: 'shelf' },
  { id: 'phone', name: '手机', icon: 'Smartphone', emoji: '📱', position: { x: 61, y: 44 }, hint: '屏幕朝下扣着，偶尔震一下。', zone: 'desk' },
  { id: 'books', name: '书堆', icon: 'BookCopy', emoji: '📚', position: { x: 62, y: 29 }, hint: '最上面那本永远看不完。', zone: 'shelf' },
  { id: 'notes', name: '便签墙', icon: 'StickyNote', emoji: '🗒️', position: { x: 84, y: 6 }, hint: '贴满了「明天再说」。', zone: 'wall' },
  { id: 'painting', name: '墙上的画', icon: 'Frame', emoji: '🖼️', position: { x: 60, y: 6 }, hint: '画的是一片海，没人知道为什么挂在这。', zone: 'wall' },
]

export const ROOM_OBJECT_MAP: Record<string, RoomObject> = Object.fromEntries(
  ROOM_OBJECTS.map((o) => [o.id, o]),
)

/* ==========================================================================
   4. 事件系统参数
   ========================================================================== */

/** 稀有度对应的默认权重（普通 70% / 稀有 5% / 隐藏 1%，其余概率落在「什么都不发生」上） */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 70,
  rare: 5,
  hidden: 1,
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: '普通',
  rare: '稀有',
  hidden: '隐藏',
}

/** 触发方式的中文名（后台事件管理里用） */
export const TRIGGER_LABEL: Record<TriggerType, string> = {
  click: '单击',
  dblclick: '双击',
  longpress: '长按',
  combo: '连点',
  night: '深夜限定',
  first: '首次访问',
  random: '随机',
  global: '全站随机',
}

/** 全局随机事件的触发间隔：3–10 分钟 */
export const GLOBAL_EVENT_MIN_MS = 3 * 60 * 1000
export const GLOBAL_EVENT_MAX_MS = 10 * 60 * 1000

/** 连点判定的时间窗（毫秒）：在这段时间内点够次数才算连点 */
export const COMBO_WINDOW_MS = 1200

/** 长按判定时长（毫秒） */
export const LONG_PRESS_MS = 600

/** 深夜时段（分钟粒度不重要，直接给小时区间） */
export const DEEP_NIGHT_RANGE: readonly [number, number] = [0, 5]

/* ==========================================================================
   5. 心情 / 天气 / 标签
   ========================================================================== */

export const MOOD_OPTIONS: MoodOption[] = [
  { value: 'calm', label: '平静', emoji: '🌙' },
  { value: 'rainy', label: '潮湿', emoji: '🌧️' },
  { value: 'happy', label: '轻快', emoji: '🌤️' },
  { value: 'tired', label: '疲惫', emoji: '🫠' },
  { value: 'sad', label: '低落', emoji: '🌫️' },
  { value: 'lost', label: '发懵', emoji: '🌀' },
  { value: 'warm', label: '暖和', emoji: '🕯️' },
  { value: 'angry', label: '有点烦', emoji: '⚡' },
]

export const MOOD_MAP: Record<string, MoodOption> = Object.fromEntries(
  MOOD_OPTIONS.map((m) => [m.value, m]),
)

export const WEATHER_OPTIONS: WeatherOption[] = [
  { value: 'rain', label: '雨', emoji: '🌧️' },
  { value: 'drizzle', label: '小雨', emoji: '🌦️' },
  { value: 'cloudy', label: '阴', emoji: '☁️' },
  { value: 'clear', label: '晴', emoji: '☀️' },
  { value: 'snow', label: '雪', emoji: '❄️' },
  { value: 'fog', label: '雾', emoji: '🌫️' },
  { value: 'wind', label: '风', emoji: '🍃' },
  { value: 'unknown', label: '没看窗外', emoji: '🫥' },
]

/** 唱片架 / 点唱机的标签 */
export const TRACK_TAGS: TrackTag[] = ['深夜', '雨', '通勤', '开心', '难过', '随便听听']

/** 日记常用标签 */
export const DIARY_TAGS = ['碎碎念', '今天', '梦', '工作', '音乐', '猫', '读书', '雨夜'] as const

/* ==========================================================================
   6. 可见范围文案
   ========================================================================== */

export const TRACK_VISIBILITY_LABEL: Record<TrackVisibility, string> = {
  public: '公开（访客可听）',
  private: '私密（仅站长登录后可听）',
}

export const DIARY_VISIBILITY_LABEL: Record<DiaryVisibility, string> = {
  draft: '草稿（只有我）',
  public: '公开（访客可读）',
  private: '私密（只有我）',
  password: '口令（输入口令才能看）',
}

export const TREEHOLE_VISIBILITY_LABEL: Record<TreeholeVisibility, string> = {
  public: '可以贴到树洞墙上',
  admin: '只给房东看',
  private: '私密保存，别给任何人看',
}

export const TREEHOLE_VISIBILITY_HINT: Record<TreeholeVisibility, string> = {
  public: '审核通过后，会匿名出现在树洞墙上。',
  admin: '只有房东能看到，永远不会公开。',
  private: '只存进抽屉最底层，房东也不会在墙上贴出来。',
}

/* ==========================================================================
   7. 树洞
   ========================================================================== */

export const TREEHOLE_LIMITS = {
  contentMin: 1,
  contentMax: 2000,
  nicknameMax: 24,
  minIntervalSeconds: 60,
  dailyLimit: 10,
} as const

/** 隐私提示 */
export const TREEHOLE_PRIVACY_NOTICE =
  '请不要写真实姓名、电话、住址、单位、学校这些能定位到你本人的信息。树洞不是保险箱，但它会尽量闭嘴。'

/** 默认敏感词（会与后台 site_settings.treehole_banned_words 合并） */
export const DEFAULT_BANNED_WORDS = [
  '身份证',
  '银行卡',
  '手机号',
  '微信号',
  '加我微信',
  'QQ号',
  '住址',
  '家庭住址',
  '裸照',
  '约炮',
  '赌博',
  '毒品',
  '代开发票',
  '兼职刷单',
]

/* ==========================================================================
   8. 存储与上传
   ========================================================================== */

export const STORAGE_BUCKETS = {
  publicMusic: 'public-music',
  privateMusic: 'private-music',
  covers: 'covers',
  diaryImages: 'diary-images',
  /** 图文手帐：公开照片 */
  journalPhotos: 'journal-photos',
  /** 图文手帐：私密 / 口令手帐的照片 */
  privateJournalPhotos: 'private-journal-photos',
} as const

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS]

/** 音频允许的 MIME（与 0003_storage.sql 里的 allowed_mime_types 保持一致） */
export const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/flac',
] as const

/** 图片允许的 MIME */
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const

export const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.ogg', '.wav', '.flac', '.webm'] as const
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif'] as const

/** 私密音乐的 signed URL 有效期（秒） */
export const SIGNED_URL_TTL_SECONDS = 3600

/* ==========================================================================
   9. 小游戏（数据库里读不到时的兜底）
   ========================================================================== */

export const DEFAULT_GAMES: GameDef[] = [
  {
    slug: '2048',
    name: '2048',
    description: '把数字推到一起去。适合发呆的时候玩。',
    enabled: true,
    config: { size: 4, target: 2048 },
    sort: 10,
  },
  {
    slug: 'snake',
    name: '贪吃蛇',
    description: '房间里的蛇不吃苹果，吃台灯的光点。',
    enabled: true,
    config: { speed: 140, wrap: false },
    sort: 20,
  },
  {
    slug: 'memory',
    name: '翻牌记忆',
    description: '翻开两张一样的牌。像翻旧照片。',
    enabled: true,
    config: { pairs: 8 },
    sort: 30,
  },
]

/* ==========================================================================
   10. 成就（数据库里读不到时的兜底；key 必须与 0004_seed.sql 一致）
   ========================================================================== */

export const DEFAULT_ACHIEVEMENTS: AchievementDef[] = [
  { key: 'lamp_keeper', name: '晚安开灯人', description: '第一次把台灯打开又关上。', icon: 'Lamp', secret: false, sort: 10 },
  { key: 'drawer_heart', name: '把心事放进抽屉', description: '第一次往树洞里投递了一封信。', icon: 'MailOpen', secret: false, sort: 20 },
  { key: 'vinyl_traveler', name: '黑胶旅人', description: '在唱片机前听满 10 首歌。', icon: 'Disc3', secret: false, sort: 30 },
  { key: 'slack_master', name: '摸鱼大师', description: '在小游戏里拿到任意一个最高分。', icon: 'Gamepad2', secret: false, sort: 40 },
  { key: 'regular_guest', name: '常客', description: '累计第 3 天推开这扇门。', icon: 'DoorOpen', secret: false, sort: 50 },
  { key: 'room_secret', name: '房间的秘密', description: '触发过一次稀有事件。', icon: 'Sparkles', secret: true, sort: 60 },
  { key: 'cat_patience', name: '猫的耐心是有限的', description: '点猫 100 次。', icon: 'Cat', secret: false, sort: 70 },
  { key: 'midnight_owl', name: '夜猫子', description: '在 0:00–5:00 之间来过。', icon: 'MoonStar', secret: true, sort: 80 },
  { key: 'alien_radio', name: '外星电台', description: '听到过那段 5 秒的外星广播。', icon: 'RadioTower', secret: true, sort: 90 },
  { key: 'hidden_drawer', name: '隐藏抽屉的钥匙', description: '连续三天来看猫，猫给了你一把小钥匙。', icon: 'KeyRound', secret: true, sort: 100 },
]

/** 长按唱片机时调到的随机频道 */
export const RADIO_CHANNELS = [
  '天气预报：今夜有雨，明天也有雨。',
  '深夜新闻：本市今晚没有发生什么大事。',
  '外星广播：……（后面是一段听不懂的话）',
  '点歌台：下一位听众要听的歌，还在找。',
  '树洞回音：有人在很远的地方，也醒着。',
  '交通台：这条路上目前只有你一辆车。',
] as const

/* ==========================================================================
   11. localStorage 键名（统一管理，避免到处写魔法字符串）
   ========================================================================== */

export const STORAGE_KEYS = {
  /** 访客会话 id，用于统计与事件日志 */
  sessionId: 'lofi:session-id',
  /** 已触发过的事件 key → 时间戳 */
  firedEvents: 'lofi:fired-events',
  /** 每个事件的冷却结束时间 */
  cooldowns: 'lofi:cooldowns',
  /** 已解锁成就 key → 解锁时间 */
  achievements: 'lofi:achievements',
  /** 各物件的连点计数与时间窗 */
  combo: 'lofi:combo',
  /** 访问记录：{ days: string[], visits: number, firstSeen: string, lastSeen: string } */
  visits: 'lofi:visits',
  /** 每个物件被点过的次数 */
  clickCount: 'lofi:click-count',
  /** 播放器偏好：音量、循环、随机、上次播放的歌 */
  playerPrefs: 'lofi:player-prefs',
  /** 各小游戏最高分 */
  gameScores: 'lofi:game-scores',
  /** 房间灯的状态 */
  lights: 'lofi:lights',
  /** 是否已经听过「音频需要手动开启」的提示 */
  audioUnlocked: 'lofi:audio-unlocked',
} as const

/* ==========================================================================
   12. 站点设置（数据库里读不到时的兜底）
   ========================================================================== */

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  roomName: 'Lo-fi 房间电台',
  hostName: '房东',
  tagline: SITE_TAGLINE,
  about:
    '这是一间只在深夜营业的小房间。有旧唱片机、一只不太理人的猫、一本写到一半的日记。' +
    '你可以听歌、翻日记、往抽屉里塞一封信，或者干脆坐着听雨。',
  weather: '雨',
  weatherNote: '窗外在下雨，雨声比音乐清楚。',
  backgroundAudio: null,
  announcement: null,
  socialLinks: [],
  gamesEnabled: true,
  treeholeNotice:
    '这里只有我，和一只不会说话的猫。请不要写真实姓名、电话、地址这些能定位到你本人的信息。',
  treeholeBannedWords: DEFAULT_BANNED_WORDS,
  musicCopyrightNotice:
    '只上传自己创作、免版权或已获得授权的音乐。商业歌曲请不要公开传播。',
  musicNightTag: '深夜',
  shelfNote: '唱片架上的每一张都是自己放上去的。针落下的声音比音乐还轻。',
}

/* ==========================================================================
   13. 播放器
   ========================================================================== */

/** 连续播放多久后提醒休息（毫秒）：40 分钟 */
export const PLAY_REMINDER_MS = 40 * 60 * 1000

/** 听满多少首解锁「黑胶旅人」 */
export const VINYL_TRAVELER_TRACKS = 10

/** 点猫多少次解锁「猫的耐心是有限的」 */
export const CAT_PATIENCE_CLICKS = 100

/** 解锁隐藏抽屉需要的连续访问天数 */
export const HIDDEN_DRAWER_DAYS = 3
