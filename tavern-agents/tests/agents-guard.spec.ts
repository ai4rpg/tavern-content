import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateAgents } from '../scripts/validate-agents.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const agentsDir = join(repoRoot, 'agents')

describe('tavern agents content package', () => {
  it('every agent file satisfies the frontmatter + body contract', async () => {
    const violations = await validateAgents(agentsDir)
    expect(violations).toEqual([])
  })

  it('keeps the layout the preset generator depends on', async () => {
    // The tavern-preset generator resolves this package's package.json through
    // `loadTavernAgents()` and reads `<package>/agents/*.md` (LICENSE.md is
    // skipped by name), embedding one persona per child preset. The four
    // current personas are the ones the generated `tool-subagent-*` rows bind
    // to: adding a persona is fine, removing or renaming one is not — it would
    // leave those rows dangling and orphan recorded child-session ids.
    const packageJson = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')) as { name: string }
    expect(packageJson.name).toBe('@ai4rpg/tavern-agents')

    const entries = await readdir(agentsDir, { withFileTypes: true })
    const personas = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'LICENSE.md')
      .map(entry => entry.name.slice(0, -3))
      .sort()
    expect(personas).toEqual(expect.arrayContaining([
      'check-agent',
      'conversion-agent',
      'first-message-agent',
      'schema-agent',
    ]))
    expect(entries.some(entry => entry.name === 'LICENSE.md')).toBe(true)
  })
})
