# tavern-content

[tavern-cards](https://github.com/ai4rpg/tavern-cards) 工作流在 DeepSeek Harness（dsh）上的内容仓：所有「内容与配置」而非插件代码的部分，一个克隆全带走。这里的包都**不发 npm**；它们组合的插件（`@ai4rpg/dsh-tavern-stages`、`@ai4rpg/dsh-stage-switch` 等）作为预设包的依赖从 npm 安装。

[English](README.md) | 中文

- `tavern-preset/` —— `@ai4rpg/dsh-tavern-preset`，agent 预设包：声明式 `tavern-standard` 预设、三个 tavern 技能、persona 散文、宿主平面侧边栏行。**安装入口**——见 [`tavern-preset/docs/install-guide.zh.md`](tavern-preset/docs/install-guide.zh.md)。
- `tavern-agents/` —— `@ai4rpg/tavern-agents`，四个具名子代理人格（CC BY-NC-SA）；作为预设包的生成期 devDependency，其正文被内嵌进生成补丁，而不是装进 profile。

## 安装

把本节内容交给你的 agent，让它照做即可。自己动手也没问题，下面每条命令都是复制粘贴级的。部署目标有两种：`web` 之类的命令行 profile，以及官方桌面端（Electron 客户端）独占的 `desktop` profile。

| 目标 profile | 安装 |
|---|---|
| `web` 及同类（命令行启动） | `bash install.sh --profile web --verify`：脚本把本仓下载到 `~/tavern-content`（已有检出则改为拉取更新），再把预设包装进该 profile，tavern 插件作为依赖从 npm 到达。Windows 改用 `powershell -ExecutionPolicy Bypass -File install.ps1` |
| 官方桌面端（`desktop`） | 在应用内安装：用应用自带的 `dsh`（菜单**管理 dsh 命令…**会把它注册到 PATH）跑 `dsh plugin --profile desktop add file:<克隆目录>/tavern-preset`，或把同样的路径填进侧边栏**插件**页的安装框。终端里的 `bash install.sh --profile desktop` 也是同一条路，脚本准备好检出后替你跑那条自带的 `dsh` |

桌面端装完后完全退出再重开：新建会话时预设选择器里出现 **Tavern Cards**，就是装好了。桌面端什么都不用在本机装，dsh、node、pnpm 都随应用自带；命令行 profile 只需要 dsh 本身。

逐条步骤、装好后的验证、升级与卸载、排错都写在 [`tavern-preset/docs/install-guide.zh.md`](tavern-preset/docs/install-guide.zh.md)：桌面端见「官方桌面端」一节，命令行 profile 见「安装」与「校验」两节。装了什么、怎么定制，见 [`tavern-preset/README.zh.md`](tavern-preset/README.zh.md)。

重跑脚本即升级（拉取更新并重装）；`--remove` 卸载预设包并保留本地检出。全部参数见脚本头部注释。

手动安装（不使用脚本）：

```sh
git clone https://github.com/ai4rpg/tavern-content
dsh plugin --profile web add file:<克隆目录的绝对路径>/tavern-preset
```

## 许可

按包区分：`tavern-preset` 的代码部分 MIT、`skills/` 技能体 CC BY-NC-SA 4.0（见其 [`LICENSE.md`](tavern-preset/LICENSE.md)）；`tavern-agents` 整体 CC BY-NC-SA 4.0（见其 [`LICENSE.md`](tavern-agents/LICENSE.md)）。
