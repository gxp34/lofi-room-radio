'use client'

import * as React from 'react'
import { AlertTriangle, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { ActionButton } from '@/components/admin/action-button'
import { Field, Section, StatCard, Tag } from '@/components/admin/ui'
import { Icon, ICONS } from '@/components/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  createAchievement,
  deleteAchievement,
  seedBuiltInAchievements,
  updateAchievement,
  type AchievementInput,
} from '@/lib/admin/achievements'
import { DEFAULT_ACHIEVEMENTS } from '@/lib/constants'
import type { Tables } from '@/types'

/**
 * 成就管理。
 *
 * 图标是「lucide 图标名」字符串，只有 src/components/icon.tsx 里白名单内的名字能显示出来，
 * 其它一律回落到默认图标 —— 所以下面会把白名单列成一个可以点的候选列表，少打错字。
 *
 * key 在编辑时不可改：user_achievements.achievement_key 外键指向它，
 * 改 key 会把玩家已经拿到的解锁记录一起带走。要换 key 就删掉重建（页面上有提醒）。
 */

type AchievementRow = Tables<'achievements'>

/** 白名单里的图标名（给候选按钮用） */
const ICON_NAMES = Object.keys(ICONS)

/** 表单值：一律用字符串，提交前再收拾 */
interface AchievementFormValues {
  key: string
  name: string
  description: string
  icon: string
  secret: boolean
  sort: string
}

const EMPTY_FORM: AchievementFormValues = {
  key: '',
  name: '',
  description: '',
  icon: '',
  secret: false,
  sort: '0',
}

function rowToForm(row: AchievementRow): AchievementFormValues {
  return {
    key: row.key,
    name: row.name,
    description: row.description ?? '',
    icon: row.icon ?? '',
    secret: row.secret,
    sort: String(row.sort),
  }
}

function formToInput(values: AchievementFormValues): AchievementInput {
  return {
    key: values.key.trim(),
    name: values.name.trim(),
    description: values.description.trim() || null,
    icon: values.icon.trim() || null,
    secret: values.secret,
    sort: values.sort.trim() === '' ? 0 : Number(values.sort),
  }
}

