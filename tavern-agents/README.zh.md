# @ai4rpg/tavern-agents

[English](README.md) | 中文

四个 tavern 具名子代理人格（`check-agent`、`conversion-agent`、`schema-agent`、`first-message-agent`），以纯 markdown 文件形式存放，同步自上游 [ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards)。

`@ai4rpg/dsh-tavern-stages` 提供本包所用的 `loadTavernAgents()` 加载器。预设生成器在开发期消费它：读取 `agents/*.md`，把每个 persona 的正文与 frontmatter `description` 内嵌为 `cordis.patch.yml` 里的 `tavern-child-*` 子预设。安装后的预设不在运行时加载本包；生成补丁就是运行期副本。本包是预设包的生成期 devDependency，不是运行时依赖。

## 目录契约

- `agents/*.md`：一人格一文件，YAML frontmatter 只含 `name`（须与文件名一致）与 `description`，其下为正文。正文为上游同步产物，本仓不作修改；措辞改动请去上游。
- `agents/LICENSE.md`：目录许可声明，每次同步重新生成；它不是人格。

## 命令

- `npm run sync`：清空并从上游重建 `agents/`（`TAVERN_CARDS_ROOT` 须指向你的 [tavern-cards](https://github.com/ai4rpg/tavern-cards) 检出；无默认值），随后校验 frontmatter/正文契约。
- `npm test`：同一契约加布局守卫（当前四个人格都在；生成器解析所用的包名未变）。

## 新增、改名、删除人格

新增人格对源包是安全的，但生成的预设要跑过 `npm run gen` 才会获得对应的委派行与子预设。改名或删除是破坏性变更，因为已有 `tavern-child-*` id 会被会话记录、`tool-subagent-*` 行按名绑定。此类改动需与预设重新生成协同，并对旧会话保留稳定 id。

## 许可

CC BY-NC-SA 4.0（见 `LICENSE.md`）。
