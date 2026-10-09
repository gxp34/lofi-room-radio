import type { EventAction, EventConditions, Rarity, RoomEvent, TriggerType } from '@/types'

/**
 * 内置事件池。
 *
 * 这里是「房间的性格」所在 —— 所有文案都写在这个文件里。
 *
 * 关于数据库：`events` 表可以覆盖 / 追加这些事件（后台「事件管理」页）。
 * 前台启动时会先读数据库，成功就用数据库的，读不到（比如还没配置 Supabase）
 * 就退回这份内置池。这样两边都不耽误：站长能改，网站也不会因为没网就没内容。
 *
 * 概率设计（见 engine.ts 的 RARITY_CHANCE）：
 *   隐藏 1% ／ 稀有 5% ／ 普通 70% ／ 剩下的 24% 什么都不发生。
 *   但对「点击」类触发，如果落进那 24%，会兜底成一条普通事件 ——
 *   你亲手点了东西，房间总得回你一句。
 */

interface EventSeed {
  /** 事件唯一键，命名规则：物件.触发.标识 */
  key: string
  /** 属于哪个物件（与 ROOM_OBJECTS 的 id 对应，全局事件用 'global'） */
  object: string
  text: string
  trigger?: TriggerType
  rarity?: Rarity
  weight?: number
  cooldown?: number
  once?: boolean
  action?: EventAction | null
  conditions?: EventConditions
  deepNightOnly?: boolean
  /** 需要连续访问几天 */
  consecutiveDays?: number
  sort?: number
}

/** 带默认值的工厂，省得每写一条都要填一屏字段 */
function seed(input: EventSeed): RoomEvent {
  return {
    id: `builtin:${input.key}`,
    objectType: input.object,
    eventKey: input.key,
    text: input.text,
    action: input.action ?? null,
    trigger: input.trigger ?? 'click',
    rarity: input.rarity ?? 'common',
    weight: input.weight ?? 10,
    cooldownSeconds: input.cooldown ?? 0,
    once: input.once ?? false,
    conditions: input.conditions ?? {},
    deepNightOnly: input.deepNightOnly ?? false,
    consecutiveDays: input.consecutiveDays ?? null,
    enabled: true,
    sort: input.sort ?? 0,
  }
}

/* ==========================================================================
   台灯
   ========================================================================== */

const LAMP_EVENTS: RoomEvent[] = [
  seed({
    key: 'lamp.first.on',
    object: 'lamp',
    text: '咔哒。房间亮了一点。',
    trigger: 'first',
    action: 'lamp_on',
    once: true,
    // 只有「灯本来是关的」才叫开灯 —— 否则文案和实际动作会对不上
    conditions: { requiresLampOff: true },
    sort: 10,
  }),
  seed({
    key: 'lamp.first.off',
    object: 'lamp',
    text: '晚安。只留屏幕和猫的眼睛。',
    trigger: 'first',
    action: 'lamp_off',
    once: true,
    conditions: { requiresLampOn: true },
    sort: 20,
  }),

  // ---- 普通开灯 ----
  seed({
    key: 'lamp.on.moth',
    object: 'lamp',
    text: '灯亮了。飞蛾在窗外犹豫。',
    action: 'lamp_on',
    weight: 12,
    conditions: { requiresLampOff: true },
  }),
  seed({
    key: 'lamp.on.rain',
    object: 'lamp',
    text: '暖光把雨声照得更清楚了。',
    action: 'lamp_on',
    weight: 12,
    conditions: { requiresLampOff: true },
  }),
  seed({
    key: 'lamp.on.warm',
    object: 'lamp',
    text: '灯泡热起来，有一股很旧的灰尘味。',
    action: 'lamp_on',
    weight: 8,
    conditions: { requiresLampOff: true },
  }),

  // ---- 普通关灯 ----
  seed({
    key: 'lamp.off.closer',
    object: 'lamp',
    text: '关灯后，雨声更近了。',
    action: 'lamp_off',
    weight: 12,
    conditions: { requiresLampOn: true },
  }),
  seed({
    key: 'lamp.off.island',
    object: 'lamp',
    text: '黑暗里，屏幕像一个小岛。',
    action: 'lamp_off',
    weight: 12,
    conditions: { requiresLampOn: true },
  }),
  seed({
    key: 'lamp.off.pupil',
    object: 'lamp',
    text: '猫的瞳孔一下子放大了一圈。',
    action: 'lamp_off',
    weight: 8,
    conditions: { requiresLampOn: true },
  }),

  // ---- 连点 ----
  seed({
    key: 'lamp.combo.3',
    object: 'lamp',
    text: '别玩开关啦，电费很贵。',
    trigger: 'combo',
    weight: 20,
    cooldown: 120,
    conditions: { combo: 3 },
    sort: 100,
  }),
  seed({
    key: 'lamp.combo.7',
    object: 'lamp',
    text: '啪。跳闸了。',
    trigger: 'combo',
    rarity: 'rare',
    weight: 30,
    action: 'power_trip',
    cooldown: 600,
    conditions: { combo: 7 },
    sort: 110,
  }),

  // ---- 深夜限定 ----
  seed({
    key: 'lamp.night.on',
    object: 'lamp',
    text: '凌晨的飞蛾也睡不着。',
    trigger: 'night',
    action: 'lamp_on',
    weight: 20,
    deepNightOnly: true,
    conditions: { requiresLampOff: true },
  }),
  seed({
    key: 'lamp.night.off',
    object: 'lamp',
    text: '这个点关灯，你会睡着的。',
    trigger: 'night',
    action: 'lamp_off',
    weight: 20,
    deepNightOnly: true,
    conditions: { requiresLampOn: true },
  }),

  // ---- 稀有 ----
  seed({
    key: 'lamp.rare.moonlight',
    object: 'lamp',
    text: '灯光变成月光色，墙上投出一行字：早点睡。',
    rarity: 'rare',
    weight: 5,
    action: 'lamp_moon',
    cooldown: 1800,
    sort: 200,
  }),
]

