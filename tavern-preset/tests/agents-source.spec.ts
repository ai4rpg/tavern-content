import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadAgents, REQUIRED_AGENTS } from '../scripts/load-agents.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const upstream = join(root, 'tests/fixtures/agents-upstream')
const generated = join(root, 'cordis.patch.yml')
const temporary: string[] = []
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function directory() {
  const dir = mkdtempSync(join(tmpdir(), 'agents-source-'))
  temporary.push(dir)
  return dir
}
function copySource() {
  const dir = join(directory(), 'approved source 中文')
  cpSync(upstream, dir, { recursive: true })
  return dir
}
function generate(sourceRoot: string | undefined, out: string, cwd = root) {
  const env = { ...process.env }
  delete env.TAVERN_CARDS_ROOT
  delete env.TAVERN_AGENTS_ROOT
  if (sourceRoot !== undefined) env.TAVERN_CARDS_ROOT = sourceRoot
  return spawnSync(process.execPath, [join(root, 'scripts/gen-preset.mjs'), '--out', out], { cwd, env, encoding: 'utf8' })
}
function expectGenerationFailure(sourceRoot: string | undefined, message: string) {
  const out = join(directory(), 'patch.yml')
  writeFileSync(out, 'keep the existing artifact')
  const result = generate(sourceRoot, out)
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain(message)
  expect(readFileSync(out, 'utf8')).toBe('keep the existing artifact')
}

describe('explicit, validated upstream personas', () => {
  it.each([
    ['check-agent', '6478d4f583b477bb8d9885ae0d3c0342424b9e2c'],
    ['conversion-agent', '43c51dd45a6c6d813acf5bb5157b9c8794f66bf5'],
    ['first-message-agent', '412b0a61ea71eaa4ed47a7388336c9f387005126'],
    ['schema-agent', 'c2e394ea09014c3d51eeba7dbb27fe8edc1b0b41'],
  ])('keeps %s as an independent pinned upstream blob', (name, blob) => {
    const bytes = readFileSync(join(upstream, 'agents', name + '.md'))
    expect(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')).toBe(blob)
  })
  it('keeps the four persisted identities, skips LICENSE and normalizes only line endings/leading blank lines', async () => {
    const dir = copySource()
    writeFileSync(join(dir, 'agents/LICENSE.md'), 'not a persona')
    const file = join(dir, 'agents/check-agent.md')
    const input = readFileSync(file, 'utf8')
    writeFileSync(file, input.replaceAll('\n', '\r\n'))
    const agents = await loadAgents(dir)
    expect(agents.map(agent => agent.name)).toEqual(REQUIRED_AGENTS)
    expect(agents[0]!.body).toBe(input.replace(/^---\n[\s\S]*?\n---\n+/, ''))
    expect(agents.every(agent => agent.description && agent.body && !agent.body.includes('{{'))).toBe(true)
  })
  it('generates the same artifact from a relocated input and an unrelated cwd', () => {
    const dir = copySource()
    const out = join(directory(), 'patch.yml')
    const result = generate(dir, out, directory())
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(out)).toEqual(readFileSync(generated))
  })
  it.each([
    ['absent environment', undefined, 'TAVERN_CARDS_ROOT is required'],
    ['blank environment', ' ', 'TAVERN_CARDS_ROOT is required'],
    ['missing directory', 'missing', 'Cannot read upstream agents directory'],
  ] as const)('fails loudly for %s without overwriting output', (_label, source, message) => {
    expectGenerationFailure(source === 'missing' ? join(directory(), source) : source, message)
  })
  it('rejects an empty or incomplete source instead of generating missing child presets', async () => {
    const dir = directory()
    mkdirSync(join(dir, 'agents'))
    await expect(loadAgents(dir)).rejects.toThrow('empty')
    expectGenerationFailure(dir, 'empty')
    cpSync(join(upstream, 'agents/check-agent.md'), join(dir, 'agents/check-agent.md'))
    await expect(loadAgents(dir)).rejects.toThrow('missing required agents')
    expectGenerationFailure(dir, 'missing required agents')
  })
  it('rejects a directory named like a persona', async () => {
    const dir = copySource()
    const path = join(dir, 'agents/check-agent.md')
    rmSync(path)
    mkdirSync(path)
    await expect(loadAgents(dir)).rejects.toThrow('must be a regular file')
    expectGenerationFailure(dir, 'must be a regular file')
  })
  it('rejects linked persona sources rather than following them', async ({ skip }) => {
    const dir = copySource()
    const path = join(dir, 'agents/check-agent.md')
    rmSync(path)
    try {
      symlinkSync(join(upstream, 'agents/check-agent.md'), path)
    } catch (error) {
      if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        skip('Windows file-symlink permission is unavailable')
        return
      }
      throw error
    }
    await expect(loadAgents(dir)).rejects.toThrow('must be a regular file')
    expectGenerationFailure(dir, 'must be a regular file')
  })
  it.each([
    ['no frontmatter', '# check-agent\nbody', 'missing YAML frontmatter'],
    ['closing fence suffix', '---\nname: check-agent\ndescription: text\n---oops\nbody', 'missing YAML frontmatter'],
    ['long closing fence', '---\nname: check-agent\ndescription: text\n----\nbody', 'missing YAML frontmatter'],
    ['unsupported YAML tag', '---\nname: check-agent\ndescription: !unsupported text\n---\nbody', 'invalid YAML frontmatter'],
    ['bad YAML', '---\nname: [\ndescription: text\n---\nbody', 'invalid YAML frontmatter'],
    ['duplicate key', '---\nname: check-agent\nname: check-agent\ndescription: text\n---\nbody', 'invalid YAML frontmatter'],
    ['extra field', '---\nname: check-agent\ndescription: text\nextra: true\n---\nbody', 'exactly name + description'],
    ['wrong name', '---\nname: another-agent\ndescription: text\n---\nbody', 'match the file stem'],
    ['empty description', '---\nname: check-agent\ndescription: ""\n---\nbody', 'non-empty string'],
    ['non-string description', '---\nname: check-agent\ndescription: [text]\n---\nbody', 'non-empty string'],
    ['empty body', '---\nname: check-agent\ndescription: text\n---\n  \n', 'body is empty'],
    ['unsafe prompt macro', '---\nname: check-agent\ndescription: text\n---\n{{unsafe}}', 'body contains "{{"'],
  ])('rejects %s before writing a generated artifact', async (_label, text, message) => {
    const dir = copySource()
    writeFileSync(join(dir, 'agents/check-agent.md'), text)
    await expect(loadAgents(dir)).rejects.toThrow(message)
    expectGenerationFailure(dir, message)
  })
})
