'use client'

import * as React from 'react'
import { FileWarning, ImageIcon, Loader2, Music4, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { ActionButton } from '@/components/admin/action-button'
import { Section, Tag } from '@/components/admin/ui'
import { Button } from '@/components/ui/button'
import {
  deleteMediaFile,
  deleteMediaRecord,
  syncMediaFromStorage,
  type MediaBucket,
  type MediaBucketSnapshot,
  type MediaFileItem,
  type MediaOrphanRecord,
} from '@/lib/admin/media'
import { mimeFromName } from '@/lib/upload'
import { formatDateTimeCN } from '@/lib/admin/format'
import { formatBytes } from '@/lib/utils'

/**
 * 媒体库管理。
 *
 * 数据是服务端页面查好的（Storage 的目录只有服务端读得到），
 * 这里只负责渲染 + 触发三个写操作：
 *   - 删除文件（Storage + 记录，两边都尽力删）；
 *   - 删除记录（文件留着）；
 *   - 扫描 Storage 补登记。
 * 每个操作都有二次确认和 toast 反馈，成功后靠 action 里的 revalidatePath 自己刷新。
 */

const BUCKET_META: Record<MediaBucket, { label: string; description: string; kind: 'audio' | 'image' }> = {
  'public-music': {
    label: '公开音乐',
    description: 'public-music · 访客可以直接播放',
    kind: 'audio',
  },
  'private-music': {
    label: '私密音乐',
    description: 'private-music · 只有登录的站长能听',
    kind: 'audio',
  },
  covers: {
    label: '唱片封面',
    description: 'covers · 公开桶，前台用 publicUrl 直接取',
    kind: 'image',
  },
  'diary-images': {
    label: '日记配图',
    description: 'diary-images · 私密桶，展示时签发临时地址',
    kind: 'image',
  },
  'journal-photos': {
    label: '手帐照片（公开）',
    description: 'journal-photos · 公开手帐的照片，访客直接能看',
    kind: 'image',
  },
  'private-journal-photos': {
    label: '手帐照片（私密）',
    description: 'private-journal-photos · 私密和口令手帐的照片，展示时签临时地址',
    kind: 'image',
  },
}

export function MediaManager({
  buckets,
  notice,
}: {
  buckets: MediaBucketSnapshot[]
  notice?: string | null
}) {
  const [syncing, setSyncing] = React.useState(false)

  const totalFiles = buckets.reduce((sum, bucket) => sum + bucket.files.length, 0)
  const totalSize = buckets.reduce(
    (sum, bucket) => sum + bucket.files.reduce((inner, file) => inner + (file.size ?? 0), 0),
    0,
  )
  const totalOrphans = buckets.reduce((sum, bucket) => sum + bucket.orphans.length, 0)

  /** 扫描 Storage：补登记那些「文件在、记录不在」的东西 */
  const handleSync = React.useCallback(async () => {
    setSyncing(true)
    try {
      const result = await syncMediaFromStorage()

      if (result.ok) {
        toast.success(
          result.data.added > 0
            ? `扫描完了，补登记了 ${result.data.added} 个文件。`
            : '扫描完了，没有漏登记的文件。',
        )
      } else {
        toast.error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '扫描失败了，再试一次。')
    } finally {
      setSyncing(false)
    }
  }, [])

  return (
    <div className="space-y-5">
      {/* ---------------- 顶部说明（文案固定，别改） ---------------- */}
      <div className="rounded-xl border border-neon/25 bg-neon/[0.06] p-3.5">
        <p className="text-xs leading-relaxed text-paper/85">删除是不可恢复的。删掉音乐文件后，前台的播放器会跳过那一首。删封面之前先想想它有没有被引用。</p>
      </div>

      {/* ---------------- 扫描 + 总览 ---------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={syncing}
          onClick={() => void handleSync()}
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          )}
          {syncing ? '扫描中…' : '扫描 Storage 补全记录'}
        </Button>

        <p className="text-[11px] leading-relaxed text-dust">
          Storage 里共 {totalFiles} 个文件，占 {formatBytes(totalSize)}
          {totalOrphans > 0 && ` · 另有 ${totalOrphans} 条登记找不到对应文件`}
        </p>
      </div>

      {notice && <p className="text-xs leading-relaxed text-neon">{notice}</p>}

      {/* ---------------- 四个桶 ---------------- */}
      {buckets.map((snapshot) => (
        <BucketSection key={snapshot.bucket} snapshot={snapshot} />
      ))}
    </div>
  )
}

/* ==========================================================================
   一个桶
   ========================================================================== */

function BucketSection({ snapshot }: { snapshot: MediaBucketSnapshot }) {
  const meta = BUCKET_META[snapshot.bucket]
  const totalSize = snapshot.files.reduce((sum, file) => sum + (file.size ?? 0), 0)
  const isEmpty = snapshot.files.length === 0 && snapshot.orphans.length === 0

  return (
    <Section
      title={`${meta.label}（${snapshot.files.length}）`}
      description={meta.description}
      actions={
        snapshot.error ? (
          <Tag tone="neon">读取失败</Tag>
        ) : (
          <Tag tone="lamp">
            {snapshot.files.length} 个文件 · {formatBytes(totalSize)}
          </Tag>
        )
      }
    >
      {snapshot.error ? (
        <p className="text-xs leading-relaxed text-neon">{snapshot.error}</p>
      ) : isEmpty ? (
        <p className="text-xs text-dust">这个桶还是空的。</p>
      ) : (
        <ul className="space-y-2.5">
          {snapshot.files.map((file) => (
            <FileRow key={`file:${file.path}`} bucket={snapshot.bucket} file={file} kind={meta.kind} />
          ))}
          {snapshot.orphans.map((record) => (
            <OrphanRow key={`orphan:${record.id}`} record={record} />
          ))}
        </ul>
      )}
    </Section>
  )
}

/* ==========================================================================
   一行文件
   ========================================================================== */

function FileRow({
  bucket,
  file,
  kind,
}: {
  bucket: MediaBucket
  file: MediaFileItem
  kind: 'audio' | 'image'
}) {
  return (
    <li className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-dust" aria-hidden>
          {kind === 'audio' ? <Music4 className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xs text-paper" title={file.path}>
            {file.path}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-dust">
            {describeType(file.type, file.path)} · {formatBytes(file.size)} ·{' '}
            {formatDateTime(file.createdAt)}
          </p>
          {!file.recordId && (
            <span className="mt-1.5 inline-block">
              <Tag tone="rain">表里没有登记</Tag>
            </span>
          )}
        </div>

        <ActionButton
          action={() => deleteMediaFile(bucket, file.path)}
          confirm="确认删除？"
          successMessage="文件和记录都删掉了。"
          variant="ghost"
          size="icon-sm"
          aria-label={`删除 ${file.path}`}
          className="shrink-0 text-dust hover:text-neon"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </ActionButton>
      </div>
    </li>
  )
}

/* ==========================================================================
   一行「只剩记录」的孤儿数据
   ========================================================================== */

function OrphanRow({ record }: { record: MediaOrphanRecord }) {
  return (
    <li className="rounded-xl border border-dashed border-white/[0.09] bg-white/[0.015] p-3">
      <div className="flex items-start gap-3">
        <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon" aria-hidden />

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xs text-paper/85" title={record.path}>
            {record.path}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-dust">
            表里登记过，但 Storage 里找不到这个文件 · {formatBytes(record.size)} ·{' '}
            {formatDateTime(record.createdAt)}
          </p>
        </div>

        <ActionButton
          action={() => deleteMediaRecord(record.id)}
          confirm="确认删除？"
          successMessage="登记记录清掉了，文件本来就不在。"
          variant="ghost"
          size="icon-sm"
          aria-label={`删除记录 ${record.path}`}
          className="shrink-0 text-dust hover:text-neon"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </ActionButton>
      </div>
    </li>
  )
}

/* ==========================================================================
   小工具
   ========================================================================== */

/** 类型这一列可能是 MIME（audio/mpeg），也可能是老数据里的粗分类（audio） */
function describeType(type: string | null, path: string): string {
  const value = (type ?? mimeFromName(path)).toLowerCase()

  if (value.startsWith('audio/')) return `音频 · ${value}`
  if (value.startsWith('image/')) return `图片 · ${value}`
  if (value === 'audio') return '音频'
  if (value === 'image') return '图片'
  return value || '类型未知'
}

/** ISO 时间 → 2024-06-11 02:13（固定 Asia/Shanghai，空值给个中文占位） */
function formatDateTime(iso: string | null): string {
  if (!iso) return '时间未知'
  const formatted = formatDateTimeCN(iso)
  return formatted === '—' ? '时间未知' : formatted
}
