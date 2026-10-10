'use client'

import * as React from 'react'
import { Compass, Info, Moon, RefreshCw, Sparkles, Sun, Sunrise, Sunset } from 'lucide-react'

import { useRoom } from '@/components/providers/room-provider'
import { MoonPhaseIcon, type MoonShape } from '@/components/sky/moon-phase'
import { SkyChart } from '@/components/sky/sky-chart'
import { Button } from '@/components/ui/button'
import { computeSkyTimes, estimateUtcOffsetSeconds, skyPhaseAt } from '@/lib/external/sky'
import { SKY_PHASE_META } from '@/lib/external/sky-meta'
import { moonPhaseName } from '@/lib/sky/moon-phase'
import { buildSkyScene, type SkyScene } from '@/lib/sky/scene'
import { readCelestialView, rememberCelestialView } from '@/lib/sky/view-cache'
import { cn } from '@/lib/utils'
import type { SkyPhase, SkyTimes } from '@/types/external'

/**
 * 「星空图」页面的客户端适配层。
 *
 * 为什么要有这一层（和 /games/virtual-cat 是同一个原因）：
 *   页面本身是服务端组件（要导 metadata），而星图需要 useState/useEffect，
 *   所以真正干活的必须是客户端组件，服务端只负责壳和标题。
 *
 * 数据从哪来 —— 这一页**几乎不发网络请求**：
 *   1. `/api/sky`（自己的 Route Handler）只拿两样东西：经纬度、服务端的"现在几点"。
 *      这两样客户端确实拿不到（经纬度是站长在后台填的）。
 *   2. 星表、星座连线、月亮和行星的位置全部是本地算的 —— 不走网络，
 *      也不请求任何外部服务。
 *   3. 日出日落用项目里已有的 suncalc（`lib/external/sky.ts` 里的
 *      computeSkyTimes），也是本地计算。
 *   所以断网之后这一页照样能用，只是会退回上次记住的经纬度。
 *
 * 降级分三层，一层比一层狠：
 *   ① `/api/sky` 拿不到     → 用 localStorage 里上次记住的经纬度 / 上海兜底
 *   ② 连经纬度都没有         → 仍然画图，但用兜底坐标（不会白屏）
 *   ③ 算的时候抛异常         → scene 留在 null，SkyChart 画它自己那张静态底图
 */

/**
 * 星图重算的时间粒度：15 分钟一格。
 *
 * 星空每 15 分钟才转 3.75°，在这个尺寸的图上肉眼看不出来；
 * 但格子太粗会显得"这图是死的"（停留半小时都不变），
 * 太细则白烧 CPU。15 分钟是这两者之间的一个舒服点。
 */
const SCENE_BUCKET_MS = 15 * 60 * 1000

/** 时钟显示精度：分钟。30 秒刷一次就够了 */
const CLOCK_MS = 30_000

/**
 * 简化模式（手机）画到几等星为止。
 *
 * 3.1 等：全天大约 170 颗，390px 宽的圆盘上密而不糊。
 * 桌面端交给 scene.ts 的 4.6 等（约 700 颗），把这个房间
 * "看得见很多星星"的设定撑起来。
 */
const SIMPLIFIED_MAG_LIMIT = 3.1

/** 拿不到经纬度时的最后一道兜底（和 env.server.ts 的默认值一致：上海） */
const FALLBACK_LOCATION = { latitude: 31.2304, longitude: 121.4737, city: '上海' }

/** /api/sky 的返回 */
interface SkyParams {
  enabled: boolean
  serverNow: string
  latitude: number
  longitude: number
  city: string
}

export interface SkyClientProps {
  /** 服务端读到的开关（数据库值 > 环境变量 > true） */
  enabled: boolean
}

