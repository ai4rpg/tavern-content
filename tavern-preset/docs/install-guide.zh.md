# Tavern Cards 预设安装指南

[English](install-guide.md) | 中文

`@ai4rpg/dsh-tavern-preset` 是 DeepSeek Harness（dsh）上 tavern 卡牌工作流的 **agent 预设包**：一份声明式预设 `tavern-standard`，把阶段机、项目工具、三个 tavern 技能与具名子代理委派工具组合在一起。装进 profile 只需一条命令；本指南说明这条命令带来什么、如何校验、首次运行的冒烟清单，以及如何升级或卸载。

## 本包装了什么

| 组成 | 说明 |
|---|---|
| `preset-tavern-standard` | 预设声明：一行 `@deepseek-ai/dsh-agent-preset`，`config.id: tavern-standard`、roster `order: 5`、`Tavern Cards` 展示元数据（单语；语言在生成包时确定）。会话在预设选择器里选用它。 |
| `ui-sidebar-stage` 行 | 阶段侧边栏 tab，挂在宿主层。它是被动 UI：不注入提示词、不注册工具。 |
| `@ai4rpg/dsh-tavern-stages`（依赖） | 插件：`dsh-stage-switch` 的阶段配置、带焦点追踪与完成判定的 `tavern_forge` 项目工具，以及四个具名子代理 provider（`tavern:check-agent` 等）。 |
| `@ai4rpg/dsh-stage-switch`（依赖） | 阶段机（`route → design → planning → content → ui`）、`goto_stage`、`/stage` 命令与评审弹窗。 |
| `@ai4rpg/dsh-ui-sidebar-stage`（依赖） | 侧边栏 tab 背后的浏览器模块。 |
| `skills/` 与 `persona.yml`（本包自带） | 三个 tavern 技能体（`tavern-design`、`tavern-cards`、`tavern-ui`）与写作向 persona 散文。预设的 `skill-filesystem` 行通过 `customSkillDirs` 暴露这些技能。 |

预设里其余部分就是官方 `standard` 组合（文件工具、搜索、jobs、plan mode、compaction、delegation、web 等）：`tavern-standard` 等于那份组合追加 tavern 组、并替换 persona 散文。

## 前置要求

- `dsh` 在 `0.2` 线上——已安装的 CLI，或一个 dsh 源码检出（在检出里用 `pnpm dsh …` 调启动器）。profile 组合 `dsh-base` + `dsh-web-app`，预设各行解析所需的 session、工具、技能、子代理、token-meter 与 `session-projection` 服务由它们提供。
- Node.js `^22.19 || >=24`，且 `pnpm` 在 `PATH` 上：`dsh plugin` 会转发给 pnpm（`npm install -g pnpm`，或启用 corepack）。官方桌面端例外——它用应用自带的 pnpm 与 dsh 安装，本机两样都可以没有。
- 能访问 npm registry——首条命令会把 dsh 自己的依赖树拉进 profile。
- 本预设包是**本地检出，不是 npm 包**：安装命令指向克隆的内容仓里的预设文件夹。它拉进的插件（`@ai4rpg/dsh-tavern-stages`）从 npm 作为依赖到达；人格内容包（`@ai4rpg/tavern-agents`）搭本包自己对同级目录的 `file:` 依赖的车。
- 一个模型 provider 与 API key，在 Web UI 的 **Settings → Providers** 里配置好再开第一个会话。

## 安装

```sh
dsh plugin --profile web add file:<tavern-content 克隆里 tavern-preset 的绝对路径>
```

在 dsh 源码检出里，给启动器加前缀：`pnpm dsh plugin --profile web add file:<绝对路径>`。

- 路径必须是绝对路径：`dsh plugin` 拒绝相对 spec，shell 也不会在 `file:` 后展开 `~`。本预设包是本地检出，不是 npm 包；它拉进的插件（`@ai4rpg/dsh-tavern-stages`）作为普通依赖从 npm 到达。人格内容包在克隆的仓内自行解析：本包的 `file:../tavern-agents` 依赖指向同级目录。
- `web` 是 Web UI 启动的 profile；想装到别处就把名字换掉。尚不存在的 profile 会在首次使用时按随附模板创建。
- 该命令用 pnpm 安装本包、把它选进 `dsh.profile.bundles` 的 bundle 层，并把它的依赖解析进 profile。正是这份解析让预设的各行得以加载（`@ai4rpg/dsh-stage-switch`、`@ai4rpg/dsh-tavern-stages`、四个 `@deepseek-ai/dsh-tool-subagent` 行），也让 `tavern_forge` 背后的 `tavern-cards-forge` 落在工具找得到的位置。
- `@ai4rpg/dsh-tavern-stages` 作为依赖到达，无需手动 add；本包是唯一安装路径。
- 想让新会话默认用 tavern 预设，在 `settings.yaml` 或 Web 设置页里设 `agent-presets.default: tavern-standard`；这是用户侧选择。

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

