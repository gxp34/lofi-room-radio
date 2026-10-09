import { createHash } from 'node:crypto'

import { TREEHOLE_IP_SALT } from '@/lib/env.server'

/**
 * 树洞的服务端工具：IP 哈希、敏感词扫描、内容规整。
 *
 * 这个文件用到 node:crypto，**只能在服务端导入**。
 * 下面的守卫是为了防止有人不小心把它 import 进客户端组件 —— 那样构建会直接失败，
 * 比上线后才发现要好。
 */

if (typeof window !== 'undefined') {
  throw new Error('[treehole] 这个模块只能在服务端使用（Route Handler / Server Action）。')
}

/* --------------------------------------------------------------------------
   1. IP → 哈希
   -------------------------------------------------------------------------- */

/**
 * 把访客 IP 变成不可反推的哈希。
 *
 * 为什么不用明文：树洞是给陌生人说心里话的地方，
 * 存明文 IP 等于给每一句话配了门牌号。这里只保留「能不能认出是同一个人」的能力，
 * 也就是限流需要的最小信息量。
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`${TREEHOLE_IP_SALT}:${ip}`).digest('hex').slice(0, 32)
}

/**
 * 从请求头里取访客 IP。
 * Vercel / Cloudflare / 自建反代写的头都不一样，这里挨个试一遍。
 */
export function getClientIp(headers: Headers): string {
  const candidates = [
    headers.get('x-forwarded-for')?.split(',')[0],
    headers.get('x-real-ip'),
    headers.get('cf-connecting-ip'),
    headers.get('x-vercel-forwarded-for')?.split(',')[0],
  ]

  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (value) return value
  }

  // 本地开发时拿不到，用一个固定值（限流仍然生效，只是所有人都算同一个人）
  return '127.0.0.1'
}

/* --------------------------------------------------------------------------
   2. 敏感词扫描
   -------------------------------------------------------------------------- */

/** 去掉空格和常见标点，防止「身 份 证」这种拆字绕过 */
function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[.\-_*·、,，。!！?？;；:：'"“”‘’()（）\[\]【】<>《》/\\|~`^]/g, '')
}

/**
 * 扫一遍敏感词，返回命中的词。
 *
 * 注意：**命中不等于拒绝**。
 * 树洞里很多话本来就该被说出来（比如提到「银行卡」可能是被诈骗了），
 * 所以这里只做标记，交给站长在后台人工看 —— 打标签，不封嘴。
 */
export function scanBannedWords(text: string, words: string[]): string[] {
  const normalized = normalizeForMatch(text)
  const hits: string[] = []

  for (const word of words) {
    if (!word) continue
    const needle = normalizeForMatch(word)
    if (needle && normalized.includes(needle)) {
      hits.push(word)
    }
  }

  return hits
}

/* --------------------------------------------------------------------------
   3. 内容规整 & 防刷
   -------------------------------------------------------------------------- */

/** 规整空白：连续空行压成一个，行尾空格去掉 */
export function normalizeContent(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 疑似垃圾内容（大量重复字符 / 一堆链接） */
export function looksLikeSpam(text: string): boolean {
  // 同一个字符连续出现 12 次以上
  if (/(.)\1{11,}/u.test(text)) return true

  // 链接超过 3 个
  const links = text.match(/https?:\/\//gi)
  if (links && links.length > 3) return true

  return false
}

/** 昵称兜底：空的话就叫「匿名」 */
export function normalizeNickname(nickname: string | undefined): string {
  const trimmed = (nickname ?? '').trim()
  if (!trimmed) return '匿名'
  return trimmed.slice(0, 24)
}
