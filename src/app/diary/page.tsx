import { redirect } from 'next/navigation'

/**
 * 旧的 /diary 已经并进图文手帐了。
 * 这里保留一个跳转，免得以前分享出去的链接变成 404。
 */
export default function DiaryRedirect() {
  redirect('/journal')
}
