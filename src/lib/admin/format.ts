/**
 * 后台的时间格式化。
 *
 * ⚠️ 为什么不能直接用 `date.getHours()`：
 * 服务端渲染时用的是**服务器时区**（Vercel 上是 UTC），
 * 客户端 hydration 时用的是**浏览器时区**（大概率是 UTC+8）。
 * 两边算出来的字符串不一样，React 就会报 hydration mismatch。
 *
 * 所以这里固定用 `Asia/Shanghai` 来格式化 —— 这个站是给中国时区的站长用的，
 * 固定时区既避免了不一致，也让「日记是什么时候写的」有个确定的答案。
 */

const FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** `2024-06-11 03:24`；时间不合法或为空时返回 `—` */
export function formatDateTimeCN(iso: string | null | undefined): string {
  if (!iso) return '—'

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'

  // Intl 输出形如 "2024/06/11 03:24"，换成更好读的连字符
  return FORMATTER.format(date).replace(/\//g, '-')
}

/** 只要日期：`2024-06-11` */
export function formatDateCN(iso: string | null | undefined): string {
  const full = formatDateTimeCN(iso)
  return full === '—' ? full : full.split(' ')[0] ?? full
}
