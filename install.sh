#!/usr/bin/env bash
# Tavern Cards（tavern-cards 工作流）dsh 一键安装脚本。
#
# 独立于任何仓库检出：自动从 GitHub 获取内容仓 tavern-content（含预设包
# tavern-preset 与子代理人格包 tavern-agents），并把预设包装进 dsh profile。
# 插件（@ai4rpg/dsh-tavern-stages、@ai4rpg/dsh-stage-switch 等）是预设包的
# npm 依赖，由 `dsh plugin add` 自动从 registry 带入，无需单独安装。
#
# 两种运行方式：
#   A. 独立运行（无需先克隆任何仓库）：脚本把内容仓下载到落点再安装。
#   B. 在 tavern-content 检出内运行：脚本检测到自身就在检出里，直接使用它。
#
# 下载方式：优先 git clone --depth 1；无 git 时回退 curl + tar 拉 tarball。
# Windows：请改用同目录的 install.ps1，或在 WSL / Git Bash 中运行本脚本。
#
# 官方桌面端（Electron 客户端）：桌面端读的是应用独占的 desktop profile，
# 独立（npm 装的）dsh CLI 会拒绝它（error: profile "desktop" is managed
# exclusively by the Electron application）。唯一被允许管它的 CLI 是桌面端
# 自带的命令：应用菜单「管理 dsh 命令…」注册到 /usr/local/bin 的那个，或
# 应用包里的 Contents/Resources/runtime/cli/bin/dsh——它带应用自己的 pnpm
# 和 manageDesktopProfile 特权。所以 `--profile desktop` 先启动一次桌面端
# 初始化 profile 并完全退出，再按 --desktop-cli -> PATH 上的 dsh ->
# /usr/local/bin/dsh -> /Applications、~/Applications 里的应用包依次找候选，
# 用只读的 `plugin --profile desktop list` 确认哪条能用，然后调
#   <桌面端 dsh> plugin --profile desktop add file:<内容仓>/tavern-preset
# 一条都确认不了就回退到打印可粘进桌面端会话的 plugin_manager 指引。
# web 等 profile 流程不受影响。
#
# 用法: bash install.sh [--profile <名>] [--dir <路径>] [--repo <url>]
#                       [--no-pull] [--verify] [--remove] [--dry-run]
#                       [--desktop-cli <路径>] [--prompt]

set -euo pipefail

REPO_URL="https://github.com/ai4rpg/tavern-content.git"
REPO_WEB="https://github.com/ai4rpg/tavern-content"
PRESET_PKG="@ai4rpg/dsh-tavern-preset"

PROFILE=web
CONTENT_DIR=""
MODE=install   # install | remove
NO_PULL=0
VERIFY=0
DRY_RUN=0
DESKTOP_CLI=""      # 桌面端自带 dsh 的显式路径（别名/未进 PATH 时用）
DESKTOP_PROMPT=0    # 强制只打印 plugin_manager 指引（桌面端会话里装）

say() { printf '%s\n' "$*"; }
fatal() { say "✗ $*" >&2; exit 1; }
need_arg() { say "参数 $1 需要一个值（--help 查看用法）" >&2; exit 1; }
run() { if [ "$DRY_RUN" = 1 ]; then say "  [dry-run] $*"; return 0; else "$@"; fi; }

