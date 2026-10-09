'use client'

import * as React from 'react'
import { Gamepad2, Loader2, Pencil, RotateCcw, Save, Trash2, Trophy } from 'lucide-react'
import { toast } from 'sonner'

import { ActionButton } from '@/components/admin/action-button'
import { EmptyState, Field, Section, Tag } from '@/components/admin/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  clearScores,
  deleteScore,
  ensureGames,
  toggleGame,
  updateGameConfig,
} from '@/lib/admin/games'

/**
 * 小游戏管理。
 *
 * 每个游戏一张卡片：开关、最高分、记录条数、最近 20 条记录（可以逐条删）。
 * 排行榜只可能来自访客主动提交 —— 前台 localStorage 里的最高分后台是看不到的，
 * 所以「一条都没有」是正常的，不是坏了。
 */

/** 一条排行榜记录（时间已经在服务端格式化好，避免时区导致 hydration 不一致） */
export interface AdminGameScore {
  id: string
  playerName: string
  score: number
  createdAtLabel: string
}

/** 一张游戏卡片需要的全部数据 */
export interface AdminGameCard {
  slug: string
  name: string
  description: string | null
  enabled: boolean
  sort: number
  bestScore: number
  scoreCount: number
  recentScores: AdminGameScore[]
}

export function GameManager({ games }: { games: AdminGameCard[] }) {
  return (
    <Section
      title="掌机卡带"
      description="关掉某个游戏，前台的掌机里就看不到它了。名字和说明改完立刻生效。"
      actions={
        <ActionButton
          action={ensureGames}
          successMessage="缺失的内置游戏已经补齐了。"
          variant="outline"
          size="sm"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          补齐内置游戏
        </ActionButton>
      }
    >
      {games.length === 0 ? (
        <EmptyState
          title="games 表里还没有游戏"
          description="点右上角「补齐内置游戏」，把 2048 / 贪吃蛇 / 翻牌记忆写进数据库（已经存在的不会被动）。"
        />
      ) : (
        <ul className="space-y-4">
          {games.map((game) => (
            <GameCard key={game.slug} game={game} />
          ))}
        </ul>
      )}
    </Section>
  )
}

/* ==========================================================================
   一张卡片
   ========================================================================== */

function GameCard({ game }: { game: AdminGameCard }) {
  const [enabled, setEnabled] = React.useState(game.enabled)
  const [pending, setPending] = React.useState(false)
  const [editing, setEditing] = React.useState(false)

  // 服务端重新渲染后以数据库为准（乐观更新失败时也靠它兜底）
  React.useEffect(() => {
    setEnabled(game.enabled)
  }, [game.enabled])

  async function handleToggle(next: boolean) {
    setEnabled(next)
    setPending(true)

    try {
      const result = await toggleGame(game.slug, next)

      if (result.ok) {
        toast.success(next ? `「${game.name}」开了。` : `「${game.name}」关了。`)
      } else {
        setEnabled(!next)
        toast.error(result.error)
      }
    } catch (error) {
      setEnabled(!next)
      toast.error(error instanceof Error ? error.message : '开关没切换成功。')
    } finally {
      setPending(false)
    }
  }

  return (
    <li className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
      {/* ---------------- 头部：名字 + 开关 ---------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Gamepad2 className="h-4 w-4 text-lamp" aria-hidden />
            <span className="font-display text-sm text-paper">{game.name}</span>
            <Tag tone="rain">{game.slug}</Tag>
            {enabled ? <Tag tone="lamp">启用中</Tag> : <Tag>已关掉</Tag>}
          </div>

          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {game.description ?? '还没有写说明。'}
          </p>

          <p className="mt-1 text-[11px] text-dust">
            排序 {game.sort} · 最高分 {game.bestScore} · 记录 {game.scoreCount} 条
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-dust">
            <Switch
              checked={enabled}
              disabled={pending}
              onCheckedChange={handleToggle}
              aria-label={`开关「${game.name}」`}
            />
            {pending ? '切换中…' : enabled ? '开着' : '关着'}
          </span>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={editing}
            onClick={() => setEditing((value) => !value)}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editing ? '取消' : '编辑'}
          </Button>
        </div>
      </div>

      {editing && <EditForm game={game} onDone={() => setEditing(false)} />}

      {/* ---------------- 排行榜 ---------------- */}
      <div className="mt-4 border-t border-white/[0.06] pt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 font-display text-xs text-paper/85">
            <Trophy className="h-3.5 w-3.5 text-lamp" aria-hidden />
            最近 {game.recentScores.length} 条记录
          </p>

          {game.scoreCount > 0 && (
            <ActionButton
              action={() => clearScores(game.slug)}
              confirm="确认清空？"
              successMessage="排行榜清空了。"
              variant="ghost"
              size="sm"
              className="text-dust hover:text-neon"
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空排行榜
            </ActionButton>
          )}
        </div>

        {game.recentScores.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-dust">
            还没有人来交分数。前台现在是只写本地 localStorage 的，没有记录很正常。
          </p>
        ) : (
          <ul className="space-y-1.5">
            {game.recentScores.map((score, index) => (
              <li
                key={score.id}
                className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-night/40 px-3 py-1.5"
              >
                <span className="w-5 shrink-0 font-display text-[11px] text-dust">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-paper/85">
                  {score.playerName}
                </span>
                <span className="shrink-0 font-display text-xs text-lamp">{score.score}</span>
                <span className="hidden shrink-0 text-[11px] text-dust sm:block">
                  {score.createdAtLabel}
                </span>

                <ActionButton
                  action={() => deleteScore(score.id)}
                  confirm="确认删除？"
                  successMessage="这条记录删掉了。"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="删除这条记录"
                  className="shrink-0 text-dust hover:text-neon"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}

/* ==========================================================================
   编辑名字 / 说明 / 排序
   ========================================================================== */

function EditForm({ game, onDone }: { game: AdminGameCard; onDone: () => void }) {
  const [name, setName] = React.useState(game.name)
  const [description, setDescription] = React.useState(game.description ?? '')
  const [sort, setSort] = React.useState(String(game.sort))
  const [saving, setSaving] = React.useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)

    try {
      const result = await updateGameConfig(game.slug, {
        name,
        description: description.trim().length > 0 ? description : null,
        sort: Number(sort),
      })

      if (result.ok) {
        toast.success('改好了。')
        onDone()
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '没保存上。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 space-y-3 border-t border-white/[0.06] pt-3"
      noValidate
    >
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label="游戏名" htmlFor={`${game.slug}-name`}>
          <Input
            id={`${game.slug}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="排序" htmlFor={`${game.slug}-sort`} hint="数字越小越靠前。">
          <Input
            id={`${game.slug}-sort`}
            type="number"
            step={10}
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          />
        </Field>
      </div>

      <Field label="说明" htmlFor={`${game.slug}-description`} hint="显示在掌机的游戏名旁边。">
        <Textarea
          id={`${game.slug}-description`}
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          保存
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          取消
        </Button>
      </div>
    </form>
  )
}
