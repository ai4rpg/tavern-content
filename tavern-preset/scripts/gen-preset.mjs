#!/usr/bin/env node
/**
 * Generate `cordis.patch.yml` — the profile patch that declares the
 * `tavern-standard` agent preset.
 *
 * The patch is derived, not hand-written: the preset's `plugins` list IS the
 * official `standard` composition with exactly three edits, so a base upgrade
 * moves this preset with it.
 *
 *   1. `persona.yml` replaces the base's persona row (prose override; the
 *      mechanism stays the base's — the template carries no `complete`, no
 *      `includeRuntimeContext`);
 *   2. the base's `skill-filesystem` row gains a `customSkillDirs` entry
 *      (a `!!js` expression resolved against the loader's `baseUrl`) pointing
 *      at this package's own `skills/` directory;
 *   3. the tavern group is appended: the stage-switch row (config =
 *      `tavernCardsStageConfig` from the plugin package + this deployment's
 *      display metadata from `stage-display.json`: Chinese aliases and review
 *      language), the tavern-stages row, and one `tool-subagent` row per
 *      `loadTavernAgents()` entry — so the delegation tools cannot drift from
 *      the personas they delegate to;
 *   4. one child preset per agent is appended: `tavern-child-<agent>` carries
 *      the agent body as its persona prefix and a narrow tool set derived from
 *      the same base rows (no stage, delegation, or planning rows).
 *
 * A second inserted row activates the stage sidebar tab on the host plane.
 * The tab cannot ride the preset: the browser module roster only scans the
 * main Loader tree, and preset rows live in a separate tree. The row is
 * passive UI (no prompt section, no tool), so host-plane activation is safe.
 *
 * Usage:
 *   node scripts/gen-preset.mjs [--lang=zh|en] [--out <file>]     (default: ./cordis.patch.yml)
 *   node scripts/gen-preset.mjs --stdout
 *
 * Regeneration is idempotent for an unchanged base + plugin package +
 * `stage-display.json`; the output is committed, and `tests/preset.spec.ts`
 * fails if it drifts.
 *
 * @module scripts/gen-preset
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, YAMLSeq, parseDocument } from 'yaml'
import { loadTavernAgents, tavernCardsStageConfig } from '@ai4rpg/dsh-tavern-stages'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
/** Chinese display metadata lives in the content repo, not in the plugin package. */
const STAGE_DISPLAY = JSON.parse(readFileSync(join(root, 'stage-display.json'), 'utf8'))
if (STAGE_DISPLAY.language !== 'zh' && STAGE_DISPLAY.language !== 'en') {
  throw new Error(`gen-preset: stage-display.json has unsupported language ${JSON.stringify(STAGE_DISPLAY.language)}`)
}

/** The official base composition, read through `@deepseek-ai/dsh-web-app`'s exports. */
const BASE_PATCH = '@deepseek-ai/dsh-web-app/presets/standard.patch.yml'
/** The base row whose `config.plugins` this generator derives from. */
const BASE_PRESET_ROW_ID = 'preset-standard'

const AGENT_PRESET_PACKAGE = '@deepseek-ai/dsh-agent-preset'
const PERSONA_PACKAGE = '@deepseek-ai/dsh-persona'
const SKILL_FILESYSTEM_PACKAGE = '@deepseek-ai/dsh-skill-filesystem'
const TOOL_SUBAGENT_PACKAGE = '@deepseek-ai/dsh-tool-subagent'
const STAGE_SWITCH_PACKAGE = '@ai4rpg/dsh-stage-switch'
const TAVERN_STAGES_PACKAGE = '@ai4rpg/dsh-tavern-stages'
const SIDEBAR_PACKAGE = '@ai4rpg/dsh-ui-sidebar-stage'
const SELF_PACKAGE = '@ai4rpg/dsh-tavern-preset'

/** The preset id sessions record and resume by. Renaming it orphans old sessions. */
const PRESET_ID = 'tavern-standard'
/** Roster order: official standard=1, ptc=2, minimal=3, cordis=4. */
const PRESET_ORDER = 5

/** Child preset ids are a cold-resume contract (`tavern-child-<agent>`). */
const CHILD_PRESET_PREFIX = 'tavern-child'
/** Roster order: the main preset is 5, so its internal children follow at 6..9. */
const CHILD_PRESET_ORDER = 6
/**
 * Rows every child preset carries, cloned from the official base (never
 * hand-copied). Deltas below stay minimal and are derived from each agent
 * body's execution flow; re-check them when the personas are synced upstream.
 */
