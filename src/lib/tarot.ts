/**
 * 塔罗牌 · 大阿卡纳 22 张。
 *
 * 为什么只做 22 张：
 *   全套 78 张里的小阿卡纳是四个花色各 14 张，每张都要独立手绘卡面的话
 *   绘制量会大到失控，而且大部分牌面只是"几根杖、几个杯"的重复。
 *   大阿卡纳 22 张是经典占卜用的那副，每张都有独立且强烈的意象，
 *   做精比做全更值。
 *
 * 牌义的写法：这个站是深夜房间里一个人的站，所以牌义不用那种
 * "命运将指引你走向成功"的腔调，而是像一个人在台灯下跟自己说话。
 * 逆位也不是"凶"，而是"同一张牌卡住的那一面"。
 */

export interface TarotCard {
  /** 0–21 */
  id: number
  /** 罗马数字，愚者是 0 */
  roman: string
  /** 中文名 */
  name: string
  /** 英文名 */
  nameEn: string
  /** 牌面的核心意象，两三行以内，写在卡面下方 */
  motif: string
  /** 正位关键词 */
  uprightKeywords: string[]
  /** 逆位关键词 */
  reversedKeywords: string[]
  /** 正位牌义 */
  upright: string
  /** 逆位牌义 */
  reversed: string
  /** 这张牌的插图主色（手绘卡面用），统一取夜色系的低饱和色 */
  accent: string
}