桌面端右侧栏的 **Plugins** 页管的就是当前 profile。安装框接受本地目录的绝对路径（也可以写 `file:` 前缀），把 `<克隆>/tavern-preset` 的绝对路径填进去即可。这条路不需要终端，也不需要任何 PATH 上的命令。

### 3. 会话里的 plugin_manager

也可以让桌面端会话里的 agent 用宿主内置的 `plugin_manager` 装，target 同样是本地目录规格 `file:<克隆>/tavern-preset`。**这条路有前提：会话要用 `cordis` 预设**——`plugin_manager` 在 `dsh-base` 与 `dsh-web-app` 层都是关闭的，只有 `cordis` 预设的会话带它；`Tavern Cards` 会话不带，所以它不能自己给自己装。已经是 `Tavern Cards` 会话时，先新建一个 `cordis` 预设的会话再操作。

### 升级、卸载与自检

- 升级：把内容仓拉到最新（`git -C <克隆> pull`），再用上面的任意一条路重装一次同一个来源。
- 卸载：把 `add` 换成 `remove @ai4rpg/dsh-tavern-preset` 再执行一次；或 `bash install.sh --profile desktop --remove`。
- 自检：桌面 profile 的 `package.json` 里，`dependencies` 应有 `@ai4rpg/dsh-tavern-preset`（本地目录装出来的是 `file:` 规格），`dsh.profile.bundles` 应列出 `@ai4rpg/dsh-tavern-preset`。
- 生效：完全退出并重开桌面端后，新会话的预设选择器里出现 **Tavern Cards**，右侧栏出现阶段 tab。
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
   - 四个委派工具在场：`check-agent`、`conversion-agent`、`first-message-agent`、`schema-agent`。
   - 右侧栏出现阶段 tab（在其它预设的会话里它显示空态）。
   - 当会话有了聚焦的卡牌项目、且当前阶段的交付物读作完成时，运行时上下文里出现 `Current stage policy:` 一行。该信号基于文件、由观察驱动：空 workspace 不渲染，走 `bash` 的文件写入也绕过该信号；项目文件请用受追踪的编辑工具（`write` / `edit`）写。
4. 阶段流程为 `route → design → planning → content → ui`；完整切换会把交接文档写到 `<会话工作区>/handoff/<会话 id>/<阶段>.md`，而轻切换（低于配置的 `minHandoffTokens`）不写任何文件。

完整的分层回归提示词（从会话隔离到端到端工作流）见 [testing-prompts.md](testing-prompts.md)。

## 评审弹窗语言

随包预设在其 `stage-switch` 行声明 `language: zh`，所以 `goto_stage` 评审弹窗开箱即中文。这个选择活在组合里，安装后无需再改。

想要英文，就把该字段改成 `en`（改你运行的那份预设）。由于这一行位于预设声明内部，改动属于你自己组合的那份副本：用自己的 bundle 覆盖 `preset-tavern-standard` 行，或编辑已安装的 `cordis.patch.yml`。请**替换**该文件而不是原地编辑（pnpm 对已安装文件做硬链接）；并注意重装或升级会把它恢复成 `zh`。

## 隔离

tavern 上下文按会话生效。只有从 `tavern-standard` 启动的会话才会拿到阶段提示、`goto_stage` / `tavern_forge`、tavern 技能与四个委派工具。其它预设的会话，以及同一台机器上的其它 profile，保持无 tavern。侧边栏 tab 是唯一共享的部分：它挂在宿主层（浏览器模块名册只扫宿主树），且是被动 UI（不注入提示词、不注册工具）；非 tavern 会话显示它的空态。

## 升级与卸载

**升级。** 把检出推进（`git pull`）后重跑安装命令；profile 会从文件夹重装：

```sh
dsh plugin --profile web add file:<tavern-content 克隆里 tavern-preset 的绝对路径>
```

检出就是版本，没有版本号可写。若 lockfile 保留了先前装的副本，先 `remove` 再 `add`。新会话使用新版本；运行中的会话保留它启动时的 revision。

**预设是快照。** `tavern-standard` 是官方 `standard` 组合追加 tavern 组，在生成该包时定稿。改动它（无论走 Web UI 的预设入口，Creator mode 按行 id 覆盖 `preset-tavern-standard`，还是编辑已安装的 patch）都会**整体替换** `plugins` 列表；之后升级插件或预设包都影响不到那份改过的副本。改过之后想拿到上游变更，请重装本包，或在新版本之上重新施加你的改动。

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
| 四个委派工具缺失 | 同上，先查会话的预设；若确实在 `tavern-standard` 上，说明 tavern 组挂载失败；读会话创建时给出的诊断。 |
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