/* ==========================================================================
   猫
   ========================================================================== */

const CAT_EVENTS: RoomEvent[] = [
  seed({
    key: 'cat.first.pet',
    object: 'cat',
    text: '呼噜——猫没睁眼，但尾巴动了一下。',
    trigger: 'first',
    action: 'cat_purr',
    once: true,
    sort: 10,
  }),

  // ---- 普通点击 ----
  seed({
    key: 'cat.click.belly',
    object: 'cat',
    text: '猫翻了个身，把肚皮朝上，又后悔了。',
    weight: 12,
  }),
  seed({
    key: 'cat.click.look',
    object: 'cat',
    text: '猫看了你一眼，像在说：有事？',
    weight: 12,
  }),
  seed({
    key: 'cat.click.headphone',
    object: 'cat',
    text: '猫把爪子搭在你手上，指甲收着，但还是有点尖。',
    weight: 10,
  }),
  seed({
    key: 'cat.click.tail',
    object: 'cat',
    text: '尾巴尖在被子上敲了两下，像是节拍。',
    weight: 10,
  }),
  seed({
    key: 'cat.click.stretch',
    object: 'cat',
    text: '猫伸了个懒腰，把毛蹭在枕头上。',
    weight: 8,
  }),

  // ---- 连点 ----
  seed({
    key: 'cat.combo.3',
    object: 'cat',
    text: '猫的耐心 -1。',
    trigger: 'combo',
    weight: 20,
    cooldown: 90,
    conditions: { combo: 3 },
    sort: 100,
  }),
  seed({
    key: 'cat.combo.5',
    object: 'cat',
    text: '猫走了。三秒后它会回来，别问为什么。',
    trigger: 'combo',
    weight: 20,
    action: 'cat_leave',
    cooldown: 300,
    conditions: { combo: 5 },
    sort: 110,
  }),

  // ---- 长按 ----
  seed({
    key: 'cat.longpress.pet',
    object: 'cat',
    text: '你摸到了猫。世界暂时安静。',
    trigger: 'longpress',
    weight: 40,
    action: 'cat_purr',
    cooldown: 60,
    sort: 150,
  }),

  // ---- 猫叼东西 ----
  seed({ key: 'cat.gift.earphone', object: 'cat', text: '猫叼来一只耳机，放下就走了。', trigger: 'random', action: 'cat_gift', weight: 10, cooldown: 240 }),
  seed({ key: 'cat.gift.ticket', object: 'cat', text: '猫叼来一张票根，边角被咬过。', trigger: 'random', action: 'cat_gift', weight: 10, cooldown: 240 }),
  seed({ key: 'cat.gift.note', object: 'cat', text: '猫叼来一张树洞纸条 —— 明明是锁着的抽屉。', trigger: 'random', action: 'cat_gift', weight: 6, cooldown: 240 }),
  seed({ key: 'cat.gift.key', object: 'cat', text: '猫叼来一把小钥匙，很小，不知道开什么。', trigger: 'random', action: 'cat_gift', weight: 6, cooldown: 240 }),
  seed({ key: 'cat.gift.pick', object: 'cat', text: '猫叼来一枚拨片。你很久没弹了。', trigger: 'random', action: 'cat_gift', weight: 8, cooldown: 240 }),
  seed({ key: 'cat.gift.sock', object: 'cat', text: '猫叼来一只袜子。另一只一直没找到。', trigger: 'random', action: 'cat_gift', weight: 8, cooldown: 240 }),

  // ---- 连续访问三天：小钥匙 ----
  seed({
    key: 'cat.streak.key',
    object: 'cat',
    text: '猫吐出一把小钥匙。抽屉最里面，咔哒一声开了。',
    rarity: 'rare',
    weight: 50,
    action: 'cat_key',
    once: true,
    consecutiveDays: 3,
    conditions: { consecutiveDays: 3 },
    sort: 180,
  }),

  // ---- 深夜 ----
  seed({
    key: 'cat.night.awake',
    object: 'cat',
    text: '凌晨的猫最清醒，像值夜班的同事。',
    trigger: 'night',
    weight: 25,
    deepNightOnly: true,
  }),

  // ---- 猫踩键盘（它现在睡在床上，要专门跳下来一趟） ----
  seed({
    key: 'cat.glitch.keyboard',
    object: 'cat',
    text: "猫跳下床，路过键盘的时候踩了一脚。日记页多了一行：asdfghjkl;'",
    weight: 6,
    action: 'cat_glitch',
    cooldown: 420,
  }),

  // ---- 点猫 100 次 ----
  seed({
    key: 'cat.patience.100',
    object: 'cat',
    text: '猫终于正眼看你了。它大概是认命了。',
    rarity: 'rare',
    weight: 60,
    once: true,
    action: 'cat_purr',
    conditions: { minClicks: 100 },
    sort: 190,
  }),

  // ---- 稀有 ----
  seed({
    key: 'cat.rare.meow',
    object: 'cat',
    text: '猫张嘴，发出很小的声音：「喵。」你怀疑它其实说了别的。',
    rarity: 'rare',
    weight: 5,
    action: 'cat_purr',
    cooldown: 1800,
    sort: 200,
  }),

  // ---- 隐藏（1% 那一档） ----
  seed({
    key: 'cat.hidden.stare',
    object: 'cat',
    text: '猫突然盯着窗户的方向，看了很久。你也跟着看过去。什么都没有。',
    rarity: 'hidden',
    weight: 5,
    cooldown: 3600,
    sort: 300,
  }),
]

