# Supabase 初始化说明

## 一、执行顺序（很重要）

打开 Supabase 控制台 → 左侧 **SQL Editor** → **New query**，
按下面的顺序把每个文件的内容整段粘贴进去，点 **Run**。

| 顺序 | 文件 | 做什么 |
| --- | --- | --- |
| 1 | [`migrations/0001_schema.sql`](migrations/0001_schema.sql) | 建 13 张表、索引、`updated_at` 触发器、`is_admin()` 等工具函数 |
| 2 | [`migrations/0002_rls.sql`](migrations/0002_rls.sql) | 打开行级安全并定义全部策略（含匿名投递、限流、防自审） |
| 3 | [`migrations/0003_storage.sql`](migrations/0003_storage.sql) | 建 4 个存储桶、设置大小与类型限制、写存储策略 |
| 4 | [`migrations/0004_seed.sql`](migrations/0004_seed.sql) | 初始化小游戏、成就、站点设置 |
| 5 | [`migrations/0005_admin_stats.sql`](migrations/0005_admin_stats.sql) | 后台仪表盘的聚合统计函数与数据导出函数 |
| 6 | [`migrations/0006_journal.sql`](migrations/0006_journal.sql) | 图文手帐：扩展 diaries、建 journal_photos、两个照片桶、口令手帐函数 |

六个脚本都是**幂等**的：重复执行只会更新结构，不会删除你已有的数据。
所以改错了、重跑了都没关系。

> 用 Supabase CLI 的话：
> ```bash
> supabase link --project-ref 你的项目ref
> supabase db push
> ```
> CLI 会按文件名顺序自动执行 `migrations/` 下的脚本。

## 二、创建站长账号

1. 本地启动项目 → 打开 `http://localhost:3000/admin/login`
2. 点「还没有账号？去注册」，用你自己的邮箱注册
   （如果 Supabase 开了邮箱验证，先去邮箱点确认链接）
3. 回到 SQL Editor 执行一次（换成你的邮箱）：

```sql
update public.profiles set role = 'admin' where email = 'your@email.com';
```

4. 校验：

```sql
select id, email, role, created_at from public.profiles;
```

5. 顺便把这个邮箱填进 `.env.local` 的 `ADMIN_EMAIL`，作为兜底判断。

> 后台还支持 `ADMIN_EMAIL` 环境变量直接判定站长，
> 但**强烈建议**把数据库里的 `role` 也改成 `admin` —— RLS 策略认的是数据库里的角色，
> 只改环境变量的话，后台页面进得去，但读私密数据会被 RLS 拦住。

## 三、执行完的校验清单

把下面这段贴进 SQL Editor 跑一次，全部应该是 `true`：

```sql
select
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE') >= 13      as "表建好了",
  (select count(*) from pg_policies where schemaname = 'public') >= 25      as "RLS 策略建好了",
  (select count(*) from storage.buckets
     where id in ('public-music','private-music','covers','diary-images')) = 4 as "存储桶建好了",
  (select count(*) from public.achievements) >= 10                          as "成就有数据",
  (select count(*) from public.games) = 3                                   as "小游戏有数据",
  (select count(*) from pg_proc
     where proname in ('admin_overview','admin_export')) = 2                as "后台统计函数建好了";
```

想看得更细：

```sql
-- 每个表开了 RLS 没有
select relname, relrowsecurity
  from pg_class
 where relnamespace = 'public'::regnamespace and relkind = 'r'
 order by relname;

-- 所有策略
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname;
```

## 四、Storage 桶一览

| 桶 | 公开 | 大小上限 | 允许类型 | 前台怎么用 |
| --- | --- | --- | --- | --- |
| `public-music` | ✅ | 25 MB | mp3 / m4a / aac / ogg / wav / flac / webm | `getPublicUrl()` 直接放 `<audio src>` |
| `private-music` | ❌ | 25 MB | 同上 | 服务端 `createSignedUrl(path, 3600)` |
| `covers` | ✅ | 5 MB | jpg / png / webp / avif / gif | `getPublicUrl()` 交给 `next/image` |
| `diary-images` | ❌ | 5 MB | 同上 | 服务端批量签名后展示 |
| `journal-photos` | ✅ | 10 MB | jpg / png / webp / avif | 公开手帐的照片，`getPublicUrl()` |
| `private-journal-photos` | ❌ | 10 MB | 同上 | 私密 / 口令手帐的照片，签名后展示 |

桶级限制是在 `storage.buckets` 的 `file_size_limit` 与 `allowed_mime_types` 字段里设的，
**不依赖前端校验**，绕过前端也传不上去。

## 五、安全设计说明（为什么这么写）

### 1. 匿名投递不能自己给自己盖章

```sql
-- 0002_rls.sql 里插入策略的核心
with check (
  is_approved = false      -- 访客无法自己审核通过
  and is_hidden = false
  and report_count = 0
)
```

所以就算有人直接在浏览器控制台调 `supabase.from('treehole_messages').insert(...)`，
也只能写进「未审核」状态，上不了树洞墙。

### 2. 限流写在数据库里

`enforce_treehole_rate_limit` 触发器：同一个人 10 分钟最多 5 条、24 小时最多 20 条。
应用层再算一遍（更好的提示语），但**数据库是最后一道闸**。

### 3. IP 只存哈希

`treehole_messages.ip_hash` = `sha256(盐 + IP)`，盐在环境变量 `TREEHOLE_IP_SALT`。
数据库里没有明文 IP，哈希也无法反推。

### 4. 列表页只读公开内容

所有 `select` 策略都写成 `公开条件 or public.is_admin()`，
并且 `is_admin()` 是 `security definer` 的 —— 否则策略里查 `profiles` 会无限递归。

### 5. 密钥绝不进数据库

`site_settings` 是**全站可读**的（前台要拿房间名、社交链接），
所以这里只放能公开的东西；任何密钥只走环境变量。

### 6. 口令手帐为什么真的安全

`diaries.visibility = 'password'` 的手帐，**正文根本不进 RLS 的可见范围**：
匿名 key 查它只会得到 0 行。访客看到的只是一个「上锁的标题」
（由 `journal_locked_entries()` 这个 SECURITY DEFINER 函数提供，只吐标题和日期）。

流程是：

```
访客输口令
  → /api/journal/unlock（服务端，带限流：同 IP 一分钟 8 次）
  → rpc journal_check_password(id, 口令)
       └─ SECURITY DEFINER，只返回 true/false，不泄漏 password_hash
  → 通过之后才用 service_role 取回正文和照片，并签发 1 小时的图片地址
```

`password_hash` 用 `crypt(口令, gen_salt('bf'))` 存 bcrypt 哈希，明文永不落库。

## 六、改了表结构之后

`src/types/database.ts` 是手写的（为了保留中文注释）。
改了表结构记得同步改它，或者用官方命令重新生成再对照着补注释：

```bash
npx supabase gen types typescript --project-id 你的项目ref > src/types/database.generated.ts
```
