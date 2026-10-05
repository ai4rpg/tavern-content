/**
 * Loader-composed skill harness for this preset package.
 *
 * WHY A REAL LOADER: the preset's `skill-filesystem` row points
 * `config.customSkillDirs` at this package's own `skills/` directory through a
 * `!!js` expression. `!!js` is the Loader's YAML dialect, not a JavaScript
 * value: mounting the declaration with `ctx.plugin(AgentPreset, config)` hands
 * the row the plain STRING the expression looks like, the provider resolves it
 * as a relative path that does not exist, and discovery silently yields
 * nothing. Anything a test wants to claim about the preset's skills therefore
 * has to boot a composition through `@deepseek-ai/cordis-plugin-loader`.
 *
 * The harness builds that composition in a fresh temp directory:
 *
 *   <tmp>/node_modules/@ai4rpg/dsh-tavern-preset -> <this package root>
 *   <tmp>/cordis.yml                             (the entry list described below)
 *   <tmp>/decoy-skills/<name>/SKILL.md           (the other preset's own skill)
 *
 * `node_modules` is what makes the generated expression work. It evaluates
 * `createRequire(baseUrl).resolve('@ai4rpg/dsh-tavern-preset/package.json')`
 * with `baseUrl` set to the composition file's directory (the Loader's
 * per-entry base URL; an Include subtree re-anchors it on its own file), so the
 * package must be resolvable FROM THE TEMP DIRECTORY. `createRequire` resolves
 * the symlink to its real path, so the directory the expression lands on is
 * this repository's `skills/`.
 *
 * The `skill-filesystem` ROW IS TAKEN FROM THE GENERATED `cordis.patch.yml`:
 * its node — including the `!!js` scalar — is cloned into the temp composition
 * rather than re-typed here, so a generator change that breaks the expression
 * fails these tests. Only two config keys are added, and neither touches the
 * expression:
 *
 *   - `includeDefaultRoots: false` keeps the machine's real skill directories
 *     (`~/.dsh/skills`, `~/.agents/skills`, project roots) out of the exact-name
 *     assertions;
 *   - `watch: false` keeps chokidar watchers out of the test process.
 *
 * The composition declares TWO presets so scope isolation is observable:
 * `tavern-standard` carries the generated skills row, and a decoy preset
 * carries an ordinary `customSkillDirs` pointing at a directory of its own.
 *
 * @module tests/helpers/skill-loader
 */

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { Include } from '@deepseek-ai/cordis-plugin-include'
import '@deepseek-ai/cordis-plugin-loader'
import '@deepseek-ai/cordis-plugin-include'
import AgentPreset from '@deepseek-ai/dsh-agent-preset'
import AgentPresetRegistry from '@deepseek-ai/dsh-agent-preset-registry'
import SessionProjection from '@deepseek-ai/dsh-session-projection'
import SkillRegistry, { type SkillDefinition, type SkillSummary } from '@deepseek-ai/dsh-skill'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import { Document, YAMLMap, YAMLSeq, isScalar, parse, parseDocument } from 'yaml'

/** The preset id sessions record and resume by. */
export const PRESET_ID = 'tavern-standard'
/** A second declared preset with skills of its own: the isolation control. */
export const OTHER_PRESET_ID = 'decoy-standard'
/** The synthetic skill the other preset mounts. */
export const DECOY_SKILL = 'other-skill'
/** The three skills this package ships. */
export const TAVERN_SKILLS = ['tavern-cards', 'tavern-design', 'tavern-ui'] as const
/** One shipped skill name. */
export type TavernSkill = (typeof TAVERN_SKILLS)[number]
/** This package's root, resolved from this file (`tests/helpers/`). */
export const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
/** The canonical skill tree the generated expression must land on. */
export const skillsRoot = join(repoRoot, 'skills')

