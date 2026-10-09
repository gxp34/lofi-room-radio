import { isDeepNight } from '@/lib/utils'
import type { LightsMode } from '@/types'

/**
 * 猫的动作。
 *
 * 猫不是一张固定图片 —— 它会根据你解锁过的**彩蛋（成就）**、
 * 房间的灯、以及现在几点，换一个姿势。这些姿势本身就是彩蛋的奖励：
 * 你看不到成就页面上的文字，但你能看见猫的态度变了。
 *
 * 判定写成纯函数，就是为了能单独测：给一份状态，答案应该是确定的。
 */

export type CatPose =
  /** 坐着看你（默认） */
  | 'sitting'
  /** 蜷成一团睡着（深夜） */
  | 'curled'
  /** 黑里只剩两只眼睛（灯灭） */
  | 'glowing'
  /** 伸懒腰（解锁「房间的秘密」） */
  | 'stretch'
  /** 翻肚皮 —— 认命了（解锁「猫的耐心是有限的」= 点够 100 次） */
  | 'bellyUp'
  /** 竖着耳朵盯着收音机（解锁「外星电台」） */
  | 'alert'
  /** 叼来一把钥匙（解锁「隐藏抽屉的钥匙」—— 最深的那个彩蛋） */
  | 'withKey'

export interface CatPoseContext {
  lights: LightsMode
  /** 已解锁的成就 key */
  unlocked: string[]
  now?: Date
}

export interface CatPoseInfo {
  pose: CatPose
  /** 一句话说明为什么是这个姿势 */
  reason: string
  /** 动作名（悬停提示 / 调试面板用） */
  label: string
}

/**
 * 优先级从高到低。
 *
 * 为什么「钥匙」压过「灯灭」：最深的彩蛋是猫叼来一把钥匙，
 * 它要是被关灯的黑剪影盖住，就永远没人看得见了。
 * 反过来「翻肚皮」这类就让位给关灯 —— 关灯只剩两只眼睛这件事本身也很好玩。
 */
const RULES: Array<{
  pose: CatPose
  label: string
  match: (ctx: Required<CatPoseContext>) => string | null
}> = [
  {
    pose: 'withKey',
    label: '叼着一把钥匙',
    match: ({ unlocked }) =>
      unlocked.includes('hidden_drawer') ? '解锁了「隐藏抽屉的钥匙」' : null,
  },
  {
    pose: 'glowing',
    label: '黑里只剩两只眼睛',
    match: ({ lights }) => (lights === 'off' ? '台灯是关着的' : null),
  },
  {
    pose: 'bellyUp',
    label: '翻着肚皮',
    match: ({ unlocked }) =>
      unlocked.includes('cat_patience') ? '解锁了「猫的耐心是有限的」' : null,
  },
  {
    pose: 'alert',
    label: '竖着耳朵',
    match: ({ unlocked }) => (unlocked.includes('alien_radio') ? '解锁了「外星电台」' : null),
  },
  {
    pose: 'stretch',
    label: '正在伸懒腰',
    match: ({ unlocked }) => (unlocked.includes('room_secret') ? '解锁了「房间的秘密」' : null),
  },
  {
    pose: 'curled',
    label: '蜷着睡了',
    match: ({ now }) => (isDeepNight(now) ? '现在是凌晨' : null),
  },
]

/** 这个动作的中文名（给后台和文档用） */
export const CAT_POSE_LABEL: Record<CatPose, string> = {
  sitting: '坐着看你',
  curled: '蜷成一团',
  glowing: '暗中发亮',
  stretch: '伸懒腰',
  bellyUp: '翻肚皮',
  alert: '竖着耳朵',
  withKey: '叼着钥匙',
}

export function pickCatPose(ctx: CatPoseContext): CatPoseInfo {
  const full: Required<CatPoseContext> = {
    lights: ctx.lights,
    unlocked: ctx.unlocked,
    now: ctx.now ?? new Date(),
  }

  for (const rule of RULES) {
    const reason = rule.match(full)
    if (reason) {
      return { pose: rule.pose, reason, label: CAT_POSE_LABEL[rule.pose] }
    }
  }

  return { pose: 'sitting', reason: '没什么特别的，它就坐着看你', label: CAT_POSE_LABEL.sitting }
}

/** 这条姿势是不是彩蛋奖励（后台/调试面板里标一下） */
export const EASTER_EGG_POSES: CatPose[] = ['withKey', 'bellyUp', 'alert', 'stretch']
