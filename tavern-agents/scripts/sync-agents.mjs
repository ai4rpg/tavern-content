#!/usr/bin/env node
// Sync the agent personas from the upstream tavern-cards repository into
// `agents/`: the named-subagent persona bodies that @ai4rpg/dsh-tavern-stages
// reads at runtime (it resolves this package and registers one
// `tavern:<name>` provider per `agents/*.md`).
//
// The personas are CC BY-NC-SA content — so is the whole package. The
// directory license notice is rewritten on every sync because the tree is
// wiped and rebuilt; license changes go here, not into the tree.
//
// The three tavern skills are distribution content of the preset package
// (@ai4rpg/dsh-tavern-preset): their sync — including the DSH rewrite of
// forge CLI references into `tavern_forge({ command, args })` calls — lives
// in that package's `scripts/sync-skills.mjs`. The two syncs never touch
// each other's output.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAgents } from './validate-agents.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = process.env.TAVERN_CARDS_ROOT
if (sourceRoot === undefined) {
  console.error('TAVERN_CARDS_ROOT is not set — point it at a checkout of github.com/ai4rpg/tavern-cards')
  process.exit(1)
}
const agentsRoot = join(root, 'agents')

/**
 * License notice for the synced agent tree, written into `agents/LICENSE.md`
 * on every run because the tree is wiped and rebuilt — a hand-added file
 * would be lost on the next run. License changes go here, not into the tree.
 */
const agentsLicenseMd = `# License — agents/

Copyright (c) 2026 ai4rpg

本目录（\`*.md\` 子代理人格正文）同步自
[github.com/ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards)，
整体按
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh)
授权，与本包根目录 \`LICENSE.md\` 的许可一致：

- **署名（BY）**：使用或再分发时须保留本版权与协议链接，并对修改之处作出说明；
- **非商业（NC）**：不得将本目录内容或其衍生作品用于商业性目的；
- **相同方式共享（SA）**：对本目录内容的改编再分发时，须以 CC BY-NC-SA 4.0
  （或其后版本的相同条款）提供。

完整法律文本见 <https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode>。

> 本文件由 \`scripts/sync-agents.mjs\` 在每次同步时生成；如需调整许可条款，
> 请修改该脚本，手改本文件会在下次同步时被覆盖。
`

await rm(agentsRoot, { recursive: true, force: true })
await mkdir(agentsRoot, { recursive: true })

const agentsFrom = join(sourceRoot, 'agents')
if (!existsSync(agentsFrom)) {
  console.error(`error: upstream agents directory not found: ${agentsFrom}`)
  process.exitCode = 1
} else {
  await cp(agentsFrom, agentsRoot, { recursive: true, force: true })
  console.log('synced agent personas')

  const violations = await validateAgents(agentsRoot)
  for (const { file, message } of violations) {
    console.error(`error: agents/${file}: ${message}`)
  }
  if (violations.length > 0) process.exitCode = 1

  await writeFile(join(agentsRoot, 'LICENSE.md'), agentsLicenseMd)
}
