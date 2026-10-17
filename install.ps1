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
# 官方桌面端（Electron 客户端）：桌面端读的是应用独占的 desktop profile，
# 独立（npm 装的）dsh CLI 会拒绝它（error: profile "desktop" is managed
# exclusively by the Electron application）。唯一被允许管它的 CLI 是桌面端
# 自带的命令：应用菜单「管理 dsh 命令…」装的 dsh，或应用包里的
# resources\runtime\cli\bin\dsh.cmd——它带应用自己的 pnpm 和
# manageDesktopProfile 特权。所以 -ProfileName desktop 优先用那个 dsh 装：
# 先启动一次桌面端初始化 profile 并完全退出，脚本再调
#   <桌面端 dsh> plugin --profile desktop add file:<内容仓>\tavern-preset
# 那条 dsh 不在 PATH 上时（或 -DesktopCli 指定的不是它），脚本回退到打印
# 一段可粘进桌面端会话的 plugin_manager 指引。web 等 profile 流程不受影响。
#
# 用法: powershell -ExecutionPolicy Bypass -File install.ps1
#       [-ProfileName web] [-Dir <路径>] [-Repo <url>]
#       [-NoPull] [-Verify] [-Remove] [-DryRun]
#       [-DesktopCli <路径>] [-Prompt]
param(
  [string]$ProfileName = 'web',
  [string]$Dir = '',
  [string]$Repo = 'https://github.com/ai4rpg/tavern-content',
  [switch]$NoPull,
  [switch]$Verify,
  [switch]$Remove,
  [switch]$DryRun,
  [string]$DesktopCli = '',
  [switch]$Prompt
)

$ErrorActionPreference = 'Stop'
$PresetPkg = '@ai4rpg/dsh-tavern-preset'

function Say([string]$msg) { Write-Host $msg }
function Fatal([string]$msg) { Write-Host "✗ $msg" -ForegroundColor Red; exit 1 }

# ---- profile 名归一化：desktop 是应用独占 profile -------------------------
# 独立（npm 装的）dsh CLI 对 desktop 一律拒绝（启动、dump、plugin 三条路径
# 都是）；能管它的是桌面端自带的 dsh —— 应用菜单「管理 dsh 命令…」装到
# PATH 上的那个，或应用安装目录里的 resources\runtime\cli\bin\dsh.cmd，它
# 带应用自己的 pnpm 与 manageDesktopProfile 特权。所以桌面端模式按
# -DesktopCli -> PATH 上的 dsh -> 注册表里的安装位置 -> 默认安装目录
# 依次找候选，再用只读的 `plugin --profile desktop list` 确认哪条能用；
# 一条都确认不了就只打印安装路径与文档指路。

$IsDesktop = $ProfileName.ToLower() -eq 'desktop'
$PromptMode = $false
if ($IsDesktop) {
  $DesktopDshArgs = @()
  $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
  $DesktopProfileDir = Join-Path (Join-Path $DshHome 'profiles') 'desktop'
  if ($Prompt) { $PromptMode = $true }
  if (-not $PromptMode -and -not (Test-Path (Join-Path $DesktopProfileDir 'package.json'))) {
    Say "  桌面端 profile 尚未初始化: $DesktopProfileDir"
    Say '  先启动一次桌面端（它会建立自己的 profile），完全退出（含系统托盘）后再运行本脚本。'
    exit 1
  }
}

