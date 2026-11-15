# Tavern Cards 预设安装指南

[English](install-guide.md) | 中文

`@ai4rpg/dsh-tavern-preset` 是 DeepSeek Harness（dsh）上 tavern 卡牌工作流的 **agent 预设包**：一份声明式预设 `tavern-standard`，把阶段机、项目工具、三个 tavern 技能与四个由内部子预设承载的委派工具组合在一起。装进 profile 只需一条命令；本指南说明这条命令带来什么、如何校验、首次运行的冒烟清单，以及如何升级或卸载。

## 本包装了什么

安装会加入声明式 `tavern-standard` 预设（官方 `standard` 组合追加 tavern 组与四个内部子预设，并替换 persona 散文）、host 层阶段侧边栏 tab，以及三个 tavern 技能。tavern 插件（`@ai4rpg/dsh-stage-switch`、`@ai4rpg/dsh-tavern-stages`、`@ai4rpg/dsh-ui-sidebar-stage`）作为依赖从 npm 到达。各部分的说明与定制入口见[预设包 README](../README.zh.md)。

## 前置要求

- `dsh` `>=0.2.2-rc.3 <0.3.0-0`——已安装的 CLI，或一个 dsh 源码检出（在检出里用 `pnpm dsh …` 调启动器）。本包通过 `engines.dsh` 声明该范围，dsh 在加载前会检查。profile 组合 `dsh-base` + `dsh-web-app`，预设各行解析所需的 session、工具、技能、子代理、token-meter 与 `session-projection` 服务由它们提供。
- Node.js `>=24.9.0`，且 `pnpm` 在 `PATH` 上：`dsh plugin` 会转发给 pnpm（`npm install -g pnpm`，或启用 corepack）。官方桌面端例外——它用应用自带的 pnpm 与 dsh 安装，本机两样都可以没有。
- 能访问 npm registry——首条命令会把 dsh 自己的依赖树拉进 profile。
- 本预设包**不是 npm 包**：可以从克隆的内容仓里的预设文件夹安装（见下），也可以装某个 tag 的 GitHub release tarball。它的 tavern 插件作为依赖从 npm 到达。生成补丁已经内嵌四份人格正文；安装不需要上游检出或人格源包。
- 一个模型 provider 与 API key，在 Web UI 的 **Settings → Providers** 里配置好再开第一个会话。

## 安装

```sh
dsh plugin --profile web add file:<tavern-content 克隆里 tavern-preset 的绝对路径>
```

在 dsh 源码检出里，给启动器加前缀：`pnpm dsh plugin --profile web add file:<绝对路径>`。

- 路径必须是绝对路径：`dsh plugin` 拒绝相对 spec，shell 也不会在 `file:` 后展开 `~`。这条路线装的是本地检出；GitHub release tarball 或 Git 安装见下一节。上游人格源只供重新生成使用，不是安装前置条件。
- `web` 是 Web UI 启动的 profile；想装到别处就把名字换掉。尚不存在的 profile 会在首次使用时按随附模板创建。
- 该命令用 pnpm 安装本包、把它选进 `dsh.profile.bundles` 的 bundle 层，并把它的依赖解析进 profile。正是这份解析让预设的各行得以加载（`@ai4rpg/dsh-stage-switch`、`@ai4rpg/dsh-tavern-stages`、四个 `@deepseek-ai/dsh-tool-subagent` 委派行与四个子预设声明），也让 `tavern_forge` 背后的 `tavern-cards-forge` 落在工具找得到的位置。
- tavern 插件无需手动 add；本包是唯一安装路径。
- `PATH` 上没有 `dsh` 时，仓库根的 `install.sh` / `install.ps1` 回退到 `npx -y @deepseek-ai/dsh@0.2.2-rc.3`；若本机已装 `dsh`，先核对 `dsh --version`——rc.1 宿主会被本预设的 `engines.dsh` 拒绝。
- 想让新会话默认用 tavern 预设，在 `settings.yaml` 或 Web 设置页里设 `agent-presets.default: tavern-standard`；这是用户侧选择。

### 从 GitHub release 安装（不用克隆）

每个 `tavern-preset-v*` tag 都会生成一个 release，附带打包好的预设与 `.sha256`。把版本换成你要的：

```sh
dsh plugin --profile web add https://github.com/ai4rpg/tavern-content/releases/download/tavern-preset-v0.3.0/ai4rpg-dsh-tavern-preset-0.3.0.tgz
```

