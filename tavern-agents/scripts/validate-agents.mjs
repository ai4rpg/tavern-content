// Shared validation for the agents directory.
//
// sync-agents.mjs calls `validateAgents` after copying agent files and fails
// on violations; tests/agents-guard.spec.ts imports the same function and
// asserts the violations list is empty. Keeping the logic here gives one
// source of truth for the agent-file contract.
//
// Contract:
//   - YAML frontmatter has exactly two fields: `name` and `description`.
//   - `name` matches the file stem (check-agent.md → "check-agent").
//   - The body below the frontmatter does not contain `{{`, because dsh's
//     strict prompt interpolation would treat it as a variable reference.
//     Agent bodies travel through user messages today, which bypass the
//     section/context interpolation path, but the guard keeps the contract
//     explicit in case a future change routes them through prompt assembly.

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * @typedef {{ file: string, message: string }} Violation
 */

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

/**
 * Parse the `name: <value>` line from a YAML frontmatter block.
 * Accepts both bare and double-quoted values (the agents use double quotes
 * on descriptions, bare on names, but be lenient).
 * @param {string} text
 * @returns {{ fields: Record<string, string>, body: string } | null}
 */
function parseFrontmatter(text) {
  const match = FRONTMATTER_RE.exec(text)
  if (match === null) return null
  const fields = {}
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim()
    let value = line.slice(colon + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    fields[key] = value
  }
  return { fields, body: match[2] ?? '' }
}

/**
 * Validate every `*.md` file in an agents directory (the `LICENSE.md` note
 * that ships alongside the personas is not a persona and is skipped).
 * @param {string} agentsDir - absolute or cwd-relative path to the directory.
 * @returns {Promise<Violation[]>} violations in stable (file, then message) order.
 */
export async function validateAgents(agentsDir) {
  /** @type {Violation[]} */
  const violations = []
  let entries = []
  try {
    entries = await readdir(agentsDir, { withFileTypes: true })
  } catch {
    return [{ file: agentsDir, message: 'agents directory does not exist' }]
  }
  const files = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'LICENSE.md')
    .map(entry => entry.name)
    .sort()
  for (const name of files) {
    const file = join(agentsDir, name)
    const text = await readFile(file, 'utf8')
    const parsed = parseFrontmatter(text)
    if (parsed === null) {
      violations.push({ file: name, message: 'missing YAML frontmatter (--- ... ---)' })
      continue
    }
    const { fields, body } = parsed
    const known = Object.keys(fields).sort()
    if (known.length !== 2 || known[0] !== 'description' || known[1] !== 'name') {
      violations.push({
        file: name,
        message: `frontmatter must have exactly name + description; got [${known.join(', ')}]`,
      })
    }
    const stem = name.slice(0, -3)
    if (fields.name !== stem) {
      violations.push({
        file: name,
        message: `frontmatter name "${fields.name ?? ''}" does not match file stem "${stem}"`,
      })
    }
    if ((fields.description ?? '') === '') {
      violations.push({ file: name, message: 'description is empty' })
    }
    if (body.includes('{{')) {
      const index = body.indexOf('{{')
      const snippet = body.slice(index, index + 16)
      violations.push({
        file: name,
        message: `body contains "{{" near "${snippet}…" — dsh prompt interpolation would reject it`,
      })
    }
  }
  return violations
}