# 桌面端自带的 dsh 固定在 <安装目录>\resources\runtime\cli\bin\dsh.cmd；
# 安装目录可能是默认位置，也可能被用户改过（安装程序会写进卸载注册表）。
function Get-DesktopDshCandidates {
  $candidates = New-Object System.Collections.Generic.List[string]
  if ($DesktopCli) { $candidates.Add($DesktopCli) | Out-Null }
  $onPath = Get-Command dsh -ErrorAction SilentlyContinue
  if ($onPath) { $candidates.Add($onPath.Source) | Out-Null }
  $uninstallRoots = @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
  )
  foreach ($root in $uninstallRoots) {
    Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
      $entry = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      if ($entry.DisplayName -like '*DeepSeek Harness*' -and $entry.InstallLocation) {
        $cli = Join-Path $entry.InstallLocation 'resources\runtime\cli\bin\dsh.cmd'
        if (Test-Path -LiteralPath $cli -PathType Leaf) { $candidates.Add($cli) | Out-Null }
      }
    }
  }
  $bases = @()
  if ($env:LOCALAPPDATA) { $bases += Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness' }
  if ($env:ProgramFiles) { $bases += Join-Path $env:ProgramFiles 'DeepSeek Harness' }
  if (${env:ProgramFiles(x86)}) { $bases += Join-Path ${env:ProgramFiles(x86)} 'DeepSeek Harness' }
  foreach ($base in $bases) {
    $cli = Join-Path $base 'resources\runtime\cli\bin\dsh.cmd'
    if (Test-Path -LiteralPath $cli -PathType Leaf) { $candidates.Add($cli) | Out-Null }
  }
  return @($candidates | Select-Object -Unique)
}

# 探测桌面端 dsh：普通 dsh 会在启动前就拒绝 desktop profile，不会碰 profile；
# 桌面端 dsh 则真的执行 pnpm list。读操作，不改动任何东西。
function Test-DesktopCarrier([string]$exe) {
  if (-not $exe) { return $false }
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $exe plugin --profile desktop list 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  } finally {
    $ErrorActionPreference = $previous
  }
}

# 安装方式与逐条排错写在内容仓的文档里，脚本只指路：桌面端有三条路
# （应用自带的 dsh、侧边栏 Plugins 页、cordis 会话里的 plugin_manager）。
function Show-DesktopDocUrl {
  $web = $Repo -replace '\.git$', ''
  Say "  $web/blob/main/tavern-preset/docs/install-guide.zh.md"
}

# 桌面端 dsh 不可用：说明原因并指向文档。
function Show-DesktopCarrierUnavailable {
  Say '  未找到能管理 desktop profile 的 dsh：已找过 -DesktopCli、PATH 上的 dsh、'
  Say '  卸载注册表里的安装位置与默认安装目录。独立（npm 装的）dsh 对 desktop'
  Say '  一律拒绝，只有桌面端自带的命令能管它。'
  Say '  安装方法（三条路，含 -DesktopCli 指向应用包内启动器）：'
  Show-DesktopDocUrl
}