export const TAROT_CARDS: TarotCard[] = [
  {
    id: 0,
    roman: '0',
    name: '愚者',
    nameEn: 'The Fool',
    motif: '站在悬崖边上，抬头看太阳，脚边一只小狗在叫。',
    uprightKeywords: ['开始', '不设防', '轻装'],
    reversedKeywords: ['鲁莽', '犹豫', '怕出丑'],
    upright:
      '你手上什么都没有，所以也什么都不用怕。这一步不是计划好的，但它是对的。允许自己不知道接下来会怎样，往前走两步再说。',
    reversed:
      '要么是没看路就往下跳，要么是站在崖边站了太久、把"再准备准备"当成了正经事。先分清你是哪一种。',
    accent: '#e8c56a',
  },
  {
    id: 1,
    roman: 'I',
    name: '魔术师',
    nameEn: 'The Magician',
    motif: '一手指天、一手指地，桌上摆着杯、剑、杖、币。',
    uprightKeywords: ['动手', '工具都在', '专注'],
    reversedKeywords: ['空谈', '手生', '用错力'],
    upright:
      '你需要的东西已经全在桌上了，缺的只是开始。别再去买新的工具，先把手上这件用完。',
    reversed:
      '说得多、做得少，或者力气使错了地方。也可能是你把某个能力看得太轻——它其实已经够用了。',
    accent: '#d4635e',
  },
  {
    id: 2,
    roman: 'II',
    name: '女祭司',
    nameEn: 'The High Priestess',
    motif: '坐在黑白两根柱子之间，身后是石榴花纹的帷幕，脚边一弯月亮。',
    uprightKeywords: ['直觉', '先别说话', '还没到揭晓的时候'],
    reversedKeywords: ['自我怀疑', '被忽略的直觉', '沉默太久'],
    upright:
      '有些事你现在还看不清，但那不是坏消息——时候没到而已。你心里其实已经有一个答案了，只是还没敢承认。先安静一会儿。',
    reversed:
      '你在反复问别人，却一直压着自己那个早就知道的答案。也可能是沉默变成了逃避。',
    accent: '#6b7fd0',
  },
  {
    id: 3,
    roman: 'III',
    name: '皇后',
    nameEn: 'The Empress',
    motif: '坐在麦田前的软椅上，头戴十二星冠，手里握着金星权杖。',
    uprightKeywords: ['丰盛', '照顾自己', '慢一点'],
    reversedKeywords: ['过度付出', '空掉', '忽略自己'],
    upright:
      '该有的会自己长出来，不用一直盯着。今天先把自己喂饱、睡够——你最近对别人比对自己好太多了。',
    reversed:
      '你把好的都给出去了，留给自己的只剩壳。也可能是"照顾"变成了控制。先给自己留一份。',
    accent: '#7fa86a',
  },
  {
    id: 4,
    roman: 'IV',
    name: '皇帝',
    nameEn: 'The Emperor',
    motif: '坐在石座上，盔甲下是红袍，手执白羊权杖，身后是荒山。',
    uprightKeywords: ['秩序', '定规矩', '扛住'],
    reversedKeywords: ['太硬', '控制欲', '没有边界'],
    upright:
      '现在需要的不是灵感，是规矩。给这件事划个范围、定个时间，然后按它走。你扛得住。',
    reversed:
      '要么硬到不肯听人说话，要么完全没边界、什么都往身上揽。刚和软都不是问题，卡在中间才是。',
    accent: '#c2643f',
  },
  {
    id: 5,
    roman: 'V',
    name: '教皇',
    nameEn: 'The Hierophant',
    motif: '戴三重冠端坐，脚下交叉着两把钥匙，两名信徒跪在身前。',
    uprightKeywords: ['前辈', '现成的路', '被指点'],
    reversedKeywords: ['盲从', '教条', '该走自己的了'],
    upright:
      '这件事有人走过，而且愿意带你。放下"我想自己搞明白"的执拗，去问一句，会省你很多时间。',
    reversed:
      '规矩是别人定的，不一定适合你。也可能是你把某个"权威"看得太重了。',
    accent: '#9b8fa3',
  },
  {
    id: 6,
    roman: 'VI',
    name: '恋人',
    nameEn: 'The Lovers',
    motif: '两个人站在天使之下，一边是结果子的树，一边是燃着火的树。',
    uprightKeywords: ['选择', '真心', '合得来'],
    reversedKeywords: ['摇摆', '不合', '不敢选'],
    upright:
      '这不只是感情牌，更是一张"选择"牌。选那个你愿意为之承担后果的，而不是看起来最划算的。',
    reversed:
      '你在两件事之间来回站，把自己耗掉了。也可能这段关系里，有个人一直在忍。',
    accent: '#e78aa6',
  },
  {
    id: 7,
    roman: 'VII',
    name: '战车',
    nameEn: 'The Chariot',
    motif: '驾着战车，车前一黑一白两只狮身兽，顶上是星星华盖。',
    uprightKeywords: ['往前推', '收心', '方向明确'],
    reversedKeywords: ['失控', '使蛮力', '方向不清'],
    upright:
      '两只兽往两个方向拉，但缰绳在你手上。现在的关键是别分心——把力气收拢到一个方向上，就能动起来。',
    reversed:
      '你在猛冲，但没看方向；或者表面在前进、内里已经散了。停三分钟，确认一下要去哪。',
    accent: '#7fc8d8',
  },
  {
    id: 8,
    roman: 'VIII',
    name: '力量',
    nameEn: 'Strength',
    motif: '一位女子轻轻按住狮子的口鼻，头顶悬着无限符号。',
    uprightKeywords: ['温柔地用力', '耐心', '驯服'],
    reversedKeywords: ['硬撑', '自我怀疑', '压抑'],
    upright:
      '真正的力气不是把狮子打服，是伸手摸它的头。对自己、对这件事，都用这种方式——慢，但有效。',
    reversed:
      '你在硬撑，把"我能忍"错当成了力量。也可能是那股劲被压得太久，快撑不住了。',
    accent: '#e0a03f',
  },
  {
    id: 9,
    roman: 'IX',
    name: '隐者',
    nameEn: 'The Hermit',
    motif: '独自站在山顶，提着一盏灯，灯里是一颗六角星。',
    uprightKeywords: ['独处', '自己找答案', '慢下来'],
    reversedKeywords: ['孤立', '躲起来', '怕见人'],
    upright:
      '现在不需要热闹。把灯举高一点，照脚下那三步就够了——你要的答案在你自己的经验里，不在别人嘴里。',
    reversed:
      '独处变成了躲。也可能是你已经在山上待太久，该下山见见人了。',
    accent: '#8a94a6',
  },
  {
    id: 10,
    roman: 'X',
    name: '命运之轮',
    nameEn: 'Wheel of Fortune',
    motif: '一枚刻着 TARO 的轮子转着，四角是四个读着书的生灵。',
    uprightKeywords: ['转折', '时候到了', '顺势'],
    reversedKeywords: ['卡住', '重复', '时机不对'],
    upright:
      '轮子转到你这边了。这种时候不用问"我配不配"，顺着走就行——机会来的时候往往长得不像机会。',
    reversed:
      '同一件事你又遇上了一遍，说明上一次的功课没做完。也可能是时机真的还没到，硬推会更累。',
    accent: '#b28ad4',
  },
  {
    id: 11,
    roman: 'XI',
    name: '正义',
    nameEn: 'Justice',
    motif: '一手举剑、一手持天平，身后是两根柱子之间的紫幕。',
    uprightKeywords: ['因果', '如实看', '该负责'],
    reversedKeywords: ['偏颇', '逃避责任', '委屈'],
    upright:
      '这一步的账，早晚要算。诚实一点——包括对自己。你现在的处境，大半是你之前的选择攒出来的，这不是指责，是好消息：**能攒出来就能改**。',
    reversed:
      '你在给自己找理由，或者被人不公平地对待。分清是"我错了"还是"我被亏待了"，这两件事的解法完全不同。',
    accent: '#5fb3a1',
  },
  {
    id: 12,
    roman: 'XII',
    name: '吊人',
    nameEn: 'The Hanged Man',
    motif: '一条腿倒吊在 T 形树上，双手背在身后，头上一圈光。',
    uprightKeywords: ['换个角度', '等待', '主动放弃'],
    reversedKeywords: ['白等', '拖延', '不甘心'],
    upright:
      '你现在动不了，但那不是被困住，是换了个角度。倒过来看，有些事的样子会完全不一样。别急着下来。',
    reversed:
      '你在等一个不会来的东西，而且等的姿势已经僵了。也可能是嘴上说"放下了"，心里一直没放。',
    accent: '#6fa8c9',
  },
  {
    id: 13,
    roman: 'XIII',
    name: '死神',
    nameEn: 'Death',
    motif: '白骨骑士举着白玫瑰旗，远处一轮太阳正在升起。',
    uprightKeywords: ['结束', '腾空', '让位给新的'],
    reversedKeywords: ['拖着不放', '怕变', '假结束'],
    upright:
      '这不是死亡，是收割——该结束的那件事真的该结束了。它腾出来的位置，是为了让别的东西长进来。',
    reversed:
      '你知道该结束了，但手一直没松。拖着不会更好，只会让新的东西也进不来。',
    accent: '#cfc7bb',
  },
  {
    id: 14,
    roman: 'XIV',
    name: '节制',
    nameEn: 'Temperance',
    motif: '一位天使一只脚在水中、一只脚在岸上，两个杯子之间倒着水。',
    uprightKeywords: ['调和', '慢慢来', '别走极端'],
    reversedKeywords: ['失衡', '过量', '两头顾不上'],
    upright:
      '这件事不需要猛药，需要比例。给自己定个能长期走下去的量——不是今天做到满分，是明天还能接着做。',
    reversed:
      '有一头明显地压过了另一头。也可能是你在两件事之间来回救火，哪头都没照顾好。',
    accent: '#d9c48a',
  },
  {
    id: 15,
    roman: 'XV',
    name: '恶魔',
    nameEn: 'The Devil',
    motif: '山羊头的身影下，两个人被松松的锁链拴着，链子其实能摘下来。',
    uprightKeywords: ['欲望', '上瘾', '自己拴的自己'],
    reversedKeywords: ['松绑', '看穿了', '戒断中'],
    upright:
      '让你难受的那件事，你现在其实是被它喂着的。链子不紧——**你没摘，是因为还想要那点好处**。先承认这一点，比骂自己有用。',
    reversed:
      '你开始看清那个循环了，甚至已经在往外走。过程中会反复，这是正常的，别因为一次回头就判自己失败。',
    accent: '#a33f3f',
  },
  {
    id: 16,
    roman: 'XVI',
    name: '塔',
    nameEn: 'The Tower',
    motif: '一道闪电击中高塔，王冠被掀飞，两个人正在坠落。',
    uprightKeywords: ['崩掉', '真相', '不得不重建'],
    reversedKeywords: ['拖着的危机', '迟早的事', '侥幸'],
    upright:
      '它塌了。但塌掉的是那个本来就撑不住的东西——你其实早就知道它有问题。现在虽然难看，但至少是真实的。',
    reversed:
      '同样的事没塌，但裂缝还在，你在小心翼翼地绕开它。与其天天提心吊胆，不如找个时间主动处理。',
    accent: '#e07840',
  },
  {
    id: 17,
    roman: 'XVII',
    name: '星星',
    nameEn: 'The Star',
    motif: '一位女子跪在池边，两只水罐一倒进水里、一倒在岸上，头顶八颗星。',
    uprightKeywords: ['恢复', '有盼头', '安静地好起来'],
    reversedKeywords: ['灰心', '不信了', '关掉了自己'],
    upright:
      '最难的那段过去了。现在不需要做什么大事，只要让水一点一点倒回去——睡好、吃饭、见光。会好的，只是慢。',
    reversed:
      '你把希望收起来了，因为失望过太多次。可以理解，但完全不信也挺累的——留一条缝。',
    accent: '#8fc7e8',
  },
  {
    id: 18,
    roman: 'XVIII',
    name: '月亮',
    nameEn: 'The Moon',
    motif: '月亮里有一张脸，两只犬狼对月而吠，一只甲壳动物从水里爬上岸。',
    uprightKeywords: ['不安', '看不清', '旧情绪翻上来'],
    reversedKeywords: ['雾散了', '面对', '不再怕'],
    upright:
      '你现在怕的东西，有一半是自己的影子。夜里看不清的时候，判断力是要打折的——今天别做重大决定，等天亮。',
    reversed:
      '雾正在散。你开始能分清"事实"和"我脑补的版本"了，这是很关键的一步。',
    accent: '#ded6c4',
  },
  {
    id: 19,
    roman: 'XIX',
    name: '太阳',
    nameEn: 'The Sun',
    motif: '一个孩子骑着白马从围墙里出来，头顶一轮带脸的大太阳，身后是向日葵。',
    uprightKeywords: ['坦荡', '被看见', '好起来'],
    reversedKeywords: ['强颜欢笑', '延迟的好', '不好意思高兴'],
    upright:
      '可以高兴，不用先想"万一后面变差呢"。这一段时间就是好的，允许自己直接享用，别打折。',
    reversed:
      '好事在，但你没敢全收下；或者你在别人面前笑着，回去却更累。也可能是好消息晚了一点，但它确实在路上。',
    accent: '#f0c674',
  },
  {
    id: 20,
    roman: 'XX',
    name: '审判',
    nameEn: 'Judgement',
    motif: '天使吹响号角，旗上是十字，棺中的人举起双手回应。',
    uprightKeywords: ['清算', '被叫醒', '翻篇'],
    reversedKeywords: ['自责', '听不见', '不原谅自己'],
    upright:
      '有一件事该做个了结了——不是别人审判你，是你自己终于愿意回头看。把该承认的承认了，然后就可以往前走。',
    reversed:
      '你在反复给自己定罪，把"反省"做成了自我惩罚。反省是为了往前走，不是为了停在原地挨骂。',
    accent: '#86b7d4',
  },
  {
    id: 21,
    roman: 'XXI',
    name: '世界',
    nameEn: 'The World',
    motif: '一个舞者被桂冠花环围住，四角是四个读着书的生灵。',
    uprightKeywords: ['完成', '闭环', '可以走了'],
    reversedKeywords: ['差一口气', '收不了尾', '舍不得'],
    upright:
      '这一段走完了，而且走得挺完整。允许自己说一句"我做到了"——很多人跳过这一步就去赶下一程，结果一直觉得空。',
    reversed:
      '只差最后一点点了，但你在拖——有时候是因为不想结束。收个尾吧，哪怕收得不完美。',
    accent: '#6fae8a',
  },
]

