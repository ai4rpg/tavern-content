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
/** The content-owned Chinese display metadata the generator injects. */
const stageDisplay = JSON.parse(readFileSync(join(repoRoot, 'stage-display.json'), 'utf8')) as {
  language: string
  aliases: Record<string, string>
}

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
const agentsPromise = loadTavernAgents()

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

  it('inserts the preset declaration, its four child presets, and the host-plane sidebar tab', () => {
    expect(patch.insert.map(row => row.id)).toEqual([
      'preset-tavern-standard',
      'preset-tavern-child-check-agent',
      'preset-tavern-child-conversion-agent',
      'preset-tavern-child-first-message-agent',
      'preset-tavern-child-schema-agent',
      'ui-sidebar-stage',
    ])
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
      stages: tavernCardsStageConfig.stages.map(stage => ({
        ...stage,
        alias: stageDisplay.aliases[stage.name],
      })),
      minHandoffTokens: tavernCardsStageConfig.minHandoffTokens,
      section: tavernCardsStageConfig.section,
      language: stageDisplay.language,
    })
    expect((stageSwitch.config as { stages: Array<{ alias?: string }> }).stages
      .map(stage => stage.alias))
      .toEqual(['路由', '设计', '规划', '内容', '界面'])
  })

  it('leaves delegation entirely to dsh: no subagent configuration on the tavern-stages row', () => {
    const row = byId(children, 'tavern-stages')
    expect(row.name).toBe('@ai4rpg/dsh-tavern-stages')
    expect(row.config).toBeUndefined()
  })

  it('generates one spawn delegation tool per agents/*.md, each selecting its child preset', async () => {
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
          provider: 'spawn',
          toolName: agent.name,
          agentPreset: `tavern-child-${agent.name}`,
          maxDepth: 'provider-managed',
        },
      })
      // 0.2.1 rejects `persona`/`toolFilter` at mount and silently ignores the
      // two background keys; identity and tools belong to the child preset.
      for (const dead of ['persona', 'toolFilter', 'enableRunInBackground', 'backgroundMode']) {
        expect(toolRows[index]!.config).not.toHaveProperty(dead)
      }
    }
  })
})