/* ==========================================================================
   旧唱片机
   ========================================================================== */

const RECORD_EVENTS: RoomEvent[] = [
  seed({
    key: 'record.first.play',
    object: 'record',
    text: '黑胶开始转。针落下的声音比音乐还轻。',
    trigger: 'first',
    action: 'record_play_pause',
    once: true,
    sort: 10,
  }),

  // ---- 播放中随机 ----
  seed({
    key: 'record.play.twoam',
    object: 'record',
    text: '这首歌适合凌晨两点。',
    action: 'record_play_pause',
    weight: 12,
  }),
  seed({
    key: 'record.play.crackle',
    object: 'record',
    text: '黑胶爆豆声像雨。',
    action: 'record_play_pause',
    weight: 12,
  }),
  seed({
    key: 'record.play.circle',
    object: 'record',
    text: '唱针走过一圈，时间也走了一圈。',
    action: 'record_play_pause',
    weight: 10,
  }),
  seed({
    key: 'record.play.dust',
    object: 'record',
    text: '唱片上有一层薄灰，声音毛了一点。',
    action: 'record_play_pause',
    weight: 8,
  }),

  // ---- 双击换歌 ----
  seed({
    key: 'record.dblclick.next',
    object: 'record',
    text: '抬针，换一张。',
    trigger: 'dblclick',
    weight: 40,
    action: 'record_next',
    sort: 60,
  }),

  // ---- 长按调频 ----
  seed({
    key: 'record.longpress.radio',
    object: 'record',
    text: '你拧到了没有台的位置，全是沙沙声。',
    trigger: 'longpress',
    weight: 40,
    action: 'record_radio',
    cooldown: 30,
    sort: 70,
  }),

  // ---- 跳针 ----
  seed({
    key: 'record.glitch.stutter',
    object: 'record',
    text: '跳针了。同一句歌词重复两遍。',
    trigger: 'random',
    weight: 10,
    action: 'record_glitch',
    cooldown: 600,
  }),

  // ---- 猫选曲 ----
  seed({
    key: 'record.cat.pick',
    object: 'record',
    text: '猫踩到了唱片机，随机切了一首。它看起来很满意。',
    trigger: 'random',
    weight: 8,
    action: 'record_next',
    cooldown: 480,
  }),

  // ---- 稀有：外星电台 ----
  seed({
    key: 'record.rare.alien',
    object: 'record',
    text: '所有频段同时安静下来。然后是一段听不懂的话。',
    rarity: 'rare',
    weight: 5,
    action: 'record_alien',
    cooldown: 3600,
    sort: 200,
  }),

  // ---- 隐藏（1% 那一档） ----
  seed({
    key: 'record.hidden.reverse',
    object: 'record',
    text: '唱片倒着转了一秒。你确定不是眼花，因为你听见了倒着的那句歌词。',
    rarity: 'hidden',
    weight: 5,
    action: 'record_glitch',
    cooldown: 3600,
    sort: 300,
  }),
]

