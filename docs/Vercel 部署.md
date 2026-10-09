# 部署到 Vercel

从零到线上，全程免费额度内。整个过程大约 20 分钟，其中一半时间在等 Supabase 建库。

## 顺序总览

就这五步，**顺序别换**——后面几步都依赖前面：

| # | 做什么 | 在哪一节 | 不做会怎样 |
| --- | --- | --- | --- |
| 1 | **跑 SQL**（六个文件） | [一](#一先在-supabase-建库) | 少跑 0006 → 手帐传照片必失败 |
| 2 | 拿到三个 API 值 | [一](#一先在-supabase-建库) | — |
| 3 | 推 GitHub + Vercel 导入 + **填环境变量** | [二](#二把代码推到-github) [三](#三在-vercel-导入项目) | 少一个 → 站点退回演示模式，什么都存不了 |
| 4 | **把自己设成 admin** | [四](#四部署后必做的两件事) | 能进后台但**什么都传不了** |
| 5 | **改成正式域名** | [四](#四部署后必做的两件事) | 登录会跳回 localhost |

> 第 4 步和第 5 步都要等**第一次部署成功**之后才能做
> （要先有网址才能注册、才能配域名）。

---

## 零、需要准备的东西

| 东西 | 说明 | 花钱吗 |
| --- | --- | --- |
| GitHub 账号 | 用来放代码，Vercel 从它拉 | 免费 |
| Supabase 账号 | 数据库 + 登录 + 文件存储 | 免费额度足够个人站 |
| Vercel 账号 | 托管 Next.js | 免费（Hobby） |
| 域名（可选） | 用 `xxx.vercel.app` 也能跑 | 域名要钱 |

---

## 一、先在 Supabase 建库

1. 打开 <https://supabase.com> → **New project**
   - Name：随便，比如 `lofi-room`
   - Database Password：**记下来**（后面一般用不到，但丢了要重置）
   - Region：选离你近的（国内一般选 `Southeast Asia (Singapore)`）
2. 等 2 分钟，项目建好
3. 左侧 **SQL Editor** → **New query**，把下面**六个**文件的内容**按顺序**整段粘贴执行。
   **六个都要跑** —— 少一个，对应功能就会在那一步报错：

```
supabase/migrations/0001_schema.sql        建表、索引、触发器、函数
supabase/migrations/0002_rls.sql           行级安全策略
supabase/migrations/0003_storage.sql       音乐 / 封面四个桶 + 存储策略
supabase/migrations/0004_seed.sql          小游戏 / 成就 / 站点设置初始数据
supabase/migrations/0005_admin_stats.sql   后台统计与导出函数
supabase/migrations/0006_journal.sql       图文手帐：照片表 + 两个照片桶 + 口令函数
```

六个脚本都是幂等的，执行错了重跑一次就行，不会删数据。

> ⚠️ **最容易漏的是 0006。**
> 漏了它，音乐上传照常能用（走的是 0003 建的桶），
> 但**图文手帐一传照片就会报错** —— `journal_photos` 表和
> `journal-photos` / `private-journal-photos` 两个桶都不存在。

4. 左侧 **Project Settings → API**，记下这三个值（等下要用）：

| 名字 | 长什么样 | 放哪儿 |
| --- | --- | --- |
| Project URL | `https://abcdefg.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` | 很长的 JWT，`eyJ...` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` | 另一段很长的 JWT | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ `service_role` 是**万能钥匙**，能绕过所有安全策略。
> 它只能出现在 Vercel 的环境变量里（不加 `NEXT_PUBLIC_` 前缀），
> 绝不能写进任何提交到 Git 的文件。

---

## 二、把代码推到 GitHub

在项目目录里：

```bash
git init
git add .
git commit -m "Lo-fi 房间电台：初始版本"

# 在 GitHub 上新建一个空仓库（不要勾选 README），然后：
git remote add origin https://github.com/你的用户名/lofi-room-radio.git
git branch -M main
git push -u origin main
```

**推之前确认一件事**：`.env.local` 没有被提交。
`.gitignore` 里已经写了 `.env*.local`，用 `git status` 再确认一眼 ——
如果看到 `.env.local`，立刻 `git rm --cached .env.local`。

---

## 三、在 Vercel 导入项目

1. 打开 <https://vercel.com/new>
2. **Import Git Repository** → 选刚才那个仓库
3. Framework Preset 会自动识别成 **Next.js**，不用改
4. 先别点 Deploy，展开 **Environment Variables**，把下面这些填进去：

### 必填

| 变量名 | 值 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 你的 Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 你的 anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 你的 service_role key |
| `ADMIN_EMAIL` | 你自己的邮箱（登录后台用） |
| `NEXT_PUBLIC_SITE_URL` | 先随便填 `https://example.vercel.app`，部署完再改成真实地址 |

### 建议填

| 变量名 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_SITE_NAME` | 默认「Lo-fi 房间电台」 |
| `TREEHOLE_IP_SALT` | 随机一串字符，用来给访客 IP 做哈希 |
| `TREEHOLE_MIN_INTERVAL_SECONDS` | 默认 60 |
| `TREEHOLE_DAILY_LIMIT` | 默认 10 |
| `NEXT_PUBLIC_MAX_AUDIO_MB` | 默认 25，音频大小上限 |
| `NEXT_PUBLIC_MAX_IMAGE_MB` | 默认 5，**只作用于歌曲封面**；手帐照片是另一套（原图 10MB，浏览器里会先压缩）|

> `TREEHOLE_IP_SALT` 一定要换成你自己的随机串。
> 用默认值等于没加盐，别人拿到数据库也容易反推出 IP。

5. 点 **Deploy**，等 1–2 分钟

---

## 四、部署后必做的两件事

顺序建议：**先把自己设成站长，再把域名改对**。
（设站长要在站点上注册一次，所以得等第一次部署成功之后做。）

### 1. 把自己设成站长（不做这步，后台什么都传不了）

1. 打开 `https://你的项目名.vercel.app/admin/login`
2. 点「还没有账号？去注册」，用你的邮箱注册
3. 回 Supabase **SQL Editor** 执行一次（换成你的邮箱）：

```sql
update public.profiles set role = 'admin' where email = '你的邮箱@example.com';
```

4. 校验一下：

```sql
select id, email, role from public.profiles;
```

看到 `role = admin` 就成了。回到 `/admin/login` 登录，应该能进后台。

> **为什么这步不能跳**：音乐和手帐照片是**从浏览器直传 Supabase Storage** 的，
> 能不能传由 Storage 的策略决定，而那条策略判的是 `is_admin()`。
> 没提权就只能读、不能写，上传会直接报权限错误。

### 2. 把站点地址改成正式域名

Vercel 部署成功后会先给你一个域名，比如 `lofi-room-radio.vercel.app`。
先用它把上面两步跑通，最后再换成你自己的域名：

1. Vercel → **Settings → Domains** → 添加域名 → 按提示去域名商改 DNS
2. 回到 **Settings → Environment Variables**，把 `NEXT_PUBLIC_SITE_URL` 改成
   `https://你的域名`（**不要带结尾斜杠**）
3. **Deployments → 最新那次 → Redeploy** 让新变量生效
4. Supabase 控制台 → **Authentication → URL Configuration**：
   - **Site URL**：填 `https://你的域名`
   - **Redirect URLs**：加上 `https://你的域名/**`

**这三处（Vercel 变量、Supabase Site URL、Supabase Redirect URLs）必须一起改，
少改一处就会出现「登录后跳回 localhost」或者分享链接指向 localhost。**

> 还没有域名也没关系：一直用 `xxx.vercel.app` 完全能跑，
> 只是把上面那三处都填成那个地址就行。

> 顺便建议：**Authentication → Providers → Email** 里把
> 「Confirm email」关掉（个人站只有一个用户，开着只会给自己添麻烦）。

---

## 五、验收清单

照着点一遍，全过就是部署成功了：

- [ ] 首页能打开，能看到房间和 **18 个可以戳的物件**
- [ ] 点台灯 → 房间变亮，底部弹出「咔哒。房间亮了一点。」
- [ ] 连点台灯 3 次 → 「别玩开关啦，电费很贵。」
- [ ] 点猫、长按猫 → 有不同的话；**猫的姿势会跟着成就变**（关灯只剩两只眼睛）
- [ ] 点床、点沙发 → **没有反应**（它们是纯布景，故意的）
- [ ] 手机打开同一个地址 → **能看到房间插图**（可以左右滑动看全），下面还有一份按分区排的卡片（墙上 / 架子上 / 桌面上 / 沙发上 / 地上），两边都能点
- [ ] `/music` 能听到演示音频（或你上传的歌）
- [ ] 手机上锁屏 → 能看到歌名和封面（Media Session）
- [ ] `/treehole` 投一封信 → 后台能看到待审
- [ ] `/admin` 登录 → 仪表盘有数字

**上传相关的四条（部署最容易出问题的就是这几个）：**

- [ ] 后台**传一首歌** → `/music` 立刻出现，能播
- [ ] 后台**新建一篇手帐 + 拖一张照片进去** → `/journal` 能看到
      （如果这步报错，八成是 `0006_journal.sql` 没跑）
- [ ] 手帐照片传完之后，在后台**看不到 EXIF 那一行黄字警告**（说明 GPS 被剥干净了）
- [ ] 新建一篇**口令可见**的手帐 → 前台显示成上锁的一页 → 输对口令能打开
- [ ] 后台审核树洞 → 通过后 `/treehole` 墙上出现

- [ ] `/games` 三个游戏都能玩，最高分记得住
- [ ] 关掉浏览器再打开 → 已触发的「一次性」事件不会重复出现

---

## 六、常见问题

### 上传大音频会不会失败？

不会。文件是**从浏览器直接传到 Supabase Storage** 的，不经过 Vercel 的函数
（Vercel 的 Serverless 函数有 4.5MB 的请求体上限，走中转必然失败）。
能不能传由 Storage 的策略决定：只有登录的站长能写进那六个桶。

手帐照片同理，而且**压缩和剥 EXIF 都在浏览器里做完**再传，
所以手机直出的 4MB 照片传到 Supabase 时通常只剩 200–400KB。

### 传照片报错 / `/journal` 打不开

八成是 `0006_journal.sql` 没执行。去 SQL Editor 跑一遍，然后确认：

```sql
select id, public from storage.buckets where id like '%journal%';
```

应该看到 `journal-photos`（public = true）和 `private-journal-photos`（public = false）两行。

### 页面报「permission denied for table xxx」

说明 RLS 策略没建好，或者 migrations 没执行全。
去 SQL Editor 跑一遍 `supabase/README.md` 里那段「执行完的校验清单」。

### 浏览器控制台报 CORS

Supabase 默认允许所有来源，一般不会遇到。
真遇到了：**Project Settings → API → CORS** 里加上你的 Vercel 域名。

### 后台进不去，一直被踢回登录页

三个原因，挨个查：

1. 没执行提权 SQL（`update profiles set role='admin' ...`）
2. `.env` 里的 `ADMIN_EMAIL` 和注册用的邮箱不一致
3. Supabase 的 Cookie 被浏览器的隐私插件拦了 —— 换个无痕窗口试试

### 免费额度够用吗？

个人站完全够：

| 项目 | Supabase 免费额度 | Vercel Hobby |
| --- | --- | --- |
| 数据库 | 500MB | — |
| 文件存储 | 1GB | — |
| 月流量 | 5GB | 100GB |
| 函数调用 | 500K 次/月 | 100GB-小时 |
| 构建 | — | 100 次/天 |

音频文件是大头。1GB 大概能放 40 首 25MB 的无损，或者 400 首 2.5MB 的 mp3。
超了就删旧的，或者在 Supabase 里单独买存储。

### 想用自己的域名

见「[四、部署后必做的两件事](#四部署后必做的两件事)」第 2 步。
记住要改的地方是**三处**：Vercel 的 `NEXT_PUBLIC_SITE_URL`、
Supabase 的 Site URL、Supabase 的 Redirect URLs —— 少改一处就会出问题。

---

## 七、更新网站

改完代码推上去就行，Vercel 会自动重新部署：

```bash
git add .
git commit -m "改了什么"
git push
```

如果要改数据库结构，把新的 SQL 放在 `supabase/migrations/` 下按序号命名，
本地和线上都要执行一次（线上在 Supabase SQL Editor 里跑）。

> **线上重跑迁移是安全的**：这六个脚本都写成幂等的，
> 重复执行只会更新结构，不会删你已经写下的内容。

---

## 八、备份建议

后台仪表盘底部有六个「导出 JSON」按钮（图文手帐 / 树洞 / 音乐列表 / 事件池 / 成就 / 站点设置）。

**每个月点一次，存到本地。** 数据库是别人的服务器，
但你写下的东西不该只存在那儿。

> 手帐照片是**文件**，不在数据库里，导出 JSON 拿不回来。
> 要备份照片就在 Supabase → **Storage** 里把 `journal-photos` 整个下载下来
> （私密手帐的照片在 `private-journal-photos`）。
