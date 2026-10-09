'use client'

import * as React from 'react'
import {
  CloudRain,
  Loader2,
  MessageCircleHeart,
  Music4,
  Plus,
  RotateCcw,
  Save,
  Share2,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { ActionButton } from '@/components/admin/action-button'
import { Field, Section } from '@/components/admin/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { resetSettings, saveSettings, type SettingsInput } from '@/lib/admin/settings'
import { cn } from '@/lib/utils'
import type { SiteSettings } from '@/types'

/**
 * 站点设置表单。
 *
 * 几个刻意的选择：
 *   1. 用受控 state，不用 react-hook-form —— 这里有三组「可增删的数组字段」，
 *      手写 state 的增删反而比 RHF 的 useFieldArray 更好读；
 *      服务端 settingsSchema 仍然是最后一道关（前端放过了也会被拦下来）。
 *   2. 数组字段一律做成「一行一条」的列表，谁都不用手写 JSON。
 *   3. 恢复默认走 ActionButton 的二次确认 —— 它会覆盖站长写过的所有内容。
 */

/** 社交链接一行（icon 沿用已有值，界面上只给名称和链接两个输入框） */
interface SocialLinkRow {
  label: string
  href: string
  icon: string
}

interface FormState {
  roomName: string
  hostName: string
  tagline: string
  about: string
  weather: string
  weatherNote: string
  announcement: string
  gamesEnabled: boolean
  treeholeNotice: string
  treeholeBannedWords: string[]
  musicCopyrightNotice: string
  musicNightTag: string
  shelfNote: string
  socialLinks: SocialLinkRow[]
  backgroundAudio: string
}

/** SiteSettings（可空字段用 null）→ 表单 state（一律用空字符串，受控输入框更好用） */
function toFormState(settings: SiteSettings): FormState {
  return {
    roomName: settings.roomName,
    hostName: settings.hostName,
    tagline: settings.tagline,
    about: settings.about,
    weather: settings.weather,
    weatherNote: settings.weatherNote,
    announcement: settings.announcement ?? '',
    gamesEnabled: settings.gamesEnabled,
    treeholeNotice: settings.treeholeNotice,
    treeholeBannedWords: [...settings.treeholeBannedWords],
    musicCopyrightNotice: settings.musicCopyrightNotice,
    musicNightTag: settings.musicNightTag,
    shelfNote: settings.shelfNote,
    socialLinks: settings.socialLinks.map((link) => ({
      label: link.label,
      href: link.href,
      icon: link.icon ?? '',
    })),
    backgroundAudio: settings.backgroundAudio ?? '',
  }
}

export function SettingsForm({ initial }: { initial: SiteSettings }) {
  const [values, setValues] = React.useState<FormState>(() => toFormState(initial))
  const [saving, setSaving] = React.useState(false)

  /**
   * 服务端重新渲染（保存成功 / 恢复默认后的 revalidatePath）时会送来新的 initial，
   * 这里同步一次。用 JSON 内容做依赖而不是 initial 对象本身：
   * 内容没变就不动 state，免得把正在编辑的内容冲掉。
   */
  const serverSnapshot = React.useMemo(() => JSON.stringify(initial), [initial])
  React.useEffect(() => {
    setValues(toFormState(initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSnapshot])

  function patch(partial: Partial<FormState>) {
    setValues((previous) => ({ ...previous, ...partial }))
  }

  /* ---------------- 数组字段：增 / 改 / 删 ---------------- */

  function addBannedWord() {
    patch({ treeholeBannedWords: [...values.treeholeBannedWords, ''] })
  }

  function updateBannedWord(index: number, word: string) {
    patch({
      treeholeBannedWords: values.treeholeBannedWords.map((item, i) => (i === index ? word : item)),
    })
  }

  function removeBannedWord(index: number) {
    patch({ treeholeBannedWords: values.treeholeBannedWords.filter((_, i) => i !== index) })
  }

  function addSocialLink() {
    patch({ socialLinks: [...values.socialLinks, { label: '', href: '', icon: '' }] })
  }

  function updateSocialLink(index: number, partial: Partial<SocialLinkRow>) {
    patch({
      socialLinks: values.socialLinks.map((item, i) => (i === index ? { ...item, ...partial } : item)),
    })
  }

  function removeSocialLink(index: number) {
    patch({ socialLinks: values.socialLinks.filter((_, i) => i !== index) })
  }

  /* ---------------- 提交 ---------------- */

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)

    try {
      // 全空的行直接丢掉：点错了「添加一条」不该让整张表单保存失败
      const socialLinks = values.socialLinks
        .filter((row) => row.label.trim().length > 0 || row.href.trim().length > 0)
        .map((row) => ({
          label: row.label,
          href: row.href,
          icon: row.icon.trim().length > 0 ? row.icon : undefined,
        }))

      const treeholeBannedWords = values.treeholeBannedWords
        .map((word) => word.trim())
        .filter((word) => word.length > 0)

      const payload: SettingsInput = {
        roomName: values.roomName,
        hostName: values.hostName,
        tagline: values.tagline,
        about: values.about,
        weather: values.weather,
        weatherNote: values.weatherNote,
        announcement: values.announcement.trim().length > 0 ? values.announcement : null,
        gamesEnabled: values.gamesEnabled,
        treeholeNotice: values.treeholeNotice,
        treeholeBannedWords,
        musicCopyrightNotice: values.musicCopyrightNotice,
        musicNightTag: values.musicNightTag,
        shelfNote: values.shelfNote,
        socialLinks,
        backgroundAudio: values.backgroundAudio.trim().length > 0 ? values.backgroundAudio : null,
      }

      const result = await saveSettings(payload)

      if (result.ok) {
        toast.success('设置已保存，前台刷新后生效')
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败了。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {/* ---------------- 基本 ---------------- */}
      <Section title="基本" description="房间名会出现在导航栏，房东称呼出现在关于页。">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="房间名" htmlFor="room-name" hint="显示在导航栏左上角。">
              <Input
                id="room-name"
                value={values.roomName}
                onChange={(event) => patch({ roomName: event.target.value })}
                placeholder="Lo-fi 房间电台"
              />
            </Field>
            <Field label="房东称呼" htmlFor="host-name" hint="访客看到的是「房东」还是别的叫法。">
              <Input
                id="host-name"
                value={values.hostName}
                onChange={(event) => patch({ hostName: event.target.value })}
                placeholder="房东"
              />
            </Field>
          </div>

          <Field label="一句话简介" htmlFor="tagline" hint="首页标题下面那一行。">
            <Input
              id="tagline"
              value={values.tagline}
              onChange={(event) => patch({ tagline: event.target.value })}
              placeholder="推门进来就好，不用敲门。"
            />
          </Field>

          <Field label="关于" htmlFor="about" hint="关于页的正文，可以多行。">
            <Textarea
              id="about"
              rows={5}
              value={values.about}
              onChange={(event) => patch({ about: event.target.value })}
              placeholder="这是一间只在深夜营业的小房间……"
            />
          </Field>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-paper/90">游戏厅</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-dust">
                关掉之后，前台的「摸鱼掌机」会显示成掌机没电了。
              </p>
            </div>
            <Switch
              checked={values.gamesEnabled}
              onCheckedChange={(checked) => patch({ gamesEnabled: checked })}
              aria-label="游戏厅开关"
            />
          </div>
        </div>
      </Section>

      {/* ---------------- 天气与公告 ---------------- */}
      <Section
        title="天气与公告"
        description="天气是手写的，不用接任何接口 —— 反正窗外什么样你自己最清楚。"
        actions={<CloudRain className="h-4 w-4 text-dust" aria-hidden />}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="当前天气" htmlFor="weather" hint="比如：雨 / 晴 / 雾。">
              <Input
                id="weather"
                value={values.weather}
                onChange={(event) => patch({ weather: event.target.value })}
                placeholder="雨"
              />
            </Field>
            <Field label="天气的一句话" htmlFor="weather-note" hint="跟着天气一起显示。">
              <Input
                id="weather-note"
                value={values.weatherNote}
                onChange={(event) => patch({ weatherNote: event.target.value })}
                placeholder="窗外在下雨，雨声比音乐清楚。"
              />
            </Field>
          </div>

          <Field
            label="首页公告"
            htmlFor="announcement"
            hint="留空就是不显示公告。最多 300 字，写长了会把首页挤下去。"
          >
            <Textarea
              id="announcement"
              rows={2}
              value={values.announcement}
              onChange={(event) => patch({ announcement: event.target.value })}
              placeholder="留空就是没有公告。"
            />
          </Field>

          <Field
            label="背景音地址"
            htmlFor="background-audio"
            hint="留空就是不自动播放。可以填站内路径（/audio/room.mp3）或完整网址。"
          >
            <Input
              id="background-audio"
              value={values.backgroundAudio}
              onChange={(event) => patch({ backgroundAudio: event.target.value })}
              placeholder="/audio/room-loop.mp3"
            />
          </Field>
        </div>
      </Section>

      {/* ---------------- 树洞 ---------------- */}
      <Section
        title="树洞"
        description="抽屉开头的说明、以及会被自动标记的敏感词。"
        actions={<MessageCircleHeart className="h-4 w-4 text-dust" aria-hidden />}
      >
        <div className="space-y-5">
          <Field label="树洞说明" htmlFor="treehole-notice" hint="显示在树洞页最上面。">
            <Textarea
              id="treehole-notice"
              rows={3}
              value={values.treeholeNotice}
              onChange={(event) => patch({ treeholeNotice: event.target.value })}
            />
          </Field>

          {/* 敏感词：一行一个 */}
          <Field
            label={`敏感词（${values.treeholeBannedWords.length} 个）`}
            hint="访客写的内容里出现这些词会被标记，等你亲自看过才会公开。"
          >
            <div className="space-y-2">
              {values.treeholeBannedWords.length === 0 && (
                <p className="text-[11px] text-dust">一个词都没有。下面点「添加一条」。</p>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                {values.treeholeBannedWords.map((word, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={word}
                      aria-label={`第 ${index + 1} 个敏感词`}
                      placeholder="例如：微信号"
                      onChange={(event) => updateBannedWord(index, event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`删除第 ${index + 1} 个敏感词`}
                      className="shrink-0 text-dust hover:text-neon"
                      onClick={() => removeBannedWord(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" onClick={addBannedWord}>
                <Plus className="h-3.5 w-3.5" />
                添加一条
              </Button>
            </div>
          </Field>
        </div>
      </Section>

      {/* ---------------- 音乐 ---------------- */}
      <Section
        title="音乐"
        description="版权提醒会出现在上传区旁边，深夜标签会贴在深夜歌单上。"
        actions={<Music4 className="h-4 w-4 text-dust" aria-hidden />}
      >
        <div className="space-y-4">
          <Field label="版权提醒" htmlFor="music-copyright-notice" hint="给访客看的一句话。">
            <Textarea
              id="music-copyright-notice"
              rows={2}
              value={values.musicCopyrightNotice}
              onChange={(event) => patch({ musicCopyrightNotice: event.target.value })}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="深夜歌单标签" htmlFor="music-night-tag" hint="用来挑出深夜歌单，比如「深夜」。">
              <Input
                id="music-night-tag"
                value={values.musicNightTag}
                onChange={(event) => patch({ musicNightTag: event.target.value })}
                placeholder="深夜"
              />
            </Field>
            <Field label="唱片架边上的一句话" htmlFor="shelf-note">
              <Input
                id="shelf-note"
                value={values.shelfNote}
                onChange={(event) => patch({ shelfNote: event.target.value })}
                placeholder="唱片架上的每一张都是自己放上去的。"
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* ---------------- 社交链接 ---------------- */}
      <Section
        title="社交链接"
        description="显示在页脚。一行一条，名称随便写，链接要带 https://。"
        actions={<Share2 className="h-4 w-4 text-dust" aria-hidden />}
      >
        <div className="space-y-2">
          {values.socialLinks.length === 0 && (
            <p className="text-[11px] text-dust">还没有社交链接。下面点「添加一条」。</p>
          )}

          {values.socialLinks.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-center">
              <Input
                value={row.label}
                aria-label={`第 ${index + 1} 条社交链接的名称`}
                placeholder="名称，比如 GitHub"
                onChange={(event) => updateSocialLink(index, { label: event.target.value })}
              />
              <Input
                value={row.href}
                aria-label={`第 ${index + 1} 条社交链接的地址`}
                placeholder="https://…"
                onChange={(event) => updateSocialLink(index, { href: event.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`删除第 ${index + 1} 条社交链接`}
                className="text-dust hover:text-neon"
                onClick={() => removeSocialLink(index)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addSocialLink}>
            <Plus className="h-3.5 w-3.5" />
            添加一条
          </Button>
        </div>
      </Section>

      {/* ---------------- 保存条 ---------------- */}
      <div
        className={cn(
          'sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07]',
          'bg-night/90 px-3 py-3 backdrop-blur',
        )}
      >
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? '保存中…' : '保存设置'}
        </Button>

        <ActionButton
          action={resetSettings}
          confirm="确认恢复默认？"
          successMessage="已经恢复成内置的默认设置了。"
          variant="outline"
        >
          <RotateCcw className="h-4 w-4" />
          恢复默认
        </ActionButton>

        <p className="text-[11px] leading-relaxed text-dust">
          保存后前台刷新一次才会看到新设置。「恢复默认」会盖掉你写过的房间名和公告。
        </p>
      </div>
    </form>
  )
}
