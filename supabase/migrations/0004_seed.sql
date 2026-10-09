-- ============================================================================
-- Lo-fi 房间电台 · 0004 Seed（初始数据：小游戏 / 成就 / 站点设置）
-- ----------------------------------------------------------------------------
-- 可重复执行：已存在的行会被更新为基础值（不会覆盖你在后台改过的业务数据，
-- 因为这里用的是 on conflict do nothing；只有 site_settings 用 do nothing 保护你的修改）。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. 小游戏开关
-- ---------------------------------------------------------------------------
insert into public.games (slug, name, description, enabled, config, sort)
values
  ('2048',   '2048',   '把数字推到一起去。适合发呆的时候玩。', true, '{"size":4,"target":2048}'::jsonb, 10),
  ('snake',  '贪吃蛇', '房间里的蛇不吃苹果，吃台灯的光点。',     true, '{"speed":140,"wrap":false}'::jsonb, 20),
  ('memory', '翻牌记忆', '翻开两张一样的牌。像翻旧照片。',       true, '{"pairs":8}'::jsonb, 30)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. 成就
-- ---------------------------------------------------------------------------
insert into public.achievements (key, name, description, icon, secret, sort)
values
  ('lamp_keeper',      '晚安开灯人',       '第一次把台灯打开又关上。',                     'Lamp',        false, 10),
  ('drawer_heart',     '把心事放进抽屉',   '第一次往树洞里投递了一封信。',                 'MailOpen',    false, 20),
  ('vinyl_traveler',   '黑胶旅人',         '在唱片机前听满 10 首歌。',                     'Disc3',       false, 30),
  ('slack_master',     '摸鱼大师',         '在小游戏里拿到任意一个最高分。',               'Gamepad2',    false, 40),
  ('regular_guest',    '常客',             '累计第 3 天推开这扇门。',                      'DoorOpen',    false, 50),
  ('room_secret',      '房间的秘密',       '触发过一次稀有事件。',                         'Sparkles',    true,  60),
  ('cat_patience',     '猫的耐心是有限的', '点猫 100 次。',                                'Cat',         false, 70),
  ('midnight_owl',     '夜猫子',           '在 0:00–5:00 之间来过。',                      'MoonStar',    true,  80),
  ('alien_radio',      '外星电台',         '听到过那段 5 秒的外星广播。',                  'RadioTower',  true,  90),
  ('hidden_drawer',    '隐藏抽屉的钥匙',   '连续三天来看猫，猫给了你一把小钥匙。',         'KeyRound',    true,  100)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. 站点设置
-- ---------------------------------------------------------------------------
insert into public.site_settings (key, value) values
  ('room_name',        '"Lo-fi 房间电台"'::jsonb),
  ('host_name',        '"房东"'::jsonb),
  ('tagline',          '"推门进来就好，不用敲门。"'::jsonb),
  ('about',            '"这是一间只在深夜营业的小房间。有旧唱片机、一只不太理人的猫、一本写到一半的日记。你可以听歌、翻日记、往抽屉里塞一封信，或者干脆坐着听雨。"'::jsonb),
  ('weather',          '"雨"'::jsonb),
  ('weather_note',     '"窗外在下雨，雨声比音乐清楚。"'::jsonb),
  ('background_audio', 'null'::jsonb),
  ('announcement',     'null'::jsonb),
  ('social_links',     '[]'::jsonb),
  ('games_enabled',    'true'::jsonb),
  ('treehole_notice',  '"这里只有我，和一只不会说话的猫。请不要写真实姓名、电话、地址这些能定位到你本人的信息。"'::jsonb),
  ('treehole_banned_words',
   '["身份证","银行卡","手机号","微信号","QQ号","住址","家庭住址","裸照","约炮","赌博","毒品","代开发票","加我微信","兼职刷单"]'::jsonb),
  ('music_copyright_notice',
   '"只上传自己创作、免版权或已获得授权的音乐。商业歌曲请不要公开传播。"'::jsonb),
  ('music_night_tag',  '"深夜"'::jsonb),
  ('shelf_note',       '"唱片架上的每一张都是自己放上去的。针落下的声音比音乐还轻。"'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3.1 清理「心理援助热线」
-- ---------------------------------------------------------------------------
-- 这个功能已经整个移除了（前台树洞页的区块、页脚那行、关于页、后台设置都删了）。
-- 如果你之前跑过旧版的 0004，库里会留着 treehole_hotlines 这条设置，这里清掉。
-- 幂等：新库本来就没有这条。
delete from public.site_settings where key = 'treehole_hotlines';

-- 说明文案原来有一句「如果撑不住了，请打下面的热线」，热线没了要一起改。
update public.site_settings
   set value = '"这里只有我，和一只不会说话的猫。请不要写真实姓名、电话、地址这些能定位到你本人的信息。"'::jsonb,
       updated_at = now()
 where key = 'treehole_notice'
   and value::text like '%热线%';

-- ---------------------------------------------------------------------------
-- 4. 站长提权（重要，只做一次）
-- ----------------------------------------------------------------------------
-- 步骤：
--   1) 打开网站 /admin/login，用你的邮箱注册 / 登录一次（Supabase Auth 会创建用户）
--   2) 回到 SQL Editor，把下面的邮箱换成你自己的，执行一次
--
-- update public.profiles set role = 'admin' where email = 'your@email.com';
--
-- 3) 校验：select id, email, role from public.profiles;
--
-- 说明：应用层同时支持环境变量 ADMIN_EMAIL 作为兜底判断，
--       所以就算忘了提权，只要 ADMIN_EMAIL 填对了也进得去后台。
--       但还是建议把数据库里的 role 一起改成 admin，这样 RLS 才真正放行。
-- ---------------------------------------------------------------------------
