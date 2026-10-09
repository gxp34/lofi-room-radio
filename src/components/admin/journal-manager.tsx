'use client'

import * as React from 'react'
import {
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  Pin,
  PinOff,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { ActionButton } from '@/components/admin/action-button'
import { Field, Section, Tag } from '@/components/admin/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  DIARY_TAGS,
  JOURNAL_IMAGE_OPTIONS,
  JOURNAL_PHOTO_MAX_MB,
  JOURNAL_VISIBILITY_HINT,
  MOOD_OPTIONS,
  STORAGE_BUCKETS,
  WEATHER_OPTIONS,
} from '@/lib/constants'
import {
  addJournalPhotos,
  createJournalEntry,
  deleteJournalEntry,
  deleteJournalPhoto,
  moveJournalEntry,
  setJournalCover,
  setJournalPinned,
  updateJournalEntry,
  updateJournalPhoto,
} from '@/lib/admin/journal'
import { formatSize, processImage } from '@/lib/image'
import { appendPhotoPlaceholder } from '@/lib/journal'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { DiaryVisibility, JournalEntry } from '@/types'

/**
 * 图文手帐的后台。
 *
 * 上传链路（每一环都是必须的）：
 *   拖进文件 → 浏览器里 decode/重编码（**这一步顺带剥掉 EXIF 和 GPS**）
 *   → 压到长边 2000 → 同时生成 480 的缩略图
 *   → 直传 Supabase Storage（不经过 Vercel，那边有 4.5MB 上限）
 *   → 写 journal_photos 表 → 把占位符插进正文
 *
 * 公开手帐的照片进 journal-photos，私密/口令手帐的进 private-journal-photos。
 * 可见性后来又改了的话，服务端会把文件在两个桶之间搬过去。
 */

export function JournalManager({ entries }: { entries: JournalEntry[] }) {
  const [creating, setCreating] = React.useState(entries.length === 0)
  const [expandedId, setExpandedId] = React.useState<string | null>(null)
  const [justCreatedId, setJustCreatedId] = React.useState<string | null>(null)

  // 新建成功之后，等列表刷新出新数据再把那一篇自动展开，方便马上拖照片
  React.useEffect(() => {
    if (!justCreatedId) return
    if (entries.some((entry) => entry.id === justCreatedId)) {
      setExpandedId(justCreatedId)
      setJustCreatedId(null)
    }
  }, [entries, justCreatedId])

  return (
    <div className="space-y-5">
      <Section
        title="写一页新的"
        description="先写标题和正文，保存之后就能把照片拖进来了。"
        actions={
          <Button
            variant={creating ? 'ghost' : 'default'}
            size="sm"
            onClick={() => setCreating((value) => !value)}
          >
            {creating ? <X className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
            {creating ? '收起' : '新建'}
          </Button>
        }
      >
        {creating ? (
          <JournalEditor
            mode="create"
            onSaved={(id) => {
              setJustCreatedId(id)
              setCreating(false)
            }}
          />
        ) : (
          <p className="text-xs text-dust">点右上角「新建」开始。</p>
        )}
      </Section>

      <Section title={`本子里的（${entries.length} 页）`} description="置顶的排最前面，其余按排序值。">
        {entries.length === 0 ? (
          <p className="text-xs text-dust">还没有写过任何一页。</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id}>
                <JournalRow
                  entry={entry}
                  expanded={expandedId === entry.id}
                  onToggle={() =>
                    setExpandedId((current) => (current === entry.id ? null : entry.id))
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

/* ==========================================================================
   列表里的一行
   ========================================================================== */

function JournalRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: JournalEntry
  expanded: boolean
  onToggle: () => void
}) {
  const cover = entry.photos[0]

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {/* 封面缩略图 */}
          <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-night/50">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover.thumbUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="h-5 w-5 text-dust" aria-hidden />
            )}
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-display text-sm text-paper">{entry.title}</span>
              <VisibilityTag visibility={entry.visibility} />
              {entry.isPinned && (
                <Tag tone="lamp">
                  <Pin className="mr-1 h-2.5 w-2.5" aria-hidden />
                  置顶
                </Tag>
              )}
              {entry.photos.length > 0 && <Tag>共 {entry.photos.length} 张</Tag>}
            </div>
            <p className="mt-1 line-clamp-1 text-[11px] text-dust">
              {formatDateTime(entry.publishedAt ?? entry.createdAt)} · 排序 {entry.sort}
              {entry.tags.length > 0 && ` · ${entry.tags.join(' / ')}`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <ActionButton
            action={() => setJournalPinned(entry.id, !entry.isPinned)}
            variant="ghost"
            size="icon-sm"
            aria-label={entry.isPinned ? '取消置顶' : '置顶'}
            successMessage={entry.isPinned ? '取消置顶了。' : '置顶了。'}
          >
            {entry.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </ActionButton>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="上移"
            onClick={async () => {
              const result = await moveJournalEntry(entry.id, 'up')
              if (!result.ok) toast.error(result.error)
            }}
          >
            <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="下移"
            onClick={async () => {
              const result = await moveJournalEntry(entry.id, 'down')
              if (!result.ok) toast.error(result.error)
            }}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>

          <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? '收起' : '编辑'}
          </Button>

          <ActionButton
            action={() => deleteJournalEntry(entry.id)}
            confirm="确认删除？"
            successMessage="删掉了，照片也一起清了。"
            variant="ghost"
            size="icon-sm"
            aria-label="删除"
            className="text-dust hover:text-neon"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </ActionButton>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <JournalEditor
            mode="edit"
            entry={entry}
            onSaved={() => onToggle()}
            onCancel={() => onToggle()}
          />
        </div>
      )}
    </div>
  )
}