usage() {
  cat <<'EOF'
用法: bash install.sh [--profile <名>] [--dir <路径>] [--repo <url>]
                      [--no-pull] [--verify] [--remove] [--dry-run]

  --profile <名>   dsh profile 名（默认 web —— Web UI 启动用的就是这个）。
                   填 desktop 进入桌面端模式：优先用桌面端自带的 dsh 安装
                   （它才有管理 desktop profile 的特权），找不到就打印一段
                   可粘进桌面端会话的 plugin_manager 指引
  --dir <路径>     tavern-content 内容仓落点（默认 ~/tavern-content；
                   已存在则 git pull 更新；也可用环境变量 TAVERN_CONTENT_ROOT）
  --repo <url>     内容仓地址（默认官方仓，可指向 fork / 镜像）
  --no-pull        已有检出时不拉取更新
  --verify         安装后校验 tavern 层已挂载（普通 profile 用 --dump-config；
                   桌面端 profile 改用 profile 清单里的 dsh.profile.bundles）
  --remove         卸载预设包（保留本地内容仓；桌面端模式用桌面端 dsh 卸载）
  --dry-run        只打印将要执行的命令，不做任何更改
  --desktop-cli <路径>
                   桌面端自带 dsh 的位置（如 macOS 应用包里的
                   ".../Contents/Resources/runtime/cli/bin/dsh"）；默认依次找
                   --desktop-cli、PATH 与 /usr/local/bin 上的 dsh、
                   /Applications 与 ~/Applications 里的应用包
  --prompt         桌面端模式下不调 dsh，只打印安装路径与文档指路

环境变量: TAVERN_CONTENT_ROOT 同 --dir；DSH_CMD 覆盖 dsh 命令；
DSH_HOME 覆盖 Harness 家目录（默认 ~/.dsh，桌面端 profile 在其 profiles/ 下）。
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --profile) [ $# -ge 2 ] || need_arg "$1"; PROFILE="$2"; shift 2 ;;
    --dir)     [ $# -ge 2 ] || need_arg "$1"; CONTENT_DIR="$2"; shift 2 ;;
    --repo)    [ $# -ge 2 ] || need_arg "$1"; REPO_URL="$2"; REPO_WEB="${2%.git}"; shift 2 ;;
    --no-pull) NO_PULL=1; shift ;;
    --verify)  VERIFY=1; shift ;;
    --remove)  MODE=remove; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --desktop-cli) [ $# -ge 2 ] || need_arg "$1"; DESKTOP_CLI="$2"; shift 2 ;;
    --prompt)  DESKTOP_PROMPT=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fatal "未知参数: $1（--help 查看用法）" ;;
  esac
done

# ---- profile 名归一化：desktop 是应用独占 profile -------------------------
# 独立（npm 装的）dsh CLI 对 desktop 一律拒绝（启动、dump、plugin 三条路径
# 都是）；能管它的是桌面端自带的 dsh —— 应用菜单「管理 dsh 命令…」注册到
# /usr/local/bin 的那个，或应用包里的 Contents/Resources/runtime/cli/bin/dsh，
# 它带应用自己的 pnpm 与 manageDesktopProfile 特权。所以桌面端模式按
# --desktop-cli -> PATH 上的 dsh -> /usr/local/bin/dsh -> /Applications、
# ~/Applications 里的应用包依次找候选，再用只读的 `plugin --profile
# desktop list` 确认哪条能用；一条都确认不了就只打印安装路径与文档指路。

PROFILE_LC="$(printf '%s' "$PROFILE" | tr '[:upper:]' '[:lower:]')"
if [ "$PROFILE_LC" = desktop ]; then DESKTOP=1; else DESKTOP=0; fi
DESKTOP_DSH=()
DESKTOP_PROMPT_MODE=0
if [ "$DESKTOP" = 1 ] && [ "$DESKTOP_PROMPT" = 1 ]; then DESKTOP_PROMPT_MODE=1; fi

# Harness 家目录与桌面端 profile：与宿主同一条解析（DSH_HOME → ~/.dsh）。
dsh_home() {
  if [ -n "${DSH_HOME:-}" ]; then printf '%s' "$DSH_HOME"; else printf '%s' "$HOME/.dsh"; fi
}
DESKTOP_PROFILE_DIR="$(dsh_home)/profiles/desktop"

desktop_profile_ready() { [ -f "$DESKTOP_PROFILE_DIR/package.json" ]; }

# 还没初始化就没法用 CLI 装：那条 dsh 拒绝为用户凭空造一个 desktop profile。
desktop_needs_first_run() {
  say "  桌面端 profile 尚未初始化: $DESKTOP_PROFILE_DIR"
  say "  先启动一次桌面端（它会建立自己的 profile），完全退出（含系统托盘）后再运行本脚本。"
  exit 1
}
if [ "$DESKTOP" = 1 ] && [ "$DESKTOP_PROMPT_MODE" = 0 ]; then
  desktop_profile_ready || desktop_needs_first_run
fi

