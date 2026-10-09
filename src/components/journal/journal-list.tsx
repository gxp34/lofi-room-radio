'use client'

import * as React from 'react'
import { KeyRound, Loader2, Lock, NotebookPen } from 'lucide-react'

import { JournalCard } from '@/components/journal/journal-card'
import { JournalEffects } from '@/components/journal/journal-effects'
import { PhotoLightbox } from '@/components/journal/photo-lightbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useJournalStore } from '@/stores/journal-store'
import type { JournalEntry, LockedJournalEntry } from '@/types'

/**
 * 图文手帐列表。
 *
 * 三件事：
 *   1. 按标签筛选，单列排布（手机上也是单列，手帐本来就不适合并排看）
 *   2. 口令手帐显示成上锁的一页，输入口令后由服务端取回正文
 *   3. 灯箱：点任意一张照片打开，← → 翻，ESC 关
 *   另外承接房间里触发的手帐事件（爪印、掉照片、照片背面的字、变暗）。
 */
export interface JournalListProps {
  entries: JournalEntry[]
  locked: LockedJournalEntry[]
}

export function JournalList({ entries, locked }: JournalListProps) {
  const [tag, setTag] = React.useState<string>('全部')
  const [unlocked, setUnlocked] = React.useState<Record<string, JournalEntry>>({})
  const [lightbox, setLightbox] = React.useState<{ entryId: string; index: number } | null>(null)

  const oldFindAt = useJournalStore((state) => state.oldFindAt)
  const [oldHighlight, setOldHighlight] = React.useState(false)

  /** 「抽屉里翻出旧手帐」：把最旧的一篇高亮一会儿 */
  React.useEffect(() => {
    if (oldFindAt === 0) return
    setOldHighlight(true)
    const timer = window.setTimeout(() => setOldHighlight(false), 15_000)
    return () => window.clearTimeout(timer)
  }, [oldFindAt])

  /** 已解锁的排进正常列表 */
  const allEntries = React.useMemo(() => {
    const extra = Object.values(unlocked).filter(
      (entry) => !entries.some((existing) => existing.id === entry.id),
    )
    return [...entries, ...extra]
  }, [entries, unlocked])

  const allTags = React.useMemo(() => {
    const set = new Set<string>()
    for (const entry of allEntries) for (const item of entry.tags) set.add(item)
    return Array.from(set).sort()
  }, [allEntries])

  const visible = React.useMemo(
    () => (tag === '全部' ? allEntries : allEntries.filter((entry) => entry.tags.includes(tag))),
    [allEntries, tag],
  )

  /** 最旧的一篇（给「翻出旧手帐」用） */
  const oldestId = React.useMemo(() => {
    if (allEntries.length === 0) return null
    return [...allEntries].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )[0]?.id ?? null
  }, [allEntries])

  const lightboxEntry = lightbox
    ? (allEntries.find((entry) => entry.id === lightbox.entryId) ?? null)
    : null

  const openPhoto = React.useCallback((entryId: string, index: number) => {
    setLightbox({ entryId, index })
  }, [])

  return (
    <div className="space-y-6">
      <JournalEffects />

      {/* ---------------- 标签筛选 ---------------- */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={tag === '全部'} onClick={() => setTag('全部')}>
            全部
          </Chip>
          {allTags.map((item) => (
            <Chip key={item} active={tag === item} onClick={() => setTag(item)}>
              {item}
            </Chip>
          ))}
        </div>
      )}

      {/* ---------------- 空 ---------------- */}
      {allEntries.length === 0 && locked.length === 0 && <EmptyJournal />}

      {/* ---------------- 手帐本体（单列） ---------------- */}
      <div className="space-y-7">
        {visible.map((entry) => (
          <JournalCard
            key={entry.id}
            entry={entry}
            highlighted={oldHighlight && entry.id === oldestId}
            onOpenPhoto={openPhoto}
          />
        ))}
      </div>

      {visible.length === 0 && allEntries.length > 0 && (
        <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
          「{tag}」标签下还没有手帐。
        </p>
      )}

      {/* ---------------- 上锁的手帐 ---------------- */}
      {locked.length > 0 && (
        <section aria-labelledby="locked-heading" className="space-y-3 pt-2">
          <h2
            id="locked-heading"
            className="flex items-center gap-2 font-display text-sm text-dust"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden />
            上了锁的 {locked.length} 页
          </h2>

          <div className="space-y-3">
            {locked.map((entry) => (
              <LockedCard
                key={entry.id}
                entry={entry}
                unlockedEntry={unlocked[entry.id]}
                onUnlocked={(value) =>
                  setUnlocked((previous) => ({ ...previous, [entry.id]: value }))
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* ---------------- 灯箱 ---------------- */}
      {lightbox && lightboxEntry && lightboxEntry.photos.length > 0 && (
        <PhotoLightbox
          photos={lightboxEntry.photos}
          index={Math.min(lightbox.index, lightboxEntry.photos.length - 1)}
          entryTitle={lightboxEntry.title}
          onIndexChange={(index) => setLightbox({ entryId: lightboxEntry.id, index })}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active
          ? 'border-lamp/40 bg-lamp/12 text-lamp'
          : 'border-white/[0.08] bg-white/[0.02] text-dust hover:text-paper',
      )}
    >
      {children}
    </button>
  )
}

function EmptyJournal() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-room/35 p-8 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-night/50">
        <NotebookPen className="h-6 w-6 text-dust" aria-hidden />
      </span>
      <p className="mt-5 font-display text-sm text-paper">本子还是新的</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
        还没有公开的手帐。照片和字写在一起，一页一页往后翻。
      </p>
      <p className="mt-4 text-[11px] text-dust">
        适合当第一页的：一张没什么意义的照片，配一句「这天很普通」。
      </p>
    </div>
  )
}

/* ==========================================================================
   上锁的一页
   ========================================================================== */

function LockedCard({
  entry,
  unlockedEntry,
  onUnlocked,
}: {
  entry: LockedJournalEntry
  unlockedEntry?: JournalEntry
  onUnlocked: (entry: JournalEntry) => void
}) {
  const [password, setPassword] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const date = new Date(entry.publishedAt ?? entry.createdAt)
  const dateText = Number.isNaN(date.getTime())
    ? ''
    : `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`

  // 已经解锁：直接把内容渲染出来
  if (unlockedEntry) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-[11px] text-lamp">
          <KeyRound className="h-3 w-3" aria-hidden />
          已解锁 · 本次浏览有效
        </p>
        <JournalCard entry={unlockedEntry} onOpenPhoto={() => undefined} />
      </div>
    )
  }

  async function unlock(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const response = await fetch('/api/journal/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, password }),
      })

      const payload = (await response.json()) as {
        ok: boolean
        entry?: JournalEntry
        message?: string
      }

      if (!response.ok || !payload.ok || !payload.entry) {
        setError(payload.message ?? '口令不对。')
        return
      }

      onUnlocked(payload.entry)
      setPassword('')
    } catch {
      setError('网络好像断了。')
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={unlock}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.015] p-4"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-night/50">
        <Lock className="h-4 w-4 text-dust" aria-hidden />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-sm text-paper/85">{entry.title}</span>
        <span className="block text-[11px] text-dust">{dateText} · 需要口令</span>
      </span>

      <span className="flex w-full items-center gap-2 sm:w-auto">
        <label className="sr-only" htmlFor={`pw-${entry.id}`}>
          口令
        </label>
        <Input
          id={`pw-${entry.id}`}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="口令"
          autoComplete="off"
          className="h-9 w-full sm:w-36"
        />
        <Button type="submit" size="sm" disabled={pending || password.length === 0}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          打开
        </Button>
      </span>

      {error && (
        <p role="alert" className="w-full text-[11px] text-neon">
          {error}
        </p>
      )}
    </form>
  )
}
