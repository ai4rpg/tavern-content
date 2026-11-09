// Generator-only upstream input. No package lookup or implicit sibling checkout.
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parseDocument } from 'yaml'

/** Child preset ids are persisted; the four existing personas cannot disappear. */
export const REQUIRED_AGENTS = ['check-agent', 'conversion-agent', 'first-message-agent', 'schema-agent']

/**
 * Read one approved upstream snapshot, validate it before generation, and keep
 * the body bytes (apart from line-ending normalization/leading blank lines)
 * identical to the previous loader. Frontmatter is data, never prompt text.
 * @param {string | undefined} sourceRoot TAVERN_CARDS_ROOT, containing agents/.
 * @returns {Promise<{name: string, description: string, body: string}[]>}
 */
export async function loadAgents(sourceRoot = process.env.TAVERN_CARDS_ROOT) {
  if (typeof sourceRoot !== 'string' || !sourceRoot.trim()) {
    throw new Error('TAVERN_CARDS_ROOT is required — point it at an approved tavern-cards main snapshot')
  }
  const agentsDir = join(sourceRoot, 'agents')
  const entries = await readdir(agentsDir, { withFileTypes: true }).catch(error => {
    throw new Error(`Cannot read upstream agents directory: ${agentsDir}`, { cause: error })
  })
  const files = entries.filter(entry => entry.name.endsWith('.md') && entry.name !== 'LICENSE.md')
    .sort((a, b) => a.name.localeCompare(b.name))
  if (!files.length) throw new Error(`Upstream agents directory is empty: ${agentsDir}`)
  const agents = []
  for (const entry of files) {
    if (!entry.isFile()) throw new Error(`Upstream agent must be a regular file: ${entry.name}`)
    const text = (await readFile(join(agentsDir, entry.name), 'utf8')).replace(/\r\n/g, '\n')
    const match = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(text)
    if (!match) throw new Error(`${entry.name}: missing YAML frontmatter (--- ... ---)`)
    const document = parseDocument(match[1], { uniqueKeys: true })
    const issue = document.errors[0] ?? document.warnings[0]
    if (issue) throw new Error(`${entry.name}: invalid YAML frontmatter: ${issue.message}`)
    const fields = document.toJS({ maxAliasCount: 0 })
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)
      || Object.keys(fields).sort().join(',') !== 'description,name') {
      throw new Error(`${entry.name}: frontmatter must have exactly name + description`)
    }
    const name = entry.name.slice(0, -3)
    if (!/^[a-z][a-z0-9-]*$/.test(name) || fields.name !== name) {
      throw new Error(`${entry.name}: frontmatter name must match the file stem`)
    }
    if (typeof fields.description !== 'string' || !fields.description.trim()) {
      throw new Error(`${entry.name}: description must be a non-empty string`)
    }
    const body = match[2].replace(/^\n+/, '')
    if (!body.trim()) throw new Error(`${entry.name}: body is empty`)
    if (body.includes('{{')) throw new Error(`${entry.name}: body contains "{{" — dsh prompt interpolation would reject it`)
    agents.push({ name, description: fields.description, body })
  }
  const missing = REQUIRED_AGENTS.filter(name => !agents.some(agent => agent.name === name))
  if (missing.length) throw new Error(`Upstream is missing required agents: ${missing.join(', ')}`)
  return agents
}