# 桌面端自带的 dsh 固定在 <应用>.app/Contents/Resources/runtime/cli/bin/dsh；
# 应用装在哪由用户自选（dmg 不自动安装）——应用自己认的已安装位置是
# /Applications、~/Applications 等 NSApplicationDirectory 目录（Electron 的
# isInApplicationsFolder()），菜单「管理 dsh 命令…」注册的落点是
# /usr/local/bin/dsh。候选依次收：--desktop-cli（可能是别名/包装脚本，原样收）、
# PATH 上的 dsh、/usr/local/bin/dsh、应用目录里的应用包（只收存在的路径）。
DESKTOP_DSH_CANDIDATES=()
DESKTOP_CANDIDATES_SEEN=""

desktop_add_candidate() {
  local candidate="$1"
  [ -n "$candidate" ] || return 0
  case "$DESKTOP_CANDIDATES_SEEN" in
    *"|$candidate|"*) return 0 ;;
  esac
  DESKTOP_CANDIDATES_SEEN="$DESKTOP_CANDIDATES_SEEN|$candidate|"
  DESKTOP_DSH_CANDIDATES+=("$candidate")
  return 0
}

desktop_collect_candidates() {
  local candidate
  if [ -n "$DESKTOP_CLI" ]; then desktop_add_candidate "$DESKTOP_CLI"; fi
  candidate="$(command -v dsh 2>/dev/null || true)"
  if [ -n "$candidate" ]; then desktop_add_candidate "$candidate"; fi
  for candidate in \
    /usr/local/bin/dsh \
    "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
    "$HOME/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
  do
    if [ -e "$candidate" ]; then desktop_add_candidate "$candidate"; fi
  done
  return 0
}

# 探测一条候选 dsh：普通 dsh 会在启动前就拒绝 desktop profile，不会碰
# profile；桌面端 dsh 则真的执行 pnpm list。读操作，不改动任何东西。
desktop_carrier_works() {
  local rc=0
  "$1" plugin --profile desktop list >/dev/null 2>&1 || rc=$?
  [ "$rc" -eq 0 ]
}

# 选出能用的载体：--prompt 时不收集不探测；dry-run 只取第一个候选（不改动
# 任何东西）；全失败就回退到只打印指引。
if [ "$DESKTOP" = 1 ] && [ "$DESKTOP_PROMPT_MODE" = 0 ]; then
  desktop_collect_candidates
  if [ "$DRY_RUN" = 1 ]; then
    if [ "${#DESKTOP_DSH_CANDIDATES[@]}" -gt 0 ]; then
      DESKTOP_DSH=("${DESKTOP_DSH_CANDIDATES[0]}")
    else
      DESKTOP_PROMPT_MODE=1
    fi
  else
    if [ "${#DESKTOP_DSH_CANDIDATES[@]}" -gt 0 ]; then
      for candidate in "${DESKTOP_DSH_CANDIDATES[@]}"; do
        if desktop_carrier_works "$candidate"; then DESKTOP_DSH=("$candidate"); break; fi
      done
    fi
    if [ "${#DESKTOP_DSH[@]}" -eq 0 ]; then DESKTOP_PROMPT_MODE=1; fi
  fi
fi

# 安装方式与逐条排错写在内容仓的文档里，脚本只指路：桌面端有三条路
# （应用自带的 dsh、侧边栏 Plugins 页、cordis 会话里的 plugin_manager）。
desktop_doc_url() { say "  ${REPO_WEB}/blob/main/tavern-preset/docs/install-guide.zh.md"; }

# 桌面端 dsh 不可用：说明原因并指向文档。
desktop_carrier_unavailable() {
  say "  未找到能管理 desktop profile 的 dsh：已找过 --desktop-cli、PATH 上的 dsh、"
  say "  /usr/local/bin/dsh，以及 /Applications、~/Applications 里的应用包。独立"
  say "  （npm 装的）dsh 对 desktop 一律拒绝，只有桌面端自带的命令能管它。"
  say "  安装方法（三条路，含 --desktop-cli 指向应用包内启动器）："
  desktop_doc_url
}

# ---- dsh 命令解析 ---------------------------------------------------------

if [ -n "${DSH_CMD:-}" ]; then
  read -r -a DSH <<< "$DSH_CMD"
elif command -v dsh >/dev/null 2>&1; then
  DSH=(dsh)
else
  DSH=(npx -y @deepseek-ai/dsh)
fi

# ---- 卸载模式 -------------------------------------------------------------

