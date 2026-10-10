-- ============================================================================
-- Lo-fi 房间电台 · 0015 频道地址带上备用线路
-- ----------------------------------------------------------------------------
-- 0014 把备用线路写成了注释，要人工去改。这一版把它们**写进同一行**：
--
--     名称 | 主地址 备用地址 | 标签
--
-- 解析时按顺序试，主地址解析不出来就自动往下走（见 resolveStream）。
-- 网络电台换域名、挂线路是常态，这样挂一条不至于整个台点不动。
--
-- ⚠️ 这一个迁移是 `do update` 而不是 `do nothing` —— 它要**替换**整份列表。
--    如果你已经在后台改过频道列表，跑之前先把内容复制出来备份。
--
-- 可重复执行。
-- ============================================================================

insert into public.site_settings (key, value)
values
  (
    'radio_channels',
    to_jsonb(
      $channels$
# ── 中文台（全部实测可用）────────────────────────────────
# 一行一个：名称 | 播放地址 | 标签（标签用逗号隔开，搜索会用到）
# 以 # 开头的行会被忽略。删一行就少一个台。
#
# 地址栏里可以写**多条**（空格或分号隔开）：主地址挂了会自动试下一条。
# 只写**入口**地址 —— HLS 的二级地址带一次性 token，写死了过一会儿就失效。
华语金曲500首 | https://ls.qingting.fm/live/3412131.m3u8?bitrate=64 https://lhttp.qtfm.cn/live/5022308/64k.mp3 | 华语,怀旧,金曲
清晨音乐台 | https://lhttp.qingting.fm/live/4915/64k.mp3 | 轻音乐,清晨,器乐
CRI 怀旧金曲频道 | https://lhttp.qingting.fm/live/5022038/64k.mp3 | 怀旧,老歌,国际台
北京音乐广播 | https://lhttp.qtfm.cn/live/332/64k.mp3 | 音乐,北京,流行
CNR-4 经典音乐广播 | https://ngcdn001.cnr.cn/live/yyzs/index.m3u8 | 古典,国家级,音乐
上海经典金曲广播 | https://lhttp-hw.qtfm.cn/live/273/64k.mp3 | 金曲,上海,怀旧
山东音乐广播 | https://audiolive302.iqilu.com/sdradioYinyue/sdradio07/playlist.m3u8 https://lhttp.qingting.fm/live/1665/64k.mp3 | 流行,山东,音乐广播
陕西音乐广播 | https://lhttp.qtfm.cn/live/4873/64k.mp3 | 音乐,陕西,西安
西安音乐广播 | https://stream3.xiancity.cn/4/sd/live.m3u8 | 音乐,西安,本地
郑州电台怀旧好声音 | https://lhttp.qingting.fm/live/1223/64k.mp3 | 怀旧,老歌,郑州
咸阳综合广播 | https://lhttp.qingting.fm/live/5022397/64k.mp3 | 陕西,咸阳,综合

# 备注：lhttp.qtfm.cn 和 lhttp.qingting.fm 实测可以互换，
# 哪个域名挂了就把那一行的域名换掉即可。
$channels$::text
    )
  )
on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

-- 回滚（手动执行）：把 0014 再跑一遍即可恢复成没有备用线路的版本。
