import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { loadTavernAgents, tavernCardsStageConfig } from '@ai4rpg/dsh-tavern-stages'

/**
 * Guards for the one artifact this package ships: `cordis.patch.yml`, the
 * profile patch that declares the `tavern-standard` agent preset.
 *
 * The patch is derived (`scripts/gen-preset.mjs`), so these tests pin the three
 * things that must stay true: the committed file is what the generator
 * produces, the tavern group equals the plugin package's exports, and the
 * package metadata stays publishable.
 */

const require = createRequire(import.meta.url)
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const patchPath = join(repoRoot, 'cordis.patch.yml')

/** Rows of the generated patch, with `!!js` expressions kept verbatim. */
type Row = {
  id?: string
  name?: string
  group?: boolean
  isolate?: Record<string, unknown>
  config?: Record<string, unknown>
  [key: string]: unknown
}

/** `!!js` is evaluated by the dsh Loader at row activation; here it stays text. */
const JS_TAG = { tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }

function readPatch(text = readFileSync(patchPath, 'utf8')): { insert: Row[] } {
  const [layer] = parse(text, { customTags: [JS_TAG] }) as [{ insert: Row[] }]
  return layer!
}

function pluginsOf(row: Row): Row[] {
  return row.config!.plugins as Row[]
}

function byId(rows: readonly Row[], id: string): Row {
  const row = rows.find(entry => entry.id === id)
  expect(row, `row ${id}`).toBeDefined()
  return row!
}

/** The official base composition the generator derives from. */
function basePlugins(): Row[] {
  const path = require.resolve('@deepseek-ai/dsh-web-app/presets/standard.patch.yml')
  const [layer] = parse(readFileSync(path, 'utf8'), { customTags: [JS_TAG] }) as [{ insert: Row[] }]
  const base = layer!.insert.find(row => row.id === 'preset-standard')!
  return pluginsOf(base)
}

const patch = readPatch()
const declaration = byId(patch.insert, 'preset-tavern-standard')
const plugins = pluginsOf(declaration)

describe('generated patch', () => {
  it('is byte-identical to a fresh generator run', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'tavern-preset-')), 'cordis.patch.yml')
    try {
      execFileSync(process.execPath, [join(repoRoot, 'scripts', 'gen-preset.mjs'), '--out', out], {
        cwd: repoRoot,
        stdio: 'pipe',
      })
      expect(readFileSync(out, 'utf8')).toBe(readFileSync(patchPath, 'utf8'))
    } finally {
      rmSync(out, { force: true, recursive: true })
    }
  })

  it('inserts the preset declaration and the host-plane sidebar tab', () => {
    expect(patch.insert.map(row => row.id)).toEqual(['preset-tavern-standard', 'ui-sidebar-stage'])
    expect(byId(patch.insert, 'ui-sidebar-stage').name).toBe('@ai4rpg/dsh-ui-sidebar-stage')
  })

  it('declares the resume-contract preset id with display metadata and roster order', () => {
    expect(declaration.name).toBe('@deepseek-ai/dsh-agent-preset')
    expect(declaration.config!.id).toBe('tavern-standard')
    // Declared presets have no i18n field: dsh translates only its own four
    // built-ins, so the language is fixed at generation time (default zh).
    expect(String(declaration.config!.name)).toBe('Tavern Cards')
    expect(String(declaration.config!.description)).toContain('tavern_forge')
    expect(String(declaration.config!.description)).toContain('官方 standard')
    // Official presets occupy 1..4 (standard, ptc, minimal, cordis).
    expect(declaration.config!.order).toBe(5)
  })

  it('is the base composition with only the persona row replaced', () => {
    const base = basePlugins()
    const [persona] = parse(readFileSync(join(repoRoot, 'persona.yml'), 'utf8'), {
      customTags: [JS_TAG],
    }) as [Row]
    const generated = byId(plugins, 'persona')
    expect(generated).toEqual(persona)

    // Every other base row survives verbatim (the skill-filesystem row differs
    // only by the added customSkillDirs entry, asserted separately below).
    const mutated = new Set(['persona', 'skill-filesystem'])
    for (const row of base) {
      if (mutated.has(String(row.id))) continue
      expect(byId(plugins, String(row.id)), `base row ${row.id}`).toEqual(row)
    }
    // …plus exactly one appended row: the tavern group.
    expect(plugins).toHaveLength(base.length + 1)
    expect(plugins.at(-1)!.id).toBe('tavern')
  })

  it('points the skill-filesystem row at this package\'s skills directory via a loader-evaluated expression', () => {
    const row = byId(plugins, 'skill-filesystem')
    const config = row.config as { customSkillDirs: string[] }
    expect(config.customSkillDirs).toEqual([
      "process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@ai4rpg/dsh-tavern-preset/package.json')), 'skills')",
    ])
  })
})