if [ "$MODE" = remove ]; then
  if [ "$DESKTOP" = 1 ]; then
    say "==> 卸载 $PRESET_PKG（桌面端 profile: desktop）"
    if [ "$DESKTOP_PROMPT_MODE" = 1 ]; then
      say "  不调 dsh：在桌面端会话里用 plugin_manager，或在侧边栏 Plugins 页卸载 $PRESET_PKG。"
      say "  （--prompt，或没找到桌面端自带的 dsh 时如此。）"
      say "  方法见:"
      desktop_doc_url
      say "  本地内容仓保留在原处，确认不需要可手动删除。"
      exit 0
    fi
    if [ "$DRY_RUN" = 1 ]; then
      say "  [dry-run] ${DESKTOP_DSH[*]} plugin --profile desktop list   # 探测：这条 dsh 是不是桌面端自带的那条"
    fi
    say "  用桌面端自带的 dsh 卸载（它带应用自己的 pnpm 与 desktop profile 特权）"
    if ! run "${DESKTOP_DSH[@]}" plugin --profile desktop remove "$PRESET_PKG"; then
      say "  未检出旧安装（或移除报错见上）"
    fi
    if [ "$DRY_RUN" = 1 ]; then
      say ""
      say "（dry-run 结束：以上命令均未执行）"
      exit 0
    fi
    say ""
    say "已卸载。注意："
    say "  - 在 tavern-standard 上跑过的会话将无法恢复（预设 id 是恢复契约）；如需回头，重新运行本脚本安装。"
    say "  - 完全退出并重开桌面端后生效。"
    say "  - 本地内容仓保留在原处，确认不需要可手动删除。"
    exit 0
  fi
  say "==> 卸载 $PRESET_PKG（profile: $PROFILE）"
  if ! run "${DSH[@]}" plugin --profile "$PROFILE" remove "$PRESET_PKG"; then
    say "  未检出旧安装（或移除报错见上）"
  fi
  if [ "$DRY_RUN" = 1 ]; then
    say ""
    say "（dry-run 结束：以上命令均未执行）"
    exit 0
  fi
  say ""
  say "已卸载。注意："
  say "  - 在 tavern-standard 上跑过的会话将无法恢复（预设 id 是恢复契约）；如需回头，重新运行本脚本安装。"
  say "  - 本地内容仓保留在原处，确认不需要可手动删除。"
  exit 0
fi

# ---- 内容仓落点 -----------------------------------------------------------
# 优先级：--dir > 脚本自身所在检出 > $TAVERN_CONTENT_ROOT > ~/tavern-content

