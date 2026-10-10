/**
 * Node 的模块解析钩子：让 `@/xxx` 这种别名能被直接跑起来（开发工具）。
 *
 * 为什么需要它：
 *   项目源码统一用 `@/lib/...` 这种别名（tsconfig 的 paths），
 *   Next 会自己把这个别名解析掉，Node 不会。
 *   scripts/verify-sky-math.mjs 要 import **真实的** scene.ts 做端到端验证，
 *   所以得把别名补上 —— 否则只能把源码里的别名改成相对路径，
 *   那是为了工具去改产品代码，本末倒置。
 *
 * 只在 scripts/ 下的验证脚本里注册，不影响 Next 的构建。
 */

import { existsSync, readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve as resolvePath } from 'node:path'

const ROOT = resolvePath(import.meta.dirname, '..', '..')

/** 扩展名补齐的顺序，和 tsc / Next 的默认一致 */
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.mjs', '.json']

/** 目录形式的导入也要认（`@/lib/sky` → `@/lib/sky/index.ts`） */
const INDEX_EXTENSIONS = EXTENSIONS.filter(Boolean).map((extension) => `/index${extension}`)

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context)

  const base = resolvePath(ROOT, 'src', specifier.slice(2))

  for (const suffix of [...EXTENSIONS, ...INDEX_EXTENSIONS]) {
    const candidate = `${base}${suffix}`
    if (existsSync(candidate)) {
      /**
       * ⚠️ 这里返回的是 `{ url, shortCircuit: true }`，**不能**调 nextResolve
       * 去解析这个绝对路径 —— 它只认 specifier，喂一个 Windows 盘符路径
       * 会被当成协议名（"C:"）而解析失败。
       * 这个坑的症状是 "Cannot find module ...src/lib/sky/stars.generated"。
       */
      return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
  }

  // 实在找不到就交回默认逻辑，让它给出正常的报错
  return nextResolve(specifier, context)
}

/**
 * 把 .tsx 也喂给 Node 的类型擦除。
 *
 * Node 22+ 能直接跑 .ts（`--experimental-strip-types` 默认开），
 * 但**不认 .tsx** —— JSX 不是 TypeScript 的类型语法，擦不掉，
 * 会报 "Unknown file extension .tsx"。
 *
 * 这里用 `stripTypeScriptTypes` 的 JSX 模式处理：它会把 JSX 变成
 * 普通的函数调用（`_jsx(...)`），我们不真的运行组件，只要能把
 * 模块加载进来、拿到里面导出的纯函数（例如 moonPhasePath）就够了。
 * 组件体里的 `_jsx` 只有在被调用时才会求值，而验证脚本不会去渲染它。
 */
export function load(url, context, nextLoad) {
  if (!url.endsWith('.tsx')) return nextLoad(url, context)

  const source = readFileSync(fileURLToPath(url), 'utf8')
  const javascript = stripTypeScriptTypes(source, {
    mode: 'strip',
    sourceUrl: url,
    // 只有开了 jsx 才认得了 .tsx
    jsx: true,
  })

  return { format: 'module', source: javascript, shortCircuit: true }
}

