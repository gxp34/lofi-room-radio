'use client'

import * as React from 'react'
import { Loader2, Plus, Trash2, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'

import { ActionButton } from '@/components/admin/action-button'
import { Field, Section, StatCard, Tag } from '@/components/admin/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  createEvent,
  deleteEvent,
  importBuiltinEvents,
  toggleEvent,
  updateEvent,
  type EventInput,
} from '@/lib/admin/events'
import { RARITY_LABEL, ROOM_OBJECTS, TRIGGER_LABEL } from '@/lib/constants'
import { EVENT_POOL_SIZE } from '@/lib/events/pool'
import type { Rarity, Tables, TriggerType } from '@/types'

/**
 * 事件池管理。
 *
 * 设计取舍：列表里的「编辑」不再是展开整块表单，而是把这一行换成表单，
 * 其余行保持可读 —— 事件池有 60+ 条，全部铺开根本没法看。
 *
 * 关于生效时间：前台是启动时读一次事件池，所以这里改完要等**下一次刷新**。
 */

type EventRow = Tables<'events'>

const RARITY_TONE: Record<Rarity, 'muted' | 'lamp' | 'rain' | 'neon'> = {
  common: 'muted',
  rare: 'rain',
  hidden: 'neon',
}

/** 触发方式下拉的选项（顺序与 TRIGGER_LABEL 保持一致） */
const TRIGGER_OPTIONS = Object.keys(TRIGGER_LABEL) as TriggerType[]

/** 稀有度下拉的选项 */
const RARITY_OPTIONS = Object.keys(RARITY_LABEL) as Rarity[]

/** 物件下拉：内置的 22 个房间物件 + 全局 + 自定义 */
const OBJECT_OPTIONS = [
  ...ROOM_OBJECTS.map((object) => ({ id: object.id, name: `${object.name}（${object.id}）` })),
  { id: 'global', name: '全局事件（global）' },
]

/**
 * 可用的副作用标识（与前台 lib/events 的执行器一一对应）。
 * 写错不会报错，只是前台不知道该做什么 —— 所以这里列出来给个参考。
 */
const ACTION_HINT =
  '可选。前台能执行的副作用：toggle_lamp / lamp_on / lamp_off / lamp_moon / power_trip / ' +
  'cat_purr / cat_leave / cat_gift / cat_key / cat_glitch / record_play_pause / record_next / ' +
  'record_radio / record_glitch / record_alien / open_music / open_diary / open_treehole / ' +
  'open_games / open_about / rain_change / phone_buzz / notes_fall / moon_move / light_flicker / ' +
  'car_light / nothing。留空就只显示文案。'

/** 查中文物件名，查不到就回落到原始 id */
function objectName(id: string): string {
  if (id === 'global') return '全局'
  return ROOM_OBJECTS.find((object) => object.id === id)?.name ?? id
}

/** 表单里的字符串取值（受控组件统一用字符串，提交前再转类型） */
interface EventFormValues {
  objectType: string
  eventKey: string
  text: string
  action: string
  trigger: TriggerType
  rarity: Rarity
  weight: string
  cooldown: string
  once: boolean
  deepNightOnly: boolean
  consecutiveDays: string
  conditionsText: string
  sort: string
  enabled: boolean
}

const EMPTY_FORM: EventFormValues = {
  objectType: 'lamp',
  eventKey: '',
  text: '',
  action: '',
  trigger: 'click',
  rarity: 'common',
  weight: '10',
  cooldown: '0',
  once: false,
  deepNightOnly: false,
  consecutiveDays: '',
  conditionsText: '{}',
  sort: '0',
  enabled: true,
}

/** 数据库行 → 表单值 */
function rowToForm(row: EventRow): EventFormValues {
  return {
    objectType: row.object_type,
    eventKey: row.event_key,
    text: row.text,
    action: row.action ?? '',
    trigger: row.trigger,
    rarity: row.rarity,
    weight: String(row.weight),
    cooldown: String(row.cooldown_seconds),
    once: row.once,
    deepNightOnly: row.deep_night_only,
    consecutiveDays: row.consecutive_days === null ? '' : String(row.consecutive_days),
    conditionsText: JSON.stringify(row.conditions ?? {}, null, 2),
    sort: String(row.sort),
    enabled: row.enabled,
  }
}

