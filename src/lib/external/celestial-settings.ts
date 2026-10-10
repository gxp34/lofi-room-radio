import { isSupabaseConfigured } from '@/lib/env'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * 「星空图」的总开关。
 *
 * 优先级的规则（和天气那套一致，别改成别的顺序）：
 *   1. `site_settings.celestial_enabled` —— 站长在后台点的那一下，最高优先级。
 *   2. 环境变量 `CELESTIAL_ENABLED` —— **只在数据库里没有这一行时**才用它兜底，
 *      给"刚部署、迁移还没跑"这段时间一个合理的默认值。
 *   3. 都没有 → true。星空是纯本地计算，不花钱、不发请求、不依赖任何外部服务，
 *      所以默认开着是最合理的选择（要关也就是后台点一下）。
 *
 * 为什么不并进 lib/external/settings.ts 的 ExternalSettings：
 *   那个函数一次只 select 它关心的那几个 key，每加一种功能都要动它；
 *   而星空的读取时机也不同 —— 页面**渲染时**就要知道，
 *   天气是客户端挂载之后才自己去接口拉的。单独一个模块边界更清楚。
 */

const KEY = 'celestial_enabled'

/**
 * 环境变量的兜底值。
 *
 * 这里**故意不引 env.server.ts**：那个文件带 service_role 密钥，
 * 一旦被谁误引到客户端组件就会在浏览器里抛错。而这个模块只会被
 * 服务端页面和 Route Handler 用，所以只需要读一个普通的 process.env。
 *
 * 只认 'false' / '0' / 'no' / 'off' 是"关"，其它（含未设置）都算开 ——
 * 宁可因为写错一个值多开一个本地计算的功能，也不要因为写错而白屏。
 */
export const CELESTIAL_ENABLED_FALLBACK = parseBooleanFlag(process.env.CELESTIAL_ENABLED) ?? true

function parseBooleanFlag(value: string | undefined): boolean | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === '') return null
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  return null
}

export async function loadCelestialEnabled(): Promise<boolean> {
  const supabase = createSupabaseServerClient()
  // 没连数据库（本地演示模式）时直接用兜底值，省一次注定失败的查询
  if (!supabase) return CELESTIAL_ENABLED_FALLBACK

  try {
    /**
     * 用 maybeSingle() 而不是 cache.ts 里的 readSetting()：
     * readSetting 把"没有这一行"和"查询出错"都返回成 null，而这两件事
     * 在这里的含义**完全不同** —— 缺行才该退回环境变量，
     * 查询出错说明数据库只是暂时不通，这时候贸然用环境变量会把
     * 站长在后台的选择悄悄覆盖掉。所以这里要自己分清。
     */
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', KEY)
      .maybeSingle()

    if (error) {
      console.warn('[celestial] 读星空开关失败，先按开着处理：', error.message)
      return true
    }

    // 没有这一行（迁移没跑）→ 环境变量兜底
    if (!data) return CELESTIAL_ENABLED_FALLBACK

    const value = data.value as unknown
    if (typeof value === 'boolean') return value
    // 手写成字符串 "true" / "false" 也认
    if (typeof value === 'string') return parseBooleanFlag(value) ?? CELESTIAL_ENABLED_FALLBACK

    return CELESTIAL_ENABLED_FALLBACK
  } catch (error) {
    console.warn('[celestial] 读星空开关异常，先按开着处理：', error)
    return true
  }
}