/* ==========================================================================
   全局随机事件（每 3–10 分钟一条）
   ========================================================================== */

const GLOBAL_EVENTS: RoomEvent[] = [
  seed({ key: 'global.cat.meow', object: 'global', text: '猫叫了一声，很短。', trigger: 'global', weight: 14 }),
  seed({ key: 'global.rain.change', object: 'global', text: '雨声变压了。', trigger: 'global', weight: 12, action: 'rain_change', cooldown: 120 }),
  seed({ key: 'global.rain.heavy', object: 'global', text: '雨突然大了一阵。', trigger: 'global', weight: 8, action: 'rain_change', cooldown: 240 }),
  seed({ key: 'global.light.flicker', object: 'global', text: '灯泡闪了一下。', trigger: 'global', weight: 10, action: 'light_flicker', cooldown: 180 }),
  seed({ key: 'global.car.light', object: 'global', text: '有车灯从窗外扫过去。', trigger: 'global', weight: 12, action: 'car_light', cooldown: 150 }),
  seed({ key: 'global.phone.buzz', object: 'global', text: '手机震了一下。你没看。', trigger: 'global', weight: 10, action: 'phone_buzz', cooldown: 200 }),
  seed({ key: 'global.record.glitch', object: 'global', text: '唱片跳了一下针。', trigger: 'global', weight: 8, action: 'record_glitch', cooldown: 300 }),
  seed({ key: 'global.notes.fall', object: 'global', text: '一张便签从墙上掉下来了。', trigger: 'global', weight: 8, action: 'notes_fall', cooldown: 240 }),
  seed({ key: 'global.moon.move', object: 'global', text: '月亮往左挪了一点。', trigger: 'global', weight: 8, action: 'moon_move', cooldown: 300 }),
  seed({ key: 'global.clock.tick', object: 'global', text: '时钟走了一格，夜里听得特别清楚。', trigger: 'global', weight: 6, deepNightOnly: true }),
  seed({ key: 'global.bed.creak', object: 'global', text: '床板轻轻响了一声，像有人翻了个身。', trigger: 'global', weight: 6 }),
  seed({ key: 'global.tea.cool', object: 'global', text: '茶凉了。你没喝几口。', trigger: 'global', weight: 5 }),
]

/* ==========================================================================
   进出房间
   ========================================================================== */