const CHILD_BASE_ROW_IDS = [
  'agent-instructions',
  'tool-fs',
  'tool-fs-search',
  'skill-filesystem',
  'tool-skill',
  'compaction',
]
const CHILD_ROW_DELTAS = {
  // The conversion body runs `node scripts/validate-conversion-outline.mjs`.
  'conversion-agent': { extraRows: ['tool-bash', 'tool-pwsh'] },
  // The reviewer reports; it never edits the manuscript.
  'check-agent': { rowConfig: { 'tool-fs': { write: false, edit: false } } },
}
const childPresetId = agent => `${CHILD_PRESET_PREFIX}-${agent.name}`

/** Display metadata. Declared presets have no i18n field — dsh translates only
 * its own four built-ins (`presetDisplayText`), so the language is chosen here,
 * at generation time: `--lang=zh` (default) or `--lang=en`. The name itself is
 * language-neutral; the description is one single-language sentence. */
const DISPLAY_COPY = {
  zh: {
    name: 'Tavern Cards',
    description: '官方 standard 工具集基座 + 写作向 persona + tavern 阶段工作流'
      + '（goto_stage、tavern_forge、tavern 技能）；tavern 上下文只在选用本预设的会话中加载。',
    childName: agent => `Tavern child · ${agent.name}`,
    childDescription: agent => `内部子预设，供 ${agent.name} 委派工具使用，不作为用户会话预设选用。`
      + agent.description,
  },
  en: {
    name: 'Tavern Cards',
    description: 'The official standard toolset with a writing-oriented persona and the tavern'
      + ' stage workflow (goto_stage, tavern_forge, tavern skills); tavern context loads only'
      + ' in sessions on this preset.',
    childName: agent => `Tavern child · ${agent.name}`,
    childDescription: agent => `Internal child preset for the ${agent.name} delegation tool;`
      + ` do not select it for user sessions. ${agent.description}`,
  },
}
const LANG_ARG = process.argv.find(arg => arg.startsWith('--lang='))
const LANG = LANG_ARG === undefined ? 'zh' : LANG_ARG.slice('--lang='.length)
const DISPLAY = DISPLAY_COPY[LANG]
if (DISPLAY === undefined) {
  console.error(`gen-preset: unknown --lang=${LANG} (expected one of: ${Object.keys(DISPLAY_COPY).join(', ')})`)
  process.exit(1)
}

/**
 * The `!!js` expression that points the base's `skill-filesystem` row at this
 * package's `skills/` directory. `baseUrl` is the preset tree's loader base
 * (the profile directory), so `createRequire(baseUrl)` resolves this package
 * from the profile's installed modules — the same pattern the harness uses for
 * its own shipped presets.
 */
const SKILL_DIRS_EXPR = "process.getBuiltinModule('node:path').join("
  + "process.getBuiltinModule('node:path').dirname("
  + `process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('${SELF_PACKAGE}/package.json')`
  + "), 'skills')"

/** The base composition's `plugins` list, as a live YAML node. */
function basePlugins() {
  const base = parseDocument(readFileSync(require.resolve(BASE_PATCH), 'utf8'))
  const insert = base.contents.items[0]?.get('insert')
  const row = insert?.items?.find(entry => entry.get('id') === BASE_PRESET_ROW_ID)
  const plugins = row?.get('config')?.get('plugins')
  if (plugins === undefined) {
    throw new Error(`gen-preset: ${BASE_PATCH} carries no ${BASE_PRESET_ROW_ID} row with config.plugins`)
  }
  return { base, plugins }
}

/** The persona row from `persona.yml`, optionally with an agent body as prefix. */
function personaRow(prefix = undefined) {
  const [row] = parseDocument(readFileSync(join(root, 'persona.yml'), 'utf8')).toJS()
  if (row?.name !== PERSONA_PACKAGE) {
    throw new Error(`gen-preset: persona.yml must declare the ${PERSONA_PACKAGE} row`)
  }
  if (prefix !== undefined) row.config = { ...row.config, prefix }
  return row
}

