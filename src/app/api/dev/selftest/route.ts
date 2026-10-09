import { NextResponse } from 'next/server'

import { CAT_POSE_LABEL, pickCatPose, type CatPose } from '@/lib/cat'
import { ROOM_OBJECTS } from '@/lib/constants'
import { isEventAvailable, resolveEvent, type EventLedger } from '@/lib/events/engine'
import { DEFAULT_EVENT_POOL, EVENT_BY_KEY } from '@/lib/events/pool'
import type { EventContext, TriggerType } from '@/types'

/**
 * 事件系统自测（**只在开发环境可用**）。
 *
 * 用法：`npm run dev` 之后访问 http://localhost:3000/api/dev/selftest
 *
 * 它会把事件池的规则跑一遍断言：首次触发、连点优先级、深夜限定、连续访问、
 * 冷却、一次性、稀有度概率分布。改完事件池跑一下，比手动点半天靠谱。
 *
 * 生产环境直接返回 404 —— 这不是给线上用的东西。
 */
export const dynamic = 'force-dynamic'

const EMPTY_LEDGER: EventLedger = { fired: {}, cooldowns: {} }

function ctx(partial: Partial<EventContext> & { objectType: string; trigger: TriggerType }): EventContext {
  return {
    visitedDays: 1,
    consecutiveDays: 1,
    visits: 1,
    clickCount: {},
    unlockedAchievements: [],
    lampOn: false,
    ...partial,
  }
}

function get(key: string) {
  const event = EVENT_BY_KEY[key]
  if (!event) throw new Error(`事件池里没有 ${key}`)
  return event
}