describe('tavern group', () => {
  const group = byId(plugins, 'tavern')
  const children = group.config as unknown as Row[]

  it('isolates the stage service in one entry-local realm', () => {
    expect(group.name).toBe('cordis:group')
    expect(group.group).toBe(true)
    // StageController publishes ctx.stage; a preset row publishing into the
    // root realm is rejected at mount, and the plugin consumes ctx.stage.
    expect(group.isolate).toEqual({ stage: true })
  })

  it('carries the plugin package\'s stage config plus this deployment\'s language', () => {
    const stageSwitch = byId(children, 'stage-switch')
    expect(stageSwitch.name).toBe('@ai4rpg/dsh-stage-switch')
    expect(stageSwitch.config).toEqual({
      stages: tavernCardsStageConfig.stages.map(stage => ({ ...stage })),
      minHandoffTokens: tavernCardsStageConfig.minHandoffTokens,
      section: tavernCardsStageConfig.section,
      language: 'zh',
    })
  })

  it('enables the named-subagent providers without a persona override', () => {
    const row = byId(children, 'tavern-stages')
    expect(row.name).toBe('@ai4rpg/dsh-tavern-stages')
    expect(row.config).toEqual({ subagents: { enabled: true } })
  })

  it('generates one delegation tool per agents/*.md, from the same export the providers register from', async () => {
    const agents = await loadTavernAgents()
    expect(agents.map(agent => agent.name)).toEqual([
      'check-agent',
      'conversion-agent',
      'first-message-agent',
      'schema-agent',
    ])
    const toolRows = children.filter(row => row.id?.startsWith('tool-subagent-'))
    expect(toolRows.map(row => row.id)).toEqual(agents.map(agent => `tool-subagent-${agent.name}`))
    for (const [index, agent] of agents.entries()) {
      expect(toolRows[index]).toEqual({
        id: `tool-subagent-${agent.name}`,
        name: '@deepseek-ai/dsh-tool-subagent',
        config: {
          provider: `tavern:${agent.name}`,
          toolName: agent.name,
          enableRunInBackground: false,
          backgroundMode: 'one-shot',
          maxDepth: 'provider-managed',
        },
      })
    }
    // The model-facing tools are the rows; the provider row must not carry a
    // `persona` of its own — the agent body is prepended to the child's first
    // prompt instead of overriding the host persona.
    expect(byId(children, 'tavern-stages').config).not.toHaveProperty('persona')
  })
})

describe('shipped skill bodies', () => {
  it('carries the three skills with their license note', () => {
    const skillsRoot = join(repoRoot, 'skills')
    expect(existsSync(join(skillsRoot, 'LICENSE.md'))).toBe(true)
    const names = readdirSync(skillsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
    expect(names).toEqual(['tavern-cards', 'tavern-design', 'tavern-ui'])
    for (const name of names) {
      expect(existsSync(join(skillsRoot, name, 'SKILL.md')), `${name}/SKILL.md`).toBe(true)
    }
  })
})

describe('package metadata', () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
    files: string[]
    license: string
    publishConfig?: { access: string }
    dsh: { bundle: { patch: string } }
  }

  it('declares the bundle patch and carries no publish metadata', () => {
    expect(pkg.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(pkg.publishConfig, 'this package is a local checkout, never published to npm').toBeUndefined()
    expect(pkg.files).toContain('cordis.patch.yml')
    expect(pkg.files).toContain('skills')
  })

  it('depends on the composed packages as registry ranges', () => {
    // Ranges only, with one deliberate exception: the personas ride the
    // self-contained content repo — @ai4rpg/tavern-agents is pinned to its
    // sibling checkout, which ships in the same download, so the relative
    // `file:` spec stays portable. Any other `file:`/`link:`/`portal:` spec
    // would point outside the repo and break on another machine.
    for (const [name, spec] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      if (name === '@ai4rpg/tavern-agents') {
        expect(spec, name).toBe('file:../tavern-agents')
        continue
      }
      expect(spec, name).not.toMatch(/^(file|link|portal):/)
      expect(spec, name).toMatch(/^\^?\d+\.\d+\.\d+/)
    }
    expect(pkg.dependencies['@ai4rpg/dsh-tavern-stages']).toMatch(/^\^0\.1\./)
    expect(pkg.dependencies['@ai4rpg/dsh-stage-switch']).toMatch(/^\^0\.2\./)
    expect(pkg.dependencies['@ai4rpg/dsh-ui-sidebar-stage']).toMatch(/^\^0\.1\./)
    expect(pkg.dependencies['@ai4rpg/tavern-agents']).toBe('file:../tavern-agents')
  })

  it('licenses the code as MIT with the CC BY-NC-SA skill scope spelled out', () => {
    expect(pkg.license).toBe('SEE LICENSE IN LICENSE.md')
    const license = readFileSync(join(repoRoot, 'LICENSE.md'), 'utf8')
    expect(license).toContain('MIT License')
    expect(license).toContain('except the `skills/` directory')
    expect(license).toContain('CC BY-NC-SA 4.0')
  })
})
