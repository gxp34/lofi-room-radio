/**
 * 迁移脚本体检（开发用，不是网站的一部分）。
 *
 * 用法：
 *   node scripts/check-sql.mjs                  # 检查 supabase/migrations
 *   node scripts/check-sql.mjs <目录>            # 检查别的目录（自测用）
 *
 * 在把 SQL 粘进 Supabase 之前跑一下。它查两类**只有执行时才会炸**的问题。
 *
 * ── 1. 先用后建 ─────────────────────────────────────────────────────────────
 * 引用了还没创建的表。踩过一次：
 *
 *   0001 里 is_admin() 是 LANGUAGE sql 的函数，函数体里查 public.profiles，
 *   而 profiles 表在同一个文件后面才创建。Postgres 默认 check_function_bodies = on，
 *   会在 CREATE FUNCTION 的那一刻就去解析 sql 函数体，于是直接报
 *      ERROR: 42P01: relation "public.profiles" does not exist
 *
 * 这里有三个我第一版全写错的地方，记下来免得再犯：
 *
 *   a) **函数体不能一律跳过**。上面那个 bug 就藏在函数体里。
 *      但也不能一律检查 —— 要按语言区分：
 *        · LANGUAGE sql     → 建函数时就解析，表必须已经存在
 *        · LANGUAGE plpgsql → 只做语法检查，不解析表名，引用后面才建的表没问题
 *
 *   b) **被 `set check_function_bodies = off` 保护的要放过**。
 *      0001 开头就关掉了它，所以 is_admin() 提前定义是安全的。
 *      这个设置是**会话级**的 —— 每个文件在 SQL Editor 里是独立会话，
 *      所以只有「同一文件里、函数之前」关掉才算数。
 *
 *   c) **`from public.X` 必须算表引用**。我第一版漏了这条，
 *      结果那唯一一个真实 bug 恰好抓不到（它写的就是 `from public.profiles`）。
 *
 * ── 2. 幂等 ────────────────────────────────────────────────────────────────
 * 重跑会报 policy already exists / 插重复数据。两种写法算通过：
 *   · 显式写 drop policy if exists "名字"
 *   · 放进 DO 块里，循环内先 `drop policy if exists %I` 再 execute
 * 另外**只统计顶层语句** —— 函数体里的 insert 不是「迁移时插数据」，
 * 重跑迁移不会让它多插一次。
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = process.argv[2] ?? 'supabase/migrations'

const files = readdirSync(DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort()

let problems = 0

/* ==========================================================================
   全局：每张表在「第几个文件、第几行」第一次被创建
   ========================================================================== */

const created = new Map()

files.forEach((file, fileIndex) => {
  readFileSync(join(DIR, file), 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const match = line.match(/^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/i)
      if (match && !created.has(match[1])) {
        created.set(match[1], { file, fileIndex, line: i + 1 })
      }
    })
})

const before = (a, b) =>
  a.fileIndex < b.fileIndex || (a.fileIndex === b.fileIndex && a.line < b.line)

/**
 * 「真的在引用一张表」的写法。
 *
 * 每条都带 \b：`function` 这个词的末尾正好是 `on`（functi-on），
 * 不加词边界的话，`comment on function public.is_admin()` 会被当成「引用表 is_admin」。
 */
const TABLE_PATTERNS = [
  /\bfrom\s+public\.(\w+)/gi,
  /\bjoin\s+public\.(\w+)/gi,
  /\binsert\s+into\s+public\.(\w+)/gi,
  /\bupdate\s+public\.(\w+)/gi,
  /\bdelete\s+from\s+public\.(\w+)/gi,
  /\balter\s+table\s+(?:if\s+exists\s+)?public\.(\w+)/gi,
  /\bcreate\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?\S+\s+\bon\s+public\.(\w+)/gi,
  /\bcreate\s+policy\s+"[^"]*"\s+\bon\s+public\.(\w+)/gi,
  /\bcomment\s+on\s+table\s+public\.(\w+)/gi,
  /\breferences\s+public\.(\w+)/gi,
  /\bgrant\s+[\s\S]*?\bon\s+public\.(\w+)/gi,
  /\bon\s+public\.(\w+)/gi,
]