/**
 * 表单值 → action 入参。
 * conditions 是 JSON textarea，解析失败要给出**中文**报错并中断提交。
 */
function formToInput(values: EventFormValues): { input: EventInput } | { error: string } {
  let conditions: Record<string, unknown> = {}
  const raw = values.conditionsText.trim()

  if (raw.length > 0) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { error: '条件（conditions）必须是一个 JSON 对象，例如 {"combo":3}。' }
      }
      conditions = parsed as Record<string, unknown>
    } catch {
      return { error: '条件（conditions）不是合法的 JSON，请检查引号和逗号。' }
    }
  }

  return {
    input: {
      object_type: values.objectType.trim(),
      event_key: values.eventKey.trim(),
      text: values.text.trim(),
      action: values.action.trim() || null,
      trigger: values.trigger,
      rarity: values.rarity,
      weight: values.weight.trim() === '' ? 10 : Number(values.weight),
      cooldown_seconds: values.cooldown.trim() === '' ? 0 : Number(values.cooldown),
      once: values.once,
      deep_night_only: values.deepNightOnly,
      consecutive_days:
        values.consecutiveDays.trim() === '' ? null : Number(values.consecutiveDays),
      conditions,
      enabled: values.enabled,
      sort: values.sort.trim() === '' ? 0 : Number(values.sort),
    },
  }
}

