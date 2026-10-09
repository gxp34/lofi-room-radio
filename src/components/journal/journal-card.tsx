'use client'

import * as React from 'react'
import { CloudRain, Hash, Pin } from 'lucide-react'

import { RichText } from '@/components/journal/rich-text'
import { MOOD_MAP, WEATHER_OPTIONS } from '@/lib/constants'
import { parseJournalBlocks } from '@/lib/journal'
import { cn } from '@/lib/utils'
import type { JournalBlock, JournalEntry, JournalPhoto } from '@/types'

/**
 * 一条手帐 = 一页摊开的本子。
 *
 * 排版跟着「手帐」这个形态走：
 *   · 照片做成拍立得（白边、胶带、轻微歪斜），下面写说明
 *   · 文字段落直接排在纸面上
 *   · 两者按正文里的 [[photo:id]] 占位符交替出现，所以可以「一段字、一张图、再一段字」
 */

const WEATHER_MAP = Object.fromEntries(WEATHER_OPTIONS.map((item) => [item.value, item]))

/** 拍立得：稍微歪一点，像随手贴上去的 */
function Polaroid({
  photo,
  caption,
  tilt,
  onOpen,
  priority,
}: {
  photo: JournalPhoto
  caption: string | null
  tilt: number
  onOpen: () => void
  priority?: boolean
}) {
  const ratio = photo.width && photo.height ? photo.width / photo.height : 4 / 3

  return (
    <figure
      className="group relative mx-auto w-full max-w-[22rem] sm:max-w-[24rem]"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {/* 胶带 */}
      <span
        aria-hidden
        className="absolute -top-2.5 left-1/2 z-10 h-5 w-16 -translate-x-1/2 rotate-[-3deg] rounded-[1px] bg-[#e8dcc0]/70 shadow-sm backdrop-blur-[1px]"
      />

      <button
        type="button"
        onClick={onOpen}
        aria-label={caption ? `查看照片：${caption}` : '查看照片'}
        className="block w-full rounded-[3px] bg-[#f3ece1] p-2.5 pb-3 shadow-[0_14px_30px_-14px_rgba(0,0,0,0.85)] transition-transform duration-200 group-hover:-translate-y-0.5"
      >
        <span
          className="block w-full overflow-hidden rounded-[2px] bg-[#1b1622]"
          style={{ aspectRatio: `${ratio}` }}
        >
          {/* 用原生 img：照片走 Supabase 的 publicUrl / 签名地址，
              交给 next/image 会吃掉 Vercel 的图片优化额度，个人站没必要 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.thumbUrl}
            alt={caption ?? '手帐照片'}
            width={photo.width ?? undefined}
            height={photo.height ?? undefined}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className="h-full w-full object-cover"
          />
        </span>

        {caption && (
          <figcaption className="mt-2.5 px-1 text-center font-display text-[11px] leading-relaxed text-[#2b2230]/75">
            {caption}
          </figcaption>
        )}
      </button>
    </figure>
  )
}

export interface JournalCardProps {
  entry: JournalEntry
  /** 从抽屉里翻出来的那本旧手帐 —— 会有一圈高亮 */
  highlighted?: boolean
  /** 点开某张照片（index 是这条手帐里的第几张） */
  onOpenPhoto: (entryId: string, index: number) => void
}

export function JournalCard({ entry, highlighted, onOpenPhoto }: JournalCardProps) {
  const blocks = React.useMemo(
    () => parseJournalBlocks(entry.content, entry.photos),
    [entry.content, entry.photos],
  )

  // 灯箱翻页的顺序 = 页面上出现的顺序
  const ordered = React.useMemo(
    () => blocks.filter((b): b is Extract<JournalBlock, { type: 'photo' }> => b.type === 'photo'),
    [blocks],
  )
  const indexOfPhoto = React.useMemo(() => {
    const map = new Map<string, number>()
    ordered.forEach((block, index) => map.set(block.photo.id, index))
    return map
  }, [ordered])

  const mood = entry.mood ? MOOD_MAP[entry.mood] : undefined
  const weather = entry.weather ? WEATHER_MAP[entry.weather] : undefined
  const date = new Date(entry.publishedAt ?? entry.createdAt)
  const dateText = Number.isNaN(date.getTime())
    ? ''
    : `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`

  return (
    <article
      className={cn(
        'paper relative rounded-xl p-5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] sm:p-7',
        highlighted && 'ring-2 ring-lamp/60',
      )}
    >
      {/* 装订孔 */}
      <span
        aria-hidden
        className="absolute inset-y-6 left-2 hidden w-3 flex-col justify-around sm:flex"
      >
        {Array.from({ length: 5 }).map((_, index) => (
          <span key={index} className="h-2 w-2 rounded-full bg-[#2b2230]/12" />
        ))}
      </span>

      <div className="sm:pl-6">
        {/* 页眉 */}
        <header className="mb-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#2b2230]/55">
            <time dateTime={entry.publishedAt ?? entry.createdAt} className="font-display">
              {dateText}
            </time>
            {mood && (
              <span>
                {mood.emoji} {mood.label}
              </span>
            )}
            {weather && (
              <span>
                {weather.emoji} {weather.label}
              </span>
            )}
            {entry.isPinned && (
              <span className="flex items-center gap-1 text-[#b8566e]">
                <Pin className="h-3 w-3" aria-hidden />
                置顶
              </span>
            )}
            {entry.visibility === 'private' && (
              <span className="rounded-full bg-[#2b2230]/10 px-2 py-0.5">私密</span>
            )}
          </div>

          <h2 className="mt-1.5 font-display text-xl leading-snug text-[#2b2230] sm:text-2xl">
            {entry.title}
          </h2>

          {entry.tags.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {entry.tags.map((tag) => (
                <li
                  key={tag}
                  className="flex items-center gap-0.5 font-display text-[10px] text-[#2b2230]/50"
                >
                  <Hash className="h-2.5 w-2.5" aria-hidden />
                  {tag}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 h-px w-full bg-[#2b2230]/10" />
        </header>

        {/* 图文混排 */}
        <div className="space-y-5">
          {blocks.map((block) => {
            if (block.type === 'text') {
              return <RichText key={block.key} text={block.text} className="text-[#2b2230]" />
            }

            const index = indexOfPhoto.get(block.photo.id) ?? 0
            // 交替倾斜，看起来像手贴的
            const tilt = index % 2 === 0 ? -1.1 : 1.3

            return (
              <Polaroid
                key={block.key}
                photo={block.photo}
                caption={block.caption}
                tilt={tilt}
                priority={index === 0}
                onOpen={() => onOpenPhoto(entry.id, index)}
              />
            )
          })}
        </div>

        {/* 页脚：这张纸的小注脚 */}
        <footer className="mt-6 flex items-center justify-between border-t border-[#2b2230]/10 pt-3 text-[10px] text-[#2b2230]/40">
          <span className="flex items-center gap-1">
            <CloudRain className="h-3 w-3" aria-hidden />
            {entry.photos.length > 0 ? `${entry.photos.length} 张照片` : '没有照片'}
          </span>
          <span className="font-display">Lo-fi 房间电台</span>
        </footer>
      </div>
    </article>
  )
}
