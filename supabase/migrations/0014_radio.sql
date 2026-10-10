-- ============================================================================
-- Lo-fi 房间电台 · 0014 实时电台
-- ----------------------------------------------------------------------------
-- 三行设置：
--   radio_enabled          总开关（还有环境变量 RADIO_ENABLED 当总闸，两个都开才开）
--   radio_channels         自定义频道，**多行文本**，一行一个：名称 | 地址 | 标签
--   radio_default_channel  进页面时默认选中的台
--
-- 为什么自定义频道用多行文本而不是一张表：
--   这些地址是从外面抄来的，会失效、会换。要能一眼看懂、直接改一行。
--   做成带增删按钮的表单反而更慢，而且手机上没法编辑。
--   换台不用改代码、不用重新部署 —— 后台存一下就行。
--
-- ⚠️ 下面**每一条都实测过**（返回码 + content-type + 实际字节数），
--    没有验证通过的地址一律没写进来。
--    但网络电台的地址天生会变，失效了就在后台改，不用动代码。
--
-- 可重复执行：on conflict do nothing（你在后台改过的值不会被重跑覆盖）。
-- ============================================================================

insert into public.site_settings (key, value)
values
  ('radio_enabled', 'true'::jsonb),

  -- SomaFM 的 Groove Salad：这个站的调性最贴的一个台
  ('radio_default_channel', '"somafm:groovesalad"'::jsonb),

  (
    'radio_channels',
    to_jsonb(
      $channels$
# ── 中文台（全部实测可用）────────────────────────────────
# 一行一个：名称 | 播放地址 | 标签（标签用逗号隔开，搜索会用到）
# 以 # 开头的行会被忽略。删一行就少一个台。
#
# 规则：只写**入口**地址。HLS 的二级地址里带一次性 token，
# 写死切片地址过一会儿就失效 —— 播放器会自己跟随层级。
华语金曲500首 | https://ls.qingting.fm/live/3412131.m3u8?bitrate=64 | 华语,怀旧,金曲
清晨音乐台 | https://lhttp.qingting.fm/live/4915/64k.mp3 | 轻音乐,清晨,器乐
CRI 怀旧金曲频道 | https://lhttp.qingting.fm/live/5022038/64k.mp3 | 怀旧,老歌,国际台
北京音乐广播 | https://lhttp.qtfm.cn/live/332/64k.mp3 | 音乐,北京,流行
CNR-4 经典音乐广播 | https://ngcdn001.cnr.cn/live/yyzs/index.m3u8 | 古典,国家级,音乐
上海经典金曲广播 | https://lhttp-hw.qtfm.cn/live/273/64k.mp3 | 金曲,上海,怀旧
山东音乐广播 | https://audiolive302.iqilu.com/sdradioYinyue/sdradio07/playlist.m3u8 | 流行,山东,音乐广播
陕西音乐广播 | https://lhttp.qtfm.cn/live/4873/64k.mp3 | 音乐,陕西,西安
西安音乐广播 | https://stream3.xiancity.cn/4/sd/live.m3u8 | 音乐,西安,本地
郑州电台怀旧好声音 | https://lhttp.qingting.fm/live/1223/64k.mp3 | 怀旧,老歌,郑州
咸阳综合广播 | https://lhttp.qingting.fm/live/5022397/64k.mp3 | 陕西,咸阳,综合

# ── 备用线路（也都验证过）──────────────────────────────
# 上面有台放不出来时，把对应的这条改成正式行（去掉 #）。
# 顺带一提：lhttp.qtfm.cn 和 lhttp.qingting.fm 实测可以互换，一个挂了换另一个。
# 华语金曲500首（MP3 备用） | https://lhttp.qtfm.cn/live/5022308/64k.mp3 | 华语,备用
# 山东音乐广播（MP3 备用） | https://lhttp.qingting.fm/live/1665/64k.mp3 | 山东,备用
$channels$::text
    )
  )
on conflict (key) do nothing;