export function EventManager({ events }: { events: EventRow[] }) {
  const [creating, setCreating] = React.useState(events.length === 0)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [objectFilter, setObjectFilter] = React.useState('')
  const [triggerFilter, setTriggerFilter] = React.useState('')

  /* ---------------- 统计 ---------------- */
  const stats = React.useMemo(() => {
    const byRarity: Record<Rarity, number> = { common: 0, rare: 0, hidden: 0 }
    let enabled = 0
    for (const event of events) {
      byRarity[event.rarity] += 1
      if (event.enabled) enabled += 1
    }
    return { enabled, byRarity }
  }, [events])

  /** 已经被用到的物件（筛选下拉只列出真实存在的） */
  const usedObjects = React.useMemo(() => {
    const ids = [...new Set(events.map((event) => event.object_type))]
    return ids.sort()
  }, [events])

  const filtered = React.useMemo(
    () =>
      events.filter(
        (event) =>
          (objectFilter === '' || event.object_type === objectFilter) &&
          (triggerFilter === '' || event.trigger === triggerFilter),
      ),
    [events, objectFilter, triggerFilter],
  )

  return (
    <div className="space-y-5">
      {/* ---------------- 统计 ---------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="事件总条数" value={events.length} hint="数据库里的事件池" />
        <StatCard label="启用中" value={stats.enabled} hint={`停用 ${events.length - stats.enabled} 条`} />
        <StatCard
          label="按稀有度"
          value={`${stats.byRarity.common} / ${stats.byRarity.rare} / ${stats.byRarity.hidden}`}
          hint="普通 / 稀有 / 隐藏"
        />
        <StatCard
          label="内置事件池"
          value={`${EVENT_POOL_SIZE} 条`}
          hint="代码里写死的兜底内容"
        />
      </div>

      {/* ---------------- 生效提示 ---------------- */}
      <div className="rounded-xl border border-lamp/25 bg-lamp/[0.06] p-3.5">
        <p className="text-xs leading-relaxed text-paper/85">
          这里改完的事件，会在访客页面「下一次刷新后」生效 ——
          前台进入房间时只读一次事件池，之后都会用内存里的那份，不会边玩边变。
        </p>
      </div>

      {/* ---------------- 导入内置池 ---------------- */}
      <Section
        title="导入内置事件池"
        description={`把代码里那 ${EVENT_POOL_SIZE} 条内置事件写进数据库。event_key 已经存在的会整条跳过，不会覆盖你改过的文案。`}
        actions={
          <ActionButton
            action={importBuiltinEvents}
            variant="outline"
            size="sm"
            pendingLabel="导入中…"
            successMessage="导入完成，看看下面的统计。"
          >
            <Wand2 className="h-3.5 w-3.5" />
            导入内置事件池
          </ActionButton>
        }
      >
        <p className="text-xs leading-relaxed text-dust">
          空白数据库建议先导入一次：这样 {EVENT_POOL_SIZE} 条文案都会变成可编辑的记录。
          已经在库里的 key 会被跳过，重复点也不会产生重复条目。
        </p>
      </Section>

      {/* ---------------- 新建 ---------------- */}
      <Section
        title="新建事件"
        description="event_key 是唯一标识，建议按「物件.触发.标识」命名，例如 cat.click.yawn。"
        actions={
          <Button
            variant={creating ? 'ghost' : 'default'}
            size="sm"
            onClick={() => setCreating((value) => !value)}
          >
            {creating ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {creating ? '收起' : '新建事件'}
          </Button>
        }
      >
        {creating ? (
          <EventForm
            mode="create"
            initial={EMPTY_FORM}
            onDone={() => setCreating(false)}
          />
        ) : (
          <p className="text-xs text-dust">点右上角「新建事件」开始。</p>
        )}
      </Section>

      {/* ---------------- 列表 ---------------- */}
      <Section
        title={`事件列表（${filtered.length} / ${events.length}）`}
        description="按物件和触发方式筛选。编辑会就地展开在这一行里。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="按物件筛选"
              className="h-8 rounded-md border border-white/10 bg-night/60 px-2 text-xs text-paper"
              value={objectFilter}
              onChange={(event) => setObjectFilter(event.target.value)}
            >
              <option value="">全部物件</option>
              {usedObjects.map((id) => (
                <option key={id} value={id}>
                  {objectName(id)}（{id}）
                </option>
              ))}
            </select>
            <select
              aria-label="按触发方式筛选"
              className="h-8 rounded-md border border-white/10 bg-night/60 px-2 text-xs text-paper"
              value={triggerFilter}
              onChange={(event) => setTriggerFilter(event.target.value)}
            >
              <option value="">全部触发方式</option>
              {TRIGGER_OPTIONS.map((trigger) => (
                <option key={trigger} value={trigger}>
                  {TRIGGER_LABEL[trigger]}
                </option>
              ))}
            </select>
            {(objectFilter !== '' || triggerFilter !== '') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setObjectFilter('')
                  setTriggerFilter('')
                }}
              >
                清除筛选
              </Button>
            )}
          </div>
        }
      >
        {filtered.length === 0 ? (
          <p className="text-xs text-dust">
            {events.length === 0
              ? '事件池是空的。可以先用上面那个「导入内置事件池」。'
              : '这个筛选条件下没有事件。'}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {filtered.map((event) => (
              <EventRowItem
                key={event.id}
                event={event}
                editing={editingId === event.id}
                onToggleEditing={() =>
                  setEditingId((current) => (current === event.id ? null : event.id))
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

function EventRowItem({
  event,
  editing,
  onToggleEditing,
}: {
  event: EventRow
  editing: boolean
  onToggleEditing: () => void
}) {
  const [pending, setPending] = React.useState(false)

  async function switchEnabled() {
    setPending(true)
    try {
      const result = await toggleEvent(event.id, !event.enabled)
      if (result.ok) {
        toast.success(event.enabled ? '已经停用，前台不会再抽到这条。' : '已经启用。')
      } else {
        toast.error(result.error)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <li className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* 第一行：物件 + 文案 */}
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="lamp">{objectName(event.object_type)}</Tag>
            <span className="text-[11px] text-dust">{event.event_key}</span>
          </div>

          <p className="mt-1.5 text-sm leading-relaxed text-paper/90">{event.text}</p>

          {/* 第二行：各种属性 */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-dust">
            <span>触发：{TRIGGER_LABEL[event.trigger]}</span>
            <Tag tone={RARITY_TONE[event.rarity]}>{RARITY_LABEL[event.rarity]}</Tag>
            <span>权重：{event.weight}</span>
            <span>冷却：{event.cooldown_seconds} 秒</span>
            {event.once && <Tag>一次性</Tag>}
            {event.deep_night_only && <Tag tone="rain">深夜限定</Tag>}
            {event.consecutive_days !== null && (
              <span>连续访问：{event.consecutive_days} 天</span>
            )}
            {event.action && <span>动作：{event.action}</span>}
            <span>排序：{event.sort}</span>
            {event.enabled ? (
              <Tag tone="lamp">已启用</Tag>
            ) : (
              <Tag>已停用</Tag>
            )}
          </div>
        </div>

        {/* 操作 */}
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" disabled={pending} onClick={switchEnabled}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {event.enabled ? '停用' : '启用'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggleEditing} aria-expanded={editing}>
            {editing ? '取消' : '编辑'}
          </Button>
          <ActionButton
            action={() => deleteEvent(event.id)}
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

      {editing && (
        <EventForm
          mode="edit"
          initial={rowToForm(event)}
          eventId={event.id}
          onDone={onToggleEditing}
        />
      )}
    </li>
  )
}

/* ==========================================================================
   表单（新建 / 编辑共用）
   ========================================================================== */

function EventForm({
  mode,
  initial,
  eventId,
  onDone,
}: {
  mode: 'create' | 'edit'
  initial: EventFormValues
  eventId?: string
  onDone: () => void
}) {
  const [values, setValues] = React.useState<EventFormValues>(initial)
  const [saving, setSaving] = React.useState(false)

  function patch(next: Partial<EventFormValues>) {
    setValues((current) => ({ ...current, ...next }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()

    const converted = formToInput(values)
    if ('error' in converted) {
      toast.error(converted.error)
      return
    }

    if (converted.input.event_key === '') {
      toast.error('event_key 不能是空的。')
      return
    }
    if (converted.input.text === '') {
      toast.error('总得说点什么 —— 文案不能是空的。')
      return
    }

    setSaving(true)
    try {
      const result =
        mode === 'create' || !eventId
          ? await createEvent(converted.input)
          : await updateEvent(eventId, converted.input)

      if (result.ok) {
        toast.success(mode === 'create' ? '新事件加进池子了。' : '改好了。')
        onDone()
      } else {
        toast.error(result.error)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className={
        mode === 'edit'
          ? 'mt-3 space-y-3 border-t border-white/[0.06] pt-3'
          : 'space-y-3'
      }
      noValidate
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="物件（object_type）" htmlFor={`${mode}-object`} hint="事件挂在哪个房间物件上。">
          <select
            id={`${mode}-object`}
            className="h-10 w-full rounded-md border border-white/10 bg-night/60 px-3 text-sm text-paper"
            value={values.objectType}
            onChange={(event) => patch({ objectType: event.target.value })}
          >
            {OBJECT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
            {/* 库里可能已经存在自定义物件，保留它，别让编辑时被悄悄改掉 */}
            {!OBJECT_OPTIONS.some((option) => option.id === values.objectType) && (
              <option value={values.objectType}>{values.objectType}（自定义）</option>
            )}
          </select>
        </Field>

        <Field
          label="事件 key（event_key）"
          htmlFor={`${mode}-key`}
          hint="例如 cat.click.yawn。只能用小写字母、数字、点、下划线、连字符。"
        >
          <Input
            id={`${mode}-key`}
            value={values.eventKey}
            placeholder="cat.click.yawn"
            onChange={(event) => patch({ eventKey: event.target.value })}
          />
        </Field>
      </div>

      <Field label="文案（访客看到的那句话）" htmlFor={`${mode}-text`}>
        <Textarea
          id={`${mode}-text`}
          rows={2}
          value={values.text}
          placeholder="猫打了个哈欠，然后又睡了。"
          onChange={(event) => patch({ text: event.target.value })}
        />
      </Field>

      <Field
        label="副作用（action，可选）"
        htmlFor={`${mode}-action`}
        hint={ACTION_HINT}
      >
        <Input
          id={`${mode}-action`}
          value={values.action}
          placeholder="cat_purr"
          onChange={(event) => patch({ action: event.target.value })}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="触发方式" htmlFor={`${mode}-trigger`}>
          <select
            id={`${mode}-trigger`}
            className="h-10 w-full rounded-md border border-white/10 bg-night/60 px-3 text-sm text-paper"
            value={values.trigger}
            onChange={(event) => patch({ trigger: event.target.value as TriggerType })}
          >
            {TRIGGER_OPTIONS.map((trigger) => (
              <option key={trigger} value={trigger}>
                {TRIGGER_LABEL[trigger]}（{trigger}）
              </option>
            ))}
          </select>
        </Field>

        <Field label="稀有度" htmlFor={`${mode}-rarity`} hint="稀有度决定前台抽到它的概率。">
          <select
            id={`${mode}-rarity`}
            className="h-10 w-full rounded-md border border-white/10 bg-night/60 px-3 text-sm text-paper"
            value={values.rarity}
            onChange={(event) => patch({ rarity: event.target.value as Rarity })}
          >
            {RARITY_OPTIONS.map((rarity) => (
              <option key={rarity} value={rarity}>
                {RARITY_LABEL[rarity]}（{rarity}）
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="权重" htmlFor={`${mode}-weight`} hint="同类里越大越容易被抽到。">
          <Input
            id={`${mode}-weight`}
            type="number"
            min={0}
            max={1000}
            value={values.weight}
            onChange={(event) => patch({ weight: event.target.value })}
          />
        </Field>
        <Field label="冷却（秒）" htmlFor={`${mode}-cooldown`} hint="0 表示不限制。">
          <Input
            id={`${mode}-cooldown`}
            type="number"
            min={0}
            max={86400}
            value={values.cooldown}
            onChange={(event) => patch({ cooldown: event.target.value })}
          />
        </Field>
        <Field
          label="需要连续访问天数"
          htmlFor={`${mode}-days`}
          hint="留空表示不需要，例如 3。"
        >
          <Input
            id={`${mode}-days`}
            type="number"
            min={1}
            max={365}
            value={values.consecutiveDays}
            onChange={(event) => patch({ consecutiveDays: event.target.value })}
          />
        </Field>
      </div>

      <Field
        label="条件（conditions，JSON）"
        htmlFor={`${mode}-conditions`}
        hint={'例：{"combo":3} / {"requiresLampOff":true} / {"hourRange":[0,5]}。看不懂就保持 {}。'}
      >
        <Textarea
          id={`${mode}-conditions`}
          rows={4}
          className="font-mono text-xs"
          value={values.conditionsText}
          onChange={(event) => patch({ conditionsText: event.target.value })}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="排序" htmlFor={`${mode}-sort`} hint="数字越小越靠前。">
          <Input
            id={`${mode}-sort`}
            type="number"
            value={values.sort}
            onChange={(event) => patch({ sort: event.target.value })}
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-paper/90">开关</legend>
          <div className="flex flex-wrap items-center gap-4 pt-1.5">
            <label className="flex items-center gap-2 text-xs text-paper/85">
              <input
                type="checkbox"
                className="h-4 w-4 accent-lamp"
                checked={values.enabled}
                onChange={(event) => patch({ enabled: event.target.checked })}
              />
              启用
            </label>
            <label className="flex items-center gap-2 text-xs text-paper/85">
              <input
                type="checkbox"
                className="h-4 w-4 accent-lamp"
                checked={values.once}
                onChange={(event) => patch({ once: event.target.checked })}
              />
              只触发一次
            </label>
            <label className="flex items-center gap-2 text-xs text-paper/85">
              <input
                type="checkbox"
                className="h-4 w-4 accent-lamp"
                checked={values.deepNightOnly}
                onChange={(event) => patch({ deepNightOnly: event.target.checked })}
              />
              仅深夜（0:00–5:00）
            </label>
          </div>
        </fieldset>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {mode === 'create' ? '加进事件池' : '保存'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          取消
        </Button>
      </div>
    </form>
  )
}
