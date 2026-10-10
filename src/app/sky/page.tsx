import type { Metadata } from 'next'
import { Sparkles } from 'lucide-react'

import { SkyClient } from '@/app/sky/sky-client'
import { loadCelestialEnabled } from '@/lib/external/celestial-settings'

export const metadata: Metadata = {
  title: '星空图',
  description: '今晚头顶上的那片天：亮星、星座连线、月亮和行星的位置，全部在本地算出来。',
}

/**
 * 「星空图」独立页面。
 *
 * ⚠️ 这个页面为什么是服务端组件（而不是像 /music 那样直接 'use client'）：
 *   它要导 metadata，而 metadata 只能在服务端组件里导。
 *   真正需要状态的部分在 sky-client.tsx 里 —— 和 /games/virtual-cat 分两层
 *   是同一个原因，只是这里缺的不是函数 prop，而是 metadata。
 *
 * ============================================================================
 * 关于 d3-celestial：**没有用它**，这里是自己实现的精简星图
 * ============================================================================
 * 选之前实际量过（不是凭印象）：
 *
 *   · 整包 51 MB（93 个文件），装进 node_modules 就是这 51 MB。
 *   · 最小可用的一套静态资源（星表 + 连线 + 银河 + 三个脚本）也要 1.4 MB：
 *       stars.6.json                641 KB
 *       constellations.lines.json    27 KB
 *       mw.json                     522 KB
 *       celestial.min.js            122 KB
 *       lib/d3.min.js               148 KB
 *       lib/d3.geo.projection.js     46 KB
 *       lib/d3-queue.js               4 KB
 *     想要星座名的话 starnames.json 再加 660 KB。
 *   · 它依赖 **d3 v3 时代的 API**（`d3.geo.projection` / `d3.geo.zoom` 那些
 *     早就从 d3 v4 之后移除了），所以必须把它自带的那份 d3 一起引进来；
 *     而它是个直接操作全局 `window.d3` 的 IIFE，在 Next 的模块体系里
 *     只能靠 <script> 标签加载，还要绕开 SSR。
 *
 *   而这个站是一个"深夜小房间"的个人网站：多 1.4 MB 静态资源 + 51 MB 依赖，
 *   换来的是一堆我们根本不会显示的深空天体。性价比太低，所以走了自己实现这条路。
 *
 * 自己实现花了什么、省了什么：
 *   · 星表：975 颗星（4.4 等以内 + 星座连线用到的全部），
 *     连坐标带星等带色指数只有 43 KB 的 TS **源码**，gzip 之后约 13 KB。
 *     数据是用 scripts/build-sky-data.mjs 从 d3-celestial 的数据文件里
 *     **抽**出来的（BSD-3-Clause，见那个脚本顶部的许可说明），
 *     所以星表本身是可信的，只是我们只抄了需要的那部分。
 *   · 投影：球极投影（共形，星座不会被拉歪），20 行。
 *   · 位置：lib/sky/sky-math.ts。恒星时、地平坐标、月亮和行星全是自己算的，
 *     验证脚本 scripts/verify-sky-math.mjs 拿 suncalc、火星冲日、
 *     内行星大距上限这些**能独立算出来**的参照核对过。
 *   · 渲染：手写 SVG（不是 canvas），颜色直接用站内的设计 token。
 *   · 结果：一个外部请求都不发，也没有任何静态资源要部署。
 *
 * 精度上诚实地说：不做章动、不做大气折射、行星没有大行星摄动项，
 * 木星土星最差差 0.3° 左右 —— 在一张 700px 的图上是 2 个像素。
 * 这是氛围功能，不是天文软件。
 */
export default async function SkyPage() {
  /**
   * 开关在**服务端**读（数据库里的 celestial_enabled，缺行时用环境变量
   * CELESTIAL_ENABLED 兜底）。这样首帧就是对的，不会先渲染一遍再跳。
   *
   * 这里不写 `export const dynamic = 'force-dynamic'`：那个会让每次访问
   * 都重新渲染；而站长在后台改完开关时，lib/admin/settings.ts 里的
   * revalidateSettings() 已经 revalidatePath('/sky') 了，
   * 所以静态生成 + 按需失效就够，页面本身还能白拿一层缓存。
   */
  const enabled = await loadCelestialEnabled()

  return (
    <div className="container py-8 sm:py-12">
      <header className="mb-6">
        <p className="mb-2 font-display text-xs uppercase tracking-[0.2em] text-dust">
          {'// 窗外 · 抬头'}
        </p>
        <h1 className="font-display text-2xl text-paper sm:text-3xl">星空图</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          一张从头顶往下看的星图：圆心是你的正上方，边缘是地平线，上方是北。
          亮星、星座连线、月亮和行星的位置都是
          {/*
            ⚠️ 这里必须用 <strong>，不能写 **粗体** —— JSX 不解析 Markdown，
            星号会被原样画到页面上。（/games/virtual-cat 上踩过同一个坑。）
          */}
          <strong className="font-normal text-paper/85">在本地算的</strong>
          ，不联网、不调任何接口 —— 所以断网也看得见。
        </p>
        <p className="mt-2 flex max-w-2xl items-start gap-1.5 text-[11px] leading-relaxed text-dust">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-lamp" aria-hidden />
          手机上图里只画亮星、月亮和星座连线，
          <strong className="font-normal text-paper/85">行星和星座名不画在图上</strong>
          —— 但下面照样有行星和这一晚的时间，一个都没少。
          天黑之后打开这一页效果最好。
        </p>
      </header>

      {/* 简化模式（画多少颗星）由客户端挂载后自己测，服务端不知道屏幕多宽 */}
      <SkyClient enabled={enabled} />
    </div>
  )
}