function checkTableRefs(text, at, label) {
  let found = 0
  const seen = new Set()

  for (const pattern of TABLE_PATTERNS) {
    for (const ref of text.matchAll(pattern)) {
      const table = ref[1]
      if (seen.has(table)) continue
      seen.add(table)

      const c = created.get(table)
      if (!c) {
        console.log(`  !! ${at.file}:${at.line} ${label}引用了没人创建的表 public.${table}`)
        found++
      } else if (!before(c, at)) {
        console.log(
          `  !! ${at.file}:${at.line} ${label}用了 public.${table}，但它要到 ${c.file}:${c.line} 才创建`,
        )
        found++
      }
    }
  }
  return found
}

/* ==========================================================================
   把每个文件切成「顶层语句」和「函数」两类片段
   ========================================================================== */

function parseFile(file, fileIndex) {
  const lines = readFileSync(join(DIR, file), 'utf8').split('\n')
  const segments = []
  let bodiesChecked = true
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (/^\s*set\s+check_function_bodies\s*=\s*off/i.test(line)) {
      bodiesChecked = false
      i++
      continue
    }

    const start = line.match(/^\s*create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)/i)
    if (!start) {
      segments.push({ kind: 'top', text: line, line: i + 1 })
      i++
      continue
    }

    // 函数结束：第一个独占一行的 $$; 或 $$
    let end = lines.length - 1
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*\$\$;?\s*$/.test(lines[j])) {
        end = j
        break
      }
    }

    const body = lines.slice(i, end + 1).join('\n')
    segments.push({
      kind: 'function',
      name: start[1],
      isSql: /language\s+sql/i.test(body),
      text: body,
      line: i + 1,
      bodiesChecked,
    })
    i = end + 1
  }

  return segments
}

/* ==========================================================================
   1. 先建后用
   ========================================================================== */

console.log('【1】先建后用检查')

for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
  const file = files[fileIndex]
  const at = (line) => ({ file, fileIndex, line })

  for (const seg of parseFile(file, fileIndex)) {
    if (seg.kind === 'top') {
      problems += checkTableRefs(seg.text, at(seg.line), '')
    } else if (seg.isSql && seg.bodiesChecked) {
      // sql 函数体在建函数时就会被解析 → 表必须已经存在
      problems += checkTableRefs(seg.text, at(seg.line), `${seg.name}() 的函数体 `)
    }
    // plpgsql 函数体不解析表名；关掉 check_function_bodies 之后的也跳过
  }
}

if (problems === 0) console.log('  （没有）')

/* ==========================================================================
   2. 幂等（只看顶层语句）
   ========================================================================== */

console.log('\n【2】幂等检查（能不能重复执行）')

for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
  const file = files[fileIndex]
  const segments = parseFile(file, fileIndex)
  const topText = segments
    .filter((s) => s.kind === 'top')
    .map((s) => s.text)
    .join('\n')
  const wholeText = readFileSync(join(DIR, file), 'utf8')

  const policyNames = [
    ...new Set([...wholeText.matchAll(/create policy\s+"([^"]+)"/g)].map((m) => m[1])),
  ]
  const templatedDrop = /drop policy if exists\s+%I/.test(wholeText)
  const duplicateGuard = /exception\s+when\s+duplicate_object/i.test(wholeText)

  const uncovered = policyNames.filter(
    (name) =>
      !wholeText.includes(`drop policy if exists "${name}"`) &&
      !wholeText.includes(`drop policy if exists '${name}'`),
  )

  // 只数顶层 insert —— 函数体里的 insert 是运行时才执行的，不算迁移插数据
  const inserts = [...topText.matchAll(/insert\s+into\s+public\.(\w+)/g)]
  const insertGuard = /on conflict/i.test(wholeText)

  const notes = []
  if (policyNames.length > 0) {
    if (templatedDrop) notes.push('DO 块内先删后建')
    else if (uncovered.length === 0) notes.push('逐条 drop + create')
    else if (duplicateGuard) notes.push('靠 duplicate_object 兜底')
    else {
      notes.push(`${uncovered.length} 条策略重跑会报 already exists`)
      problems++
      uncovered.slice(0, 3).forEach((n) => notes.push(`未覆盖: ${n}`))
    }
  }
  if (inserts.length > 0 && !insertGuard) {
    notes.push(`${inserts.length} 处 insert 没有 on conflict，重跑会插重复数据`)
    problems++
  }
  if (notes.length === 0) notes.push('无策略 / 无插入')

  console.log(
    `  ${file.padEnd(26)} 策略 ${String(policyNames.length).padStart(2)} 条   ${notes.join('；')}`,
  )
}

console.log('')
console.log(
  problems === 0 ? `检查了 ${files.length} 个文件，没发现问题 ✓` : `发现 ${problems} 处问题`,
)
process.exitCode = problems === 0 ? 0 : 1
