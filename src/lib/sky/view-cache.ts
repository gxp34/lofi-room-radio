/**
 * 星空页的本地缓存（记住上次拿到的经纬度）。
 *
 * 为什么值得单独一个文件：
 *   `/api/sky` 挂掉、或者访客在离线状态下点进这一页时，
 *   只要记住过坐标就还能算出一张**基本正确**的星图 ——
 *   经纬度是星图里唯一"本地推不出来"的东西（后台填的），
 *   时间和恒星位置都是本地能算的。所以它值得存一份。
 *
 * 为什么不用 room-store：
 *   房间 store 是给"房间状态"用的（灯、猫、雨），
 *   往里塞一个只有 /sky 关心的坐标会污染它。
 *   而且这份缓存是**一次写入、很久不用**的，放进 store 反而多触发无谓的重渲染。
 *
 * 所有读写都包在 try/catch 里：localStorage 在隐私模式下会直接抛异常，
 * 而"缓存写不进去"绝不该变成"星图打不开"。
 */

/** 只存必要的东西，不存整个接口响应（那个里有 serverNow，存下来没意义） */
export interface CelestialView {
  latitude: number
  longitude: number
  city: string
}

/** localStorage 键名。带版本号：以后结构变了就换一个，不用写迁移 */
export const CELESTIAL_VIEW_KEY = 'lofi:celestial-view:v1'

export function readCelestialView(): CelestialView | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(CELESTIAL_VIEW_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null

    const value = parsed as Record<string, unknown>
    const latitude = value.latitude
    const longitude = value.longitude
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      // 顺手挡一下明显不对的值：存进去一个 999 会让 suncalc 算出一堆 NaN
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return null
    }

    return {
      latitude,
      longitude,
      city: typeof value.city === 'string' ? value.city : '',
    }
  } catch {
    return null
  }
}

export function rememberCelestialView(view: CelestialView): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(CELESTIAL_VIEW_KEY, JSON.stringify(view))
  } catch {
    // 隐私模式 / 配额满了：记不住就算了，下次再试
  }
}