export function SkyClient({ enabled }: SkyClientProps) {
  const { settings } = useRoom()

  const [params, setParams] = React.useState<SkyParams | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [now, setNow] = React.useState<Date | null>(null)
  const [loading, setLoading] = React.useState(false)

  /**
   * 简化模式（手机）。
   *
   * 服务端不知道屏幕多宽（而且这一页是静态生成的），所以只能挂载之后测。
   * 但**只有"画多少颗星"依赖它** —— 行星、星座名、方位刻度全是 CSS 断点，
   * 首帧就是对的。所以这里即使晚一帧也不会有"先桌面版再跳手机版"的观感，
   * 只是第一帧多算了 500 颗星而已。
   *
   * 用 matchMedia 而不是监听 resize：前者只在跨过断点时才触发，
   * 手机旋转屏幕、桌面拖窗口都不会引起无谓的重算。
   */
  const [simplified, setSimplified] = React.useState(false)

  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return

    const query = window.matchMedia('(max-width: 640px)')
    const sync = () => setSimplified(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  /**
   * 开关最终取谁？—— **服务端说了算，两边都得是"开"才开**。
   *
   * 两个来源：
   *   · `enabled`：服务端读出来的（数据库 celestial_enabled → 缺行时用
   *     环境变量 CELESTIAL_ENABLED 兜底）。这是**唯一**能反映环境变量的地方。
   *   · `settings.celestialEnabled`：房间设置里的值，来源是客户端读的
   *     site_settings。
   *
   * ⚠️ 这里踩过一个坑，写下来免得改回去：
   *   最初写的是 `settings.celestialEnabled ?? enabled ?? true`，
   *   本意是"后台一关就能立刻生效"。但 `settings.celestialEnabled` 在
   *   **本地演示模式（没配 Supabase）时是默认值 true** —— 于是它把
   *   服务端的 false 直接盖掉了：`CELESTIAL_ENABLED=false` 时
   *   /api/sky 老老实实回 enabled:false，页面却照样把整张实时星图画出来。
   *
   *   改成"与"（&&）之后两边都不会漏：
   *     · 环境变量关 → 服务端 false → 关（不管房间设置是什么）
   *     · 后台关     → 服务端 false（它读的就是同一行）→ 关
   *     · 都不关     → 开
   *   而"后台刚关掉、这一页已经开着"的情况，靠 room-provider 里的实时
   *   设置变化就能立刻反映，不需要牺牲上面的正确性。
   */
  const celestialOn = enabled && settings.celestialEnabled

  /* ------------------------------------------------------------------
     1. 取参数（经纬度 + 服务端时间）
     ------------------------------------------------------------------ */
  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sky', { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = (await response.json()) as SkyParams
      if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) {
        throw new Error('接口给的经纬度不对')
      }

      setParams(data)
      setNote(null)
      rememberCelestialView(data)
    } catch (error) {
      console.warn('[sky] 取星空参数失败，用上次记住的：', error)

      // ① 退到上次记住的
      const remembered = readCelestialView()
      if (remembered) {
        setParams({
          enabled: true,
          serverNow: new Date().toISOString(),
          latitude: remembered.latitude,
          longitude: remembered.longitude,
          city: remembered.city,
        })
        setNote('连不上服务器，用的是上次记住的坐标。')
        return
      }

      // ② 再退到兜底坐标。这一层已经保证不会白屏了
      setParams({
        enabled: true,
        serverNow: new Date().toISOString(),
        ...FALLBACK_LOCATION,
      })
      setNote('连不上服务器，用的是房间自己的默认坐标。')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // 关掉的时候没必要发请求
    if (!celestialOn) return
    void load()
  }, [celestialOn, load])

  /* ------------------------------------------------------------------
     2. 时钟：本地每 30 秒走一次
     ------------------------------------------------------------------ */
  React.useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), CLOCK_MS)
    return () => window.clearInterval(id)
  }, [])

  /* ------------------------------------------------------------------
     3. 天象：本地算，每 4 分钟重算一次
     ------------------------------------------------------------------ */
  /**
   * 服务端时间与本地时间的差。
   *
   * 为什么不用 `new Date()`：访客的电脑时钟可能是错的（差几个小时很常见），
   * 而星图对时间极其敏感 —— 差一小时星空就转 15°，整张图会明显不对。
   * 服务端给的 serverNow 是可靠的，所以用它定一个偏移量，
   * 之后本地时钟往前走，但基准是服务端的。
   */
  const clockOffsetMs = React.useMemo(() => {
    if (!params) return 0
    const server = Date.parse(params.serverNow)
    return Number.isNaN(server) ? 0 : server - Date.now()
  }, [params])

  /** 触发重算的"刻度"：每 REFRESH_MS 变一次 */
  /**
   * 星空多久重算一次。
   *
   * 思路：把"服务端校准过的现在"按 15 分钟一个格子切开，
   * 用格子编号当 useMemo 的依赖。格子一变就重算，格子没变就什么都不做。
   *
   * 为什么不直接依赖 `now`：时钟每 30 秒走一次，而星空其实每 15 分钟
   * 才值得重算一遍（15 分钟只转 3.75°，这个尺寸的图上看不出来）。
   * 直接依赖 now 的话就是每 30 秒白算一次上千次三角函数。
   *
   * 为什么不写成一个"每次渲染都重新取整"的常量：
   * 那样它每 30 秒就变一次，等于没有分桶。必须记在 state 里，
   * 只在真的跨过格子边界时才更新 —— 而且这样 useMemo 的依赖也是诚实的
   * （不再是"塞一个函数体里根本没用到的计数器"，那种写法 eslint 会正确地警告）。
   */
  const [sceneBucket, setSceneBucket] = React.useState(0)

  React.useEffect(() => {
    if (!params || !now) return
    const bucket = Math.floor((now.getTime() + clockOffsetMs) / SCENE_BUCKET_MS)
    // 同一个格子里反复 setState 会被 React 顺手挡掉，不会多渲染
    setSceneBucket((previous) => (previous === bucket ? previous : bucket))
  }, [params, now, clockOffsetMs])

  const scene: SkyScene | null = React.useMemo(() => {
    if (!params || !celestialOn || !now) return null

    try {
      return buildSkyScene({
        latitude: params.latitude,
        longitude: params.longitude,
        // 用"服务端校准过的现在"，再按格子对齐，保证同一个格子里结果完全一样
        date: new Date(sceneBucket * SCENE_BUCKET_MS),
        // 手机上只算亮星：省的是实打实的计算量（见 scene.ts 的说明）
        maxMagnitude: simplified ? SIMPLIFIED_MAG_LIMIT : 4.6,
      })
    } catch (error) {
      // ③ 最狠的一层降级：算不出来就交给 SkyChart 画它自己那张静态底图
      console.warn('[sky] 星图计算出错，退回静态星图：', error)
      return null
    }
  }, [params, celestialOn, now, sceneBucket, simplified])

  /**
   * 日出日落 / 晨昏蒙影。
   *
   * 直接用 lib/external/sky.ts 里那个 computeSkyTimes ——
   * 它已经在跑 suncalc 了，没有理由在这里再实现一遍。
   * 失败就返回 null，界面上显示「—」，不影响星图本身。
   */
  const skyTimes: SkyTimes | null = React.useMemo(() => {
    if (!scene) return null
    try {
      return computeSkyTimes(scene.date, scene.latitude, scene.longitude)
    } catch (error) {
      console.warn('[sky] 算日出日落失败：', error)
      return null
    }
  }, [scene])

  /* ------------------------------------------------------------------
     4. 渲染
     ------------------------------------------------------------------ */

  const moonShape: MoonShape | null = scene
    ? {
        illumination: scene.moon.illumination,
        phaseAngle: scene.moon.phaseAngle,
        // 相位角 < 180° = 往满月走 = 亮面在右（北半球的看法）
        waxing: scene.moon.phaseAngle < 180,
      }
    : null

  /**
   * 现在落在一天里的哪一段。
   *
   * 这里**必须**把时钟挪到观测地当地再取小时 —— 服务器跑在 UTC，
   * 用 `new Date().getHours()` 的话「深夜」会被判在 UTC 0–5 点
   * （换成上海时间就是早上 8 点到下午 1 点）。这个坑 sky.ts 里踩过一次，
   * 所以那里专门把 estimateUtcOffsetSeconds 暴露出来了，这里照用。
   */
  const phase: SkyPhase | null = React.useMemo(() => {
    if (!scene || !skyTimes) return null
    try {
      return skyPhaseAt(scene.date, skyTimes, estimateUtcOffsetSeconds(scene.longitude))
    } catch (error) {
      console.warn('[sky] 算时段失败：', error)
      return null
    }
  }, [scene, skyTimes])

  /** 后台关掉了：给一张静态星图 + 一句说明，不要白屏也不要报错 */
  if (!celestialOn) {
    return (
      <div className="space-y-4">
        <SkyChart scene={null} />
        <p className="flex items-center gap-2 text-xs leading-relaxed text-dust">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          星空图被房东关掉了，所以这里只是一张静态的星空。
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      {/* ================= 左：星图 ================= */}
      <div className="min-w-0 space-y-3">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-night/60 shadow-inset">
          <SkyChart scene={scene} />

          {/* 图上右上角那行小字：这一帧是什么时候算的 */}
          <div className="pointer-events-none absolute right-3 top-3 text-right">
            <p className="font-display text-[10px] uppercase tracking-[0.18em] text-dust/90">
              {scene ? '天顶视图' : '静态星图'}
            </p>
            <p className="mt-0.5 font-display text-[11px] tabular-nums text-paper/70">
              {now ? formatClock(now) : '--:--'}
            </p>
          </div>

          {/* 白天：太阳还没落，星星本来就看不清。说一句，别让人以为是画错了 */}
          {scene && scene.sunAltitude > -6 && (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl border border-white/[0.08] bg-night/85 px-3 py-2 backdrop-blur-sm">
              <p className="text-[11px] leading-relaxed text-dust">
                <Sparkles className="mr-1 inline h-3 w-3 text-lamp" aria-hidden />
                太阳现在在地平线上
                {scene.sunAltitude.toFixed(0)}°，天还没黑透。
                等入夜之后再来看，星图会亮起来。
              </p>
            </div>
          )}

          {/* 移动端：把"行星整块藏起来"这件事说清楚。
              桌面端不需要这句 —— 桌面上行星栏就在右边，看得见。 */}
          <p className="pointer-events-none absolute bottom-3 left-3 font-display text-[10px] text-dust/70 lg:hidden">
            行星与星座名在宽屏上显示
          </p>
        </div>

        {/* ---- 图下面那行观测信息 ---- */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-dust">
          <span className="flex items-center gap-1.5">
            <Compass className="h-3 w-3 shrink-0" aria-hidden />
            {VIEW_HINT}
          </span>
          <span className="tabular-nums">
            {params ? `${formatLatLon(params.latitude, params.longitude)}` : '—'}
            {params?.city ? ` · ${params.city}` : ''}
          </span>
          <span className="flex items-center gap-1.5">
            {loading ? (
              <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <span className="h-1 w-1 rounded-full bg-dust/70" aria-hidden />
            )}
            {note ?? (scene ? '星图是本地算的，一个外部请求都没发' : '暂时只能画静态星图')}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px]"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            重算
          </Button>
        </div>
      </div>

      {/* ================= 右：这一晚的细节 ================= */}
      <aside className="space-y-3">
        {/* ---- 月相 ---- */}
        <section className="rounded-xl border border-white/[0.07] bg-room/55 p-4 shadow-inset">
          <p className="flex items-center gap-1.5 font-display text-[11px] uppercase tracking-[0.18em] text-dust">
            <Moon className="h-3 w-3" aria-hidden />
            月亮
          </p>

          {scene && moonShape ? (
            <div className="mt-3 flex items-center gap-4">
              <MoonPhaseIcon shape={moonShape} size={64} />
              <div className="min-w-0">
                <p className="font-display text-xl text-paper">
                  {moonPhaseName(scene.moon.phaseAngle)}
                </p>
                <p className="mt-0.5 text-[11px] tabular-nums text-dust">
                  被照亮 {Math.round(scene.moon.illumination * 100)}%
                </p>
                <p className="mt-0.5 text-[11px] tabular-nums text-dust">
                  {scene.moon.altitude > 0
                    ? `现在在 ${formatDirection(scene.moon.azimuth)}方，仰角 ${scene.moon.altitude.toFixed(0)}°`
                    : '现在在地平线下面'}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-dust">
              {now ? '算不出月亮的准确位置。' : '正在算…'}
            </p>
          )}

          {/* 本地算的月出月落：和 /api/weather 用的 suncalc 是同一套 */}
          <MoonRiseSet date={scene?.date ?? null} latitude={params?.latitude ?? null} longitude={params?.longitude ?? null} />
        </section>

        {/* ---- 行星 ----
            原来这里是 `!simplified && (...)`，也就是手机上整块不渲染。
            但需求里同时写了「移动端简化：只显示亮星、月亮、星座连线」和
            「显示星座、亮星、月亮、行星位置」——
            后一句是这一页的**内容要求**，前一句说的是**图上画多少**。
            手机上不画行星是对的（那个圆盘本来就小），但"今晚哪几颗能看到"
            是这一页最有用的信息，藏掉不合适。
            所以现在手机上不画它们，但用一行横向小结列出来。 */}
        <section className="rounded-xl border border-white/[0.07] bg-room/55 p-4 shadow-inset">
          <p className="flex items-center gap-1.5 font-display text-[11px] uppercase tracking-[0.18em] text-dust">
            <Sparkles className="h-3 w-3" aria-hidden />
            行星
          </p>

          {scene ? (
            <>
              {/* 手机：横向紧凑小结。只给"看不看得见"，不挤方位和星等 */}
              <ul className="mt-3 flex flex-wrap gap-1.5 lg:hidden">
                {scene.planets.map((planet) => (
                  <li
                    key={planet.key}
                    className="flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1"
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: planet.color }}
                      aria-hidden
                    />
                    <span className="font-display text-[11px] text-paper/85">{planet.name}</span>
                    <span className="text-[10px] text-dust">
                      {planet.visible ? `${planet.altitude.toFixed(0)}°` : '看不到'}
                    </span>
                  </li>
                ))}
              </ul>

              {/* 桌面：完整的方位 + 星等 */}
              <ul className="mt-3 hidden space-y-2 lg:block">
                {scene.planets.map((planet) => (
                  <li key={planet.key} className="flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: planet.color }}
                        aria-hidden
                      />
                      <span className="font-display text-sm text-paper/90">{planet.name}</span>
                    </span>
                    <span className="text-[11px] tabular-nums text-dust">
                      {planet.visible
                        ? `${formatDirection(planet.azimuth)} ${planet.altitude.toFixed(0)}° · ${planet.magnitude.toFixed(1)} 等`
                        : planet.altitude <= 3
                          ? '在地平线下'
                          : '离太阳太近'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-[11px] text-dust">算不出行星的位置。</p>
          )}

          <p className="mt-3 border-t border-white/[0.06] pt-2.5 text-[10px] leading-relaxed text-dust/80">
            「离太阳太近」是指在地平线以上、但淹没在暮光里，肉眼找不到。
            <span className="lg:hidden">手机这里只给高度角，方位和星等在宽屏上显示。</span>
          </p>
        </section>

        {/* ---- 日出日落 / 时辰 ---- */}
        <section className="rounded-xl border border-white/[0.07] bg-room/55 p-4 shadow-inset">
          <p className="flex items-center gap-1.5 font-display text-[11px] uppercase tracking-[0.18em] text-dust">
            <Sun className="h-3 w-3" aria-hidden />
            这一晚
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat
              icon={<Sunset className="h-3.5 w-3.5 text-neon" aria-hidden />}
              label="日落"
              value={formatIso(skyTimes?.sunset ?? null)}
            />
            <Stat
              icon={<Sunrise className="h-3.5 w-3.5 text-lamp" aria-hidden />}
              label="日出"
              value={formatIso(skyTimes?.sunrise ?? null)}
            />
            <Stat
              icon={<Moon className="h-3.5 w-3.5 text-rain" aria-hidden />}
              label="天黑"
              value={formatIso(skyTimes?.dusk ?? null)}
            />
            <Stat
              icon={<Sun className="h-3.5 w-3.5 text-dust" aria-hidden />}
              label="天亮前"
              value={formatIso(skyTimes?.dawn ?? null)}
            />
          </div>

          {phase && (
            <p className="mt-3 border-t border-white/[0.06] pt-2.5 text-[11px] leading-relaxed text-dust">
              现在是
              <span className="text-paper/85"> {SKY_PHASE_META[phase].label} </span>
              —— {SKY_PHASE_META[phase].hint}。
            </p>
          )}

          {!simplified && scene && (
            <p className="mt-2 text-[10px] leading-relaxed text-dust/75">
              这一帧算出来天上有 {countAbove(scene, 3)} 颗 3 等以上的星，
              其中 {countAbove(scene, 1.5)} 颗亮到能给光晕。
            </p>
          )}
        </section>
      </aside>
    </div>
  )
}

/* ==========================================================================
   小零件
   ========================================================================== */

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] text-dust">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 font-display text-[13px] tabular-nums text-paper/85">{value}</p>
    </div>
  )
}

