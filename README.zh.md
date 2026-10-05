# tavern-content

[tavern-cards](https://github.com/ai4rpg/tavern-cards) 工作流在 DeepSeek Harness（dsh）上的内容仓：所有「内容与配置」而非插件代码的部分，一个克隆全带走。这里的包都**不发 npm**；它们组合的插件（`@ai4rpg/dsh-tavern-stages`、`@ai4rpg/dsh-stage-switch` 等）作为预设包的依赖从 npm 安装。

[English](README.md) | 中文

- `tavern-preset/` —— `@ai4rpg/dsh-tavern-preset`，agent 预设包：声明式 `tavern-standard` 预设、三个 tavern 技能、persona 散文、宿主平面侧边栏行。**安装入口**——见 [`tavern-preset/docs/install-guide.zh.md`](tavern-preset/docs/install-guide.zh.md)。
- `tavern-agents/` —— `@ai4rpg/tavern-agents`，四个具名子代理人格（CC BY-NC-SA），经预设包的 `file:` 依赖带进 profile。

## 安装

克隆本仓，然后：

```sh
git clone https://github.com/ai4rpg/tavern-content
dsh plugin --profile web add file:<克隆目录的绝对路径>/tavern-preset
```

## 许可

按包区分：`tavern-preset` 的代码部分 MIT、`skills/` 技能体 CC BY-NC-SA 4.0（见其 [`LICENSE.md`](tavern-preset/LICENSE.md)）；`tavern-agents` 整体 CC BY-NC-SA 4.0（见其 [`LICENSE.md`](tavern-agents/LICENSE.md)）。