/** The generated artifact the skill row is read from. */
const PATCH_FILE = 'cordis.patch.yml'
/** The package the generated expression resolves against. */
const SELF_PACKAGE = '@ai4rpg/dsh-tavern-preset'
const SESSION_PROJECTION_PACKAGE = '@deepseek-ai/dsh-session-projection'
const SKILL_REGISTRY_PACKAGE = '@deepseek-ai/dsh-skill'
const PRESET_REGISTRY_PACKAGE = '@deepseek-ai/dsh-agent-preset-registry'
const AGENT_PRESET_PACKAGE = '@deepseek-ai/dsh-agent-preset'
const SKILL_FILESYSTEM_PACKAGE = '@deepseek-ai/dsh-skill-filesystem'
/** The YAML tag the Loader evaluates; js-yaml's dialect node shape. */
const JS_TAG = 'tag:yaml.org,2002:js'

/** How the harness should carry the generated expression into the temp composition. */
export interface MountOptions {
  /**
   * Carry the expression as its own source TEXT instead of a `!!js` node: the
   * shape a hand-built `ctx.plugin(AgentPreset, config)` declaration produces.
   * Used as the negative control for the Loader-evaluation proof.
   */
  readonly expressionAsString?: boolean
}

/** One booted composition plus scoped read helpers. */
export interface SkillHarness {
  /** The self-cleaning temp directory that served as the Loader's base URL. */
  readonly root: string
  /** The host-plane context (Loader tree root). */
  readonly ctx: Context
  /** Raw source of the generated `!!js` expression, as the Loader evaluated it. */
  readonly skillDirsExpression: string
  /** Run a skill read against one preset's scope layer, releasing the revision lease afterwards. */
  withPresetScope<T>(id: string, read: (scope: ScopeKey) => Promise<T>): Promise<T>
  /** Skill summaries as a session on `tavern-standard` sees them. */
  listPresetSkills(id?: string): Promise<SkillSummary[]>
  /** Load one skill body as a session on `tavern-standard` sees it. */
  loadPresetSkill(name: string, id?: string): Promise<SkillDefinition | undefined>
  /** Skill summaries for a session that selected no preset. */
  listGlobalSkills(): Promise<SkillSummary[]>
  /** Dispose the runtime and delete the temp directory. */
  dispose(): Promise<void>
}

/** A SKILL.md's parsed frontmatter and its body. */
export interface SkillFrontmatter {
  readonly data: Record<string, unknown>
  readonly body: string
}

/**
 * Split a SKILL.md into frontmatter data and body, mirroring the reading in
 * `dsh-skill-filesystem`: the first line must be `---`, the block closes at the
 * next `---` line, and the body is everything after it.
 * @param source - raw SKILL.md text.
 * @returns the parsed frontmatter mapping and the untrimmed body.
 */
export function splitFrontmatter(source: string): SkillFrontmatter {
  const firstLineEnd = source.indexOf('\n')
  if (firstLineEnd < 0 || source.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') {
    throw new Error('skill source does not start with YAML frontmatter')
  }
  const start = firstLineEnd + 1
  let lineStart = start
  while (lineStart <= source.length) {
    const nextNewline = source.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? source.length : nextNewline
    if (source.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      const bodyStart = nextNewline < 0 ? source.length : nextNewline + 1
      const parsed: unknown = parse(source.slice(start, lineStart))
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('skill frontmatter is not a YAML mapping')
      }
      return { data: parsed as Record<string, unknown>, body: source.slice(bodyStart) }
    }
    if (nextNewline < 0) break
    lineStart = nextNewline + 1
  }
  throw new Error('skill source has unterminated YAML frontmatter')
}

/** Narrow a YAML node, or explain which structural assumption broke. */
function asMap(value: unknown, what: string): YAMLMap {
  if (!(value instanceof YAMLMap)) throw new Error(`${PATCH_FILE}: ${what} is not a YAML mapping`)
  return value
}

/** Narrow a YAML sequence, or explain which structural assumption broke. */
function asSeq(value: unknown, what: string): YAMLSeq {
  if (!(value instanceof YAMLSeq)) throw new Error(`${PATCH_FILE}: ${what} is not a YAML sequence`)
  return value
}