export async function GET() {
  // 生产环境不暴露这个接口
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'NOT_FOUND' }, { status: 404 })
  }

  const results: Array<{ name: string; pass: boolean; detail?: string }> = []

  const check = (name: string, pass: boolean, detail?: string) => {
    results.push({ name, pass, detail })
  }

  /* ---------- 1. 事件池完整性 ---------- */
  const keys = DEFAULT_EVENT_POOL.map((event) => event.eventKey)
  check('事件池没有重复 key', new Set(keys).size === keys.length)
  check('事件池条数 ≥ 55', DEFAULT_EVENT_POOL.length >= 55, `实际 ${DEFAULT_EVENT_POOL.length}`)

  const objects = new Set(DEFAULT_EVENT_POOL.map((event) => event.objectType))
  for (const id of ['lamp', 'cat', 'record', 'global']) {
    check(`事件池覆盖 ${id}`, objects.has(id))
  }

  /* ---------- 2. 首次触发 ---------- */
  check(
    '台灯首次开灯（灯是关的）→ lamp.first.on',
    isEventAvailable(
      get('lamp.first.on'),
      ctx({ objectType: 'lamp', trigger: 'first', lampOn: false }),
      EMPTY_LEDGER,
    ),
  )
  check(
    '台灯首次开灯：灯已经开着就不该触发开灯事件',
    !isEventAvailable(
      get('lamp.first.on'),
      ctx({ objectType: 'lamp', trigger: 'first', lampOn: true }),
      EMPTY_LEDGER,
    ),
  )
  check(
    '触发过一次的事件不会再有第二次',
    !isEventAvailable(
      get('lamp.first.on'),
      ctx({ objectType: 'lamp', trigger: 'first', lampOn: false }),
      { fired: { 'lamp.first.on': Date.now() }, cooldowns: {} },
    ),
  )

  /* ---------- 3. 连点 ---------- */
  check(
    '连点 2 次不该出「别玩开关啦」',
    !isEventAvailable(
      get('lamp.combo.3'),
      ctx({ objectType: 'lamp', trigger: 'combo', combo: 2 }),
      EMPTY_LEDGER,
    ),
  )
  check(
    '连点 3 次出「别玩开关啦」',
    isEventAvailable(
      get('lamp.combo.3'),
      ctx({ objectType: 'lamp', trigger: 'combo', combo: 3 }),
      EMPTY_LEDGER,
    ),
  )

  const combo7 = resolveEvent(
    ctx({ objectType: 'lamp', trigger: 'combo', combo: 7, lampOn: true }),
    EMPTY_LEDGER,
  )
  check(
    '连点 7 次优先命中最具体的那条（跳闸）',
    combo7.event?.eventKey === 'lamp.combo.7',
    `实际 ${combo7.event?.eventKey ?? 'null'}`,
  )

  /* ---------- 4. 深夜限定 ---------- */
  const noon = new Date('2024-06-11T14:00:00')
  const lateNight = new Date('2024-06-11T03:00:00')

  check(
    '深夜事件在下午不触发',
    !isEventAvailable(
      get('lamp.night.on'),
      ctx({ objectType: 'lamp', trigger: 'night', lampOn: false, now: noon }),
      EMPTY_LEDGER,
    ),
  )
  check(
    '凌晨 3 点触发「凌晨的飞蛾也睡不着」',
    isEventAvailable(
      get('lamp.night.on'),
      ctx({ objectType: 'lamp', trigger: 'night', lampOn: false, now: lateNight }),
      EMPTY_LEDGER,
    ),
  )

  /* ---------- 5. 连续访问 ---------- */
  check(
    '连续访问 2 天拿不到小钥匙',
    !isEventAvailable(
      get('cat.streak.key'),
      ctx({ objectType: 'cat', trigger: 'click', consecutiveDays: 2 }),
      EMPTY_LEDGER,
    ),
  )
  check(
    '连续访问 3 天拿到小钥匙',
    isEventAvailable(
      get('cat.streak.key'),
      ctx({ objectType: 'cat', trigger: 'click', consecutiveDays: 3 }),
      EMPTY_LEDGER,
    ),
  )

  /* ---------- 6. 点猫 100 次 ---------- */
  check(
    '点猫 99 次还不行',
    !isEventAvailable(
      get('cat.patience.100'),
      ctx({ objectType: 'cat', trigger: 'click', clickCount: { cat: 99 } }),
      EMPTY_LEDGER,
    ),
  )
  check(
    '点猫 100 次解锁专门的文案',
    isEventAvailable(
      get('cat.patience.100'),
      ctx({ objectType: 'cat', trigger: 'click', clickCount: { cat: 100 } }),
      EMPTY_LEDGER,
    ),
  )

  /* ---------- 7. 冷却 ---------- */
  check(
    '冷却中的事件不触发',
    !isEventAvailable(
      get('cat.longpress.pet'),
      ctx({ objectType: 'cat', trigger: 'longpress' }),
      { fired: {}, cooldowns: { 'cat.longpress.pet': Date.now() + 30_000 } },
    ),
  )
  check(
    '冷却结束后可以再触发',
    isEventAvailable(
      get('cat.longpress.pet'),
      ctx({ objectType: 'cat', trigger: 'longpress' }),
      { fired: {}, cooldowns: { 'cat.longpress.pet': Date.now() - 1000 } },
    ),
  )

  /* ---------- 8. 点击永远有反馈 ---------- */
  let silentClicks = 0
  const rarityCount = { common: 0, rare: 0, hidden: 0 }
  const ROUNDS = 3000

  for (let index = 0; index < ROUNDS; index++) {
    const resolution = resolveEvent(
      ctx({ objectType: 'lamp', trigger: 'click', lampOn: index % 2 === 0 }),
      EMPTY_LEDGER,
      { allowSilence: false },
    )
    if (resolution.silent || !resolution.text) silentClicks++
    else if (resolution.rarity) rarityCount[resolution.rarity]++
  }

  check('点击 3000 次没有一次是「什么都不发生」', silentClicks === 0, `静默 ${silentClicks} 次`)

  const rareRatio = rarityCount.rare / ROUNDS
  check(
    '稀有事件概率在 5% 附近（3%~8% 区间内）',
    rareRatio > 0.03 && rareRatio < 0.08,
    `实际 ${(rareRatio * 100).toFixed(2)}%`,
  )

  /* ---------- 9. 随机 / 全局事件允许安静 ---------- */
  let silentGlobals = 0
  for (let index = 0; index < 500; index++) {
    const resolution = resolveEvent(ctx({ objectType: 'global', trigger: 'global' }), EMPTY_LEDGER, {
      allowSilence: true,
    })
    if (resolution.silent) silentGlobals++
  }
  check('全局事件允许什么都不发生（安静也是氛围）', silentGlobals > 0, `静默 ${silentGlobals}/500`)

  /* ---------- 9b. 猫的隐藏事件（1% 那一档）确实存在 ---------- */
  const catCount = { common: 0, rare: 0, hidden: 0 }
  const CAT_ROUNDS = 4000
  for (let index = 0; index < CAT_ROUNDS; index++) {
    const resolution = resolveEvent(ctx({ objectType: 'cat', trigger: 'click' }), EMPTY_LEDGER, {
      allowSilence: false,
    })
    if (resolution.rarity) catCount[resolution.rarity]++
  }
  const catHiddenRatio = catCount.hidden / CAT_ROUNDS
  check(
    '隐藏事件概率在 1% 附近（0.3%~2% 区间内）',
    catHiddenRatio > 0.003 && catHiddenRatio < 0.02,
    `实际 ${(catHiddenRatio * 100).toFixed(2)}%（${catCount.hidden}/${CAT_ROUNDS}）`,
  )

  /* ---------- 10. 每种触发方式都有事件 ---------- */
  const triggers: TriggerType[] = ['click', 'dblclick', 'longpress', 'combo', 'night', 'first', 'random', 'global']
  for (const trigger of triggers) {
    const count = DEFAULT_EVENT_POOL.filter((event) => event.trigger === trigger).length
    check(`触发方式 ${trigger} 有事件`, count > 0, `${count} 条`)
  }

  /* ---------- 11. 猫的姿势跟着彩蛋走 ---------- */
  const poseNow = new Date('2026-06-11T21:00:00') // 晚上 9 点，不是凌晨
  const deepNight = new Date('2026-06-11T03:00:00')

  check(
    '什么都没解锁、灯开着、白天 → 猫是坐着的',
    pickCatPose({ lights: 'on', unlocked: [], now: poseNow }).pose === 'sitting',
  )

  check(
    '灯关掉 → 猫只剩两只眼睛（glowing）',
    pickCatPose({ lights: 'off', unlocked: [], now: poseNow }).pose === 'glowing',
  )

  check(
    '凌晨 → 猫蜷成一团（curled）',
    pickCatPose({ lights: 'on', unlocked: [], now: deepNight }).pose === 'curled',
  )

  check(
    '解锁「房间的秘密」→ 猫伸懒腰（stretch）',
    pickCatPose({ lights: 'on', unlocked: ['room_secret'], now: poseNow }).pose === 'stretch',
  )

  check(
    '解锁「猫的耐心是有限的」→ 猫翻肚皮（bellyUp）',
    pickCatPose({ lights: 'on', unlocked: ['cat_patience'], now: poseNow }).pose === 'bellyUp',
  )

  check(
    '解锁「外星电台」→ 猫竖着耳朵（alert）',
    pickCatPose({ lights: 'on', unlocked: ['alien_radio'], now: poseNow }).pose === 'alert',
  )

  check(
    '解锁「隐藏抽屉的钥匙」→ 猫叼来钥匙（withKey）',
    pickCatPose({ lights: 'on', unlocked: ['hidden_drawer'], now: poseNow }).pose === 'withKey',
  )

  // 最深的彩蛋要压过关灯，否则关灯之后就永远看不到钥匙了
  check(
    '关灯 + 拿了钥匙 → 仍然显示钥匙（彩蛋优先级高于关灯）',
    pickCatPose({ lights: 'off', unlocked: ['hidden_drawer'], now: deepNight }).pose === 'withKey',
  )

  check(
    '关灯 + 解锁了「外星电台」→ 关灯优先，还是只露眼睛',
    pickCatPose({ lights: 'off', unlocked: ['alien_radio'], now: poseNow }).pose === 'glowing',
  )

  // 每个姿势都要真的画得出来（key 和图形对得上）
  for (const pose of Object.keys(CAT_POSE_LABEL) as CatPose[]) {
    check(`猫的姿势 ${pose} 有名字`, CAT_POSE_LABEL[pose].length > 0)
  }

  /* ---------- 12. 主力物件必须有事件 ---------- */
  // 只对「主要互动对象」做硬断言。像热茶、植物这类点缀物件目前是单击无专属文案的
  // （会落到全局事件上），这算已知缺口，下面单独统计出来，不当成失败。
  const withEvents = new Set(DEFAULT_EVENT_POOL.map((event) => event.objectType))
  for (const id of ['lamp', 'cat', 'record', 'diary', 'drawer']) {
    const object = ROOM_OBJECTS.find((item) => item.id === id)
    check(
      `主力物件「${object?.name ?? id}」有专属事件`,
      withEvents.has(id),
      `${DEFAULT_EVENT_POOL.filter((event) => event.objectType === id).length} 条`,
    )
  }

  /* ---------- 13. 大件家具不许是可点物件 ---------- */
  // 床和沙发是纯布景。它们一旦变回可点物件，可点区域就会盖住
  // 猫、热茶、掌机这些小东西 —— 点小的经常先打到大的。
  for (const id of ['bed', 'sofa', 'desk', 'shelf', 'nightstand']) {
    check(
      `大件家具「${id}」不是可点物件`,
      !ROOM_OBJECTS.some((object) => object.id === id),
      ROOM_OBJECTS.some((object) => object.id === id) ? '它又被加回 ROOM_OBJECTS 了' : '',
    )
    check(
      `大件家具「${id}」没有事件`,
      !withEvents.has(id),
      DEFAULT_EVENT_POOL.filter((event) => event.objectType === id).length > 0
        ? '事件池里还留着它的事件'
        : '',
    )
  }

  const flavorOnly = ROOM_OBJECTS.filter((object) => !withEvents.has(object.id)).map(
    (object) => object.name,
  )

  const failed = results.filter((item) => !item.pass)

  return NextResponse.json({
    summary: `${results.length - failed.length} / ${results.length} 通过`,
    failed,
    distribution: {
      lamp: { rounds: ROUNDS, ...rarityCount },
      cat: { rounds: CAT_ROUNDS, ...catCount },
    },
    poolSize: DEFAULT_EVENT_POOL.length,
    catPoses: Object.keys(CAT_POSE_LABEL).length,
    /** 这些物件还没有专属事件（点了只会落到全局文案上），是待补的缺口 */
    objectsWithoutOwnEvents: flavorOnly,
  })
}
