# tavern-content

[tavern-cards](https://github.com/ai4rpg/tavern-cards) 工作流在 DeepSeek Harness（dsh）上的内容仓：所有「内容与配置」而非插件代码的部分，一个克隆全带走。这里的包都**不发 npm**；它们组合的插件（`@ai4rpg/dsh-tavern-stages`、`@ai4rpg/dsh-stage-switch` 等）作为预设包的依赖从 npm 安装。

[English](README.md) | 中文

- `tavern-preset/` —— `@ai4rpg/dsh-tavern-preset`，agent 预设包：声明式 `tavern-standard` 预设、三个 tavern 技能、persona 散文、宿主平面侧边栏行。**安装入口**——见 [`tavern-preset/docs/install-guide.zh.md`](tavern-preset/docs/install-guide.zh.md)。
- `tavern-agents/` —— `@ai4rpg/tavern-agents`，四个具名子代理人格（CC BY-NC-SA），经预设包的 `file:` 依赖带进 profile。

## 安装

安装脚本把下面的手动流程自动化：脚本把本仓下载到 `~/tavern-content`（已有检出则改为拉取更新），然后把预设包装进 dsh profile，tavern 插件作为其依赖从 npm 一并到达。

```sh
curl -fsSL https://raw.githubusercontent.com/ai4rpg/tavern-content/main/install.sh -o install.sh
bash install.sh --profile web --verify
```

Windows 用同样方式取回 `install.ps1`，以 `powershell -ExecutionPolicy Bypass -File install.ps1` 运行。在已有检出内可直接运行 `bash install.sh`。重跑脚本即升级（拉取更新并重装）；`--remove` 卸载预设包并保留本地检出。全部参数见脚本头部注释。

手动安装：

```sh
git clone https://github.com/ai4rpg/tavern-content
dsh plugin --profile web add file:<克隆目录的绝对路径>/tavern-preset
```

## 许可

按包区分：`tavern-preset` 的代码部分 MIT、`skills/` 技能体 CC BY-NC-SA 4.0（见其 [`LICENSE.md`](tavern-preset/LICENSE.md)）；`tavern-agents` 整体 CC BY-NC-SA 4.0（见其 [`LICENSE.md`](tavern-agents/LICENSE.md)）。