function VisibilityTag({ visibility }: { visibility: DiaryVisibility }) {
  if (visibility === 'public') return <Tag tone="lamp">公开</Tag>
  if (visibility === 'private') return <Tag tone="rain">私密</Tag>
  if (visibility === 'password') return <Tag tone="neon">口令</Tag>
  return <Tag>草稿</Tag>
}

/* ==========================================================================
   编辑器
   ========================================================================== */

interface JournalEditorProps {
  mode: 'create' | 'edit'
  entry?: JournalEntry
  /** 可以不传（开发预览页从服务端组件直接渲染时会省略掉函数 prop） */
  onSaved?: (id: string) => void
  onCancel?: () => void
}

/** 导出给开发预览页用：可以单独把编辑器渲染出来检查布局 */
export function JournalEditor({ mode, entry, onSaved, onCancel }: JournalEditorProps) {
  const [title, setTitle] = React.useState(entry?.title ?? '')
  const [content, setContent] = React.useState(entry?.content ?? '')
  const [mood, setMood] = React.useState(entry?.mood ?? '')
  const [weather, setWeather] = React.useState(entry?.weather ?? '')
  const [tags, setTags] = React.useState<string[]>(entry?.tags ?? [])
  const [visibility, setVisibility] = React.useState<DiaryVisibility>(entry?.visibility ?? 'draft')
  const [password, setPassword] = React.useState('')
  const [sort, setSort] = React.useState(entry?.sort ?? 0)
  const [isPinned, setIsPinned] = React.useState(entry?.isPinned ?? false)
  const [saving, setSaving] = React.useState(false)

  const [queue, setQueue] = React.useState<{ name: string; status: string }[]>([])
  const [dragging, setDragging] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const contentRef = React.useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const savedEntryId = entry?.id ?? null
  const canUpload = Boolean(savedEntryId)

  const toggleTag = (tag: string) => {
    setTags((previous) =>
      previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag].slice(0, 8),
    )
  }

  /* ---------------- 保存 ---------------- */

  async function save() {
    if (!title.trim()) {
      toast.error('给这一页起个标题吧。')
      return
    }
    if (!content.trim()) {
      toast.error('正文还是空的。')
      return
    }
    if (visibility === 'password' && mode === 'create' && password.trim().length === 0) {
      toast.error('选了口令可见，就得设一个口令。')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title,
        content,
        mood,
        weather,
        tags,
        visibility,
        isPinned,
        sort,
        password: password.trim() || undefined,
        coverPhoto: entry?.coverPhoto ?? null,
      }

      const result =
        mode === 'create'
          ? await createJournalEntry(payload)
          : await updateJournalEntry(entry?.id ?? '', payload)

      if (result.ok) {
        toast.success(mode === 'create' ? '写进去了。' : '改好了。')
        setPassword('')
        const id = mode === 'create' && 'data' in result ? result.data?.id : entry?.id
        onSaved?.(id ?? '')
      } else {
        toast.error(result.error)
      }
    } finally {
      setSaving(false)
    }
  }

  /* ---------------- 上传照片 ---------------- */

  /** 把照片插到正文里光标的位置；没聚焦就追加到末尾 */
  function insertPlaceholder(photoId: string, caption?: string | null) {
    const textarea = contentRef.current
    const line = appendPhotoPlaceholder('', photoId, caption ?? undefined)

    if (!textarea) {
      setContent((previous) => appendPhotoPlaceholder(previous, photoId, caption ?? undefined))
      return
    }

    const start = textarea.selectionStart ?? content.length
    const value = textarea.value
    const before = value.slice(0, start).replace(/\s+$/, '')
    const after = value.slice(start)
    const next = `${before}${before ? '\n\n' : ''}${line}${after ? `\n\n${after.replace(/^\s+/, '')}` : ''}`

    setContent(next)
    window.requestAnimationFrame(() => {
      textarea.focus()
      const position = before.length + (before ? 2 : 0) + line.length
      textarea.setSelectionRange(position, position)
    })
  }

  async function uploadFiles(files: File[]) {
    if (!savedEntryId) {
      toast.error('先保存一次，然后就能拖照片进来了。')
      return
    }
    if (files.length === 0) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      toast.error('Supabase 没配置好。')
      return
    }

    const bucket =
      visibility === 'public' ? STORAGE_BUCKETS.journalPhotos : STORAGE_BUCKETS.privateJournalPhotos

    const accepted = files.filter((file) => {
      if (!file.type.startsWith('image/')) return false
      if (file.size / 1024 / 1024 > JOURNAL_PHOTO_MAX_MB * 3) {
        toast.error(`${file.name} 太大了（原图上限 ${JOURNAL_PHOTO_MAX_MB * 3}MB）。`)
        return false
      }
      return true
    })

    setQueue(accepted.map((file) => ({ name: file.name, status: '排队中' })))
    setBusy(true)

    const uploaded: Array<{
      storagePath: string
      thumbPath: string
      caption: string | null
      width: number
      height: number
      name: string
    }> = []

    try {
      for (let index = 0; index < accepted.length; index++) {
        const file = accepted[index]
        if (!file) continue

        const update = (status: string) =>
          setQueue((previous) =>
            previous.map((item, position) => (position === index ? { ...item, status } : item)),
          )

        try {
          update('正在压…')
          const processed = await processImage(file, JOURNAL_IMAGE_OPTIONS)

          if (!processed.exifRemoved) {
            // 理论上不会发生（canvas 重编码一定丢元数据），真发生了就别传
            throw new Error('这张图里还有 EXIF，为安全起见没上传。')
          }

          const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          const base = `entries/${savedEntryId}/${stamp}`
          const fullPath = `${base}.webp`
          const thumbPath = `${base}-thumb.webp`

          update('正在传原图…')
          const { error: fullError } = await supabase.storage
            .from(bucket)
            .upload(fullPath, processed.full, {
              contentType: processed.full.type || 'image/webp',
              cacheControl: '31536000',
              upsert: false,
            })
          if (fullError) throw new Error(fullError.message)

          update('正在传缩略图…')
          const { error: thumbError } = await supabase.storage
            .from(bucket)
            .upload(thumbPath, processed.thumb, {
              contentType: processed.thumb.type || 'image/webp',
              cacheControl: '31536000',
              upsert: false,
            })
          if (thumbError) throw new Error(thumbError.message)

          uploaded.push({
            storagePath: fullPath,
            thumbPath,
            caption: null,
            width: processed.width,
            height: processed.height,
            name: file.name,
          })

          update(`完成 · ${formatSize(file.size)} → ${formatSize(processed.full.size)}`)
        } catch (error) {
          update(`失败：${error instanceof Error ? error.message : '未知错误'}`)
        }
      }

      if (uploaded.length > 0) {
        const result = await addJournalPhotos(
          savedEntryId,
          uploaded.map((item) => ({
            storagePath: item.storagePath,
            thumbPath: item.thumbPath,
            caption: item.caption,
            width: item.width,
            height: item.height,
          })),
        )

        if (!result.ok) throw new Error(result.error)

        // 登记成功之后，把占位符按顺序插进正文
        const ids = result.data?.ids ?? []
        let next = content
        ids.forEach((id) => {
          next = appendPhotoPlaceholder(next, id)
        })
        setContent(next)

        toast.success(
          `传好 ${uploaded.length} 张。EXIF（含 GPS）已经在浏览器里剥掉了，占位符也插进正文了。`,
        )

        // 正文变了要顺手存一次，否则用户切走就丢了
        const save = await updateJournalEntry(savedEntryId, {
          title,
          content: next,
          mood,
          weather,
          tags,
          visibility,
          isPinned,
          sort,
          coverPhoto: entry?.coverPhoto ?? null,
        })
        if (!save.ok) toast.error(`照片传好了，但正文没存上：${save.error}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败了。')
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragging(false)
    void uploadFiles(Array.from(event.dataTransfer.files))
  }

  /* ---------------- 渲染 ---------------- */

  return (
    <div className="space-y-4">
      {mode === 'edit' && entry && (
        <p className="flex items-center gap-1.5 text-[11px] text-dust">
          <ShieldCheck className="h-3 w-3 text-lamp" aria-hidden />
          上传前会在浏览器里重新编码：EXIF（拍摄时间、设备、**GPS 坐标**）会被剥掉，
          同时压到长边 {JOURNAL_IMAGE_OPTIONS.maxEdge}px 并生成缩略图。
        </p>
      )}

      <Field label="标题">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="比如：某个下雨的下午"
          maxLength={120}
        />
      </Field>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="正文"
          hint="支持 **加粗**、*斜体*、> 引用、- 列表；照片占位符是单独一行的 [[photo:id]]"
        >
          <Textarea
            ref={contentRef}
            rows={mode === 'create' ? 10 : 14}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={'先写一段字。\n\n[[photo:xxx]]\n\n再写一段。'}
            className="font-mono text-[13px] leading-relaxed"
          />
        </Field>

        <div className="space-y-4">
          {/* 拖拽上传 */}
          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'rounded-xl border-2 border-dashed p-5 text-center transition-colors',
              dragging ? 'border-lamp/60 bg-lamp/[0.06]' : 'border-white/[0.12] bg-white/[0.015]',
              !canUpload && 'opacity-60',
            )}
          >
            <Upload className="mx-auto h-5 w-5 text-dust" aria-hidden />
            <p className="mt-2 text-xs text-paper/85">
              {canUpload ? '把照片拖到这里，可以一次拖一批' : '先保存一次，然后就能拖照片进来了'}
            </p>
            <p className="mt-1 text-[10px] text-dust">
              支持 jpg / png / webp；会自动压缩并剥掉 EXIF
            </p>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={!canUpload || busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
              选照片
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void uploadFiles(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
          </div>

          {/* 上传队列 */}
          {queue.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-[11px]">
              {queue.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-paper/75">{item.name}</span>
                  <span
                    className={cn(
                      'shrink-0',
                      item.status.startsWith('失败') ? 'text-neon' : 'text-dust',
                    )}
                  >
                    {item.status}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* 已上传的照片 */}
          {entry && entry.photos.length > 0 && (
            <div className="space-y-2">
              <p className="font-display text-[10px] uppercase tracking-[0.18em] text-dust">
                这一页的照片
              </p>
              <ul className="space-y-2">
                {entry.photos.map((photo) => (
                  <PhotoRow
                    key={photo.id}
                    entryId={entry.id}
                    photo={photo}
                    isCover={entry.coverPhoto === photo.storagePath}
                    onInsert={() => insertPlaceholder(photo.id, photo.caption)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="心情">
          <select
            value={mood}
            onChange={(event) => setMood(event.target.value)}
            className="h-10 w-full rounded-md border border-white/10 bg-night/60 px-3 text-sm text-paper"
          >
            <option value="">不写</option>
            {MOOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.emoji} {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="天气">
          <select
            value={weather}
            onChange={(event) => setWeather(event.target.value)}
            className="h-10 w-full rounded-md border border-white/10 bg-night/60 px-3 text-sm text-paper"
          >
            <option value="">没看窗外</option>
            {WEATHER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.emoji} {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-paper/90">标签（最多 8 个）</legend>
        <div className="flex flex-wrap gap-2">
          {DIARY_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={tags.includes(tag)}
              onClick={() => toggleTag(tag)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                tags.includes(tag)
                  ? 'border-lamp/40 bg-lamp/12 text-lamp'
                  : 'border-white/[0.08] bg-white/[0.02] text-dust hover:text-paper',
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="可见性" hint={JOURNAL_VISIBILITY_HINT[visibility]}>
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as DiaryVisibility)}
            className="h-10 w-full rounded-md border border-white/10 bg-night/60 px-3 text-sm text-paper"
          >
            <option value="draft">草稿</option>
            <option value="public">公开</option>
            <option value="private">私密</option>
            <option value="password">口令</option>
          </select>
        </Field>

        {visibility === 'password' && (
          <Field
            label={mode === 'edit' ? '改口令（留空则不改）' : '口令'}
            hint="口令以 bcrypt 哈希存库，明文不落盘。"
          >
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="设一个口令"
              autoComplete="new-password"
            />
          </Field>
        )}

        <Field label="排序" hint="数字小的在前；置顶另算。">
          <Input
            type="number"
            step={10}
            value={sort}
            onChange={(event) => setSort(Number(event.target.value))}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-paper/85">
        <input
          type="checkbox"
          checked={isPinned}
          onChange={(event) => setIsPinned(event.target.checked)}
          className="h-4 w-4 accent-[#f7c873]"
        />
        置顶这一页
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === 'create' ? '写进去' : '保存'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            取消
          </Button>
        )}
        {mode === 'create' && (
          <p className="text-[11px] text-dust">保存之后才能拖照片进来（照片要挂在手帐 id 上）。</p>
        )}
      </div>
    </div>
  )
}

/* ==========================================================================
   一张已上传的照片
   ========================================================================== */

function PhotoRow({
  entryId,
  photo,
  isCover,
  onInsert,
}: {
  entryId: string
  photo: JournalEntry['photos'][number]
  isCover: boolean
  onInsert: () => void
}) {
  const [caption, setCaption] = React.useState(photo.caption ?? '')
  const [saving, setSaving] = React.useState(false)

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.01] p-2">
      <span className="h-12 w-12 shrink-0 overflow-hidden rounded border border-white/10 bg-night/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.thumbUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </span>

      <Input
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
        placeholder="照片说明（会写在照片下面）"
        className="h-9 min-w-[8rem] flex-1"
        maxLength={300}
      />

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            try {
              const result = await updateJournalPhoto(photo.id, { caption })
              if (result.ok) toast.success('说明改好了。')
              else toast.error(result.error)
            } finally {
              setSaving(false)
            }
          }}
        >
          存说明
        </Button>

        <Button type="button" variant="ghost" size="sm" onClick={onInsert}>
          插进正文
        </Button>

        <ActionButton
          action={async () => {
            const result = await setJournalCover(entryId, isCover ? null : photo.storagePath)
            return result
          }}
          variant="ghost"
          size="sm"
          successMessage={isCover ? '取消封面了。' : '设成封面了。'}
        >
          {isCover ? '取消封面' : '设为封面'}
        </ActionButton>

        <ActionButton
          action={() => deleteJournalPhoto(photo.id)}
          confirm="确认删除？"
          successMessage="照片删掉了。"
          variant="ghost"
          size="icon-sm"
          aria-label="删除照片"
          className="text-dust hover:text-neon"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </ActionButton>
      </div>
    </li>
  )
}

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
