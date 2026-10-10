/**
 * 月相的几何 —— **纯函数**，不含任何 DOM。
 *
 * 为什么从 moon-phase.tsx 里拆出来：
 *   这段是月亮为什么长这样的全部数学（晨昏线是一个椭圆、它的半短轴 = R·cos 相位角）。
 *   把它和 React 组件混在一起有两个坏处：
 *     1. 想验证它就得先能渲染 JSX —— 而验证这段恰恰最重要，
 *        因为路径参数写错了**不会报错**，只会画出一个"看着像月亮"但相位不对的图形；
 *     2. src/lib/ 全是不依赖运行时的纯逻辑（sky-math.ts 也是这样）。
 *   拆开之后 `scripts/verify-moon-phase.mjs` 可以直接 import 它做蒙特卡洛验证。
 *
 * 画法：
 *   1. 先画整圆当"月亮这个球"（暗面）；
 *   2. 再用一段路径切出被照亮的部分：一个半圆 + 一个椭圆弧。
 *
 * 关键是那个椭圆：它的**半短轴**是 R·cos(相位角) ——
 *   · 满月（相位角 180°）→ cos = -1 → 椭圆比圆还"宽"，亮面盖满整个球；
 *   · 上下弦（相位角 90°）→ cos = 0 → 椭圆退化成一条直线，正好是"一半"；
 *   · 新月（相位角 0°）→ cos = 1 → 椭圆和圆一样大，亮面被自己抵消掉。
 * 这正是"晨昏线投影成椭圆"这条几何事实的解析表达，
 * 所以不用去描一套查表用的月相图。
 *
 * 朝向：`waxing`（往满月走）由相位角 < 180° 决定，亮面在**右**边 ——
 * 这是北半球看月亮的样子。极少数情况（南半球访客）会看错，
 * 但这个站本来就是个氛围功能，不值得为此加一个半球判断。
 */

export interface MoonShape {
  /** 被照亮的比例，0–1 */
  illumination: number
  /**
   * 相位角，**地球居中**：0° = 新月，90°/270° = 上下弦，180° = 满月。
   *
   * ⚠️ 不要和「月—日—地」那个角（Meeus 的 elongation）混了，两者差 180°。
   * 本项目统一用地球居中这一套（suncalc 的 fraction 和
   * lib/external/sky.ts 的 MoonInfo.phase 都是这个约定）。
   */
  phaseAngle: number
  /** 是否在往满月走（决定亮面在左还是在右） */
  waxing: boolean
}

/**
 * 生成月相的 SVG 路径。
 *
 * @param cx 圆心 x
 * @param cy 圆心 y
 * @param radius 月亮的视半径
 */
export function moonPhasePath(cx: number, cy: number, radius: number, shape: MoonShape): string {
  const { phaseAngle, waxing } = shape

  const top = `${cx},${cy - radius}`
  const bottom = `${cx},${cy + radius}`

  /**
   * 第一段：亮面那一侧的**外缘半圆**。
   * sweep=1 从顶点画到底点落在右半圆，sweep=0 落在左半圆 ——
   * 北半球看月亮"右边先亮"，所以盈月取右、亏月取左。
   */
  const outerSweep = waxing ? 1 : 0

  /**
   * 第二段：把晨昏线描回来，闭合出亮面。
   *
   * 椭圆的半短轴 = R·cos(相位角)：
   *   · 相位角 < 90°（娥眉月）→ 正值，椭圆很扁 → 亮面是一条细牙；
   *   · 相位角 = 90°（上下弦）→ 恰好为 0，椭圆退化成直径 → 正好半个圆；
   *   · 相位角 > 90°（凸月）→ 负值 → 亮面涨过一半；
   *   · 相位角 = 180°（满月）→ −R，椭圆和圆一样大 → 整个圆都亮。
   *
   * ⚠️ 内缘的 sweep **只看半短轴的正负**，和 waxing 无关 ——
   * 因为椭圆永远以 x 轴为对称轴，"从底点回到顶点"该走右侧还是左侧
   * 完全由它鼓向哪边决定。第一版把 waxing 也揉进了这个判断里，
   * 结果是满月被画成了"亮面为零"的退化路径（两段圆弧走的是同一条半圆，
   * 围出的面积是 0），而这个 bug 在上下弦上完全看不出来。
   */
  const terminatorRadiusX = radius * Math.cos((phaseAngle * Math.PI) / 180)
  const innerSweep = terminatorRadiusX <= 0 ? 1 : 0

  return [
    `M ${top}`,
    `A ${radius} ${radius} 0 0 ${outerSweep} ${bottom}`,
    `A ${Math.abs(terminatorRadiusX)} ${radius} 0 0 ${innerSweep} ${top}`,
    'Z',
  ].join(' ')
}

/**
 * 相位角 → 中文月相名。
 *
 * 分档用的是照亮比例 (1 − cos 相位角) / 2，和
 * lib/external/sky.ts 的 computeMoon 用的是同一个公式，所以两处不会打架。
 */
export function moonPhaseName(phaseAngle: number): string {
  const illumination = (1 - Math.cos((phaseAngle * Math.PI) / 180)) / 2
  const waxing = phaseAngle < 180

  if (illumination < 0.03) return '新月'
  if (illumination < 0.45) return waxing ? '娥眉月' : '残月'
  if (illumination < 0.56) return waxing ? '上弦月' : '下弦月'
  if (illumination < 0.97) return waxing ? '盈凸月' : '亏凸月'
  return '满月'
}
