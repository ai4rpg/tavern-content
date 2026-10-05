# Tavern Cards 预设安装指南

[English](install-guide.md) | 中文

`@ai4rpg/dsh-tavern-preset` 是 DeepSeek Harness（dsh）上 tavern 卡牌工作流的 **agent 预设包**：一份声明式预设 `tavern-standard`，把阶段机、项目工具、三个 tavern 技能与具名子代理委派工具组合在一起。装进 profile 只需一条命令；本指南说明这条命令带来什么、如何校验、首次运行的冒烟清单，以及如何升级或卸载。

## 本包装了什么

| 组成 | 说明 |
|---|---|
| `preset-tavern-standard` | 预设声明：一行 `@deepseek-ai/dsh-agent-preset`，`config.id: tavern-standard`、roster `order: 5`、`Tavern Cards` 展示元数据（单语；语言在生成包时确定）。会话在预设 chip 里选用它。 |
| `ui-sidebar-stage` 行 | 阶段侧边栏 tab，挂在宿主层。它是被动 UI：不注入提示词、不注册工具。 |
| `@ai4rpg/dsh-tavern-stages`（依赖） | 插件：`dsh-stage-switch` 的阶段配置、带焦点追踪与完成判定的 `tavern_forge` 项目工具，以及四个具名子代理 provider（`tavern:check-agent` 等）。 |
| `@ai4rpg/dsh-stage-switch`（依赖） | 阶段机（`route → design → planning → content → ui`）、`goto_stage`、`/stage` 命令与评审弹窗。 |
| `@ai4rpg/dsh-ui-sidebar-stage`（依赖） | 侧边栏 tab 背后的浏览器模块。 |
| `skills/` 与 `persona.yml`（本包自带） | 三个 tavern 技能体（`tavern-design`、`tavern-cards`、`tavern-ui`）与写作向 persona 散文。预设的 `skill-filesystem` 行通过 `customSkillDirs` 暴露这些技能。 |

预设里其余部分就是官方 `standard` 组合（文件工具、搜索、jobs、plan mode、compaction、delegation、web 等）：`tavern-standard` 等于那份组合追加 tavern 组、并替换 persona 散文。

## 前置要求

- `dsh` 在 `0.2` 线上——已安装的 CLI，或一个 dsh 源码检出（在检出里用 `pnpm dsh …` 调启动器）。profile 组合 `dsh-base` + `dsh-web-app`，预设各行解析所需的 session、工具、技能、子代理、token-meter 与 `session-projection` 服务由它们提供。
- Node.js `^22.19 || >=24`，且 `pnpm` 在 `PATH` 上：`dsh plugin` 会转发给 pnpm（`npm install -g pnpm`，或启用 corepack）。
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

## 校验

```sh
dsh --profile web --dump-config | grep -nE 'tavern-preset|preset-tavern-standard|ui-sidebar-stage'
```

dump 会为每个来源层打印一行 `# == <层>` 注释。你应看到 `# == @ai4rpg/dsh-tavern-preset`，其后是 `preset-tavern-standard` 行（声明 `config.id: tavern-standard`）与 `ui-sidebar-stage` 行。没有该层说明这个 profile 里没装上；挂载失败的声明会留在 roster 上带诊断信息；逐字读它。

## 首次运行

```sh
dsh web        # 或：dsh --profile <名称>
```

1. 打开 http://127.0.0.1:3080，在 **Settings → Providers** 里配置 provider。
2. 新建会话，在预设 chip 里选 **Tavern Cards**（空白会话仍可切换预设）。把工作目录指向你希望放卡牌项目的文件夹。
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
| 预设 chip 里没有它 | 按「校验」看 dump。没有该层说明这个 profile 里没装上；被拒绝的声明会留在 roster 上带诊断。无需重启，刷新页面即可。 |
| 会话里没有 `goto_stage` 或 `tavern_forge` | 该会话不在 `tavern-standard` 上。看会话头，新建会话时选 tavern 预设。 |
| `skill` 目录里没有 tavern 技能 | 重装本包，再确认 `node_modules/@ai4rpg/dsh-tavern-preset/skills/` 下有预设 `skill-filesystem` 行指向的那三个目录。 |
| 四个委派工具缺失 | 同上，先查会话的预设；若确实在 `tavern-standard` 上，说明 tavern 组挂载失败；读会话创建时给出的诊断。 |
| `Current stage policy:` 始终不出现 | 空 workspace 与只用 `bash` 写文件时期望如此：该信号需要受追踪的文件观察。项目文件请用 `write` / `edit`。 |
| 评审弹窗语言不对 | 按上文改预设 `stage-switch` 行的 `language`（随包为 `zh`，英文用 `en`）。 |
| 升级后没有变化 | 开**新会话**（运行中的会话保留自己的 revision）；并记住改过的预设不会被合并，需重装或重新施加改动。 |
| 卸载后原 tavern 会话拒绝 resume | preset id 是 resume 契约：重装本包即可恢复该会话。 |

## 许可

仓库代码为 MIT，见 `LICENSE.md`。`skills/` 下三个技能体同步自 [ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards)，按 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 授权；见 `skills/LICENSE.md`。