需要的话先对照 `.sha256` 资产校验下载。安装会钉在这个 URL 上：升级时用新 release 的 URL 再执行一次。桌面端可以用自带 `dsh` 走同一个 URL。

Git 安装则指向仓库与包目录：

```sh
dsh plugin --profile web add 'git+https://github.com/ai4rpg/tavern-content.git#path:/tavern-preset'
```

fragment 不必带 commit：dsh 会装仓库的默认分支。想固定实际运行的内容，可在 `&path:` 前加 ref 或完整 commit——`#<branch>&path:/tavern-preset` 或 `#<40 位 commit>&path:/tavern-preset`。只有完整 commit 形式能被 dsh 的插件管理器跟踪更新；其它 Git 形式能装，但升级要重装。更省事的是 release tarball。

## 官方桌面端（Electron 客户端）

桌面端读的不是 `web` profile，而是应用独占的 `desktop` profile（`$DSH_HOME/profiles/desktop`）。独立（npm 装的）`dsh` CLI 对它一律拒绝，启动、`--dump-config`、`dsh plugin` 三条路径都是同一句：

`error: profile "desktop" is managed exclusively by the Electron application`

所以上面那条 `--profile web` 的命令对桌面端不适用：装进 `web` 的东西，桌面窗口读不到。桌面端有下面三条路，第一条最省事。

### 1. 应用自带的 dsh（推荐）

桌面端自带一条能管 `desktop` profile 的 CLI，用的是应用打包的 pnpm，本机不需要 node 或 pnpm：

- 在桌面端菜单**管理 dsh 命令…**里把它装到 PATH（macOS 装成 `/usr/local/bin/dsh`，Windows 注册到当前用户 PATH）；
- 或者直接用应用包里的启动器：macOS `DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`，Windows `<安装目录>\resources\runtime\cli\bin\dsh.cmd`。

先启动一次桌面端，让应用建立自己的 profile，然后**完全退出**（含 macOS 的 ⌘Q、Windows 的系统托盘；应用运行中包操作会等 profile 写锁）：

```sh
dsh plugin --profile desktop add file:<tavern-content 克隆里 tavern-preset 的绝对路径>
```

装完重开桌面端生效。仓库根的 `bash install.sh --profile desktop`（Windows 为 `powershell -ExecutionPolicy Bypass -File install.ps1 -ProfileName desktop`）会把本仓准备到落点，探测这条 dsh，然后替你执行上面两条命令；没探测到（比如你还没把应用命令装进 PATH）就用 `--desktop-cli <路径>` 指向应用包里的启动器，或走下面第二条路。

### 2. 侧边栏 Plugins 页

桌面端右侧栏的 **Plugins** 页管的就是当前 profile。安装框接受本地目录的绝对路径（也可以写 `file:` 前缀）或「从 GitHub release 安装」里的 Git 地址：填 `<克隆>/tavern-preset` 或那个 spec。这条路不需要终端，也不需要任何 PATH 上的命令。

### 3. 会话里的 plugin_manager

也可以让桌面端会话里的 agent 用宿主内置的 `plugin_manager` 装，target 同样是本地目录规格 `file:<克隆>/tavern-preset`。**这条路有前提：会话要用 `cordis` 预设**——`plugin_manager` 在 `dsh-base` 与 `dsh-web-app` 层都是关闭的，只有 `cordis` 预设的会话带它；`Tavern Cards` 会话不带，所以它不能自己给自己装。已经是 `Tavern Cards` 会话时，先新建一个 `cordis` 预设的会话再操作。

### 自检

- 自检：桌面 profile 的 `package.json` 里，`dependencies` 应有 `@ai4rpg/dsh-tavern-preset`（本地目录装出来的是 `file:` 规格；GitHub 安装记录 release URL 或 Git 规格），`dsh.profile.bundles` 应列出 `@ai4rpg/dsh-tavern-preset`。
- 生效：完全退出并重开桌面端后，新会话的预设选择器里出现 **Tavern Cards**，右侧栏出现阶段标签页。
- 不要用 `--profile web` 的命令去改桌面端，也不要手工改桌面 profile 的文件。

## 校验

```sh
dsh --profile web --dump-config | grep -nE 'tavern-preset|preset-tavern-standard|ui-sidebar-stage'
```

桌面端跳过这一节：`--dump-config` 同样被 CLI 拒绝，改看上一节的桌面端自检。

dump 会为每个来源层打印一行 `# == <层>` 注释。你应看到 `# == @ai4rpg/dsh-tavern-preset`，其后是 `preset-tavern-standard` 行（声明 `config.id: tavern-standard`）与 `ui-sidebar-stage` 行。没有该层说明这个 profile 里没装上；挂载失败的声明会留在 roster 上带诊断信息；逐字读它。