const ROOM_EVENTS: RoomEvent[] = [
  seed({
    key: 'global.first.visit',
    object: 'global',
    text: '门在身后关上。屋里比走廊暖一点。',
    trigger: 'first',
    once: true,
    weight: 100,
    sort: 1,
  }),
  seed({
    key: 'global.return.visit',
    object: 'global',
    text: '你又来了。猫抬了一下眼皮。',
    trigger: 'first',
    weight: 100,
    cooldown: 86400,
    conditions: { requiresReturning: true },
    sort: 2,
  }),
  seed({
    key: 'global.night.visit',
    object: 'global',
    text: '这个点还醒着的人不多。',
    trigger: 'night',
    deepNightOnly: true,
    weight: 30,
    cooldown: 43200,
  }),
]

/* ==========================================================================
   图文手帐（书桌上的那本日记本）
   ========================================================================== */

const JOURNAL_EVENTS: RoomEvent[] = [
  seed({
    key: 'diary.first.open',
    object: 'diary',
    text: '翻开手帐。照片都还在原来的页码上。',
    trigger: 'first',
    action: 'open_journal',
    once: true,
    weight: 100,
    sort: 1,
  }),

  // ---- 猫踩到手帐 ----
  seed({
    key: 'diary.paw.print',
    object: 'diary',
    text: '猫从手帐上踩过去，留下一枚爪印。它不打算道歉。',
    action: 'journal_paw',
    weight: 10,
    cooldown: 120,
  }),

  // ---- 翻页掉落旧照片 ----
  seed({
    key: 'diary.photo.slip',
    object: 'diary',
    text: '翻页的时候，掉出来一张没贴牢的照片。',
    action: 'journal_photo_fall',
    weight: 10,
    cooldown: 180,
  }),

  // ---- 照片背面有字 ----
  seed({
    key: 'diary.photo.back',
    object: 'diary',
    text: '翻过来看，这张照片背面写着字。',
    action: 'journal_photo_back',
    weight: 9,
    cooldown: 240,
  }),

  // ---- 雨夜照片变暗 ----
  seed({
    key: 'diary.photo.dim',
    object: 'diary',
    text: '雨天拍的这几张，看起来比当天更暗一点。',
    action: 'journal_dim',
    weight: 8,
    cooldown: 300,
  }),

  // ---- 深夜翻手帐 ----
  seed({
    key: 'diary.night.cold',
    object: 'diary',
    text: '凌晨看这些照片，颜色都偏冷。',
    trigger: 'night',
    action: 'journal_dim',
    weight: 20,
    deepNightOnly: true,
  }),

  // ---- 连点 ----
  seed({
    key: 'diary.combo.3',
    object: 'diary',
    text: '别翻那么快，纸会破。',
    trigger: 'combo',
    weight: 20,
    cooldown: 120,
    conditions: { combo: 3 },
    sort: 100,
  }),

  // ---- 稀有：别人的照片 ----
  seed({
    key: 'diary.rare.stranger',
    object: 'diary',
    text: '这一页的照片，好像都不是你拍的。',
    rarity: 'rare',
    weight: 5,
    action: 'journal_old_find',
    cooldown: 1800,
    sort: 200,
  }),
]

/** 抽屉里翻出旧手帐（挂在抽屉上，不是日记本） */
const DRAWER_JOURNAL_EVENTS: RoomEvent[] = [
  seed({
    key: 'drawer.old.journal',
    object: 'drawer',
    text: '抽屉最底下压着一本旧手帐，封面已经卷边了。',
    action: 'journal_old_find',
    weight: 6,
    cooldown: 900,
  }),
]

/* ==========================================================================
   点缀物件的专属事件
   ----------------------------------------------------------------------------
   这些物件以前点了只会落到全局文案上 —— 你戳热茶，它跟你说「月亮往左挪了一点」。
   现在每个都有自己的三条：**第一次**摸到的一句话（once，只在第一次触发），
   以及之后随机抽的一句。

   写法上刻意保持「观察」而不是「事件」：热茶不会突然复活，
   它只会凉。房间的生动来自细节的累积，不是来自每样东西都会跳。

   **床和沙发不在这里**：它们已经改成纯布景（不可点）。原因是可点区域太大会抢点击 ——
   猫坐在床上、热茶和掌机摆在沙发上，点那些小东西时经常先打到床和沙发。
   与其做复杂的层级优先级，不如让大件家具老老实实当背景。
   ========================================================================== */

