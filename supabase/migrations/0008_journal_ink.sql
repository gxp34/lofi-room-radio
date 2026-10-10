-- ============================================================================
-- Lo-fi 房间电台 · 0008 手帐的墨水颜色
-- ----------------------------------------------------------------------------
-- 给每一页手帐一个正文颜色，就像真的本子里换了一支笔。
--
-- 为什么存在这一列而不是写进正文：颜色是**这一页的属性**，不是内容的一部分。
-- 塞进正文就得自己发明一套记号（比如 [color:#xxx]），还得在渲染时解析，
-- 排版和内容会混在一起。存成列之后，前端只是给正文容器加一个 style。
--
-- 为什么带 check 约束：这个值最终会进到 style={{ color: ... }} 里。
-- 前端当然也会校验，但**数据库是最后一道闸** —— 真被人塞进
-- "red; background:url(...)" 这种东西，有正则挡着就进不来。
--
-- 可重复执行。
-- ============================================================================

alter table public.diaries
  add column if not exists text_color text;

comment on column public.diaries.text_color is
  '正文墨水颜色（#rrggbb）。null = 用默认的墨黑。';

-- 只允许 6 位十六进制色值。约束先删后加，方便以后调整规则时重跑。
alter table public.diaries
  drop constraint if exists diaries_text_color_check;

alter table public.diaries
  add constraint diaries_text_color_check
  check (text_color is null or text_color ~ '^#[0-9a-fA-F]{6}$');