## 首次运行

```sh
dsh web        # 或：dsh --profile <名称>
```

1. 打开 http://127.0.0.1:3080，在 **Settings → Providers** 里配置 provider。
2. 新建会话，在预设选择器里选 **Tavern Cards**（空白会话仍可切换预设）。把工作目录指向你希望放卡牌项目的文件夹。
3. 在该会话里做冒烟清单：
   - 首轮携带 `route` 阶段指令；在输入框用 `/stage <名称>` 立即切换阶段（用户切换，无弹窗），模型可调用 `goto_stage`，其切换会以评审弹窗请你批准。
   - `tavern_forge` 在模型的工具列表里；输入框还提供 `/tavern-forge` 与 `/tavern-pack`。
   - `skill` 工具目录列出 `tavern-design`、`tavern-cards`、`tavern-ui`；加载其一返回技能正文与其 `references/` 文档的基目录。
   - 四个委派工具在场：`check-agent`、`conversion-agent`、`first-message-agent`、`schema-agent`。它们绑定官方 `spawn` provider 并选中内部 `tavern-child-*` 子预设；调用立即返回 activation receipt（子代理名称），子代理的答案以完成通知送达。依赖结果的后续工作等通知到达后再继续。不要给用户会话选用 `Tavern child · *` 预设。
   - 子代理的工具面是收窄的：`check-agent` 有 read/glob/grep/skill，但没有 `write`/`edit` 与 shell；只有 `conversion-agent` 带 shell 工具供其校验脚本使用。
   - 右侧栏出现阶段标签页，阶段显示中文别名（`路由`、`设计`、`规划`、`内容`、`界面`）；`/stage` 与 `goto_stage` 仍使用持久化的英文名。在其它预设的会话里它显示空态。
   - 当会话有了聚焦的卡牌项目、且当前阶段的交付物读作完成时，运行时上下文里出现 `Current stage policy:` 一行。该信号基于文件、由观察驱动：空 workspace 不渲染，走 `bash` 的文件写入也绕过该信号；项目文件请用受追踪的编辑工具（`write` / `edit`）写。
4. 阶段流程为 `route → design → planning → content → ui`；完整切换会把交接文档写到 `<会话工作区>/handoff/<会话 id>/<阶段>.md`，而轻切换（低于配置的 `minHandoffTokens`）不写任何文件。

完整的分层回归提示词（从会话隔离到端到端工作流）见 [testing-prompts.md](testing-prompts.md)。

## 评审弹窗语言

随包预设在其 `stage-switch` 行声明 `language: zh`，所以 `goto_stage` 评审弹窗开箱即中文。这个选择活在组合里，安装后无需再改。

想要英文，就把该字段改成 `en`（改你运行的那份预设）。由于这一行位于预设声明内部，改动属于你自己组合的那份副本：用自己的 bundle 覆盖 `preset-tavern-standard` 行，或编辑已安装的 `cordis.patch.yml`。请**替换**该文件而不是原地编辑（pnpm 对已安装文件做硬链接）；并注意重装或升级会把它恢复成 `zh`。

## 隔离

tavern 上下文按会话生效。从 `tavern-standard` 启动的会话会拿到阶段提示、`goto_stage` / `tavern_forge`、tavern 技能与四个委派工具。`tavern-child-*` 声明会随预设注册表急切注册。它们供委派使用：子会话绑定委派行选中的那一个，并拿到自己的 persona、工具集与该子代理需要的技能——但没有主预设的阶段或 forge 面。用户会话直接选它会缺少该面，这正是它们标注为内部预设的原因。同一台机器上的其它 profile 不在本会话的组合里。侧边栏标签页是唯一共享的部分：它挂在宿主层（浏览器模块名册只扫宿主树），且是被动 UI（不注入提示词、不注册工具）；非 tavern 会话显示它的空态。

## 升级与卸载

**升级。** 本地检出把检出推进（`git pull`）后重跑安装命令；GitHub release 安装则用新版本的 URL 再跑一次 `add`。若 lockfile 保留了先前装的副本，先 `remove` 再 `add`。新会话使用新版本；运行中的会话保留它启动时的 revision。桌面端用同样的命令，把 `--profile web` 换成 `--profile desktop`，并使用客户端自带的 `dsh`。

