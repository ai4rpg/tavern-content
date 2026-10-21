# @ai4rpg/dsh-tavern-preset

DeepSeek Harness（dsh）上 [tavern-cards](https://github.com/ai4rpg/tavern-cards) 工作流的 **agent 预设**。

[English](README.md) | 中文

安装本包是获得 tavern 工作流的正常方式：它声明一个预设 `tavern-standard`，组合了

- [`@ai4rpg/dsh-tavern-stages`](https://www.npmjs.com/package/@ai4rpg/dsh-tavern-stages) —— 阶段配置、项目工作区工具（`tavern_forge`、焦点追踪、完成判定），以及为四个委派行与子预设提供人格正文的生成期加载器；
- [`@ai4rpg/dsh-stage-switch`](https://www.npmjs.com/package/@ai4rpg/dsh-stage-switch) —— 这些阶段运行的阶段机；
- 三个 tavern 技能 `tavern-design`、`tavern-cards`、`tavern-ui` —— 随本包的 `skills/` 目录交付（CC BY-NC-SA，见[许可](#许可)）；
- 一份写作向 persona 散文覆盖；
- 四个内部子预设 `tavern-child-*` —— 每个委派代理一个，各自携带该代理的 persona 与收窄的工具集；
- [`@ai4rpg/dsh-ui-sidebar-stage`](https://www.npmjs.com/package/@ai4rpg/dsh-ui-sidebar-stage) —— 右侧栏的 stage 标签页（宿主平面行，不是预设行）。

tavern 上下文是**按会话**的：完整工作流只在 `tavern-standard` 的会话里加载；其它预设的会话没有阶段指令与 `goto_stage`/`tavern_forge` 工具。`tavern-child-*` 内部子预设只用于委派——它们携带子代理的 persona、收窄工具与该子代理需要的技能，但没有阶段或 forge 面。预设选择由 DSH 的 Web UI 提供。

## 安装

```sh
dsh plugin --profile <name> add file:<本检出的绝对路径>
```

本包是本地检出，不是 npm 包；拉进来的插件（`@ai4rpg/dsh-tavern-stages`）发 npm。安装命令指向磁盘上的文件夹；路径必须是绝对路径（`dsh plugin` 拒绝相对 spec），安装的目标就是本检出目录本身。

官方桌面端（Electron 客户端）用的是应用独占的 `desktop` profile，独立安装的 `dsh` 管不了它。在应用内安装：用客户端自带的 `dsh`（菜单**管理 dsh 命令…**会把它注册到 PATH）跑上面那条命令，或把同样的路径填进侧边栏**插件**页的安装框。也可以在检出里跑 `bash install.sh --profile desktop`，脚本会准备检出并替你跑那条自带的 `dsh`。

**完整步骤见 `docs/install-guide.zh.md`**：命令行 profile 见「安装」与「校验」，桌面端见「官方桌面端」（一条命令脚本、`plugin_manager` 备用路、排错）。

## 预设包含什么

补丁插入一条声明，其 `plugins` 列表**就是**官方 `standard` 组合，只有下面这些改动，因此升级基座会带着预设一起走：

| 改动 | 作用 |
|---|---|
| persona 行替换为 `persona.yml` | 只换写作向散文；机制沿用基座的（模板保持 `complete` 与 `includeRuntimeContext` 未设），所以 plan-mode 段与运行时上下文照常渲染。 |
| `skill-filesystem` 行加 `customSkillDirs` | 一个按 loader 的 `baseUrl` 解析的 `!!js` 表达式指向本包自己的 `skills/` 目录，官方技能 catalog 因此暴露三个 tavern 技能。 |
| 追加 `tavern` 组 | 一个 `cordis:group`，带 `isolate: { stage: true }`（`stage` 服务不得泄漏进根域）：stage-switch 行（config = 插件包的 `tavernCardsStageConfig` + `language: zh`）、tavern-stages 行，以及插件每个 `agents/*.md` 一行 `tool-subagent-*`。 |
| 追加四个 `tavern-child-*` 预设 | 每个委派行通过 `agentPreset` 选中其中一个；子预设的 persona 就是该代理正文，插件列表是该代理收窄后的工具集（不含 stage、委派与规划行）。 |

组的委派行由插件的 `loadTavernAgents()` 生成，因此工具与人格不会漂移。每一行都绑定官方 `spawn` provider（`provider: spawn`）并声明子预设（`agentPreset: tavern-child-<agent>`）；行上不写 `persona` 与 `toolFilter`，0.2.1 对两者都会报错——身份与工具只存在于子预设里。

**四个 `Tavern child · *` 预设是内部子预设。** 宿主没有 hidden 字段，所以它们会出现在预设选择器里；它们只用于让委派行组合出子代理，不要给用户会话选用。`check-agent` 子预设是只读的（`tool-fs` 关闭 `write` 与 `edit`）；只有 `conversion-agent` 子预设带 shell 工具（`bash` / `pwsh`），供它的校验脚本使用。

**委派是异步的。** 委派工具立即返回 `{ kind: 'activation', subagentId }`，子代理的最终答案稍后以父级的完成通知送达。依赖结果的步骤要等完成通知，不要从工具返回值里取答案。子预设带 `skill` 工具，需要 tavern 参考文档的子代理会按需加载；返回的 `resourceBase.path` 就是 `references/` 的目录基。

补丁还会在宿主平面激活 stage 侧栏标签页。该标签页不能搭预设的车：浏览器 module roster 只扫主 Loader 树，而预设行住在另一棵树里。它是被动 UI（不注入提示词 section，不注册工具）。

**预设是快照。** 在 Web 编辑器里编辑它会整份替换其 `plugins` 列表，之后升级本包或插件都影响不到那份已编辑的副本；要拿到改动，需重新生成或重新应用预设。预设 id `tavern-standard` 是一份 resume 契约：会话记录它，它消失即拒绝恢复。

## 定制

### 按工具的模型与推理力度

四个委派工具继承父会话的模型路由与（未覆盖时）推理力度；生成行保持 `agentOptions` 未设，因为不同模型接受的力度值不同，强制 `max` 可能让部分模型报错。路由、力度与 `maxTokens` 是每个 `tool-subagent-*` 行的原生 `AgentOptions`。要按工具固定模型或强制力度，编辑你部署的补丁里的对应行（已安装的 `cordis.patch.yml`，或你自己的补丁层）：

```yaml
    - id: tool-subagent-check-agent
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: spawn
        toolName: check-agent
        agentPreset: tavern-child-check-agent
        maxDepth: provider-managed
        agentOptions:
          model: deepseek-chat          # 按工具固定模型路由（可选）
          # reasoningEffort: high        # max | high | medium | low（可选）
          # maxTokens: 8192             # （可选）
```

改 `agentPreset` 即换子代理的人格与工具面；这个 id 是 resume 契约，除非你拥有记录它的会话，否则请保留随包的 `tavern-child-*` id。预设是快照：重装或重新生成（`npm run gen`）会恢复随包行；持久改动请放在你自己的补丁层。

### 关闭子代理工具

删除或停用声明里 `tavern` 组的四个 `tool-subagent-*` 行。插件没有运行时开关，阶段与 forge 功能不受影响；四个子预设可以保留声明——父会话不会绑定它们，委派子会话使用其委派行选中的那一个。

## 要求

- dsh `0.2.1-rc.2` 版本线（Web profile 用 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`）；本包通过 `engines.dsh`（`>=0.2.1-rc.2 <0.3.0-0`）声明这一点。
- Node `^22.19 || >=24`（skill 目录的 `!!js` 表达式用了 `process.getBuiltinModule`）。

## 开发

```sh
npm run gen     # 从基座 + persona.yml + 插件导出重新生成 cordis.patch.yml
npm test        # 产物等式 + 真实 Loader 组合 + 技能发现
npm run typecheck
```

| 路径 | 是什么 |
|---|---|
| `cordis.patch.yml` | **生成物，已提交。** 与 `scripts/gen-preset.mjs` 漂移时 `tests/preset.spec.ts` 失败。 |
| `persona.yml` | 预设的 persona 行——该散文的唯一可编辑事实源。 |
| `stage-display.json` | 阶段的中文别名与 stage-switch 评审语言；由 `gen-preset.mjs` 读取。 |
| `skills/` | 三个技能体的 DSH 版（每次 forge 调用都写成 `tavern_forge({ command, args })` 调用形）。由 `scripts/sync-skills.mjs` 从上游同步。 |
| `scripts/gen-preset.mjs` | 派生生成器（基座 patch + persona + 插件导出 + 阶段显示元数据）。 |
| `scripts/sync-skills.mjs` | 上游技能同步（`TAVERN_CARDS_ROOT` 须指向 [tavern-cards](https://github.com/ai4rpg/tavern-cards) 检出）。 |

`@ai4rpg/dsh-tavern-stages` 发 npm，普通 `npm install` 从 registry 解析。要测试插件本地改动，改用本地检出链接：`npm install --no-save <tavern-stages 检出路径>`；目录安装让插件从自己的 `node_modules` 解析 `@deepseek-ai/*` 依赖树。链接后的插件也会从它自己的检出解析人格包，所以从链接插件生成时请运行 `TAVERN_AGENTS_ROOT=\"$PWD/../tavern-agents\" npm run gen`；否则 `loadTavernAgents()` 会退化为 `[]`，生成结果会缺少子预设。人格源是本检出里的 devDependency（`file:../tavern-agents`），只供 `npm run gen` 使用；安装后的预设不加载它——生成的子预设已内嵌四份人格正文。

## 许可

仓库代码是 MIT（`LICENSE.md`）。`skills/` 下的三个技能体同步自 [ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards)，按 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.en) 授权（署名-非商业-相同方式共享）；见 `skills/LICENSE.md`。
