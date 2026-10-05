# @ai4rpg/tavern-agents

[English](README.md) | 中文

四个 tavern 具名子代理人格（`check-agent`、`conversion-agent`、`schema-agent`、`first-message-agent`），以纯 markdown 文件形式存放，同步自上游 [ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards)。

`@ai4rpg/dsh-tavern-stages` 经自己的依赖图解析本包，读取 `agents/*.md`，并为每个 persona 注册一个 `tavern:<name>` 子代理 provider（frontmatter 的 `description` 成为绑定工具的描述）。预设包的生成器用同一来源为每个 persona 声明一行 `tool-subagent`，因此工具行与已注册的 provider 不会漂移。

## 目录契约

- `agents/*.md`：一人格一文件，YAML frontmatter 只含 `name`（须与文件名一致）与 `description`，其下为正文。正文为上游同步产物，本仓不作修改；措辞改动请去上游。
- `agents/LICENSE.md`：目录许可声明，每次同步重新生成；它不是人格。

## 命令

- `npm run sync`：清空并从上游重建 `agents/`（`TAVERN_CARDS_ROOT` 须指向你的 [tavern-cards](https://github.com/ai4rpg/tavern-cards) 检出；无默认值），随后校验 frontmatter/正文契约。
- `npm test`：同一契约加布局守卫（当前四个人格都在；插件解析所用的包名未变）。

## 新增、改名、删除人格

新增人格是安全的：插件会注册一个没有绑定工具行的 provider。改名或删除是破坏性变更，因为预设的 `tool-subagent-*` 行按名绑定、会悬空。此类改动需与预设重新生成协同。

## 许可

CC BY-NC-SA 4.0（见 `LICENSE.md`）。
