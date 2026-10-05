# Tavern Cards dsh 一键安装脚本（Windows / PowerShell，功能同 install.sh）。
# 独立于任何仓库检出：自动从 GitHub 获取内容仓 tavern-content（含预设包
# tavern-preset 与子代理人格包 tavern-agents），并把预设包装进 dsh profile。
# 插件（@ai4rpg/dsh-tavern-stages、@ai4rpg/dsh-stage-switch 等）是预设包的
# npm 依赖，由 `dsh plugin add` 自动从 registry 带入，无需单独安装。
#
# 两种运行方式：
#   A. 独立运行（无需先克隆任何仓库）：脚本把内容仓下载到落点再安装。
#   B. 在 tavern-content 检出内运行：脚本检测到自身就在检出里，直接使用它。
#
# 运行方式（任意目录）：
#   powershell -ExecutionPolicy Bypass -File install.ps1
# 建议：把脚本放到不含空格的路径下再运行。
#
# 用法: powershell -ExecutionPolicy Bypass -File install.ps1
#       [-ProfileName web] [-Dir <路径>] [-Repo <url>]
#       [-NoPull] [-Verify] [-Remove] [-DryRun]
param(
  [string]$ProfileName = 'web',
  [string]$Dir = '',
  [string]$Repo = 'https://github.com/ai4rpg/tavern-content',
  [switch]$NoPull,
  [switch]$Verify,
  [switch]$Remove,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$PresetPkg = '@ai4rpg/dsh-tavern-preset'

function Say([string]$msg) { Write-Host $msg }
function Fatal([string]$msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

# ---- dsh 命令解析 ---------------------------------------------------------

if ($env:DSH_CMD) {
  $parts = @($env:DSH_CMD -split '\s+' | Where-Object { $_ })
  $DshExe = $parts[0]
  $DshArgs = @()
  if ($parts.Count -gt 1) { $DshArgs = @($parts[1..($parts.Count - 1)]) }
} elseif (Get-Command dsh -ErrorAction SilentlyContinue) {
  $DshExe = 'dsh'
  $DshArgs = @()
} else {
  $DshExe = 'npx'
  $DshArgs = @('-y', '@deepseek-ai/dsh')
}
$DshText = (@($DshExe) + $DshArgs) -join ' '

if ($DryRun) { Say '（dry-run：只打印将执行的命令，不做任何更改）' }

# ---- 卸载模式 -------------------------------------------------------------

if ($Remove) {
  Say "==> 卸载 $PresetPkg（profile: $ProfileName）"
  if ($DryRun) {
    Say "  [dry-run] $DshText plugin --profile $ProfileName remove $PresetPkg"
  } else {
    & $DshExe @DshArgs plugin --profile $ProfileName remove $PresetPkg
    if ($LASTEXITCODE -ne 0) { Say '  未检出旧安装（或移除报错见上）' }
  }
  Say ''
  Say '已卸载。注意：'
  Say '  - 在 tavern-standard 上跑过的会话将无法恢复（预设 id 是恢复契约）；如需回头，重新运行本脚本安装。'
  Say '  - 本地内容仓保留在原处，确认不需要可手动删除。'
  exit 0
}

# ---- 内容仓落点 -----------------------------------------------------------
# 优先级：-Dir > 脚本自身所在检出 > $env:TAVERN_CONTENT_ROOT > ~\tavern-content

$ContentDir = $Dir
if (-not $ContentDir -and $PSScriptRoot -and
    (Test-Path (Join-Path $PSScriptRoot 'tavern-preset\package.json'))) {
  $ContentDir = $PSScriptRoot
  Say "==> 检测到脚本位于 tavern-content 检出内，直接使用: $ContentDir"
}
if (-not $ContentDir) {
  $ContentDir = if ($env:TAVERN_CONTENT_ROOT) { $env:TAVERN_CONTENT_ROOT } else { Join-Path $HOME 'tavern-content' }
}
$PresetDir = Join-Path $ContentDir 'tavern-preset'
$AgentsDir = Join-Path $ContentDir 'tavern-agents'

# ---- 1/3 前置检查 ---------------------------------------------------------

Say '==> 1/3 前置检查'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fatal '缺少 node —— 预设包要求 node ^22.19 || >=24（https://nodejs.org）'
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Fatal '缺少 pnpm —— dsh plugin 转发到 pnpm 安装（npm install -g pnpm，或启用 corepack）'
}
$nodeMajor = [int](& node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 22) { Say "  ⚠ node $nodeMajor 偏旧：预设包要求 ^22.19 || >=24，继续但可能安装失败" }
Say "  node $(& node --version) / pnpm $(& pnpm --version) / dsh: $DshText"

# ---- 2/3 获取内容仓 -------------------------------------------------------

Say "==> 2/3 内容仓 tavern-content"
if (Test-Path (Join-Path $PresetDir 'package.json')) {
  if ($NoPull) {
    Say "  已有检出（-NoPull 跳过更新）: $ContentDir"
  } elseif (Test-Path (Join-Path $ContentDir '.git')) {
    if ($DryRun) {
      Say "  [dry-run] git -C $ContentDir pull --ff-only"
    } else {
      & git -C $ContentDir pull --ff-only
      if ($LASTEXITCODE -ne 0) { Say '  ⚠ git pull 未成功（本地可能有未提交改动）——沿用现有内容继续' }
      else { Say '  已拉取最新内容' }
    }
  } else {
    Say "  已有内容（zip 下载，无 git 元数据，跳过更新）: $ContentDir"
    Say '    需要更新时删除该目录后重跑本脚本'
  }
} elseif ((Test-Path $ContentDir) -and (Get-ChildItem -Force $ContentDir | Select-Object -First 1)) {
  Fatal "目录已存在且不是 tavern-content 检出: $ContentDir（-Dir 换个位置，或清空后重跑）"
} elseif (Get-Command git -ErrorAction SilentlyContinue) {
  Say "  git clone --depth 1 $Repo.git -> $ContentDir"
  if (-not $DryRun) {
    & git clone --depth 1 "$Repo.git" $ContentDir
    if ($LASTEXITCODE -ne 0) { Fatal 'git clone 失败（网络 / 地址见上；-Repo 可指向 fork 或镜像）' }
  }
} else {
  Say "  未发现 git —— 回退 curl 下载 zip: $Repo/archive/HEAD.zip"
  if (-not $DryRun) {
    if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
      Fatal '缺少 git 与 curl.exe，无法从 GitHub 下载（安装 git 后重跑）'
    }
    $zip = Join-Path $env:TEMP 'tavern-content.zip'
    & curl.exe -fsSL "$Repo/archive/HEAD.zip" -o $zip
    if ($LASTEXITCODE -ne 0) { Fatal '下载失败（网络 / 地址见上）' }
    $tmp = Join-Path $env:TEMP ("tavern-content-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
    Expand-Archive $zip -DestinationPath $tmp
    $src = Get-ChildItem $tmp -Directory -Filter 'tavern-content-*' | Select-Object -First 1
    if (-not $src) {
      Remove-Item $tmp -Recurse -Force
      Remove-Item $zip -Force
      Fatal 'zip 解压结果异常'
    }
    if ((Test-Path $ContentDir) -and -not (Get-ChildItem -Force $ContentDir | Select-Object -First 1)) {
      Remove-Item $ContentDir -Force
    }
    New-Item -ItemType Directory -Force (Split-Path $ContentDir) | Out-Null
    Move-Item $src.FullName $ContentDir
    Remove-Item $tmp -Recurse -Force
    Remove-Item $zip -Force
    Say "  已下载并解压到 $ContentDir（无 git 元数据；更新需删除后重跑）"
  }
}

if (-not (Test-Path (Join-Path $PresetDir 'package.json'))) {
  Fatal "找不到预设包: $PresetDir（内容仓不完整？删除 $ContentDir 后重跑）"
}
if (-not (Test-Path (Join-Path $AgentsDir 'package.json'))) {
  Fatal "找不到子代理人格包: $AgentsDir（预设包的 file:../tavern-agents 依赖需要同检出内的 tavern-agents/ 目录）"
}

# ---- 3/3 安装预设包 -------------------------------------------------------

Say "==> 3/3 安装预设包到 profile: $ProfileName"
Say '  （@ai4rpg/dsh-tavern-stages 等插件是它的 npm 依赖，自动从 registry 带入）'
if ($DryRun) {
  Say "  [dry-run] $DshText plugin --profile $ProfileName remove $PresetPkg"
  Say "  [dry-run] $DshText plugin --profile $ProfileName add file:$PresetDir"
} else {
  & $DshExe @DshArgs plugin --profile $ProfileName remove $PresetPkg
  if ($LASTEXITCODE -ne 0) { Say '  未检出旧安装（或移除报错见上），继续安装' }
  & $DshExe @DshArgs plugin --profile $ProfileName add "file:$PresetDir"
  if ($LASTEXITCODE -ne 0) {
    Say '✗ 预设包安装失败（pnpm 报错见上）。' -ForegroundColor Red
    Say '  内存不足时可重试：$env:NODE_OPTIONS = ''--max-old-space-size=6144'' 后重跑本脚本'
    exit 1
  }
}

# ---- 校验（-Verify） ------------------------------------------------------

if ($Verify) {
  Say ''
  Say '==> 校验（--dump-config）'
  if ($DryRun) {
    Say "  [dry-run] $DshText --profile $ProfileName --dump-config | Select-String 'preset-tavern-standard|dsh-tavern-preset|ui-sidebar-stage'"
  } else {
    $dump = & $DshExe @DshArgs --profile $ProfileName --dump-config
    $hits = $dump | Select-String -Pattern 'preset-tavern-standard|dsh-tavern-preset|ui-sidebar-stage'
    if ($hits) { Say '  ✓ tavern 层已在 profile 组合中出现' }
    else { Fatal 'dump 里没找到 tavern 层 —— 安装可能未生效（上方输出可供排错）' }
  }
}

Say ''
Say '安装完成。接下来：'
Say "  1. $DshText web   启动 Web UI，到 Settings → Providers 配置 API key"
Say '  2. 新建会话，Preset 选 "Tavern Cards"，把工作目录指向卡片项目文件夹'
if (-not $Verify) {
  Say "  3. （可选）校验安装: $DshText --profile $ProfileName --dump-config | Select-String 'preset-tavern-standard|ui-sidebar-stage'"
}
Say ''
Say "  内容仓: $ContentDir"
Say '  升级 = 重跑本脚本（自动 git pull + 重装预设包）'
Say "  卸载 = install.ps1 -Remove（或 $DshText plugin --profile $ProfileName remove $PresetPkg）"