/**
 * 月出 / 月落。
 *
 * 单独一个小节，因为它依赖 suncalc 的 getMoonTimes（日出日落那套不提供）。
 * 拿不到就整行不显示 —— 不要在界面上留一堆「—」。
 */
function MoonRiseSet({
  date,
  latitude,
  longitude,
}: {
  date: Date | null
  latitude: number | null
  longitude: number | null
}) {
  const [times, setTimes] = React.useState<{ rise: string | null; set: string | null } | null>(
    null,
  )

  React.useEffect(() => {
    if (!date || latitude === null || longitude === null) {
      setTimes(null)
      return
    }

    try {
      // 动态 import：suncalc 只在客户端这一段用得上，
      // 静态 import 的话服务端渲染时也会把它拉进来（没必要）
      let cancelled = false
      void import('suncalc')
        .then((SunCalc) => {
          if (cancelled) return
          const result = SunCalc.getMoonTimes(date, latitude, longitude)
          setTimes({
            rise: result.rise instanceof Date ? result.rise.toISOString() : null,
            set: result.set instanceof Date ? result.set.toISOString() : null,
          })
        })
        .catch(() => {
          if (!cancelled) setTimes(null)
        })

      return () => {
        cancelled = true
      }
    } catch {
      setTimes(null)
      return undefined
    }
  }, [date, latitude, longitude])

  if (!times || (!times.rise && !times.set)) return null

  return (
    <p className="mt-3 border-t border-white/[0.06] pt-2.5 text-[10px] tabular-nums text-dust/80">
      月出 {times.rise ? formatIso(times.rise) : '—'} · 月落 {times.set ? formatIso(times.set) : '—'}
    </p>
  )
}