/** Replace the base persona row with `persona.yml` (prose override, mechanism untouched). */
function applyPersonaOverride(base, plugins) {
  const index = plugins.items.findIndex(row => row.get('name') === PERSONA_PACKAGE)
  if (index < 0) throw new Error(`gen-preset: the base composition has no ${PERSONA_PACKAGE} row`)
  const config = plugins.items[index].get('config')
  if (config?.get('prefix') === undefined) {
    // dsh 0.1.5 renamed dsh-persona's `text` key to `prefix`. A base that still
    // carries `text` (or nothing) is a pre-0.1.5 tree: generating from it would
    // produce a preset that fails to mount.
    throw new Error(
      `gen-preset: the base persona row has no \`prefix\` — refusing to generate from a pre-0.1.5 base`
      + ` (keys: ${config === undefined ? 'none' : [...config.items].map(item => String(item.key)).join(', ')})`,
    )
  }
  plugins.items[index] = base.createNode(personaRow())
}

/** Point the base skill-filesystem row's `customSkillDirs` at this package's `skills/`. */
function applySkillDirs(base, plugins) {
  const row = plugins.items.find(entry => entry.get('name') === SKILL_FILESYSTEM_PACKAGE)
  if (row === undefined) {
    throw new Error(`gen-preset: the base composition has no ${SKILL_FILESYSTEM_PACKAGE} row`)
  }
  const dirs = new YAMLSeq()
  const expression = base.createNode(SKILL_DIRS_EXPR)
  // The loader evaluates `!!js` expressions when the row activates; the tag has
  // to survive the YAML round trip, so it is set on the node directly.
  expression.tag = 'tag:yaml.org,2002:js'
  dirs.add(expression)
  row.setIn(['config', 'customSkillDirs'], dirs)
}

/**
 * The plugin rows of one child preset: the base rows in {@link CHILD_BASE_ROW_IDS}
 * order, the agent body as the persona prefix, and that agent's declared delta.
 * Every row is cloned from a fresh base composition; a missing base row is a
 * hard error, never a silently thinner child.
 */
function childPlugins(agent) {
  const { base, plugins } = basePlugins()
  const delta = CHILD_ROW_DELTAS[agent.name] ?? {}
  const rowIds = [
    'persona',
    ...CHILD_BASE_ROW_IDS.slice(0, 3),
    ...(delta.extraRows ?? []),
    ...CHILD_BASE_ROW_IDS.slice(3),
  ]
  const baseRows = new Map(plugins.items.map(row => [row.get('id'), row]))
  const missing = rowIds.filter(id => id !== 'persona' && !baseRows.has(id))
  if (missing.length > 0) {
    throw new Error(`gen-preset: the base composition is missing child preset rows: ${missing.join(', ')}`)
  }
  const child = base.createNode(rowIds.map((id) => {
    if (id === 'persona') return base.createNode(personaRow(agent.body))
    // Reuse the parsed node: `!!js` tags on tool-bash/tool-pwsh must survive.
    return baseRows.get(id)
  }))
  applySkillDirs(base, child)
  for (const [id, config] of Object.entries(delta.rowConfig ?? {})) {
    const row = child.items.find(entry => entry.get('id') === id)
    if (row === undefined) throw new Error(`gen-preset: no ${id} row to apply the ${agent.name} delta to`)
    for (const [key, value] of Object.entries(config)) row.setIn(['config', key], value)
  }
  return child
}

/** Look up this deployment's display label, failing if a new stage has none. */
function stageAlias(name) {
  const alias = STAGE_DISPLAY.aliases?.[name]
  if (typeof alias !== 'string' || alias.trim() === '') {
    throw new Error(`gen-preset: stage-display.json has no alias for stage ${JSON.stringify(name)}`)
  }
  return alias.trim()
}

/** The stage-switch row: plugin config plus this deployment's display metadata. */
function stageSwitchRow() {
  return {
    id: 'stage-switch',
    name: STAGE_SWITCH_PACKAGE,
    config: {
      stages: tavernCardsStageConfig.stages.map(stage => ({
        ...stage,
        alias: stageAlias(stage.name),
      })),
      minHandoffTokens: tavernCardsStageConfig.minHandoffTokens,
      section: tavernCardsStageConfig.section,
      language: STAGE_DISPLAY.language,
    },
  }
}

