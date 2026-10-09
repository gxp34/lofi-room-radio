# 把某个文件的内容放进 Windows 剪贴板，带重试和校验。
#
# 为什么需要：
#   Windows 剪贴板同一时刻只能被一个进程占用。浏览器、输入法、剪贴板管理器
#   都可能正好握着它，这时 Set-Clipboard 会抛
#     ExternalException: 所请求的剪贴板操作失败
#   而且是**静默失败** —— 剪贴板里还是上一次的内容，你以为放进去了，
#   对方粘出来却是旧的东西。（这个坑真的踩过：给了「SQL 已在剪贴板」，
#   结果对方粘出来是空的。）
#
# 所以这里做三件事：重试、写完读回来比对、失败时明确报错。
#
# 用法：
#   pwsh -File scripts/put-clipboard.ps1 <文件路径>

param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [int]$MaxAttempts = 15
)

if (-not (Test-Path $Path)) {
  Write-Host "找不到文件: $Path"
  exit 1
}

# 不用 Get-Content —— 它会按控制台代码页解码，中文注释会变乱码。
# 直接按 UTF-8 读字节。
$content = [System.IO.File]::ReadAllText((Resolve-Path $Path).Path, [System.Text.Encoding]::UTF8)
$expected = $content.Trim()
$lineCount = ($content -split "`n").Count

Write-Host "文件: $Path"
Write-Host "  $($content.Length) 字符 / $lineCount 行"
Write-Host ""

for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
  try {
    Set-Clipboard -Value $content -ErrorAction Stop
    Start-Sleep -Milliseconds 250

    $back = Get-Clipboard -Raw -ErrorAction Stop
    if ($null -ne $back -and $back.Trim() -eq $expected) {
      Write-Host "  ✓ 剪贴板已就位（第 $attempt 次尝试）"
      exit 0
    }
    Write-Host "  · 第 $attempt 次：写进去了但读回来不一致，重试"
  } catch {
    Write-Host "  · 第 $attempt 次：剪贴板被占用（$($_.Exception.GetType().Name)），重试"
  }
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "  ✗ $MaxAttempts 次都没成功 —— 剪贴板一直被别的程序占着。"
Write-Host "    试试：关掉剪贴板管理器 / 输入法的剪贴板功能，或者手动打开文件复制。"
exit 1