/** The generated preset row, as a YAML node that still owns its `!!js` scalars. */
function findPresetRow(patchText: string): YAMLMap {
  const doc = parseDocument(patchText)
  const patches = asSeq(doc.contents, 'the patch list')
  for (const patch of patches.items) {
    const insert = asMap(patch, 'a patch').get('insert')
    if (!(insert instanceof YAMLSeq)) continue
    for (const row of insert.items) {
      if (row instanceof YAMLMap && row.get('id') === `preset-${PRESET_ID}`) return row
    }
  }
  throw new Error(`${PATCH_FILE}: no preset-${PRESET_ID} row to read the skill wiring from`)
}

/** One row of the generated preset's plugin list, by plugin name. */
function findPluginRow(presetRow: YAMLMap, name: string): YAMLMap {
  const plugins = asSeq(asMap(presetRow.get('config'), 'the preset config').get('plugins'), 'config.plugins')
  for (const row of plugins.items) {
    if (row instanceof YAMLMap && row.get('name') === name) return row
  }
  throw new Error(`${PATCH_FILE}: the preset has no ${name} row`)
}

/**
 * Clone the generated `skill-filesystem` row for the temp composition.
 * @param patchText - the generated patch file contents.
 * @param expressionAsString - degrade the `!!js` node to its source text.
 * @returns the row node and the expression source it carries.
 */
function skillRowForTest(patchText: string, expressionAsString: boolean): { row: YAMLMap; expression: string } {
  const generated = findPluginRow(findPresetRow(patchText), SKILL_FILESYSTEM_PACKAGE)
  const config = asMap(generated.get('config'), 'the skill-filesystem config')
  const dirs = asSeq(config.get('customSkillDirs'), 'customSkillDirs')
  const [expressionNode] = dirs.items
  if (!isScalar(expressionNode) || expressionNode.tag !== JS_TAG || typeof expressionNode.value !== 'string') {
    throw new Error(
      `${PATCH_FILE}: the skill-filesystem row must carry a !!js customSkillDirs expression`
      + ` (found ${isScalar(expressionNode) ? String(expressionNode.tag) : typeof expressionNode})`,
    )
  }
  const expression = expressionNode.value
  const row = generated.clone() as YAMLMap
  const rowConfig = asMap(row.get('config'), 'the cloned skill-filesystem config')
  rowConfig.set('includeDefaultRoots', false)
  rowConfig.set('watch', false)
  if (expressionAsString) {
    const literal = new YAMLSeq()
    literal.add(expression)
    rowConfig.set('customSkillDirs', literal)
  }
  return { row, expression }
}

/** The decoy preset's own skill file. */
function decoySkillSource(name: string): string {
  return [
    '---',
    `name: ${name}`,
    `description: "The ${OTHER_PRESET_ID} preset's own skill; tavern skills must never reach this scope."`,
    '---',
    '',
    `# ${name}`,
    '',
    'A synthetic skill mounted by the isolation control preset.',
    '',
  ].join('\n')
}

/** Build the temp composition's entry list. */
function composition(skillRow: YAMLMap, decoySkillsDir: string): string {
  // The preset's own plugin list is not mounted: its other rows (persona, the
  // tool catalog, the tavern group) belong to composition.spec.ts. This
  // composition mounts the generated declaration with its skills row alone.
  const plugins = new YAMLSeq()
  plugins.add(skillRow)
  const doc = new Document([
    { name: SESSION_PROJECTION_PACKAGE },
    { name: SKILL_REGISTRY_PACKAGE },
    { name: PRESET_REGISTRY_PACKAGE, config: { default: PRESET_ID } },
    {
      id: `preset-${PRESET_ID}`,
      name: AGENT_PRESET_PACKAGE,
      config: {
        id: PRESET_ID,
        name: 'Tavern Cards (test)',
        description: 'The generated preset with only its skill-filesystem row, so the skill wiring is what is under test.',
        order: 5,
        // The generated row, verbatim except for the two test-narrowing keys.
        plugins,
      },
    },
    {
      id: `preset-${OTHER_PRESET_ID}`,
      name: AGENT_PRESET_PACKAGE,
      config: {
        id: OTHER_PRESET_ID,
        name: 'Decoy (test)',
        description: 'A second preset whose own skills must stay in its own layer.',
        order: 6,
        plugins: [
          {
            id: 'decoy-skill-filesystem',
            name: SKILL_FILESYSTEM_PACKAGE,
            config: {
              providerName: 'decoy',
              includeDefaultRoots: false,
              watch: false,
              customSkillDirs: [decoySkillsDir],
            },
          },
        ],
      },
    },
  ])
  return doc.toString({ lineWidth: 100, singleQuote: true })
}