describe('child presets', () => {
  const childOrder = [
    'persona',
    'agent-instructions',
    'tool-fs',
    'tool-fs-search',
    'skill-filesystem',
    'tool-skill',
    'compaction',
  ]

  it('declares one internal child preset per agent, ordered after the main preset', async () => {
    const agents = await agentsPromise
    for (const [index, agent] of agents.entries()) {
      const id = `tavern-child-${agent.name}`
      const declaration = byId(patch.insert, `preset-${id}`)
      expect(declaration.name).toBe('@deepseek-ai/dsh-agent-preset')
      expect(declaration.config!.id).toBe(id)
      expect(declaration.config!.order).toBe(6 + index)
      // The roster has no hidden flag: the name and description must say what
      // this preset is for and that user sessions should not select it.
      expect(declaration.config!.name).toBe(`Tavern child · ${agent.name}`)
      expect(String(declaration.config!.description)).toContain(agent.name)
      expect(String(declaration.config!.description)).toContain('不作为用户会话预设选用')
      expect(String(declaration.config!.description)).toContain(agent.description)
    }
    expect(new Set(patch.insert
      .filter(row => row.id?.startsWith('preset-tavern-child-'))
      .map(row => row.config!.id))).toEqual(new Set(agents.map(agent => `tavern-child-${agent.name}`)))
  })

  it('carries the agent body as the persona prefix and only its declared tool rows', async () => {
    const agents = await agentsPromise
    const base = basePlugins()
    const baseById = new Map(base.map(row => [row.id, row]))
    for (const agent of agents) {
      const declaration = byId(patch.insert, `preset-tavern-child-${agent.name}`)
      const rows = pluginsOf(declaration)
      const extra = agent.name === 'conversion-agent' ? ['tool-bash', 'tool-pwsh'] : []
      expect(rows.map(row => row.id)).toEqual([
        'persona',
        'agent-instructions',
        'tool-fs',
        'tool-fs-search',
        ...extra,
        'skill-filesystem',
        'tool-skill',
        'compaction',
      ])

      expect(byId(rows, 'persona')).toEqual({
        id: 'persona',
        name: '@deepseek-ai/dsh-persona',
        config: { prefix: agent.body },
      })

      for (const id of childOrder.filter(id => id !== 'persona')) {
        const generated = byId(rows, id)
        const expected = structuredClone(baseById.get(id)!)
        if (id === 'skill-filesystem') {
          expected.config = {
            ...expected.config,
            customSkillDirs: [
              "process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@ai4rpg/dsh-tavern-preset/package.json')), 'skills')",
            ],
          }
        }
        if (id === 'tool-fs' && agent.name === 'check-agent') {
          expected.config = { write: false, edit: false }
        }
        expect(generated, `${agent.name} row ${id}`).toEqual(expected)
      }
    }
  })

  it('keeps stage, delegation, and planning out of every child, and bash only in conversion', async () => {
    const agents = await agentsPromise
    for (const agent of agents) {
      const rows = pluginsOf(byId(patch.insert, `preset-tavern-child-${agent.name}`))
      const ids = rows.map(row => String(row.id))
      expect(ids.some(id => id.startsWith('tool-subagent')), agent.name).toBe(false)
      expect(ids, agent.name).not.toContain('delegation')
      expect(ids, agent.name).not.toContain('planning')
      expect(ids, agent.name).not.toContain('stage-switch')
      expect(ids, agent.name).not.toContain('tavern')
      expect(ids.includes('tool-bash'), agent.name).toBe(agent.name === 'conversion-agent')
      expect(ids.includes('tool-pwsh'), agent.name).toBe(agent.name === 'conversion-agent')
    }
  })

  it('uses the child-preset ids as the delegation binding, one-to-one with agents', () => {
    const ids = new Set(patch.insert
      .filter(row => row.id?.startsWith('preset-tavern-child-'))
      .map(row => String(row.config!.id)))
    const groupRows = byId(plugins, 'tavern').config as unknown as Row[]
    for (const row of groupRows.filter(entry => entry.id?.startsWith('tool-subagent-'))) {
      expect(ids.has(String((row.config as { agentPreset?: string }).agentPreset))).toBe(true)
    }
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
    engines: { dsh?: string, node?: string }
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
    expect(pkg.files).toContain('stage-display.json')
  })

  it('depends on the composed packages as registry ranges', () => {
    // Ranges only, with one deliberate exception: @ai4rpg/tavern-agents is a
    // generator-time devDependency pinned to its sibling checkout, which
    // ships in the same download, so the relative `file:` spec stays
    // portable. Any other `file:`/`link:`/`portal:` spec would point outside
    // the repo and break on another machine.
    for (const [name, spec] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
      if (name === '@ai4rpg/tavern-agents') {
        expect(spec, name).toBe('file:../tavern-agents')
        continue
      }
      expect(spec, name).not.toMatch(/^(file|link|portal):/)
      expect(spec, name).toMatch(/^\^?\d+\.\d+\.\d+/)
    }
    expect(pkg.dependencies['@ai4rpg/dsh-tavern-stages']).toMatch(/^\^0\.2\./)
    expect(pkg.dependencies['@ai4rpg/dsh-stage-switch']).toMatch(/^\^0\.2\./)
    expect(pkg.dependencies['@ai4rpg/dsh-ui-sidebar-stage']).toMatch(/^\^0\.2\./)
    expect(pkg.dependencies).not.toHaveProperty('@ai4rpg/tavern-agents')
    expect(pkg.devDependencies['@ai4rpg/tavern-agents']).toBe('file:../tavern-agents')
  })

  it('targets the dsh 0.2.1 line through engines.dsh', () => {
    expect(pkg.engines.dsh).toBe('>=0.2.1-rc.2 <0.3.0-0')
    for (const [name, spec] of Object.entries(pkg.devDependencies)) {
      if (name.startsWith('@deepseek-ai/dsh-')) expect(spec, name).toBe('^0.2.1-rc.2')
    }
    expect(pkg.devDependencies).not.toHaveProperty('@deepseek-ai/dsh-subagent-in-process-driver')
  })

  it('licenses the code as MIT with the CC BY-NC-SA skill scope spelled out', () => {
    expect(pkg.license).toBe('SEE LICENSE IN LICENSE.md')
    const license = readFileSync(join(repoRoot, 'LICENSE.md'), 'utf8')
    expect(license).toContain('MIT License')
    expect(license).toContain('except the `skills/` directory')
    expect(license).toContain('CC BY-NC-SA 4.0')
  })
})
