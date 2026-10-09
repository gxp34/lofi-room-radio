/**
 * 图片处理（全部在浏览器里做，不上传原图）。
 *
 * 做三件事：
 *   1. **剥掉 EXIF**。手机拍的照片里带着 GPS 坐标、设备型号、拍摄时间。
 *      直接传到公开桶等于把「我住在哪」写在网页上。
 *      做法是「解码 → 画到 canvas → 重新编码」：canvas 只保留像素，
 *      所有元数据段（EXIF / GPS / XMP / 缩略图）在重编码时全部消失。
 *      转换前先用 `imageOrientation: 'from-image'` 把方向读对，
 *      否则竖拍的照片会躺下。
 *   2. **压缩**。长边限制 + WebP 编码，手机直出 4MB 的照片通常能压到 200–400KB。
 *   3. **生成缩略图**。列表页只加载缩略图，点开灯箱才加载原图。
 *
 * 输出之后还会**回头检查一遍**产物里有没有 EXIF 标记 ——
 * 不能只说「我剥了」，要能证明。
 */

export interface ProcessedImage {
  /** 压缩后的原图 */
  full: Blob
  /** 缩略图 */
  thumb: Blob
  width: number
  height: number
  thumbWidth: number
  thumbHeight: number
  /** 产物里是否还残留 EXIF 标记（正常永远是 false） */
  exifRemoved: boolean
}

export interface ProcessOptions {
  /** 原图长边上限 */
  maxEdge?: number
  /** 缩略图长边上限 */
  thumbEdge?: number
  /** 质量 0~1 */
  quality?: number
  thumbQuality?: number
}

const DEFAULTS: Required<ProcessOptions> = {
  maxEdge: 2000,
  thumbEdge: 480,
  quality: 0.82,
  thumbQuality: 0.72,
}

/** 按长边等比缩放 */
function fit(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** 缩放 + 重编码成 Blob */
async function encode(
  source: ImageBitmap,
  targetWidth: number,
  targetHeight: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const context = canvas.getContext('2d')
  if (!context) throw new Error('这台设备不支持 canvas，没法压缩图片。')

  // 铺一层白底：带透明通道的 PNG 转 WebP/JPEG 时不会变成黑块
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, targetWidth, targetHeight)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, targetWidth, targetHeight)

  const toBlob = (type: string, q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q))

  // WebP 是首选（同画质体积小 30% 左右），不支持就退回 JPEG
  const webp = await toBlob('image/webp', quality)
  if (webp && webp.type === 'image/webp') return webp

  const jpeg = await toBlob('image/jpeg', quality)
  if (!jpeg) throw new Error('图片编码失败了。')
  return jpeg
}

/**
 * 检查一段二进制里有没有 EXIF / GPS 标记。
 * 只看文件头部的几个段，不做完整解析 —— 这里要的是「有没有」。
 */
export async function hasExifMarker(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer())
  const text = String.fromCharCode(...head.subarray(0, Math.min(head.length, 8192)))

  // JPEG 的 APP1 段以 "Exif\0\0" 开头；XMP 里会直接出现 GPS 相关的命名空间
  return (
    text.includes('Exif') ||
    text.includes('http://ns.adobe.com/xap') ||
    text.includes('GPS')
  )
}

/**
 * 处理一张图：剥 EXIF + 压缩 + 出缩略图。
 * 失败会抛出中文错误，调用方直接 toast 出来。
 */
export async function processImage(file: File, options: ProcessOptions = {}): Promise<ProcessedImage> {
  const config = { ...DEFAULTS, ...options }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('这张图读不出来，可能格式不对或者文件坏了。')
  }

  try {
    const full = fit(bitmap.width, bitmap.height, config.maxEdge)
    const thumb = fit(bitmap.width, bitmap.height, config.thumbEdge)

    const fullBlob = await encode(bitmap, full.width, full.height, config.quality)
    const thumbBlob = await encode(bitmap, thumb.width, thumb.height, config.thumbQuality)

    // 验证：产物里不该再有 EXIF
    const stillHasExif = await hasExifMarker(fullBlob)

    return {
      full: fullBlob,
      thumb: thumbBlob,
      width: full.width,
      height: full.height,
      thumbWidth: thumb.width,
      thumbHeight: thumb.height,
      exifRemoved: !stillHasExif,
    }
  } finally {
    bitmap.close()
  }
}

/** 人类可读的体积，用来在上传队列里显示「省了多少」 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 从文件名生成一个安全的存储路径片段（不含扩展名） */
export function baseName(name: string): string {
  const dot = name.lastIndexOf('.')
  const raw = dot > 0 ? name.slice(0, dot) : name
  return (
    raw
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'photo'
  )
}
