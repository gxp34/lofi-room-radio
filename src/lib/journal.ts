import type { JournalBlock, JournalPhoto } from '@/types'

/**
 * 手帐正文的「图文混排」规则。
 *
 * 正文就是普通文字，想在某处插一张照片，就单独占一行写：
 *
 *     [[photo:照片的id]]
 *     [[photo:照片的id|这张的说明文字]]
 *
 * 为什么不用完整 Markdown 的 `![](url)`：
 *   照片地址是**运行时**才算出来的（公开桶用 publicUrl，私有桶要签名），
 *   正文里存死 URL 会在桶切换、签名过期之后全部失效。
 *   所以正文里只存**照片 id**，地址在渲染时查表填进去。
 *
 * 没有被任何占位符引用的照片，会按 sort 顺序统一补在正文后面 ——
 * 这样「上传了但忘了插进正文」的照片也不会丢。
 */

/** 一行照片占位符 */
const PLACEHOLDER_LINE = /^\[\[photo:([0-9a-zA-Z-]+)(?:\|([^\]]*))?\]\]$/

/** 生成一行占位符 */
export function photoPlaceholder(photoId: string, caption?: string): string {
  return caption ? `[[photo:${photoId}|${caption}]]` : `[[photo:${photoId}]]`
}

/** 在正文末尾追加一张照片 */
export function appendPhotoPlaceholder(content: string, photoId: string, caption?: string): string {
  const line = photoPlaceholder(photoId, caption)
  const trimmed = content.replace(/\s+$/, '')
  return trimmed.length === 0 ? line : `${trimmed}\n\n${line}`
}

/** 从正文里摘掉某一行的占位符（删除照片时用） */
export function removePhotoPlaceholder(content: string, photoId: string): string {
  return content
    .split('\n')
    .filter((line) => {
      const match = line.trim().match(PLACEHOLDER_LINE)
      return !(match && match[1] === photoId)
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

/**
 * 把正文解析成「文字块 / 照片块」的序列，供渲染层直接遍历。
 */
export function parseJournalBlocks(content: string, photos: JournalPhoto[]): JournalBlock[] {
  const byId = new Map(photos.map((photo) => [photo.id, photo]))
  const used = new Set<string>()
  const blocks: JournalBlock[] = []

  let buffer: string[] = []
  let index = 0

  const flushText = () => {
    if (buffer.length === 0) return
    const text = buffer.join('\n').trim()
    buffer = []
    if (text.length > 0) {
      blocks.push({ type: 'text', key: `text-${index++}`, text })
    }
  }

  for (const line of content.split('\n')) {
    const match = line.trim().match(PLACEHOLDER_LINE)
    const photo = match?.[1] ? byId.get(match[1]) : undefined

    if (match && photo) {
      flushText()
      used.add(photo.id)
      blocks.push({
        type: 'photo',
        key: `photo-${photo.id}`,
        photo,
        // 占位符里写了说明就用它，否则用照片自己的 caption
        caption: match[2]?.trim() || photo.caption || null,
      })
      continue
    }

    // 匹配不到照片的占位符（比如照片被删了）当普通文字留着，方便站长发现
    buffer.push(line)
  }

  flushText()

  // 没被引用的照片补在后面
  const leftovers = photos.filter((photo) => !used.has(photo.id)).sort((a, b) => a.sort - b.sort)
  for (const photo of leftovers) {
    blocks.push({
      type: 'photo',
      key: `photo-${photo.id}`,
      photo,
      caption: photo.caption || null,
    })
  }

  return blocks
}

/** 这条手帐里所有照片的展示顺序（灯箱用它翻页） */
export function orderedPhotos(blocks: JournalBlock[]): JournalPhoto[] {
  return blocks.filter((block) => block.type === 'photo').map((block) => block.photo)
}

/** 摘要：去掉占位符和大部分 Markdown 记号，用于列表预览 */
export function journalExcerpt(content: string, max = 90): string {
  const plain = content
    .replace(/\[\[photo:[^\]]*\]\]/g, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  return plain.length > max ? `${plain.slice(0, max)}…` : plain
}

/** 手帐里有多少张照片 */
export function photoCount(blocks: JournalBlock[]): number {
  return blocks.filter((block) => block.type === 'photo').length
}