/* ==========================================================================
   格式化
   ========================================================================== */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatClock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** ISO → 本地 HH:mm；拿不到就是「—」 */
function formatIso(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return formatClock(date)
}

function formatLatLon(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(2)}°${latitude >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(longitude).toFixed(2)}°${longitude >= 0 ? 'E' : 'W'}`
  return `${lat} ${lon}`
}

/** 方位角 → 八方位中文 */
function formatDirection(azimuth: number): string {
  const names = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'] as const
  const index = Math.round((((azimuth % 360) + 360) % 360) / 45) % 8
  return names[index] ?? '北'
}

/**
 * 这一张图怎么读。
 *
 * 天顶视图的圆心是头顶 —— 所以「你在看哪边」这种问法在这里**没有意义**
 * （头顶没有方向）。但访客看到一张图总会想找个参照，所以这句话说的是
 * 地图怎么读（上方是北、圆心是头顶），而不是"你正朝北看"。
 * 方位刻度本身画在 sky-chart.tsx 的地平圈上。
 */
const VIEW_HINT = '上方是北 · 圆心是头顶'

/** 数一数亮于某个星等界限的星有多少（只算地平线以上的） */
function countAbove(scene: SkyScene, magnitude: number): number {
  return scene.stars.filter((star) => star.magnitude <= magnitude && star.altitude > 5).length
}