# 选出能用的载体：-Prompt 时不做探测；dry-run 只报第一个候选（不改动任何东西）。
if ($IsDesktop) {
  $DesktopDshCandidates = @(Get-DesktopDshCandidates)
  $DesktopDshExe = if ($DesktopDshCandidates.Count -gt 0) { $DesktopDshCandidates[0] } else { $null }
  if (-not $PromptMode) {
    if ($DryRun) {
      if (-not $DesktopDshExe) { $PromptMode = $true }
    } else {
      $confirmed = $null
      foreach ($candidate in $DesktopDshCandidates) {
        if (Test-DesktopCarrier $candidate) { $confirmed = $candidate; break }
      }
      if ($confirmed) { $DesktopDshExe = $confirmed } else { $PromptMode = $true }
    }
  }
}

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
  if ($IsDesktop) {
    Say "==> 卸载 $PresetPkg（桌面端 profile: desktop）"
    if ($PromptMode) {
      Say "  不调 dsh：在桌面端会话里用 plugin_manager，或在侧边栏 Plugins 页卸载 $PresetPkg。"
      Say '  （-Prompt，或没找到桌面端自带的 dsh 时如此。）'
      Say '  方法见:'
      Show-DesktopDocUrl
      Say '  本地内容仓保留在原处，确认不需要可手动删除。'
      exit 0
    }
    if ($DryRun) {
      Say "  [dry-run] $DesktopDshExe plugin --profile desktop list   # 探测：这条 dsh 是不是桌面端自带的那条"
    }
    Say '  用桌面端自带的 dsh 卸载（它带应用自己的 pnpm 与 desktop profile 特权）'
    if ($DryRun) {
      Say "  [dry-run] $DesktopDshExe plugin --profile desktop remove $PresetPkg"
    } else {
      & $DesktopDshExe @DesktopDshArgs plugin --profile desktop remove $PresetPkg
      if ($LASTEXITCODE -ne 0) { Say '  未检出旧安装（或移除报错见上）' }
    }
    if ($DryRun) {
      Say ''
      Say '（dry-run 结束：以上命令均未执行）'
      exit 0
    }
    Say ''
    Say '已卸载。注意：'
    Say '  - 在 tavern-standard 上跑过的会话将无法恢复（预设 id 是恢复契约）；如需回头，重新运行本脚本安装。'
    Say '  - 完全退出并重开桌面端后生效。'
    Say '  - 本地内容仓保留在原处，确认不需要可手动删除。'
    exit 0
  }
  Say "==> 卸载 $PresetPkg（profile: $ProfileName）"
  if ($DryRun) {
    Say "  [dry-run] $DshText plugin --profile $ProfileName remove $PresetPkg"
  } else {
    & $DshExe @DshArgs plugin --profile $ProfileName remove $PresetPkg
    if ($LASTEXITCODE -ne 0) { Say '  未检出旧安装（或移除报错见上）' }
  }
  if ($DryRun) {
    Say ''
    Say '（dry-run 结束：以上命令均未执行）'
    exit 0
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
if ($IsDesktop) {
  # 桌面端模式一律不需要本机的 node / pnpm：桌面端自带的 dsh 用应用打包的
  # pnpm，plugin_manager 路线则完全在应用内完成。
  Say '  桌面端模式：本机不需要 dsh CLI 与 pnpm，包操作由桌面端自带的 pnpm 完成'
  if (Get-Command node -ErrorAction SilentlyContinue) {
    Say "  （本机 node $(& node --version)；桌面端不依赖它）"
  }
  if ($PromptMode) {
    if ($Prompt) { Say "  -Prompt：不调 dsh，桌面端里的安装路径见下（profile: $DesktopProfileDir）" }
    else { Show-DesktopCarrierUnavailable }
  } elseif ($DryRun) {
    Say "  [dry-run] $DesktopDshExe plugin --profile desktop list   # 探测：这条 dsh 是不是桌面端自带的那条"
  } else {
    Say "  已确认桌面端自带的 dsh 可管理 desktop profile: $DesktopDshExe"
    Say '  （装之前请完全退出桌面端，装完再打开；应用运行中它会等 profile 写锁）'
  }
} else {
  $hasNode = Get-Command node -ErrorAction SilentlyContinue
  $hasPnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if (-not $hasNode -and -not $DryRun) {
    Fatal '缺少 node —— 预设包要求 node ^22.19 || >=24（https://nodejs.org）'
  }
  if (-not $hasPnpm -and -not $DryRun) {
    Fatal '缺少 pnpm —— dsh plugin 转发到 pnpm 安装（npm install -g pnpm，或启用 corepack）'
  }
  if ($hasNode) {
    $nodeVersion = ([string](& node --version)).TrimStart('v').Trim()
    $nodeMajor = [int]($nodeVersion.Split('.')[0])
    if ($nodeMajor -lt 22) { Say "  ⚠ node $nodeMajor 偏旧：预设包要求 ^22.19 || >=24，继续但可能安装失败" }
  }
  if ($DryRun) {
    Say "  [dry-run] 正式运行会检查 node / pnpm；将使用: $DshText"
  } else {
    Say "  node $(& node --version) / pnpm $(& pnpm --version) / dsh: $DshText"
  }
}

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

# ---- 3/3 安装（桌面端有可用载体 = 同一流程；否则 = 打印指引） --------------

if ($IsDesktop -and $PromptMode) {
  Say '==> 3/3 桌面端安装路径（本脚本不动桌面端 profile）'
  Say '  安装要用的本地目录规格是:'
  Say "    file:$PresetDir"
  Say '  在桌面端里安装（三条路，任选其一）:'
  Say '    - 侧边栏 Plugins 页：粘贴上面的绝对路径'
  Say '    - 会话里的 plugin_manager：会话要用 cordis 预设，该工具默认关闭'
  Say '    - 应用自带的 dsh：重跑本脚本会优先用它（没自动找到时用 -DesktopCli 指向'
  Say '      应用安装目录里的 resources\runtime\cli\bin\dsh.cmd）'
  Say '  方法、生效与排错见:'
  Show-DesktopDocUrl
  Say ''
  Say "  内容仓: $ContentDir"
  Say '  卸载 = install.ps1 -ProfileName desktop -Remove'
  exit 0
}

if ($IsDesktop) {
  Say '==> 3/3 用桌面端自带的 dsh 安装预设包（profile: desktop）'
  Say '  （@ai4rpg/dsh-tavern-stages 等插件是它的 npm 依赖，自动从 registry 带入）'
  if ($DryRun) {
    Say "  [dry-run] $DesktopDshExe plugin --profile desktop remove $PresetPkg"
    Say "  [dry-run] $DesktopDshExe plugin --profile desktop add file:$PresetDir"
  } else {
    & $DesktopDshExe @DesktopDshArgs plugin --profile desktop remove $PresetPkg
    if ($LASTEXITCODE -ne 0) { Say '  未检出旧安装（或移除报错见上），继续安装' }
    & $DesktopDshExe @DesktopDshArgs plugin --profile desktop add "file:$PresetDir"
    if ($LASTEXITCODE -ne 0) {
      Say '✗ 预设包安装失败（pnpm 报错见上）。' -ForegroundColor Red
      Say '  确认桌面端已完全退出（应用运行中会等 profile 写锁）；内存不足时可重试：'
      Say '  $env:NODE_OPTIONS = ''--max-old-space-size=6144'' 后重跑本脚本'
      exit 1
    }
  }
} else {
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
}

# ---- 校验（-Verify） ------------------------------------------------------

if ($Verify) {
  Say ''
  if ($IsDesktop) {
    # desktop profile 不能 --dump-config（那条路径同样被独立 CLI 拒绝），
    # 改成直接读 profile 清单里的 bundle 选择。
    Say "==> 校验（profile 清单：$DesktopProfileDir\package.json）"
    if ($DryRun) {
      Say "  [dry-run] 读 profile 清单，确认 $PresetPkg 已装、且列进 dsh.profile.bundles"
    } else {
      $manifestPath = Join-Path $DesktopProfileDir 'package.json'
      $manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
      $deps = $manifest.dependencies
      $installed = $false
      if ($deps) {
        foreach ($p in $deps.PSObject.Properties) {
          if ($p.Name -eq $PresetPkg) { $installed = $true }
          elseif ("$($p.Value)" -replace '^file:' -replace '[\\/]+$' -eq ($PresetDir -replace '[\\/]+$')) { $installed = $true }
        }
      }
      $selected = $false
      $bundles = @()
      if ($manifest.dsh -and $manifest.dsh.profile -and $manifest.dsh.profile.bundles) { $bundles = @($manifest.dsh.profile.bundles) }
      foreach ($b in $bundles) {
        if ("$b" -eq $PresetPkg) { $selected = $true }
        elseif (("$b" -replace '^file:' -replace '[\\/]+$') -eq ($PresetDir -replace '[\\/]+$')) { $selected = $true }
      }
      Say "  已装依赖: $(if ($installed) { '是' } else { '否' }) / 已列进 dsh.profile.bundles: $(if ($selected) { '是' } else { '否' })"
      if ($installed -and $selected) { Say '  ✓ 预设包已装并已选进 profile（完全退出并重开桌面端后生效）' }
      else { Fatal 'profile 清单里没确认到预设包 —— 安装可能未生效（上方输出可供排错）' }
    }
  } else {
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
}

if ($DryRun) {
  Say ''
  Say '（dry-run 结束：以上命令均未执行）'
  exit 0
}

Say ''
if ($IsDesktop) {
  Say '安装完成。接下来：'
  Say '  1. 完全退出并重开桌面端（含系统托盘）'
  Say '  2. 新建会话，Preset 选 "Tavern Cards"，把工作目录指向卡片项目文件夹'
  Say '  3. 侧边栏应出现阶段 tab'
  if (-not $Verify) {
    Say "  4. （可选）校验安装: $DesktopProfileDir\package.json 里应有 $PresetPkg"
  }
  Say ''
  Say "  内容仓: $ContentDir"
  Say '  升级 = 重跑本脚本（自动 git pull + 用桌面端 dsh 重装）'
  Say '  卸载 = install.ps1 -ProfileName desktop -Remove'
  exit 0
}

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