**预设是快照。** `tavern-standard` 是官方 `standard` 组合追加 tavern 组与四个内部子预设，在生成该包时定稿。改动它（无论走 Web UI 的预设入口，Creator mode 按行 id 覆盖 `preset-tavern-standard`，还是编辑已安装的 patch）都会**整体替换** `plugins` 列表；之后升级插件或预设包都影响不到那份改过的副本。改过之后想拿到上游变更，请重装本包，或在新版本之上重新施加你的改动。

**卸载。**

```sh
dsh plugin --profile web remove @ai4rpg/dsh-tavern-preset
```

这会把预设及其依赖从 profile 中移除。此后曾在 `tavern-standard` 上运行的会话无法再 resume（会话记录自己运行时的 preset id 并在 resume 时重新解析）；可能还想留着的会话请先收尾。

## 常见问题

| 现象 | 处理 |
|---|---|
| `dsh plugin` 报 `pnpm was not found` | `dsh plugin` 要跑 pnpm：装上它（`npm install -g pnpm`）或启用 corepack，然后重试。 |
| 安装过程内存溢出 | 加大堆后重试：`NODE_OPTIONS=--max-old-space-size=6144 dsh plugin …`。 |
| 预设选择器里没有它 | 按「校验」看 dump。没有该层说明这个 profile 里没装上；被拒绝的声明会留在 roster 上带诊断。无需重启，刷新页面即可。 |
| 会话里没有 `goto_stage` 或 `tavern_forge` | 该会话不在 `tavern-standard` 上。看会话头，新建会话时选 tavern 预设。 |
| `skill` 目录里没有 tavern 技能 | 重装本包，再确认 `node_modules/@ai4rpg/dsh-tavern-preset/skills/` 下有预设 `skill-filesystem` 行指向的那三个目录。 |
| 四个委派工具缺失 | 同上，先查会话的预设；若确实在 `tavern-standard` 上，说明 tavern 组挂载失败或 `spawn` provider 缺失；读会话创建时给出的诊断。 |
| 委派调用立刻返回一个 activation receipt（子代理名称） | 正常：dsh 0.2.2 的委派是异步的。最终答案在父级的完成通知里；等通知，不要从工具结果里取答案。 |
| 子代理没有带上人格或工具 | 检查委派行的 `agentPreset` 是否指向存在的 `tavern-child-*` id；这些 id 是 resume 契约，不要改名。 |
| `Current stage policy:` 始终不出现 | 空 workspace 与只用 `bash` 写文件时期望如此：该信号需要受追踪的文件观察。项目文件请用 `write` / `edit`。 |
| 评审弹窗语言不对 | 按上文改预设 `stage-switch` 行的 `language`（随包为 `zh`，英文用 `en`）。 |
| 升级后没有变化 | 开**新会话**（运行中的会话保留自己的 revision）；并记住改过的预设不会被合并，需重装或重新施加改动。 |
| 卸载后原 tavern 会话拒绝 resume | preset id 是 resume 契约：重装本包即可恢复该会话。 |
| `dsh plugin --profile desktop …` 报 `profile "desktop" is managed exclusively by the Electron application` | 你用的是 npm 装的独立 CLI，它改不了桌面 profile。按「官方桌面端」换应用菜单装的 `dsh`、侧边栏 Plugins 页或 `plugin_manager`。 |
| 桌面端装完界面里没出现 | 完全退出客户端（含系统托盘）再打开；并确认桌面 profile 的 `dsh.profile.bundles` 里有 `@ai4rpg/dsh-tavern-preset`。 |
| 桌面端报找不到 pnpm | 应用自带的 `dsh` 不查 PATH 上的 pnpm，它用应用打包的那份。这条报错通常说明命令跑在了本机 npm 版 `dsh` 上。 |
| 桌面端 profile 尚未初始化 | 先启动一次桌面端（它建立 `$DSH_HOME/profiles/desktop`）并完全退出，再跑安装命令或 `install.sh --profile desktop`。 |
| 会话里没有 `plugin_manager` 工具 | 它只在 `cordis` 预设的会话里启用（`dsh-base` 与 `dsh-web-app` 层都关着）。改用应用自带的 `dsh` 或 Plugins 页，或新建 `cordis` 预设会话。 |
| 装完后新会话预设选择器里仍没有 Tavern Cards | `desktop` 与 `web` 是两份独立 profile，装在哪份就只有哪份看得到；先确认装的是桌面端那一份，再完全重启客户端。 |

## 许可

仓库代码为 MIT，见 `LICENSE.md`。`skills/` 下三个技能体同步自 [ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards)，按 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 授权；见 `skills/LICENSE.md`。
