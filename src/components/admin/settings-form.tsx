'use client'

import * as React from 'react'
import {
  CloudRain,
  Globe,
  Loader2,
  MessageCircleHeart,
  Music4,
  Plus,
  RadioTower,
  RotateCcw,
  Save,
  Share2,
  Sparkles,
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
  /* ---------------- 外部数据源 ---------------- */
  weatherEnabled: boolean
  weatherCity: string
  /** 表单里是字符串：留空 = 用环境变量的兜底值（比强制填数字好用） */
  weatherLat: string
  weatherLon: string
  dailyQuoteEnabled: boolean
  dailyQuoteOverride: string
  /** 星空图开关 */
  celestialEnabled: boolean
  /** 实时电台开关 */
  radioEnabled: boolean
  /** 自定义频道（多行文本） */
  radioChannels: string
  radioDefaultChannel: string
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
    weatherEnabled: settings.weatherEnabled,
    weatherCity: settings.weatherCity ?? '',
    weatherLat: settings.weatherLat === null ? '' : String(settings.weatherLat),
    weatherLon: settings.weatherLon === null ? '' : String(settings.weatherLon),
    dailyQuoteEnabled: settings.dailyQuoteEnabled,
    dailyQuoteOverride: settings.dailyQuoteOverride ?? '',
    celestialEnabled: settings.celestialEnabled,
    radioEnabled: settings.radioEnabled,
    radioChannels: settings.radioChannels,
    radioDefaultChannel: settings.radioDefaultChannel,
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
        // 经纬度原样传字符串，格式和范围的校验在 zod schema 里（schema 会把
        // 不合法的拦下来并给出中文提示，这里不重复判一遍）
        weatherEnabled: values.weatherEnabled,
        weatherCity: values.weatherCity,
        weatherLat: values.weatherLat,
        weatherLon: values.weatherLon,
        dailyQuoteEnabled: values.dailyQuoteEnabled,
        dailyQuoteOverride: values.dailyQuoteOverride,
        celestialEnabled: values.celestialEnabled,
        radioEnabled: values.radioEnabled,
        radioChannels: values.radioChannels,
        radioDefaultChannel: values.radioDefaultChannel,
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

      {/* ---------------- 外部数据源 ---------------- */}
      <Section
        title="外部数据源"
        description="天气和每日一句都走服务端，免费无密钥。关掉或连不上时前台会自己降级，不影响开灯、日记、树洞、音乐、小游戏。"
        actions={<Globe className="h-4 w-4 text-dust" aria-hidden />}
      >
        <div className="space-y-4">
          {/* ---- 天气 ---- */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-paper/90">实时天气</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-dust">
                数据来自 Open-Meteo（免费、不用密钥），服务端缓存 30 分钟。
                房间的雨势和光线会跟着走。关掉之后房间固定是雨夜。
              </p>
            </div>
            <Switch
              checked={values.weatherEnabled}
              onCheckedChange={(checked) => patch({ weatherEnabled: checked })}
              aria-label="实时天气开关"
            />
          </div>

          {values.weatherEnabled && (
            <div className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
              <Field label="城市名" htmlFor="weather-city" hint="只用于显示，不影响取数。">
                <Input
                  id="weather-city"
                  value={values.weatherCity}
                  onChange={(event) => patch({ weatherCity: event.target.value })}
                  placeholder="上海"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="纬度"
                  htmlFor="weather-lat"
                  hint="留空就用环境变量 WEATHER_LAT。"
                >
                  <Input
                    id="weather-lat"
                    value={values.weatherLat}
                    onChange={(event) => patch({ weatherLat: event.target.value })}
                    placeholder="31.2304"
                    inputMode="decimal"
                  />
                </Field>
                <Field
                  label="经度"
                  htmlFor="weather-lon"
                  hint="留空就用环境变量 WEATHER_LON。"
                >
                  <Input
                    id="weather-lon"
                    value={values.weatherLon}
                    onChange={(event) => patch({ weatherLon: event.target.value })}
                    placeholder="121.4737"
                    inputMode="decimal"
                  />
                </Field>
              </div>

              <p className="text-[11px] leading-relaxed text-dust">
                日出日落和月相是
                <strong className="font-normal text-paper/85">本地算的</strong>
                （suncalc），不依赖网络 ——
                所以就算天气接口挂了，时间那部分照样是准的。
              </p>
            </div>
          )}

          {/* ---- 每日一句 ---- */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-paper/90">每日一句</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-dust">
                来自一言（Hitokoto），服务端
                <strong className="font-normal text-paper/85">每天只抓一次</strong>
                。抓不到就用内置的 20 句。
              </p>
            </div>
            <Switch
              checked={values.dailyQuoteEnabled}
              onCheckedChange={(checked) => patch({ dailyQuoteEnabled: checked })}
              aria-label="每日一句开关"
            />
          </div>

          <Field
            label="手动指定今天这一句"
            htmlFor="daily-quote-override"
            hint="填了就压过自动抓的那句，当天一直有效。清空恢复自动。"
          >
            <Textarea
              id="daily-quote-override"
              rows={2}
              value={values.dailyQuoteOverride}
              onChange={(event) => patch({ dailyQuoteOverride: event.target.value })}
              placeholder="留空 = 自动抓"
            />
          </Field>
        </div>
      </Section>

      {/* ---------------- 星空图 ----------------
          单独一个区块，因为这一项和上面两项的性质不一样：
          它不是"从外面拿数据"，而是页面 /sky 的开关（数据全是本地算的）。 */}
      <Section
        title="星空图"
        description="「星空图」那一页的开关。它一个外部请求都不发，所以关掉它不是省流量，只是不想给访客看。"
        actions={<Sparkles className="h-4 w-4 text-dust" aria-hidden />}
      >
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-paper/90">今晚的星空</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-dust">
              亮星表内嵌在页面包里，月亮和行星的位置本地用公式算（不请求任何接口）。
              经纬度沿用上面的「实时天气」那一组，留空则用环境变量 WEATHER_LAT / WEATHER_LON。
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-dust/80">
              关掉之后，那一页只显示一张静态星图和月相。
            </p>
          </div>
          <Switch
            checked={values.celestialEnabled}
            onCheckedChange={(checked) => patch({ celestialEnabled: checked })}
            aria-label="星空图开关"
          />
        </div>
      </Section>

      {/* ---------------- 实时电台 ---------------- */}
      <Section
        title="实时电台"
        description="外面的电台（SomaFM + 中文台）。前端不直连，全部走服务端代理并解析播放列表，频道列表缓存 1 小时。"
        actions={<RadioTower className="h-4 w-4 text-dust" aria-hidden />}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-paper/90">电台开关</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-dust">
                关掉之后连 SomaFM 都不会去请求，那一页只剩一句说明。
                另外还有一个环境变量 <code className="text-lamp">RADIO_ENABLED</code> 当总闸，
                两个都开才真的会去拉频道。
              </p>
            </div>
            <Switch
              checked={values.radioEnabled}
              onCheckedChange={(checked) => patch({ radioEnabled: checked })}
              aria-label="电台开关"
            />
          </div>

          {values.radioEnabled && (
            <>
              <Field
                label="自定义频道"
                htmlFor="radio-channels"
                hint="一行一个：名称 | 播放地址 | 标签（标签用逗号隔开，搜索会用到）。以 # 开头是注释。"
              >
                <Textarea
                  id="radio-channels"
                  rows={12}
                  value={values.radioChannels}
                  onChange={(event) => patch({ radioChannels: event.target.value })}
                  placeholder={'清晨音乐台 | https://example.com/live.mp3 | 轻音乐,清晨\n# 注释行会被忽略'}
                  className="font-mono text-[11px] leading-relaxed"
                />
              </Field>

              <Field
                label="默认选中的频道 id"
                htmlFor="radio-default-channel"
                hint="只是进页面时高亮哪一个，不会自动播放。SomaFM 的格式是 somafm:groovesalad；自定义的格式是 custom:名称。"
              >
                <Input
                  id="radio-default-channel"
                  value={values.radioDefaultChannel}
                  onChange={(event) => patch({ radioDefaultChannel: event.target.value })}
                  placeholder="somafm:groovesalad"
                />
              </Field>

              <p className="text-[11px] leading-relaxed text-dust">
                SomaFM 的几十个频道是
                <strong className="font-normal text-paper/85">自动</strong>
                从它的公开目录拉的，不用在这里写。
                下面只填它没有的（中文台为主）。
                地址会失效 —— 失效了改这里就行，不用重新部署。
              </p>
            </>
          )}
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
