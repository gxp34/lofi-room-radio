# 把剩下三条环境变量写进 Vercel。
#
# 为什么用脚本而不是网页：
#   网页那个 Settings → Environment Variables 页面不容易找到输入框；
#   而这个脚本每条都会明确告诉你「现在要填哪个」，不会把 anon 和 service_role 搞混。
#
# 值只在你自己的终端里输入，不会经过任何第三方。
#
# 用法（在项目目录里开 PowerShell，粘这一行）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\set-vercel-env.ps1

$ErrorActionPreference = 'Stop'
$filter = '^Vercel CLI|CategoryInfo|FullyQualifiedErrorId|^\s*\+|所在位置|字符:'

Write-Host ''
Write-Host '========================================'
Write-Host ' 往 Vercel 写剩下三条环境变量'
Write-Host '========================================'
Write-Host ''

# 确认 npx 在
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
  Write-Host '找不到 npx。确认 Node 装好了（新开一个 PowerShell 再试）。'
  exit 1
}

# 确认登录着
Write-Host '检查 Vercel 登录状态…'
$who = (npx --yes vercel@latest whoami 2>&1 | Where-Object { $_ -notmatch $filter }) -join ''
if ($who -notmatch 'gxp34') {
  Write-Host "  当前登录: $who"
  Write-Host '  没登录或者登录的不是 gxp34。先跑：npx vercel login'
  exit 1
}
Write-Host "  ✓ 已登录: $(($who -split "`n")[-1].Trim())"
Write-Host ''

# 三条：显示名 / 变量名 / 提示 / 是否敏感
$items = @(
  @{
    Key  = 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
    Hint = 'Supabase → Project Settings → API Keys → Legacy API keys → 复制 anon public（eyJ 开头）'
  },
  @{
    Key  = 'SUPABASE_SERVICE_ROLE_KEY'
    Hint = '同一个页面 → 复制 service_role secret（也是 eyJ 开头，可能要点 Reveal 才显示）'
  },
  @{
    Key  = 'ADMIN_EMAIL'
    Hint = '你自己的邮箱。待会儿注册后台账号要用同一个。'
  }
)

$done = @()

foreach ($item in $items) {
  Write-Host '----------------------------------------'
  Write-Host "  要填的是：$($item.Key)"
  Write-Host ''
  Write-Host "  去哪找：$($item.Hint)"
  Write-Host ''
  Write-Host '  粘进来回车。（直接回车 = 跳过这条）'
  Write-Host '----------------------------------------'

  $value = Read-Host '  值'

  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Host '  跳过' -ForegroundColor DarkGray
    Write-Host ''
    continue
  }

  # 去掉复制时容易带上的首尾空格和引号
  $value = $value.Trim().Trim('"').Trim("'")

  # 用 stdin 传值，不走命令行参数 —— 避免值出现在进程列表里
  $out = ($value | npx --yes vercel@latest env add $item.Key production --yes --force 2>&1 |
    Where-Object { $_ -notmatch $filter } | Where-Object { $_ -notmatch '^\s*$' }) -join "`n"

  if ($out -match 'Error|error|failed') {
    Write-Host "  ✗ 出错：$out" -ForegroundColor Red
  } else {
    Write-Host "  ✓ 写入成功（$($value.Length) 字符）" -ForegroundColor Green
    $done += $item.Key
  }
  Write-Host ''
}

Write-Host '========================================'
Write-Host "  成功写入 $($done.Count) 条"
foreach ($k in $done) { Write-Host "    · $k" }
Write-Host '========================================'
Write-Host ''

Write-Host '现在 Vercel 上有的环境变量：'
npx --yes vercel@latest env ls 2>&1 | Where-Object { $_ -notmatch $filter }

Write-Host ''
Write-Host '写完之后跟我说一声，我来触发重新部署并验证。'
