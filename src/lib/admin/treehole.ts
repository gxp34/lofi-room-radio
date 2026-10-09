'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { ActionResult, TreeholeVisibility } from '@/types'

import { describeError, guardAdmin } from './guard'

/**
 * 树洞的审核操作。
 *
 * 审核这件事的原则：**通过要一个一个点，隐藏可以一键**。
 * 前者是「我要对它负责」，后者是「先挡一下，回头再看」，风险不对称。
 */

const replySchema = z
  .string()
  .min(1, '回复不能是空的')
  .max(1000, '回复最多 1000 字')

/** 通过审核（如果它的可见范围是 admin / private，顺手改成 public 才有意义） */
export async function approveMessage(
  id: string,
  alsoMakePublic = true,
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const patch: { is_approved: boolean; is_flagged: boolean; visibility?: TreeholeVisibility } = {
      is_approved: true,
      // 站长看过了，敏感词标记可以清掉
      is_flagged: false,
    }
    if (alsoMakePublic) patch.visibility = 'public'

    const { error } = await supabase.from('treehole_messages').update(patch).eq('id', id)
    if (error) throw error

    revalidatePath('/admin/treehole')
    revalidatePath('/treehole')
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '没通过。') }
  }
}

/** 取消通过（撤回到待审） */
export async function unapproveMessage(id: string): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase
      .from('treehole_messages')
      .update({ is_approved: false })
      .eq('id', id)

    if (error) throw error

    revalidatePath('/admin/treehole')
    revalidatePath('/treehole')
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '撤回失败。') }
  }
}

/** 在墙上隐藏 / 恢复显示 */
export async function setMessageHidden(
  id: string,
  hidden: boolean,
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase
      .from('treehole_messages')
      .update({ is_hidden: hidden, is_flagged: false })
      .eq('id', id)

    if (error) throw error

    revalidatePath('/admin/treehole')
    revalidatePath('/treehole')
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '没能改显示状态。') }
  }
}

/** 改可见范围（比如访客选了「只给房东看」，但内容适合贴到墙上） */
export async function setMessageVisibility(
  id: string,
  visibility: TreeholeVisibility,
): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase
      .from('treehole_messages')
      .update({ visibility })
      .eq('id', id)

    if (error) throw error

    revalidatePath('/admin/treehole')
    revalidatePath('/treehole')
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '可见范围没改成。') }
  }
}

/** 回音（站长的回复） */
export async function replyToMessage(
  messageId: string,
  content: string,
): Promise<ActionResult<{ id: string }>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const parsed = replySchema.safeParse(content)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '回复内容不对' }
  }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { data, error } = await supabase
      .from('treehole_replies')
      .insert({
        message_id: messageId,
        content: parsed.data,
        is_admin: true,
      })
      .select('id')
      .single()

    if (error) throw error

    revalidatePath('/admin/treehole')
    revalidatePath('/treehole')
    return { ok: true, data: { id: data.id } }
  } catch (error) {
    return { ok: false, error: describeError(error, '回音没发出去。') }
  }
}

export async function deleteReply(id: string): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    const { error } = await supabase.from('treehole_replies').delete().eq('id', id)
    if (error) throw error

    revalidatePath('/admin/treehole')
    revalidatePath('/treehole')
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '没能删掉这条回音。') }
  }
}

/** 彻底删除一封信（不可恢复） */
export async function deleteMessage(id: string): Promise<ActionResult<undefined>> {
  const guard = await guardAdmin()
  if (!guard.ok) return { ok: false, error: guard.error }

  const supabase = createSupabaseServerClient()
  if (!supabase) return { ok: false, error: '数据库没配置好' }

  try {
    // treehole_replies 是 on delete cascade，回音会跟着删掉
    const { error } = await supabase.from('treehole_messages').delete().eq('id', id)
    if (error) throw error

    revalidatePath('/admin/treehole')
    revalidatePath('/treehole')
    return { ok: true, data: undefined }
  } catch (error) {
    return { ok: false, error: describeError(error, '没能删掉这封信。') }
  }
}
