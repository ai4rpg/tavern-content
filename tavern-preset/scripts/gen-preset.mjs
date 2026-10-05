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
 *      `tavernCardsStageConfig` from the plugin package + `language: zh`),
 *      the tavern-stages row, and one `tool-subagent` row per
 *      `loadTavernAgents()` entry — so the delegation tools and the providers
 *      they bind to cannot drift.
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
 * Regeneration is idempotent for an unchanged base + plugin package; the
 * output is committed, and `tests/preset.spec.ts` fails if it drifts.
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
/** stage-switch user-facing copy: this deployment ships the Chinese review dialogs. */
const STAGE_LANGUAGE = 'zh'
/** The provider prefix the tavern-stages row registers (`tavern:<agent>`). */
const PROVIDER_PREFIX = 'tavern'

/** Display metadata. Declared presets have no i18n field — dsh translates only
 * its own four built-ins (`presetDisplayText`), so the language is chosen here,
 * at generation time: `--lang=zh` (default) or `--lang=en`. The name itself is
 * language-neutral; the description is one single-language sentence. */
const DISPLAY_COPY = {
  zh: {
    name: 'Tavern Cards',
    description: '官方 standard 工具集基座 + 写作向 persona + tavern 阶段工作流'
      + '（goto_stage、tavern_forge、tavern 技能）；tavern 上下文只在选用本预设的会话中加载。',
  },
  en: {
    name: 'Tavern Cards',
    description: 'The official standard toolset with a writing-oriented persona and the tavern'
      + ' stage workflow (goto_stage, tavern_forge, tavern skills); tavern context loads only'
      + ' in sessions on this preset.',
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
  const [personaRow] = parseDocument(readFileSync(join(root, 'persona.yml'), 'utf8')).toJS()
  if (personaRow?.name !== PERSONA_PACKAGE) {
    throw new Error(`gen-preset: persona.yml must declare the ${PERSONA_PACKAGE} row`)
  }
  plugins.items[index] = base.createNode(personaRow)
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

/** The stage-switch row: the plugin package's config plus this deployment's language. */
function stageSwitchRow() {
  return {
    id: 'stage-switch',
    name: STAGE_SWITCH_PACKAGE,
    config: {
      stages: tavernCardsStageConfig.stages.map(stage => ({ ...stage })),
      minHandoffTokens: tavernCardsStageConfig.minHandoffTokens,
      section: tavernCardsStageConfig.section,
      language: STAGE_LANGUAGE,
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
        // The model-facing tools are the rows below; this row only turns the
        // named-subagent providers on. Keep `persona` unset everywhere: the
        // agent body is prepended to the child's first prompt instead.
        config: { subagents: { enabled: true } },
      },
      // One delegation tool per agents/*.md, generated from the same source the
      // plugin registers providers from. `agentOptions` stays unset so children
      // follow the deployment/connection default route and reasoning effort.
      ...agents.map(agent => ({
        id: `tool-subagent-${agent.name}`,
        name: TOOL_SUBAGENT_PACKAGE,
        config: {
          provider: `${PROVIDER_PREFIX}:${agent.name}`,
          toolName: agent.name,
          enableRunInBackground: false,
          backgroundMode: 'one-shot',
          maxDepth: 'provider-managed',
        },
      })),
    ],
  }
}

/** Render the patch document. */
async function generate() {
  const { base, plugins } = basePlugins()
  applyPersonaOverride(base, plugins)
  applySkillDirs(base, plugins)
  const group = base.createNode(tavernGroup(await loadTavernAgents()))
  group.commentBefore = [
    ' The tavern group. The stage config is the plugin package\'s `tavernCardsStageConfig`',
    ' plus this deployment\'s `language`; the delegation rows come from `loadTavernAgents()`.',
  ].join('\n')
  group.getIn(['config', 1]).commentBefore = [
    ' Named-subagent providers only: the model-facing tools are the rows below.',
    ' Keep `persona` unset — setting it would override the host persona and leak',
    ' runtime contexts into the child\'s first request; the agent body is',
    ' prepended to the child\'s first prompt instead.',
  ].join('\n')
  plugins.add(group)

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
