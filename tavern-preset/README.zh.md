# @ai4rpg/dsh-tavern-preset

DeepSeek Harness（dsh）上 [tavern-cards](https://github.com/ai4rpg/tavern-cards) 工作流的 **agent 预设**。

[English](README.md) | 中文

安装本包是获得 tavern 工作流的正常方式：它声明一个预设 `tavern-standard`，组合了

- [`@ai4rpg/dsh-tavern-stages`](https://www.npmjs.com/package/@ai4rpg/dsh-tavern-stages) —— 阶段配置、项目工作区工具（`tavern_forge`、焦点追踪、完成判定），以及四个具名子代理 provider；
- [`@ai4rpg/dsh-stage-switch`](https://www.npmjs.com/package/@ai4rpg/dsh-stage-switch) —— 这些阶段运行的阶段机；
- 三个 tavern 技能 `tavern-design`、`tavern-cards`、`tavern-ui` —— 随本包的 `skills/` 目录交付（CC BY-NC-SA，见[许可](#许可)）；
- 一份写作向 persona 散文覆盖；
- [`@ai4rpg/dsh-ui-sidebar-stage`](https://www.npmjs.com/package/@ai4rpg/dsh-ui-sidebar-stage) —— 右侧栏的 stage 标签（宿主平面行，不是预设行）。

tavern 上下文是**按会话**的：只在本预设上创建的会话里加载，选其它预设的会话保持无 tavern 状态（没有阶段指令、`goto_stage`/`tavern_forge` 工具与 tavern 技能）。预设选择由 DSH 的 Web UI 提供。

## 安装

```sh
dsh plugin --profile <name> add file:<本检出的绝对路径>
```

本包是本地检出，不是 npm 包；它拉进来的插件（`@ai4rpg/dsh-tavern-stages`）发 npm。安装命令指向磁盘上的文件夹；路径必须是绝对路径（`dsh plugin` 拒绝相对 spec）。完整配方见 `docs/install-guide.zh.md`。

核对 profile 组合：

```sh
dsh --profile <name> --dump-config | grep -n 'tavern-preset\|preset-tavern-standard\|ui-sidebar-stage'
```

dump 里应出现 `# == @ai4rpg/dsh-tavern-preset` 层、`preset-tavern-standard` 声明行与一行已激活的 `ui-sidebar-stage`。然后启动 profile，在新会话的预设 chip 里选 **Tavern Cards**（空白会话仍可切换）。想让 tavern 成为新会话默认，在 `settings.yaml` / Web 设置页设 `agent-presets.default: tavern-standard`；那是用户侧选择。

前置条件：0.2 版本线的 dsh profile（`dsh-base` / `dsh-web-app` 组合会话、工具、技能、子代理、token-meter 与 session-projection 这些服务，预设各行从它们解析）。无需额外安装步骤：profile 的 pnpm 安装会装好本包的依赖，预设各行按包名解析它们。

## 预设包含什么

补丁插入一条声明，其 `plugins` 列表**就是**官方 `standard` 组合，只有三处改动，因此升级基座会带着预设一起走：

| 改动 | 作用 |
|---|---|
| persona 行替换为 `persona.yml` | 只换写作向散文；机制沿用基座的（模板保持 `complete` 与 `includeRuntimeContext` 未设），所以 plan-mode 段与运行时上下文照常渲染，子代理仍继承完整宿主提示。 |
| `skill-filesystem` 行加 `customSkillDirs` | 一个按 loader 的 `baseUrl` 解析的 `!!js` 表达式指向本包自己的 `skills/` 目录，官方技能 catalog 因此暴露三个 tavern 技能。 |
| 追加 `tavern` 组 | 一个 `cordis:group`，带 `isolate: { stage: true }`（`stage` 服务不得泄漏进根域）：stage-switch 行（config = 插件包的 `tavernCardsStageConfig` + `language: zh`）、tavern-stages 行（`subagents.enabled: true`），以及插件每个 `agents/*.md` 一行 `tool-subagent-*`。 |

组的委派行由插件的 `loadTavernAgents()` 生成，因此工具与它们绑定的 provider 不会漂移。这些行上 `persona` 保持不设：agent 正文前置到子代理的首条 prompt，而 persona section 会覆盖宿主 persona。

补丁还会在宿主平面激活 stage 侧栏标签。该标签不能搭预设的车：浏览器 module roster 只扫主 Loader 树，而预设行住在另一棵树里。它是被动 UI（不注入提示词 section，不注册工具）。

**预设是快照。** 在 Web 编辑器里编辑它会整份替换其 `plugins` 列表，之后升级本包或插件都影响不到那份已编辑的副本；要拿到改动，需重新生成或重新应用预设。预设 id `tavern-standard` 是一份 resume 契约：会话记录它，它消失即拒绝恢复。

## 定制

### 按工具的模型与推理力度

四个委派工具继承会话的模型路由与（默认）连接级推理力度；生成行保持 `agentOptions` 未设，因为不同模型接受的力度值不同，强制 `max` 可能让部分模型报错。路由、力度与 `maxTokens` 是每个 `tool-subagent-*` 行的原生 `AgentOptions`。要按工具固定模型或强制力度，编辑你部署的补丁里的对应行（已安装的 `cordis.patch.yml`，或你自己的补丁层）：

```yaml
    - id: tool-subagent-check-agent
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: tavern:check-agent
        toolName: check-agent
        enableRunInBackground: false
        backgroundMode: one-shot
        maxDepth: provider-managed
        agentOptions:
          model: deepseek-chat          # 按工具固定模型路由（可选）
          # reasoningEffort: high        # max | high | medium | low（可选）
          # maxTokens: 8192             # （可选）
```

预设是快照：重装或重新生成（`npm run gen`）会恢复随包行；持久改动请放在你自己的补丁层。

### 关闭子代理工具

在 `@ai4rpg/dsh-tavern-stages` 行上设 `subagents.enabled: false`，四个 provider 不再注册。阶段与 forge 功能不受影响。

## 要求

- dsh `0.2.0-rc.2` 版本线（Web profile 用 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`）。
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
| `skills/` | 三个技能体的 DSH 版（每次 forge 调用都写成 `tavern_forge({ command, args })` 调用形）。由 `scripts/sync-skills.mjs` 从上游同步。 |
| `scripts/gen-preset.mjs` | 派生生成器（基座 patch + persona + 插件导出）。 |
| `scripts/sync-skills.mjs` | 上游技能同步（`TAVERN_CARDS_ROOT` 须指向 [tavern-cards](https://github.com/ai4rpg/tavern-cards) 检出）。 |

`@ai4rpg/dsh-tavern-stages` 发 npm，普通 `npm install` 从 registry 解析。要测试插件本地改动，改用本地检出链接：`npm install --no-save <tavern-stages 检出路径>`；目录安装让插件从自己的 `node_modules` 解析 `@deepseek-ai/*` 依赖树。人格包不需要链接：本包直接依赖同级目录（`file:../tavern-agents`）。

## 许可

仓库代码是 MIT（`LICENSE.md`）。`skills/` 下的三个技能体同步自 [ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards)，按 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.en) 授权（署名-非商业-相同方式共享）；见 `skills/LICENSE.md`。
