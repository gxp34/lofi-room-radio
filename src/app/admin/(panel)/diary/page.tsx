import { redirect } from 'next/navigation'

/**
 * 旧的后台日记页已经并进 /admin/journal 了。
 * 留一个跳转，免得书签失效。
 */
export default function AdminDiaryRedirect() {
  redirect('/admin/journal')
}