/** The tavern group appended to the base composition. */
function tavernGroup(agents) {
  return {
    id: 'tavern',
    name: 'cordis:group',
    group: true,
    // StageController publishes the `stage` service; a preset row publishing
    // into the root realm is rejected at mount, and the plugin consumes
    // `ctx.stage`, so both rows must share one entry-local realm.
    isolate: { stage: true },
    config: [
      stageSwitchRow(),
      {
        id: 'tavern-stages',
        name: TAVERN_STAGES_PACKAGE,
        // Stage plugin + project tooling only. Delegation is owned by dsh
        // 0.2.1: the rows below bind the official `spawn` provider, and each
        // child gets its persona and tools from its agentPreset preset.
      },
      // One delegation tool per agents/*.md. The agent body travels as the
      // child preset's persona prefix, never as row `persona`/`toolFilter`
      // (0.2.1 rejects both). `agentOptions` stays unset so children inherit
      // the parent session's provider/model route, reasoning effort,
      // output-token limit, and working directory.
      ...agents.map(agent => ({
        id: `tool-subagent-${agent.name}`,
        name: TOOL_SUBAGENT_PACKAGE,
        config: {
          provider: 'spawn',
          toolName: agent.name,
          agentPreset: childPresetId(agent),
          maxDepth: 'provider-managed',
        },
      })),
    ],
  }
}

/** Render the patch document. */
async function generate() {
  const agents = await loadTavernAgents()
  const { base, plugins } = basePlugins()
  applyPersonaOverride(base, plugins)
  applySkillDirs(base, plugins)
  const group = base.createNode(tavernGroup(agents))
  group.commentBefore = [
    ' The tavern group. The stage config is the plugin package\'s `tavernCardsStageConfig`',
    ' plus this deployment\'s `language`; the delegation rows come from `loadTavernAgents()`.',
  ].join('\n')
  group.getIn(['config', 1]).commentBefore = [
    ' Stage plugin and project tooling only. Delegation is owned by dsh 0.2.1:',
    ' the rows below bind the official `spawn` provider and select an internal',
    ' child preset for each agent\'s persona and tool set.',
  ].join('\n')
  const firstDelegation = group.getIn(['config', 2])
  if (firstDelegation !== undefined) {
    firstDelegation.commentBefore = [
      ' One delegation tool per agents/*.md. The child preset id is a cold-resume',
      ' contract; never rename or drop a `tavern-child-*` id once shipped.',
    ].join('\n')
  }
  plugins.add(group)

  const children = agents.map((agent, index) => ({
    id: `preset-${childPresetId(agent)}`,
    name: AGENT_PRESET_PACKAGE,
    config: {
      id: childPresetId(agent),
      name: DISPLAY.childName(agent),
      description: DISPLAY.childDescription(agent),
      order: CHILD_PRESET_ORDER + index,
      plugins: childPlugins(agent),
    },
  }))

  const doc = new Document([
    {
      insert: [
        {
          id: `preset-${PRESET_ID}`,
          name: AGENT_PRESET_PACKAGE,
          config: {
            id: PRESET_ID,
            name: DISPLAY.name,
            description: DISPLAY.description,
            order: PRESET_ORDER,
            plugins,
          },
        },
        ...children,
        // Host-plane activation: see the module comment.
        { id: 'ui-sidebar-stage', name: SIDEBAR_PACKAGE },
      ],
    },
  ])
  doc.commentBefore = [
    ' GENERATED by scripts/gen-preset.mjs — do not edit by hand.',
    ` Source: ${BASE_PATCH} (${BASE_PRESET_ROW_ID} row)`,
    '         + persona.yml',
    `         + ${TAVERN_STAGES_PACKAGE} exports (tavernCardsStageConfig, loadTavernAgents()).`,
    ' Regenerate with `npm run gen`; tests/preset.spec.ts fails on drift.',
  ].join('\n')
  return doc.toString({ lineWidth: 80, singleQuote: true })
}

const argv = process.argv.slice(2)
const outIndex = argv.indexOf('--out')
const toStdout = argv.includes('--stdout')
const target = outIndex >= 0
  ? resolve(argv[outIndex + 1] ?? '')
  : join(root, 'cordis.patch.yml')

const text = await generate()
if (toStdout) {
  process.stdout.write(text)
} else {
  writeFileSync(target, text)
  console.log(`gen-preset: wrote ${target}`)
}