/** A read budget, so a hung provider fails the test instead of the suite. */
function readSignal(): AbortSignal {
  return AbortSignal.timeout(30_000)
}

/**
 * Boot the composition through a real Loader and return scoped read helpers.
 * @param options - expression carriage (see {@link MountOptions}).
 * @returns the harness; `dispose()` tears down the runtime and the temp directory (reads release their own scope leases).
 */
export async function mountPresetSkillComposition(options: MountOptions = {}): Promise<SkillHarness> {
  const root = await mkdtemp(join(tmpdir(), 'tavern-preset-skills-'))
  try {
    // The generated expression resolves this package from the composition's own
    // directory, so the temp tree needs its own node_modules entry.
    const scopedModules = join(root, 'node_modules', '@ai4rpg')
    await mkdir(scopedModules, { recursive: true })
    await symlink(repoRoot, join(scopedModules, 'dsh-tavern-preset'), 'dir')

    const decoySkillsDir = join(root, 'decoy-skills')
    await mkdir(join(decoySkillsDir, DECOY_SKILL), { recursive: true })
    await writeFile(join(decoySkillsDir, DECOY_SKILL, 'SKILL.md'), decoySkillSource(DECOY_SKILL))

    const patchText = await readFile(join(repoRoot, PATCH_FILE), 'utf8')
    const plugins = skillRowForTest(patchText, options.expressionAsString === true)

    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, composition(plugins.row, decoySkillsDir))

    const ctx = new Context()
    // `baseUrl` is the directory relative plugin specifiers and `!!js`
    // expressions resolve against; the Include row re-anchors it on cordis.yml,
    // which lives in this same directory.
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader, {})
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      [SESSION_PROJECTION_PACKAGE, SessionProjection],
      [SKILL_REGISTRY_PACKAGE, SkillRegistry],
      [PRESET_REGISTRY_PACKAGE, AgentPresetRegistry],
      [AGENT_PRESET_PACKAGE, AgentPreset],
      [SKILL_FILESYSTEM_PACKAGE, SkillFilesystem],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()

    // A preset that failed to mount keeps its row green, so the failure has to
    // be read from the roster: otherwise these tests would report "no skills"
    // for what is really a broken declaration.
    for (const id of [PRESET_ID, OTHER_PRESET_ID]) {
      const preset = await ctx.agentPresets.resolve(id)
      if (preset.broken !== undefined) throw new Error(`preset ${id} did not mount: ${preset.broken}`)
    }

    const withPresetScope = async <T>(id: string, read: (scope: ScopeKey) => Promise<T>): Promise<T> => {
      const lease = await ctx.agentPresets.acquireScope(id)
      try {
        return await read(lease.key)
      } finally {
        await lease[Symbol.asyncDispose]()
      }
    }

    return {
      root,
      ctx,
      skillDirsExpression: plugins.expression,
      withPresetScope,
      listPresetSkills: id => withPresetScope(id ?? PRESET_ID, scope =>
        ctx.skills.list({ scope, cwd: repoRoot, signal: readSignal() })),
      loadPresetSkill: (name, id) => withPresetScope(id ?? PRESET_ID, scope =>
        ctx.skills.get(name, { scope, cwd: repoRoot, signal: readSignal() })),
      listGlobalSkills: () => ctx.skills.list({ cwd: repoRoot, signal: readSignal() }),
      dispose: async () => {
        await ctx.fiber.dispose()
        await rm(root, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true })
    throw error
  }
}