if [ -z "$CONTENT_DIR" ] && [ -n "${BASH_SOURCE[0]:-}" ]; then
  SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || SELF_DIR=""
  if [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/tavern-preset/package.json" ]; then
    CONTENT_DIR="$SELF_DIR"
    say "==> 检测到脚本位于 tavern-content 检出内，直接使用: $CONTENT_DIR"
  fi
fi
if [ -z "$CONTENT_DIR" ]; then
  CONTENT_DIR="${TAVERN_CONTENT_ROOT:-$HOME/tavern-content}"
fi
case "$CONTENT_DIR" in
  /*) ;;
  *) CONTENT_DIR="$PWD/$CONTENT_DIR" ;;
esac

PRESET_DIR="$CONTENT_DIR/tavern-preset"
AGENTS_DIR="$CONTENT_DIR/tavern-agents"

# ---- 1/3 前置检查 ---------------------------------------------------------

say "==> 1/3 前置检查"
if [ "$DESKTOP" = 1 ]; then
  # 桌面端模式一律不需要本机的 node / pnpm：桌面端自带的 dsh 用应用打包的
  # pnpm，plugin_manager 路线则完全在应用内完成。
  say "  桌面端模式：本机不需要 dsh CLI 与 pnpm，包操作由桌面端自带的 pnpm 完成"
  if command -v node >/dev/null 2>&1; then
    say "  （本机 node $(node --version)；桌面端不依赖它）"
  fi
  if [ "$DESKTOP_PROMPT_MODE" = 1 ]; then
    if [ "$DESKTOP_PROMPT" = 1 ]; then
      say "  --prompt：不调 dsh，桌面端里的安装路径见下（profile: $DESKTOP_PROFILE_DIR）"
    else
      desktop_carrier_unavailable
    fi
  elif [ "$DRY_RUN" = 1 ]; then
    say "  [dry-run] ${DESKTOP_DSH[*]} plugin --profile desktop list   # 探测：这条 dsh 是不是桌面端自带的那条"
  else
    say "  已确认桌面端自带的 dsh 可管理 desktop profile: ${DESKTOP_DSH[*]}"
    say "  （装之前请完全退出桌面端，装完再打开；应用运行中它会等 profile 写锁）"
  fi
else
  HAS_NODE=0
  if command -v node >/dev/null 2>&1; then HAS_NODE=1; fi
  HAS_PNPM=0
  if command -v pnpm >/dev/null 2>&1; then HAS_PNPM=1; fi
  if [ "$HAS_NODE" = 0 ] && [ "$DRY_RUN" = 0 ]; then
    fatal "缺少 node —— 预设包要求 node ^22.19 || >=24（https://nodejs.org）"
  fi
  if [ "$HAS_PNPM" = 0 ] && [ "$DRY_RUN" = 0 ]; then
    fatal "缺少 pnpm —— dsh plugin 转发到 pnpm 安装（npm install -g pnpm，或启用 corepack）"
  fi
  if [ "$HAS_NODE" = 1 ]; then
    NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [ "$NODE_MAJOR" -lt 22 ]; then
      say "  ⚠ node $NODE_MAJOR 偏旧：预设包要求 ^22.19 || >=24，继续但可能安装失败"
    fi
  fi
  if [ "$DRY_RUN" = 1 ]; then
    say "  [dry-run] 正式运行会检查 node / pnpm；将使用: ${DSH[*]}"
  else
    say "  node $(node --version) / pnpm $(pnpm --version 2>/dev/null || echo '?') / dsh: ${DSH[*]}"
  fi
fi

# ---- 2/3 获取内容仓 -------------------------------------------------------

say "==> 2/3 内容仓 tavern-content"
if [ -f "$PRESET_DIR/package.json" ]; then
  if [ "$NO_PULL" = 1 ]; then
    say "  已有检出（--no-pull 跳过更新）: $CONTENT_DIR"
  elif [ -d "$CONTENT_DIR/.git" ]; then
    if [ "$DRY_RUN" = 1 ]; then
      say "  [dry-run] git -C $CONTENT_DIR pull --ff-only"
    elif run git -C "$CONTENT_DIR" pull --ff-only; then
      say "  已拉取最新内容"
    else
      say "  ⚠ git pull 未成功（本地可能有未提交改动）——沿用现有内容继续"
    fi
  else
    say "  已有内容（tarball 下载，无 git 元数据，跳过更新）: $CONTENT_DIR"
    say "    需要更新时删除该目录后重跑本脚本"
  fi
elif [ -e "$CONTENT_DIR" ] && [ -n "$(ls -A "$CONTENT_DIR" 2>/dev/null)" ]; then
  fatal "目录已存在且不是 tavern-content 检出: $CONTENT_DIR（--dir 换个位置，或清空后重跑）"
elif command -v git >/dev/null 2>&1; then
  say "  git clone --depth 1 $REPO_URL -> $CONTENT_DIR"
  run git clone --depth 1 "$REPO_URL" "$CONTENT_DIR" || fatal "git clone 失败（网络 / 地址见上；--repo 可指向 fork 或镜像）"
elif command -v curl >/dev/null 2>&1 && command -v tar >/dev/null 2>&1; then
  say "  未发现 git —— 回退 curl + tar 下载 tarball: $REPO_WEB/archive/HEAD.tar.gz"
  if [ "$DRY_RUN" = 1 ]; then
    say "  [dry-run] curl -fsSL '$REPO_WEB/archive/HEAD.tar.gz' | tar -xz -C <临时目录>"
    say "  [dry-run] 解压出的 tavern-content-* 移动到 $CONTENT_DIR"
  else
    TMP="$(mktemp -d)"
    curl -fsSL "$REPO_WEB/archive/HEAD.tar.gz" | tar -xz -C "$TMP"
    SRC="$(find "$TMP" -maxdepth 1 -type d -name 'tavern-content-*' | head -n 1)"
    if [ -z "$SRC" ]; then rm -rf "$TMP"; fatal "tarball 解压结果异常"; fi
    if [ -d "$CONTENT_DIR" ]; then rmdir "$CONTENT_DIR"; fi
    mkdir -p "$(dirname "$CONTENT_DIR")"
    mv "$SRC" "$CONTENT_DIR"
    rm -rf "$TMP"
    say "  已下载并解压到 $CONTENT_DIR（无 git 元数据；更新需删除后重跑）"
  fi
else
  fatal "需要 git（或 curl + tar）从 GitHub 下载 tavern-content"
fi

if [ "$DRY_RUN" = 0 ]; then
  [ -f "$PRESET_DIR/package.json" ] || fatal "找不到预设包: $PRESET_DIR（内容仓不完整？删除 $CONTENT_DIR 后重跑）"
  [ -f "$AGENTS_DIR/package.json" ] || fatal "找不到子代理人格包: $AGENTS_DIR（预设包的 file:../tavern-agents 依赖需要同检出内的 tavern-agents/ 目录）"
fi

# ---- 3/3 安装（桌面端有可用载体 = 同一流程；否则 = 打印指引） --------------

if [ "$DESKTOP" = 1 ] && [ "$DESKTOP_PROMPT_MODE" = 1 ]; then
  say "==> 3/3 桌面端安装路径（本脚本不动桌面端 profile）"
  say "  安装要用的本地目录规格是:"
  say "    file:$PRESET_DIR"
  say "  在桌面端里安装（三条路，任选其一）:"
  say "    - 侧边栏 Plugins 页：粘贴上面的绝对路径"
  say "    - 会话里的 plugin_manager：会话要用 cordis 预设，该工具默认关闭"
  say "    - 应用自带的 dsh：重跑本脚本会优先用它（没自动找到时用 --desktop-cli 指向"
  say "      应用包里的 Contents/Resources/runtime/cli/bin/dsh）"
  say "  方法、生效与排错见:"
  desktop_doc_url
  say ""
  say "  内容仓: $CONTENT_DIR"
  say "  卸载 = bash install.sh --profile desktop --remove"
  exit 0
fi

if [ "$DESKTOP" = 1 ]; then
  say "==> 3/3 用桌面端自带的 dsh 安装预设包（profile: desktop）"
  say "  （@ai4rpg/dsh-tavern-stages 等插件是它的 npm 依赖，自动从 registry 带入）"
  if ! run "${DESKTOP_DSH[@]}" plugin --profile desktop remove "$PRESET_PKG"; then
    say "  未检出旧安装（或移除报错见上），继续安装"
  fi
  if ! run "${DESKTOP_DSH[@]}" plugin --profile desktop add "file:$PRESET_DIR"; then
    say "✗ 预设包安装失败（pnpm 报错见上）。" >&2
    say "  确认桌面端已完全退出（应用运行中会等 profile 写锁）；内存不足时可重试：" >&2
    say "  NODE_OPTIONS=--max-old-space-size=6144 bash install.sh --profile desktop" >&2
    exit 1
  fi
else
  say "==> 3/3 安装预设包到 profile: $PROFILE"
  say "  （@ai4rpg/dsh-tavern-stages 等插件是它的 npm 依赖，自动从 registry 带入）"
  if ! run "${DSH[@]}" plugin --profile "$PROFILE" remove "$PRESET_PKG"; then
    say "  未检出旧安装（或移除报错见上），继续安装"
  fi
  if ! run "${DSH[@]}" plugin --profile "$PROFILE" add "file:$PRESET_DIR"; then
    say "✗ 预设包安装失败（pnpm 报错见上）。" >&2
    say "  内存不足时可重试：NODE_OPTIONS=--max-old-space-size=6144 bash install.sh" >&2
    exit 1
  fi
fi

# ---- 校验（--verify） ------------------------------------------------------

if [ "$VERIFY" = 1 ]; then
  say ""
  if [ "$DESKTOP" = 1 ]; then
    # desktop profile 不能 --dump-config（那条路径同样被独立 CLI 拒绝），
    # 改成直接读 profile 清单里的 bundle 选择。
    say "==> 校验（profile 清单：$DESKTOP_PROFILE_DIR/package.json）"
    if [ "$DRY_RUN" = 1 ]; then
      say "  [dry-run] 读 profile 清单，确认 $PRESET_PKG 已装、且列进 dsh.profile.bundles"
    elif command -v node >/dev/null 2>&1; then
      DESKTOP_PRESET_DIR="$PRESET_DIR"
      if node -e '
        const fs = require("node:fs");
        const [file, dir, name] = process.argv.slice(1);
        let m;
        try { m = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.error("  ✗ 读不了 profile 清单: " + e.message); process.exit(1); }
        const deps = m.dependencies ?? {};
        const installed = Object.keys(deps).includes(name)
          || Object.values(deps).some(v => typeof v === "string" && v.replace(/^file:/, "").replace(/\/+$/, "").endsWith(dir.replace(/\/+$/, "")));
        const bundles = m.dsh?.profile?.bundles ?? [];
        const selected = bundles.includes(name)
          || bundles.some(v => typeof v === "string" && v.replace(/^file:/, "").replace(/\/+$/, "").endsWith(dir.replace(/\/+$/, "")));
        console.log("  已装依赖: " + (installed ? "是" : "否") + " / 已列进 dsh.profile.bundles: " + (selected ? "是" : "否"));
        process.exit(installed && selected ? 0 : 1);
      ' "$DESKTOP_PROFILE_DIR/package.json" "$DESKTOP_PRESET_DIR" "$PRESET_PKG"; then
        say "  ✓ 预设包已装并已选进 profile（完全退出并重开桌面端后生效）"
      else
        fatal "profile 清单里没确认到预设包 —— 安装可能未生效（上方输出可供排错）"
      fi
    elif grep -Fq "$PRESET_DIR" "$DESKTOP_PROFILE_DIR/package.json" 2>/dev/null; then
      say "  ✓ profile 清单里记着 $PRESET_DIR（无 node，只做了路径核对）"
    else
      fatal "profile 清单里没出现 $PRESET_DIR —— 安装可能未生效（上方输出可供排错）"
    fi
  else
    say "==> 校验（--dump-config）"
    if [ "$DRY_RUN" = 1 ]; then
      say "  [dry-run] ${DSH[*]} --profile $PROFILE --dump-config | grep -nE 'preset-tavern-standard|dsh-tavern-preset|ui-sidebar-stage'"
    elif "${DSH[@]}" --profile "$PROFILE" --dump-config | grep -nE 'preset-tavern-standard|dsh-tavern-preset|ui-sidebar-stage'; then
      say "  ✓ tavern 层已在 profile 组合中出现"
    else
      fatal "dump 里没找到 tavern 层 —— 安装可能未生效（上方输出可供排错）"
    fi
  fi
fi

if [ "$DRY_RUN" = 1 ]; then
  say ""
  say "（dry-run 结束：以上命令均未执行）"
  exit 0
fi

say ""
if [ "$DESKTOP" = 1 ]; then
  say "安装完成。接下来："
  say "  1. 完全退出并重开桌面端（含系统托盘）"
  say "  2. 新建会话，Preset 选 \"Tavern Cards\"，把工作目录指向卡片项目文件夹"
  say "  3. 侧边栏应出现阶段 tab"
  if [ "$VERIFY" = 0 ]; then
    say "  4. （可选）校验安装: grep -F '$PRESET_PKG' $DESKTOP_PROFILE_DIR/package.json"
  fi
  say ""
  say "  内容仓: $CONTENT_DIR"
  say "  升级 = 重跑本脚本（自动 git pull + 用桌面端 dsh 重装）"
  say "  卸载 = bash install.sh --profile desktop --remove"
  exit 0
fi

say "安装完成。接下来："
say "  1. ${DSH[*]} web   启动 Web UI，到 Settings → Providers 配置 API key"
say "  2. 新建会话，Preset 选 \"Tavern Cards\"，把工作目录指向卡片项目文件夹"
if [ "$VERIFY" = 0 ]; then
  say "  3. （可选）校验安装: ${DSH[*]} --profile $PROFILE --dump-config | grep -nE 'preset-tavern-standard|ui-sidebar-stage'"
fi
say ""
say "  内容仓: $CONTENT_DIR"
say "  升级 = 重跑本脚本（自动 git pull + 重装预设包）"
say "  卸载 = bash install.sh --remove（或 ${DSH[*]} plugin --profile $PROFILE remove $PRESET_PKG）"
