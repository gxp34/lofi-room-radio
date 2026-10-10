'use client'

import * as React from 'react'
import { ImageOff, RotateCcw, Shuffle, Timer, Trophy } from 'lucide-react'

import { GameShell } from '@/components/games/game-shell'
import { Button } from '@/components/ui/button'
import { playSfx } from '@/lib/audio/sfx'
import { hydrateSave, persistSave } from '@/lib/games/save'
import {
  EMPTY_PUZZLE_SAVE,
  PUZZLE_FALLBACK_IMAGE,
  PUZZLE_SIZES,
  PUZZLE_SIZE_LABEL,
  type PuzzlePhoto,
  type PuzzleSave,
  type PuzzleSize,
  countPlaced,
  createShuffledOrder,
  formatDuration,
  isSolved,
  mergePuzzleResult,
  swapTiles,
  tileBackgroundPosition,
} from '@/lib/games/puzzle'
import { cn } from '@/lib/utils'
import { useAchievementStore } from '@/stores/achievement-store'
import { useEventStore } from '@/stores/event-store'

/**
 * 照片拼图。
 *
 * 素材来自**公开手帐的照片**（服务端读好传进来），一张都没有时退回内置的像素画 ——
 * 所以手帐还空着的时候这个游戏也能玩，只是拼的是房间的像素图。
 *
 * 交互是**交换式**：点两块就换位置。桌面端另外支持拖拽。
 * 不做滑块式的原因写在 lib/games/puzzle.ts 开头（最后两格的死局太烦人）。
 */

const SAVE_SLUG = 'puzzle'

export interface GamePuzzleProps {
  /**
   * 可用的照片；空数组（或不传）时用默认像素图。
   *
   * 为什么是可选的：游戏组件要能塞进 `GAME_COMPONENTS` 那张
   * `Record<string, ComponentType<{highScore, reportScore, ...}>>` 表里，
   * 而那张表的 props 必须是可选的，否则各游戏的必需 prop 对不上。
   * 好处也实在：手帐还空着的时候这个游戏照样能玩，拼的就是像素画。
   */
  photos?: PuzzlePhoto[]
  highScore: number
  reportScore: (score: number) => void
}

