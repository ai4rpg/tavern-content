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
# 用法: bash install.sh [--profile <名>] [--dir <路径>] [--repo <url>]
#                       [--no-pull] [--verify] [--remove] [--dry-run]

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

say() { printf '%s\n' "$*"; }
fatal() { say "✗ $*" >&2; exit 1; }
need_arg() { say "参数 $1 需要一个值（--help 查看用法）" >&2; exit 1; }
run() { if [ "$DRY_RUN" = 1 ]; then say "  [dry-run] $*"; return 0; else "$@"; fi; }

usage() {
  cat <<'EOF'
用法: bash install.sh [--profile <名>] [--dir <路径>] [--repo <url>]
                      [--no-pull] [--verify] [--remove] [--dry-run]

  --profile <名>   dsh profile 名（默认 web —— Web UI 启动用的就是这个）
  --dir <路径>     tavern-content 内容仓落点（默认 ~/tavern-content；
                   已存在则 git pull 更新；也可用环境变量 TAVERN_CONTENT_ROOT）
  --repo <url>     内容仓地址（默认官方仓，可指向 fork / 镜像）
  --no-pull        已有检出时不拉取更新
  --verify         安装后用 --dump-config 校验 tavern 层已挂载
  --remove         卸载预设包（保留本地内容仓）
  --dry-run        只打印将要执行的命令，不做任何更改

环境变量: TAVERN_CONTENT_ROOT 同 --dir；DSH_CMD 覆盖 dsh 命令
（默认依次找 dsh → npx -y @deepseek-ai/dsh）。
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
    -h|--help) usage; exit 0 ;;
    *) fatal "未知参数: $1（--help 查看用法）" ;;
  esac
done

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
  say "==> 卸载 $PRESET_PKG（profile: $PROFILE）"
  if ! run "${DSH[@]}" plugin --profile "$PROFILE" remove "$PRESET_PKG"; then
    say "  未检出旧安装（或移除报错见上）"
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
command -v node >/dev/null 2>&1 || fatal "缺少 node —— 预设包要求 node ^22.19 || >=24（https://nodejs.org）"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  say "  ⚠ node $NODE_MAJOR 偏旧：预设包要求 ^22.19 || >=24，继续但可能安装失败"
fi
command -v pnpm >/dev/null 2>&1 || fatal "缺少 pnpm —— dsh plugin 转发到 pnpm 安装（npm install -g pnpm，或启用 corepack）"
say "  node $(node --version) / pnpm $(pnpm --version 2>/dev/null || echo '?') / dsh: ${DSH[*]}"

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

# ---- 3/3 安装预设包 -------------------------------------------------------

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

# ---- 校验（--verify） ------------------------------------------------------

if [ "$VERIFY" = 1 ]; then
  say ""
  say "==> 校验（--dump-config）"
  if [ "$DRY_RUN" = 1 ]; then
    say "  [dry-run] ${DSH[*]} --profile $PROFILE --dump-config | grep -nE 'preset-tavern-standard|dsh-tavern-preset|ui-sidebar-stage'"
  elif "${DSH[@]}" --profile "$PROFILE" --dump-config | grep -nE 'preset-tavern-standard|dsh-tavern-preset|ui-sidebar-stage'; then
    say "  ✓ tavern 层已在 profile 组合中出现"
  else
    fatal "dump 里没找到 tavern 层 —— 安装可能未生效（上方输出可供排错）"
  fi
fi

say ""
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
