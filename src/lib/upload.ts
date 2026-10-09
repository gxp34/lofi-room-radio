import type { SupabaseClient } from '@supabase/supabase-js'

import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS } from '@/lib/constants'
import { storageObjectName } from '@/lib/utils'
import type { Database } from '@/types/database'

/**
 * 上传相关的浏览器端小工具。
 *
 * 这里的所有函数都跑在浏览器里 —— 文件直接从浏览器传到 Supabase Storage，
 * 不经过 Vercel 的函数（那边有 4.5MB 的请求体限制）。
 * 能不能传由 Storage 的 RLS 决定：只有登录的站长能写进那四个桶。
 */

/** 浏览器有时给不出 file.type（尤其是 m4a / flac），按扩展名兜一个 */
export function mimeFromName(name: string): string {
  const lower = name.toLowerCase()

  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.aac')) return 'audio/aac'
  if (lower.endsWith('.ogg') || lower.endsWith('.oga')) return 'audio/ogg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.flac')) return 'audio/flac'
  if (lower.endsWith('.webm')) return 'audio/webm'

  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.avif')) return 'image/avif'
  if (lower.endsWith('.gif')) return 'image/gif'

  return 'application/octet-stream'
}

/** 判断是不是音频 / 图片（按扩展名，够用且不会误判） */
export function isAudioFile(name: string): boolean {
  const lower = name.toLowerCase()
  return AUDIO_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

export function isImageFile(name: string): boolean {
  const lower = name.toLowerCase()
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

/**
 * 读出音频时长（秒）。
 * 用一个临时 <audio> + objectURL 探测，读完立刻释放，不上传、不播放。
 */
export function probeAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null)
      return
    }

    const url = URL.createObjectURL(file)
    const audio = new Audio()

    const cleanup = (value: number | null) => {
      audio.removeAttribute('src')
      URL.revokeObjectURL(url)
      resolve(value)
    }

    // 万一元数据一直读不出来，别把界面卡住
    const timer = window.setTimeout(() => cleanup(null), 5000)

    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', () => {
      window.clearTimeout(timer)
      const seconds = Number.isFinite(audio.duration) ? Math.round(audio.duration) : null
      cleanup(seconds)
    })
    audio.addEventListener('error', () => {
      window.clearTimeout(timer)
      cleanup(null)
    })

    audio.src = url
  })
}

export type UploadClient = SupabaseClient<Database>

export interface UploadResult {
  path: string
  size: number
  type: string
}

/**
 * 传一个文件到指定桶。
 * 路径形如 `audio/20240611-a3f9-歌名.mp3`，按时间前缀排序，也不会重名。
 */
export async function uploadFile(
  supabase: UploadClient,
  bucket: string,
  file: File,
  folder: string,
): Promise<UploadResult> {
  const type = file.type || mimeFromName(file.name)
  const path = `${folder}/${storageObjectName(file.name)}`

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: type,
    upsert: false,
    cacheControl: '31536000',
  })

  if (error) {
    // 把 Supabase 的英文错误翻译成能看懂的中文
    const message = error.message.toLowerCase()
    if (message.includes('mime type') || message.includes('not supported')) {
      throw new Error('这个文件类型不被允许。音频支持 mp3 / m4a / aac / ogg / wav / flac，图片支持 jpg / png / webp。')
    }
    if (message.includes('exceeded the maximum allowed size') || message.includes('too large')) {
      throw new Error('文件超过了存储桶的大小限制（音频 25MB、图片 5MB）。')
    }
    if (message.includes('row-level security') || message.includes('unauthorized')) {
      throw new Error('没有上传权限。确认你已经用站长账号登录，并且执行过 0003_storage.sql。')
    }
    throw new Error(`上传失败：${error.message}`)
  }

  return { path, size: file.size, type }
}