export function GamePuzzle({ photos: photoList, highScore, reportScore }: GamePuzzleProps) {
  const photos = React.useMemo(() => photoList ?? [], [photoList])
  const [save, setSave] = React.useState<PuzzleSave>(EMPTY_PUZZLE_SAVE)
  const [size, setSize] = React.useState<PuzzleSize>(4)

  const [order, setOrder] = React.useState<number[]>([])
  const [moves, setMoves] = React.useState(0)
  const [seconds, setSeconds] = React.useState(0)
  const [running, setRunning] = React.useState(false)
  const [solved, setSolved] = React.useState(false)
  const [picked, setPicked] = React.useState<number | null>(null)
  const [photoIndex, setPhotoIndex] = React.useState(0)
  const [cloudNote, setCloudNote] = React.useState<string | null>(null)

  const timerRef = React.useRef<number | null>(null)

  /** 当前这张照片（没有手帐照片时用内置像素画） */
  const photo: PuzzlePhoto = photos.length > 0
    ? photos[photoIndex % photos.length]
    : { url: PUZZLE_FALLBACK_IMAGE, caption: null, entryTitle: '房间的像素画' }
  const imageUrl = photo.url

  /* ---------------- 存档 ---------------- */

  React.useEffect(() => {
    let alive = true
    void hydrateSave<PuzzleSave>(SAVE_SLUG, EMPTY_PUZZLE_SAVE, (cloud) => {
      if (!alive) return
      setSave(cloud)
      setCloudNote('从云端读到了你在别的设备上的记录。')
    }).then((envelope) => {
      if (alive) setSave(envelope.state)
    })
    return () => {
      alive = false
    }
  }, [])

  /* ---------------- 开局 / 重开 ---------------- */

  const start = React.useCallback(
    (nextSize: PuzzleSize = size) => {
      setOrder(createShuffledOrder(nextSize))
      setMoves(0)
      setSeconds(0)
      setSolved(false)
      setPicked(null)
      setRunning(true)
      void playSfx('page')
    },
    [size],
  )

  // 第一次进来就摆好棋盘，别让玩家看到空框
  const startedRef = React.useRef(false)
  React.useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    start(size)
  }, [size, start])

  /* ---------------- 计时 ---------------- */

  React.useEffect(() => {
    if (!running || solved) {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [running, solved])

  /* ---------------- 交换 ---------------- */

  /**
   * 换两块。
   *
   * 所有判断都在这儿一次算完，**不要**把逻辑塞进 setOrder 的 updater 里 ——
   * 那样会拿到过期的 order，而且 setMoves 会被调用两次、步数直接翻倍。
   * 第一版就是那么写的，自己给自己挖了个坑。
   */
  const doSwap = React.useCallback(
    (a: number, b: number) => {
      if (a === b || solved) return

      const next = swapTiles(order, a, b)
      const nextMoves = moves + 1
      const done = isSolved(next)

      setOrder(next)
      setMoves(nextMoves)
      setPicked(null)

      if (!done) {
        void playSfx('click')
        return
      }

      // ---- 拼好了 ----
      setSolved(true)
      setRunning(false)
      void playSfx('letter')

      const run = { moves: nextMoves, seconds, at: new Date().toISOString() }
      setSave((old) => {
        const merged = mergePuzzleResult(old, size, run)
        persistSave(SAVE_SLUG, merged)
        return merged
      })

      reportScore(nextMoves)
      useAchievementStore.getState().unlock('photo_restored')
      useEventStore
        .getState()
        .pushToast('拼回去了。照片背后那句话，现在能看到。', 'rare', 'handheld')
    },
    [moves, order, reportScore, seconds, size, solved],
  )

  const onTileClick = (index: number) => {
    if (solved) return
    if (picked === null) {
      setPicked(index)
      void playSfx('hover')
      return
    }
    doSwap(picked, index)
  }

  /* ---------------- 换难度 ---------------- */

  const changeSize = (next: PuzzleSize) => {
    setSize(next)
    start(next)
  }

  const nextPhoto = () => {
    setPhotoIndex((value) => value + 1)
    start()
    setCloudNote(null)
  }

  const placed = order.length > 0 ? countPlaced(order) : 0
  const total = size * size
  const best = save.best[String(size)]

  return (
    <GameShell
      name="照片拼图"
      tagline={solved ? '拼好了' : `${placed} / ${total} 归位`}
      highScore={Math.max(highScore, save.solved)}
      score={moves}
      status={
        solved
          ? `用了 ${moves} 步 · ${formatDuration(seconds)}`
          : running
            ? `${formatDuration(seconds)} · ${moves} 步`
            : '准备好了'
      }
      onRestart={() => start()}
      instructions={[
        '点两块交换位置。电脑上也可以直接拖。',
        '素材是公开手帐里的照片；手帐还空着时拼的是内置像素画。',
        '拼完会显示那张照片的说明 —— 有些话平时不会翻到。',
        `最佳记录：${best ? `${best.moves} 步 / ${formatDuration(best.seconds)}` : '还没有'}`,
      ]}
      controls={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-white/10">
            {PUZZLE_SIZES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => changeSize(value)}
                className={cn(
                  'px-3 py-2 font-display text-xs transition-colors',
                  size === value ? 'bg-lamp/[0.14] text-lamp' : 'text-dust hover:text-paper',
                )}
              >
                {value}×{value}
              </button>
            ))}
          </div>

          <Button size="sm" variant="outline" onClick={() => start()} disabled={solved}>
            <RotateCcw className="h-3.5 w-3.5" />
            重来
          </Button>

          {photos.length > 1 && (
            <Button size="sm" variant="ghost" onClick={nextPhoto}>
              <Shuffle className="h-3.5 w-3.5" />
              换一张
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3">
        {/* ---------------- 进度 ---------------- */}
        <div className="flex w-full items-center justify-between gap-3 font-display text-[11px] text-dust">
          <span className="flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5" aria-hidden />
            {formatDuration(seconds)}
          </span>
          <span>{moves} 步</span>
          <span className="flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5" aria-hidden />
            {best ? `${best.moves} 步` : '—'}
          </span>
        </div>

        {/* ---------------- 棋盘 ---------------- */}
        <div
          className={cn(
            'relative w-full max-w-[22rem] overflow-hidden rounded-lg border border-white/10 bg-[#0b0f13] p-1',
            '[container-type:inline-size]',
          )}
        >
          <div
            className="grid aspect-square w-full gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
          >
            {order.map((tile, index) => {
              const isPicked = picked === index
              const isPlaced = tile === index

              return (
                <button
                  key={index}
                  type="button"
                  draggable={!solved}
                  aria-label={`第 ${index + 1} 格`}
                  onClick={() => onTileClick(index)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', String(index))
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const from = Number(event.dataTransfer.getData('text/plain'))
                    if (Number.isInteger(from)) doSwap(from, index)
                  }}
                  className={cn(
                    'relative overflow-hidden rounded-[2px] transition-[transform,box-shadow] duration-150',
                    'bg-cover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lamp',
                    isPicked && 'z-10 scale-[0.94] ring-2 ring-lamp',
                    // 归位的块给一点点提示：不是作弊，是让人知道"这块对了"
                    !solved && isPlaced && 'shadow-[inset_0_0_0_1px_rgba(247,200,115,0.35)]',
                    solved && 'cursor-default',
                  )}
                  style={{
                    backgroundImage: `url("${imageUrl}")`,
                    backgroundSize: `${size * 100}% ${size * 100}%`,
                    backgroundPosition: tileBackgroundPosition(tile, size),
                  }}
                />
              )
            })}
          </div>
        </div>

        {/* ---------------- 完成 ---------------- */}
        {solved && (
          <div className="animate-rise-in w-full rounded-xl border border-lamp/25 bg-lamp/[0.05] p-3.5 text-left">
            <p className="mb-2 font-display text-xs tracking-[0.16em] text-lamp">
              拼回去了 · {moves} 步 · {formatDuration(seconds)}
            </p>

            {photo.caption ? (
              <p className="text-[13px] leading-[1.85] text-paper/85">
                照片背面写着：「{photo.caption}」
              </p>
            ) : (
              <p className="text-[13px] leading-[1.85] text-paper/85">
                这张没有写说明。它只是被忘在那儿了。
              </p>
            )}

            <p className="mt-2 border-t border-white/[0.07] pt-2 text-[11px] text-dust">
              来自手帐《{photo.entryTitle}》
            </p>
          </div>
        )}

        {!solved && photos.length === 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-dust">
            <ImageOff className="h-3 w-3" aria-hidden />
            手帐里还没有公开照片，现在拼的是房间的像素画。
          </p>
        )}

        {cloudNote && <p className="text-[11px] text-rain/80">{cloudNote}</p>}
      </div>
    </GameShell>
  )
}