/** 抽到的牌：牌本身 + 正逆位 */
export interface TarotDraw {
  card: TarotCard
  /** true = 逆位 */
  reversed: boolean
}

/**
 * 洗牌抽牌。
 *
 * 用 Fisher–Yates，并且从 crypto 取随机数 —— 塔罗这事儿，
 * 用 Math.random 会让人觉得"是不是写死的"，用真随机至少对得起这个仪式感。
 */
export function drawTarot(count: number): TarotDraw[] {
  const pool = [...TAROT_CARDS]

  // Fisher–Yates 洗牌
  for (let i = pool.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1)
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  return pool.slice(0, Math.max(0, Math.min(count, pool.length))).map((card) => ({
    card,
    // 逆位概率约 1/3 —— 和真实塔罗里"逆位偏少"的习惯一致
    reversed: secureRandomInt(3) === 0,
  }))
}

/** [0, max) 之间的安全随机整数；没有 crypto 时退回 Math.random */
function secureRandomInt(max: number): number {
  if (max <= 1) return 0

  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (cryptoObj?.getRandomValues) {
    // 取一个足够大的范围再取模，避免截断偏差
    const limit = Math.floor(0xffffffff / max) * max
    const buffer = new Uint32Array(1)
    let value = 0
    do {
      cryptoObj.getRandomValues(buffer)
      value = buffer[0]
    } while (value >= limit)
    return value % max
  }

  return Math.floor(Math.random() * max)
}

/** 三张牌的牌阵：过去 / 现在 / 未来 */
export const THREE_CARD_SPREAD = [
  { label: '过去', hint: '把你带到这里的' },
  { label: '现在', hint: '你正站的地方' },
  { label: '接下来', hint: '顺着走会遇到的' },
] as const
