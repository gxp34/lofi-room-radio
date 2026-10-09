'use client'

import * as React from 'react'
import Image from 'next/image'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ChevronDown,
  Disc3,
  Loader2,
  Music4,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { ActionButton } from '@/components/admin/action-button'
import { Field, Section, Tag } from '@/components/admin/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { STORAGE_BUCKETS, TRACK_TAGS } from '@/lib/constants'
import { MAX_AUDIO_MB, MAX_IMAGE_MB } from '@/lib/env'
import { createTrack, deleteTrack, moveTrack, updateTrack } from '@/lib/admin/tracks'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { isAudioFile, isImageFile, probeAudioDuration, uploadFile } from '@/lib/upload'
import { cn, formatDuration } from '@/lib/utils'
import { trackMetaSchema, type TrackMetaInput } from '@/lib/validators'
import type { Track } from '@/types'

/**
 * 音乐管理。
 *
 * 上传顺序：先探时长 → 传音频 → 传封面 → 写数据库。
 * 每一步都可能失败，失败就把中文原因直接告诉用户（lib/upload.ts 里做了翻译）。
 */
export function TrackManager({ tracks }: { tracks: Track[] }) {
  const [uploadOpen, setUploadOpen] = React.useState(tracks.length === 0)

  return (
    <div className="space-y-5">
      {/* ---------------- 上传区 ---------------- */}
      <Section
        title="上传新唱片"
        description="音频最多 25MB，支持 mp3 / m4a / aac / ogg / wav / flac；封面 5MB 以内。"
        actions={
          <Button
            variant={uploadOpen ? 'ghost' : 'default'}
            size="sm"
            onClick={() => setUploadOpen((value) => !value)}
          >
            {uploadOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {uploadOpen ? '收起' : '上传'}
          </Button>
        }
      >
        {uploadOpen ? (
          <UploadForm onDone={() => setUploadOpen(false)} />
        ) : (
          <p className="text-xs text-dust">点右上角「上传」开始。</p>
        )}
      </Section>

      {/* ---------------- 已上架 ---------------- */}
      <Section title={`唱片架（${tracks.length}）`} description="上移 / 下移决定前台的顺序。">
        {tracks.length === 0 ? (
          <p className="text-xs text-dust">架子上还没有歌。</p>
        ) : (
          <ul className="space-y-2.5">
            {tracks.map((track) => (
              <TrackRow key={track.id} track={track} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

/* ==========================================================================
   上传表单
   ========================================================================== */

function UploadForm({ onDone }: { onDone: () => void }) {
  const [audioFile, setAudioFile] = React.useState<File | null>(null)
  const [coverFile, setCoverFile] = React.useState<File | null>(null)
  const [tags, setTags] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TrackMetaInput>({
    resolver: zodResolver(trackMetaSchema),
    defaultValues: {
      title: '',
      artist: '',
      tags: [],
      note: '',
      visibility: 'public',
      sort: 0,
    },
  })

  const toggleTag = (tag: string) => {
    setTags((previous) =>
      previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag].slice(0, 6),
    )
  }

  const submit = handleSubmit(async (values) => {
    if (!audioFile) {
      toast.error('先选一个音频文件。')
      return
    }
    if (!isAudioFile(audioFile.name)) {
      toast.error('这个文件看起来不是音频。支持 mp3 / m4a / aac / ogg / wav / flac。')
      return
    }
    if (audioFile.size / 1024 / 1024 > MAX_AUDIO_MB) {
      toast.error(`音频超过 ${MAX_AUDIO_MB}MB 了。`)
      return
    }
    if (coverFile && !isImageFile(coverFile.name)) {
      toast.error('封面得是图片（jpg / png / webp）。')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      toast.error('Supabase 没配置好。')
      return
    }

    try {
      setBusy('正在读取音频信息…')
      const duration = await probeAudioDuration(audioFile)

      const audioBucket =
        values.visibility === 'public' ? STORAGE_BUCKETS.publicMusic : STORAGE_BUCKETS.privateMusic

      setBusy('正在上传音频…')
      const audio = await uploadFile(supabase, audioBucket, audioFile, values.visibility === 'public' ? 'public' : 'private')

      let coverPath: string | null = null
      if (coverFile) {
        setBusy('正在上传封面…')
        const cover = await uploadFile(supabase, STORAGE_BUCKETS.covers, coverFile, 'covers')
        coverPath = cover.path
      }

      setBusy('正在写入数据库…')
      const result = await createTrack({
        ...values,
        tags,
        audioPath: audio.path,
        coverPath,
        duration,
      })

      if (!result.ok) throw new Error(result.error)

      toast.success('新唱片上架了。封面还在慢慢转。')
      reset()
      setAudioFile(null)
      setCoverFile(null)
      setTags([])
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '上传失败了。')
    } finally {
      setBusy(null)
    }
  })

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {/* 文件 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="音频文件（必选）" htmlFor="audio">
          <Input
            id="audio"
            type="file"
            accept="audio/*,.mp3,.m4a,.aac,.ogg,.wav,.flac"
            onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}
          />
          {audioFile && (
            <p className="text-[11px] text-dust">
              {audioFile.name} · {(audioFile.size / 1024 / 1024).toFixed(1)} MB
            </p>
          )}
        </Field>

        <Field label="封面（选填）" htmlFor="cover" hint={`不超过 ${MAX_IMAGE_MB}MB`}>
          <Input
            id="cover"
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.webp"
            onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}
          />
          {coverFile && <p className="text-[11px] text-dust">{coverFile.name}</p>}
        </Field>
      </div>

      {/* 元数据 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="歌名" htmlFor="title" error={errors.title?.message}>
          <Input id="title" placeholder="比如：凌晨三点的雨" {...register('title')} />
        </Field>
        <Field label="艺术家" htmlFor="artist" error={errors.artist?.message}>
          <Input id="artist" placeholder="留空就是你自己" {...register('artist')} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-paper/90">标签（最多 6 个）</legend>
        <div className="flex flex-wrap gap-2">
          {TRACK_TAGS.map((tag) => (
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

      <Field label="深夜笔记（选填）" htmlFor="note" hint="写给自己看的一句话，会显示在歌曲信息里。">
        <Textarea id="note" rows={2} placeholder="这首歌是在什么时候写下来的？" {...register('note')} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="可见性" htmlFor="visibility" hint="私密歌曲只有登录后才能听到。">
          <select
            id="visibility"
            className="h-10 w-full rounded-md border border-white/10 bg-night/60 px-3 text-sm text-paper"
            {...register('visibility')}
          >
            <option value="public">公开（访客可听）</option>
            <option value="private">私密（仅站长）</option>
          </select>
        </Field>
        <Field label="排序" htmlFor="sort" hint="数字越小越靠前。">
          <Input id="sort" type="number" step={10} {...register('sort')} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={Boolean(busy)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ?? '上传并上架'}
        </Button>
        <p className="text-[11px] leading-relaxed text-dust">
          只上传自己创作、免版权或已获授权的音乐。商业歌曲请不要公开传播。
        </p>
      </div>
    </form>
  )
}

/* ==========================================================================
   已上架的一行
   ========================================================================== */

function TrackRow({ track }: { track: Track }) {
  const [editing, setEditing] = React.useState(false)

  return (
    <li className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
      <div className="flex items-center gap-3">
        {/* 封面 */}
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-roomDeep">
          {track.coverUrl ? (
            <Image src={track.coverUrl} alt="" width={44} height={44} className="h-full w-full object-cover" />
          ) : (
            <Disc3 className="h-5 w-5 text-dust" aria-hidden />
          )}
        </span>

        {/* 信息 */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-display text-sm text-paper">{track.title}</span>
            {track.visibility === 'public' ? (
              <Tag tone="lamp">公开</Tag>
            ) : (
              <Tag tone="rain">私密</Tag>
            )}
            {track.isDemo && <Tag>演示</Tag>}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-dust">
            {track.artist ?? '未知艺术家'} · {formatDuration(track.duration)} · 播放 {track.playCount} · 排序{' '}
            {track.sort}
            {track.tags.length > 0 && ` · ${track.tags.join(' / ')}`}
          </p>
        </div>

        {/* 操作 */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="上移"
            onClick={async () => {
              const result = await moveTrack(track.id, 'up')
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
              const result = await moveTrack(track.id, 'down')
              if (!result.ok) toast.error(result.error)
            }}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing((value) => !value)}
            aria-expanded={editing}
          >
            {editing ? '取消' : '编辑'}
          </Button>
          <ActionButton
            action={() => deleteTrack(track.id)}
            confirm="确认删除？"
            successMessage="删掉了。"
            variant="ghost"
            size="icon-sm"
            aria-label="删除"
            className="text-dust hover:text-neon"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </ActionButton>
        </div>
      </div>

      {editing && <EditForm track={track} onDone={() => setEditing(false)} />}
    </li>
  )
}

function EditForm({ track, onDone }: { track: Track; onDone: () => void }) {
  /**
   * 编辑表单用受控 state 而不是 react-hook-form：
   * 标签是「数组 ↔ 一串文字」的双向转换，交给 RHF 反而要绕一圈。
   * 校验照样有 —— 服务端的 zod schema 是最后一道关。
   */
  const [values, setValues] = React.useState({
    title: track.title,
    artist: track.artist ?? '',
    tagsText: track.tags.join(', '),
    note: track.note ?? '',
    visibility: track.visibility,
    sort: track.sort,
  })
  const [saving, setSaving] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const tags = values.tagsText
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 6)

      const result = await updateTrack(track.id, {
        title: values.title,
        artist: values.artist,
        tags,
        note: values.note,
        visibility: values.visibility,
        sort: Number(values.sort),
      })

      if (result.ok) {
        toast.success('改好了。')
        onDone()
      } else {
        toast.error(result.error)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="歌名">
          <Input
            value={values.title}
            onChange={(event) => setValues((v) => ({ ...v, title: event.target.value }))}
          />
        </Field>
        <Field label="艺术家">
          <Input
            value={values.artist}
            onChange={(event) => setValues((v) => ({ ...v, artist: event.target.value }))}
          />
        </Field>
      </div>

      <Field label="标签" hint="用逗号分隔，例如：深夜, 雨（最多 6 个）">
        <Input
          value={values.tagsText}
          onChange={(event) => setValues((v) => ({ ...v, tagsText: event.target.value }))}
          placeholder="深夜, 雨"
        />
      </Field>

      <Field label="深夜笔记">
        <Textarea
          rows={2}
          value={values.note}
          onChange={(event) => setValues((v) => ({ ...v, note: event.target.value }))}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="可见性">
          <select
            className="h-10 w-full rounded-md border border-white/10 bg-night/60 px-3 text-sm text-paper"
            value={values.visibility}
            onChange={(event) =>
              setValues((v) => ({ ...v, visibility: event.target.value as 'public' | 'private' }))
            }
          >
            <option value="public">公开</option>
            <option value="private">私密</option>
          </select>
        </Field>
        <Field label="排序">
          <Input
            type="number"
            step={10}
            value={values.sort}
            onChange={(event) => setValues((v) => ({ ...v, sort: Number(event.target.value) }))}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Music4 className="h-3.5 w-3.5" />}
          保存
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          取消
        </Button>
      </div>
    </form>
  )
}
