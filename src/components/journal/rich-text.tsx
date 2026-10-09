import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * 极简 Markdown 渲染（手帐正文用）。
 *
 * 只支持写手帐真正会用到的几种记号，够用而且不会有 XSS 风险
 * （不解析 HTML，全部走 React 文本节点）：
 *   · 空行分段
 *   · **加粗** / *斜体*
 *   · [文字](链接)  —— 只允许 http/https
 *   · > 引用
 *   · - 列表
 */

/** 行内记号：加粗、斜体、链接 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  const parts = text.split(pattern).filter((part) => part !== '')

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-paper">
          {part.slice(2, -2)}
        </strong>
      )
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={key} className="italic text-paper/90">
          {part.slice(1, -1)}
        </em>
      )
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const [, label, href] = link
      // 只放开 http/https，避免 javascript: 之类的伪协议
      const safe = href && /^https?:\/\//i.test(href) ? href : null
      if (safe) {
        return (
          <a
            key={key}
            href={safe}
            target="_blank"
            rel="noreferrer noopener nofollow"
            className="text-lamp underline decoration-lamp/40 underline-offset-4 hover:decoration-lamp"
          >
            {label}
          </a>
        )
      }
      return <span key={key}>{label}</span>
    }

    return <React.Fragment key={key}>{part}</React.Fragment>
  })
}

export interface RichTextProps {
  text: string
  className?: string
}

export function RichText({ text, className }: RichTextProps) {
  const blocks = React.useMemo(() => {
    const lines = text.split('\n')
    const out: Array<
      | { kind: 'p'; lines: string[] }
      | { kind: 'quote'; lines: string[] }
      | { kind: 'ul'; items: string[] }
    > = []

    let paragraph: string[] = []
    let quote: string[] = []
    let list: string[] = []

    const flushParagraph = () => {
      if (paragraph.length > 0) {
        out.push({ kind: 'p', lines: paragraph })
        paragraph = []
      }
    }
    const flushQuote = () => {
      if (quote.length > 0) {
        out.push({ kind: 'quote', lines: quote })
        quote = []
      }
    }
    const flushList = () => {
      if (list.length > 0) {
        out.push({ kind: 'ul', items: list })
        list = []
      }
    }
    const flushAll = () => {
      flushParagraph()
      flushQuote()
      flushList()
    }

    for (const raw of lines) {
      const line = raw.trimEnd()

      if (line.trim() === '') {
        flushAll()
        continue
      }

      if (line.startsWith('> ')) {
        flushParagraph()
        flushList()
        quote.push(line.slice(2))
        continue
      }

      if (/^[-*]\s+/.test(line)) {
        flushParagraph()
        flushQuote()
        list.push(line.replace(/^[-*]\s+/, ''))
        continue
      }

      flushQuote()
      flushList()
      paragraph.push(line)
    }

    flushAll()
    return out
  }, [text])

  return (
    <div className={cn('space-y-3.5', className)}>
      {blocks.map((block, index) => {
        const key = `block-${index}`

        if (block.kind === 'quote') {
          return (
            <blockquote
              key={key}
              className="border-l-2 border-lamp/40 pl-4 text-[15px] leading-[1.9] text-dust italic"
            >
              {block.lines.map((line, lineIndex) => (
                <p key={`${key}-${lineIndex}`}>{renderInline(line, `${key}-${lineIndex}`)}</p>
              ))}
            </blockquote>
          )
        }

        if (block.kind === 'ul') {
          return (
            <ul key={key} className="space-y-1.5 text-[15px] leading-[1.9] text-paper/90">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`} className="flex gap-2.5">
                  <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-lamp/70" aria-hidden />
                  <span>{renderInline(item, `${key}-${itemIndex}`)}</span>
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={key} className="text-[15px] leading-[1.9] text-paper/90">
            {block.lines.map((line, lineIndex) => (
              <React.Fragment key={`${key}-${lineIndex}`}>
                {lineIndex > 0 && <br />}
                {renderInline(line, `${key}-${lineIndex}`)}
              </React.Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
