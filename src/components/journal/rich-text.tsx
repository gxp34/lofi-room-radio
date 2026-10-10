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
 *
 * ⚠️ **颜色不要写在这里。**
 *
 * 这个组件只用在手帐卡片上，而那是**浅色纸背景**（见 journal-card.tsx 的 .paper）。
 * 整站是深色夜色主题，很容易顺手写成 text-paper / text-dust —— 那些在纸上是
 * 浅米色和灰紫色，等于隐形。
 *
 * 踩过一次：这里每个元素都自己写了 text-paper/90，而 CSS 里**子元素自己的 color
 * 会盖掉从父元素继承的颜色**，所以 journal-card 传进来的 text-[#2b2230] 根本不起作用。
 * 症状是「手帐里的文字看不见，但 emoji 显示正常」—— emoji 是彩色位图，
 * 不吃 CSS color，所以它成了唯一还看得见的东西。
 *
 * 现在的做法：文字颜色一律从外层继承（journal-card 会给深色），
 * 只有链接和引用这种需要区分的地方才写纸上专用的颜色。
 */

/** 行内记号：加粗、斜体、链接 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  const parts = text.split(pattern).filter((part) => part !== '')

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={key} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      )
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={key} className="italic">
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
            /* 纸上专用的玫红：深色主题的 text-lamp 是浅黄，在米色纸上几乎看不见 */
            className="text-[#b8566e] underline decoration-[#b8566e]/40 underline-offset-4 hover:decoration-[#b8566e]"
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
              /* 引用要能看出「这是引用」，但又不能比正文淡到看不见 ——
                 纸上用主色的 70% 加玫红左边线 */
              className="border-l-2 border-[#b8566e]/40 pl-4 text-[15px] leading-[1.9] text-[#2b2230]/70 italic"
            >
              {block.lines.map((line, lineIndex) => (
                <p key={`${key}-${lineIndex}`}>{renderInline(line, `${key}-${lineIndex}`)}</p>
              ))}
            </blockquote>
          )
        }

        if (block.kind === 'ul') {
          return (
            <ul key={key} className="space-y-1.5 text-[15px] leading-[1.9]">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`} className="flex gap-2.5">
                  <span
                    className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[#2b2230]/35"
                    aria-hidden
                  />
                  <span>{renderInline(item, `${key}-${itemIndex}`)}</span>
                </li>
              ))}
            </ul>
          )
        }

        return (
          <p key={key} className="text-[15px] leading-[1.9]">
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