const PROP_EVENTS: RoomEvent[] = [
  /* ---------------- 掌机 ---------------- */
  seed({ key: 'handheld.first.pick', object: 'handheld', text: '拿起掌机。电量 3%，还能再玩一局。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'handheld.click.battery', object: 'handheld', text: '电量提示闪了一下，然后被无视了。', weight: 11, cooldown: 240 }),
  seed({ key: 'handheld.click.save', object: 'handheld', text: '存档还停在昨天那一关。你不太想接着打。', weight: 10, cooldown: 300 }),

  /* ---------------- 窗户 ---------------- */
  seed({ key: 'window.first.rain', object: 'window', text: '窗外在下雨。雨点排着队往下滑。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'window.click.smaller', object: 'window', text: '雨好像小了一点，也可能只是你听习惯了。', weight: 11, cooldown: 260 }),
  seed({ key: 'window.click.neon', object: 'window', text: '对面楼还有一扇窗亮着。不知道那人在干什么。', weight: 10, cooldown: 300 }),
  seed({ key: 'window.night.moon', object: 'window', text: '月亮正好卡在窗格中间，像被框起来的一枚硬币。', trigger: 'night', weight: 22, deepNightOnly: true }),

  /* ---------------- 软木板 ---------------- */
  seed({ key: 'corkboard.first.read', object: 'corkboard', text: '钉着三张票根、一张便签，还有一句没写完的话。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'corkboard.click.ticket', object: 'corkboard', text: '票根上的字已经褪色了，只认得出年份。', weight: 11, cooldown: 260 }),
  seed({ key: 'corkboard.click.note', object: 'corkboard', text: '便签上写着「明天再说」。这张纸已经发黄了。', weight: 10, cooldown: 320 }),

  /* ---------------- 热茶 ---------------- */
  seed({ key: 'tea.first.sip', object: 'tea', text: '喝了一口。温度刚好，不烫也不凉。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'tea.click.cool', object: 'tea', text: '再不喝就凉了。你每次都这么说。', weight: 12, cooldown: 220 }),
  seed({ key: 'tea.click.empty', object: 'tea', text: '杯底只剩一层茶叶。要不要再泡一杯？', weight: 10, cooldown: 300 }),

  /* ---------------- 植物 ---------------- */
  seed({ key: 'plant.first.water', object: 'plant', text: '土还是湿的。你上周也是这么想的。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'plant.click.leaf', object: 'plant', text: '有一片叶子黄了。你假装没看见。', weight: 11, cooldown: 280 }),
  seed({ key: 'plant.click.turn', object: 'plant', text: '它朝着台灯的方向偏过去了一点。', weight: 10, cooldown: 320 }),
  seed({ key: 'plant.night.grow', object: 'plant', text: '植物晚上也在长，只是慢得看不出来。', trigger: 'night', weight: 20, deepNightOnly: true }),

  /* ---------------- 收音机 ---------------- */
  seed({ key: 'radio.first.tune', object: 'radio', text: '旋钮拧到底，全是沙沙声 —— 但沙沙声本身也挺好听。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'radio.click.static', object: 'radio', text: '沙沙声里像有人在说话，再仔细听又没有了。', weight: 12, cooldown: 240 }),
  seed({ key: 'radio.click.dead', object: 'radio', text: '调到那个台了。只有电流声，一个音节都没有。', weight: 10, cooldown: 300 }),

  /* ---------------- 时钟 ---------------- */
  seed({ key: 'clock.first.glance', object: 'clock', text: '两点十七分。你一直以为才十一点。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'clock.click.slow', object: 'clock', text: '盯着秒针看了一会儿。它没有变快，是你变慢了。', weight: 11, cooldown: 260 }),
  seed({ key: 'clock.click.fast', object: 'clock', text: '这个钟一直快三分钟。你从来没调过。', weight: 10, cooldown: 320 }),
  seed({ key: 'clock.night.tick', object: 'clock', text: '夜里听得特别清楚。一格，一格。', trigger: 'night', weight: 22, deepNightOnly: true }),

  /* ---------------- 地毯 ---------------- */
  seed({ key: 'rug.first.bare', object: 'rug', text: '踩上去软软的。猫不在这儿 —— 它占了床。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'rug.click.stain', object: 'rug', text: '有一小块颜色不一样，大概是哪次洒了什么。', weight: 11, cooldown: 260 }),
  seed({ key: 'rug.click.crumb', object: 'rug', text: '缝里卡着一片饼干渣。想不起来是什么时候掉的。', weight: 10, cooldown: 320 }),

  /* ---------------- 耳机 ---------------- */
  seed({ key: 'headphone.first.wear', object: 'headphone', text: '戴上之后，房间里的声音变得更远了。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'headphone.click.tangle', object: 'headphone', text: '线又缠成一团。解开它比听歌花的时间还长。', weight: 12, cooldown: 240 }),
  seed({ key: 'headphone.click.left', object: 'headphone', text: '左边那只没声音。可能是线的问题，也可能不是。', weight: 10, cooldown: 300 }),

  /* ---------------- 手机 ---------------- */
  seed({ key: 'phone.first.flip', object: 'phone', text: '翻过来看了一眼，又扣回去。没有重要的事。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'phone.click.push', object: 'phone', text: '屏幕亮了一下，是推送。你没有解锁。', weight: 12, cooldown: 200, action: 'phone_buzz' }),
  seed({ key: 'phone.click.battery', object: 'phone', text: '电量 8%。充电线不知道扔哪了。', weight: 10, cooldown: 320 }),
  seed({ key: 'phone.rare.unknown', object: 'phone', text: '一个陌生号码。你没接，它也没再打来。', rarity: 'rare', weight: 5, cooldown: 1800, sort: 200 }),

  /* ---------------- 书堆 ---------------- */
  seed({ key: 'books.first.pick', object: 'books', text: '最上面那本夹着书签，停在第 47 页。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'books.click.dust', object: 'books', text: '书脊上落了一层灰。你吹了一下，它又落回去。', weight: 11, cooldown: 260 }),
  seed({ key: 'books.click.bookmark', object: 'books', text: '书签是一片干掉的叶子，已经不脆了。', weight: 10, cooldown: 320 }),

  /* ---------------- 便签墙 ---------------- */
  seed({ key: 'notes.first.read', object: 'notes', text: '「买牛奶」「回邮件」「别再熬夜」—— 一张都没划掉。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'notes.click.curl', object: 'notes', text: '风从窗缝里进来，最上面那张翘了一下角。', weight: 11, cooldown: 240, action: 'notes_fall' }),
  seed({ key: 'notes.click.old', object: 'notes', text: '最底下压着一张去年的。字迹已经淡了。', weight: 10, cooldown: 320 }),

  /* ---------------- 墙上的画 ---------------- */
  seed({ key: 'painting.first.look', object: 'painting', text: '一片海，没有船，也没有人。', trigger: 'first', once: true, sort: 10 }),
  seed({ key: 'painting.click.moon', object: 'painting', text: '画里的月亮和窗外那个差不多亮。', weight: 11, cooldown: 260 }),
  seed({ key: 'painting.click.frame', object: 'painting', text: '画框右下角磕掉了一小块漆。', weight: 10, cooldown: 320 }),
  seed({ key: 'painting.rare.signed', object: 'painting', text: '把画取下来看背面，写着一行小字和一个年份。', rarity: 'rare', weight: 5, cooldown: 1800, sort: 200 }),
]

/* ==========================================================================
   汇总
   ========================================================================== */

export const DEFAULT_EVENT_POOL: RoomEvent[] = [
  ...LAMP_EVENTS,
  ...CAT_EVENTS,
  ...RECORD_EVENTS,
  ...PROP_EVENTS,
  ...JOURNAL_EVENTS,
  ...DRAWER_JOURNAL_EVENTS,
  ...ROOM_EVENTS,
  ...GLOBAL_EVENTS,
]

/** 方便按 key 查（后台预览、调试用） */
export const EVENT_BY_KEY: Record<string, RoomEvent> = Object.fromEntries(
  DEFAULT_EVENT_POOL.map((event) => [event.eventKey, event]),
)

/** 某个物件有哪些事件 */
export function eventsForObject(objectType: string): RoomEvent[] {
  return DEFAULT_EVENT_POOL.filter((event) => event.objectType === objectType)
}

/** 统计一下，后台/文档里可以显示「内置事件池共 N 条」 */
export const EVENT_POOL_SIZE = DEFAULT_EVENT_POOL.length