export function AchievementManager({
  achievements,
  unlockedTotal,
}: {
  achievements: AchievementRow[]
  unlockedTotal: number
}) {
  const [creating, setCreating] = React.useState(achievements.length === 0)
  const [editingKey, setEditingKey] = React.useState<string | null>(null)

  const secretCount = React.useMemo(
    () => achievements.filter((item) => item.secret).length,
    [achievements],
  )

  return (
    <div className="space-y-5">
      {/* ---------------- 统计 ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="成就总数" value={achievements.length} hint="数据库里的定义" />
        <StatCard
          label="已解锁记录"
          value={unlockedTotal}
          hint="user_achievements 里的行数（含访客）"
        />
        <StatCard
          label="隐藏成就"
          value={secretCount}
          hint={`其余 ${achievements.length - secretCount} 个是公开的`}
        />
        <StatCard
          label="内置成就"
          value={`${DEFAULT_ACHIEVEMENTS.length} 个`}
          hint="代码里写死的兜底定义"
        />
      </div>

      {/* ---------------- 删除提醒 ---------------- */}
      <div className="flex items-start gap-3 rounded-xl border border-neon/25 bg-neon/[0.06] p-3.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-neon" aria-hidden />
        <p className="text-xs leading-relaxed text-paper/85">
          删除成就时，<code>user_achievements.achievement_key</code> 是
          <span className="text-neon"> on delete cascade</span> ——
          所有人对应的解锁记录会一起被删掉，而且不可恢复。只是「不想让人看到」的话，
          把 secret 打开就够了，不必删。
        </p>
      </div>

      {/* ---------------- 补全内置成就 ---------------- */}
      <Section
        title="补全内置成就"
        description="把代码里那 10 个内置成就补进数据库。已经存在的 key 会跳过，不会覆盖你改过的名字和描述。"
        actions={
          <ActionButton
            action={seedBuiltInAchievements}
            variant="outline"
            size="sm"
            pendingLabel="补全中…"
            successMessage="补全完成，看看下面的列表。"
          >
            <Sparkles className="h-3.5 w-3.5" />
            补全内置成就
          </ActionButton>
        }
      >
        <p className="text-xs leading-relaxed text-dust">
          空白数据库建议先补一次：这样每个成就都能在这里改名、换图标。
          重复点不会产生重复条目。
        </p>
      </Section>

      {/* ---------------- 新建 ---------------- */}
      <Section
        title="新建成就"
        description="key 只能用 [a-z0-9_]，一旦定下就别改 —— 前台是靠 key 判断解锁的。"
        actions={
          <Button
            variant={creating ? 'ghost' : 'default'}
            size="sm"
            onClick={() => setCreating((value) => !value)}
          >
            {creating ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {creating ? '收起' : '新建成就'}
          </Button>
        }
      >
        {creating ? (
          <AchievementForm mode="create" initial={EMPTY_FORM} onDone={() => setCreating(false)} />
        ) : (
          <p className="text-xs text-dust">点右上角「新建成就」开始。</p>
        )}
      </Section>

      {/* ---------------- 列表 ---------------- */}
      <Section
        title={`成就列表（${achievements.length}）`}
        description="按 sort 升序排列，前台的软木板也照这个顺序显示。"
      >
        {achievements.length === 0 ? (
          <p className="text-xs text-dust">
            一条成就都没有。可以先用上面那个「补全内置成就」。
          </p>
        ) : (
          <ul className="space-y-2.5">
            {achievements.map((achievement) => (
              <AchievementRowItem
                key={achievement.key}
                achievement={achievement}
                editing={editingKey === achievement.key}
                onToggleEditing={() =>
                  setEditingKey((current) =>
                    current === achievement.key ? null : achievement.key,
                  )
                }
              />
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

function AchievementRowItem({
  achievement,
  editing,
  onToggleEditing,
}: {
  achievement: AchievementRow
  editing: boolean
  onToggleEditing: () => void
}) {
  return (
    <li className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* 图标 */}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-roomDeep">
          <Icon name={achievement.icon} className="h-4 w-4 text-lamp" />
        </span>

        {/* 信息 */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-display text-sm text-paper">{achievement.name}</span>
            {achievement.secret ? <Tag tone="neon">隐藏</Tag> : <Tag tone="lamp">公开</Tag>}
            <span className="text-[11px] text-dust">{achievement.key}</span>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-dust">
            {achievement.description ?? '（没有描述）'}
            {` · 图标 ${achievement.icon ?? '默认'} · 排序 ${achievement.sort}`}
          </p>
        </div>

        {/* 操作 */}
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onToggleEditing} aria-expanded={editing}>
            {editing ? '取消' : '编辑'}
          </Button>
          <ActionButton
            action={() => deleteAchievement(achievement.key)}
            confirm="确认删除？会连解锁记录一起删"
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

      {editing && (
        <AchievementForm
          mode="edit"
          initial={rowToForm(achievement)}
          achievementKey={achievement.key}
          onDone={onToggleEditing}
        />
      )}
    </li>
  )
}

/* ==========================================================================
   表单（新建 / 编辑共用）
   ========================================================================== */

function AchievementForm({
  mode,
  initial,
  achievementKey,
  onDone,
}: {
  mode: 'create' | 'edit'
  initial: AchievementFormValues
  achievementKey?: string
  onDone: () => void
}) {
  const [values, setValues] = React.useState<AchievementFormValues>(initial)
  const [saving, setSaving] = React.useState(false)

  function patch(next: Partial<AchievementFormValues>) {
    setValues((current) => ({ ...current, ...next }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    const input = formToInput(values)

    if (!/^[a-z0-9_]+$/.test(input.key)) {
      toast.error('key 只能用小写字母、数字、下划线（例如 room_secret）。')
      return
    }
    if (input.name === '') {
      toast.error('成就得有个名字。')
      return
    }

    setSaving(true)
    try {
      const result =
        mode === 'create' || !achievementKey
          ? await createAchievement(input)
          : await updateAchievement(achievementKey, input)

      if (result.ok) {
        toast.success(mode === 'create' ? '新成就建好了。' : '改好了。')
        onDone()
      } else {
        toast.error(result.error)
      }
    } finally {
      setSaving(false)
    }
  }

  /** 当前图标名不在白名单里时给一句提醒 */
  const iconUnknown = values.icon.trim() !== '' && !ICON_NAMES.includes(values.icon.trim())

  return (
    <form
      onSubmit={submit}
      className={mode === 'edit' ? 'mt-3 space-y-3 border-t border-white/[0.06] pt-3' : 'space-y-3'}
      noValidate
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="key（唯一标识）"
          htmlFor={`${mode}-ach-key`}
          hint={
            mode === 'edit'
              ? 'key 不能改：它牵着所有人的解锁记录。要换就删掉重建。'
              : '只能用小写字母、数字、下划线，例如 room_secret。'
          }
        >
          <Input
            id={`${mode}-ach-key`}
            value={values.key}
            placeholder="room_secret"
            disabled={mode === 'edit'}
            onChange={(event) => patch({ key: event.target.value })}
          />
        </Field>

        <Field label="名字" htmlFor={`${mode}-ach-name`} hint="前台上显示的名字，最多 40 字。">
          <Input
            id={`${mode}-ach-name`}
            value={values.name}
            placeholder="房间的秘密"
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>
      </div>

      <Field label="描述" htmlFor={`${mode}-ach-desc`} hint="解锁条件的那句话，比如「触发过一次稀有事件。」">
        <Textarea
          id={`${mode}-ach-desc`}
          rows={2}
          value={values.description}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </Field>

      <Field
        label="图标（lucide 图标名）"
        htmlFor={`${mode}-ach-icon`}
        hint="例如 Lamp、Cat、Disc3。项目里 src/components/icon.tsx 有白名单，不在名单里的会显示成默认图标。"
        error={iconUnknown ? '这个图标名不在白名单里，前台会显示成默认图标。' : undefined}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              id={`${mode}-ach-icon`}
              value={values.icon}
              placeholder="Sparkles"
              onChange={(event) => patch({ icon: event.target.value })}
            />
            {/* 实时预览：看到的是什么，前台就是什么 */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-night/60">
              <Icon name={values.icon || null} className="h-4 w-4 text-lamp" />
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {ICON_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={values.icon === name}
                onClick={() => patch({ icon: name })}
                className={
                  values.icon === name
                    ? 'rounded-full border border-lamp/40 bg-lamp/10 px-2 py-0.5 font-mono text-[10px] text-lamp'
                    : 'rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 font-mono text-[10px] text-dust hover:text-paper'
                }
              >
                {name}
              </button>
            ))}
            {values.icon !== '' && (
              <button
                type="button"
                onClick={() => patch({ icon: '' })}
                className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] text-dust hover:text-paper"
              >
                清空（用默认图标）
              </button>
            )}
          </div>
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="排序" htmlFor={`${mode}-ach-sort`} hint="数字越小越靠前。">
          <Input
            id={`${mode}-ach-sort`}
            type="number"
            value={values.sort}
            onChange={(event) => patch({ sort: event.target.value })}
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-paper/90">是否隐藏</legend>
          <label className="flex items-start gap-2 pt-1.5 text-xs leading-relaxed text-paper/85">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-lamp"
              checked={values.secret}
              onChange={(event) => patch({ secret: event.target.checked })}
            />
            <span>
              隐藏成就：没解锁之前不显示名字和描述。
              <span className="block text-[11px] text-dust">
                这比删除温和得多 —— 删除会连解锁记录一起清掉。
              </span>
            </span>
          </label>
        </fieldset>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {mode === 'create' ? '建好它' : '保存'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          取消
        </Button>
      </div>
    </form>
  )
}
