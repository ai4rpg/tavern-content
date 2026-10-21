/**
 * Real-Loader composition harness for `tests/composition.spec.ts`.
 *
 * The suite this serves boots a test-only `cordis.yml` through
 * `@deepseek-ai/cordis-plugin-loader` + `@deepseek-ai/cordis-plugin-include`
 * and mounts the REAL `tavern-standard` declaration read out of this
 * package's generated `cordis.patch.yml`.
 *
 * Two rules shape the design:
 *
 * 1. **The declaration travels as YAML text.** A preset row handed to
 *    `ctx.plugin(AgentPreset, config)` as a JavaScript object degrades its
 *    `!!js` expressions to plain strings — `customSkillDirs` would become the
 *    source TEXT of the expression and every skill would silently disappear.
 *    Reading the patch through `yaml` with a `!!js` tag (so the tag survives
 *    the read/modify/write cycle) and re-emitting it through the same writer
 *    keeps the Loader as the only evaluator.
 *
 * 2. **The mounted subset is exactly the part this host plane can satisfy.**
 *    The generated declaration is the official `standard` composition plus
 *    the tavern group, so most of its rows are the standard toolset (bash,
 *    fs, jobs, web, plan mode, compaction, workflow…). Booting that stack is
 *    a different test's job — those rows' wiring is pinned statically by
 *    `tests/preset.spec.ts`. What is mounted here is the rows whose runtime
 *    behaviour the composition suite asserts: persona, the skill provider,
 *    and the tavern group. `MOUNTED_ROW_IDS` makes the reduction explicit and
 *    fails loud if the generator renames a row out from under it.
 *
 * The base URL is the Loader's own: the composition file sits in a fresh
 * temporary directory that carries a `node_modules/@ai4rpg/dsh-tavern-preset`
 * symlink back to this repository, so the generated
 * `createRequire(baseUrl).resolve('@ai4rpg/dsh-tavern-preset/package.json')`
 * expression resolves to THIS checkout's `skills/` directory rather than a
 * copied fixture.
 */

import { mkdir, mkdtemp, readdir, readFile as readFileReal, rm, stat as statReal, symlink, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { Group, Loader } from '@deepseek-ai/cordis-plugin-loader'
import { Include } from '@deepseek-ai/cordis-plugin-include'
import { parse, stringify } from 'yaml'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPreset from '@deepseek-ai/dsh-agent-preset'
import AgentPresets, { auditRows } from '@deepseek-ai/dsh-agent-preset-registry'
import { FileSystem, FsTargetKey, FsVersion } from '@deepseek-ai/dsh-fs'
import type { FsDirEntry, FsInfo, FsTarget, FsWriteOutcome } from '@deepseek-ai/dsh-fs'
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import * as Persona from '@deepseek-ai/dsh-persona'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import SessionProjection from '@deepseek-ai/dsh-session-projection'
import * as ShellEnv from '@deepseek-ai/dsh-shell-env'
import { ShellExecutor } from '@deepseek-ai/dsh-shell'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import * as SpawnInProcess from '@deepseek-ai/dsh-subagent-spawn-in-process'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import * as ToolBash from '@deepseek-ai/dsh-tool-bash'
import * as ToolFs from '@deepseek-ai/dsh-tool-fs'
import * as ToolFsSearch from '@deepseek-ai/dsh-tool-fs-search'
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill'
import * as ToolSubagent from '@deepseek-ai/dsh-tool-subagent'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import StageController from '@ai4rpg/dsh-stage-switch'
import * as TavernStages from '@ai4rpg/dsh-tavern-stages'

/** This checkout, as the realpath a resolved `!!js` expression lands on. */
export const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

/** The resume-contract preset identity declared by `cordis.patch.yml`. */
export const PRESET_ID = 'tavern-standard'

/** The Loader row id of that declaration. */
export const PRESET_ROW_ID = 'preset-tavern-standard'

/** The declared plugin rows whose runtime behaviour this host plane supports. */
export const MOUNTED_ROW_IDS = ['persona', 'skill-filesystem', 'tavern'] as const

/**
 * The child-preset rows this host plane mounts. The child declarations also
 * carry `agent-instructions` and the compaction group; those add no tool and
 * need services outside this harness, so they stay statically pinned by
 * `tests/preset.spec.ts` (a reduced row set, same tradeoff as
 * {@link MOUNTED_ROW_IDS}).
 */
export const CHILD_MOUNTED_ROW_IDS = [
  'persona', 'tool-fs', 'tool-fs-search', 'skill-filesystem', 'tool-skill', 'tool-bash',
] as const

/** The tavern group's row id, the subtree carrying the stage machine. */
export const TAVERN_ROW_ID = 'tavern'

/** The four named delegation tools the preset's tavern group declares. */
export const DELEGATION_TOOLS = [
  'check-agent', 'conversion-agent', 'first-message-agent', 'schema-agent',
] as const

/** Specifier of the in-memory `dsh-fs` backend this harness composes. */
const MEMORY_FS = 'test:memory-fs'

/** Specifier of the inert `subprocess` seam stub (search tools mount, never run). */
const TEST_SUBPROCESS = 'test:subprocess'

/** Specifier of the inert `shell` seam stub (bash mounts, never runs). */
const TEST_SHELL = 'test:shell'

/**
 * The `subprocess` seam, present only so `tool-fs-search` can register its
 * `glob`/`grep` tools. This suite never executes a search.
 */
class TestSubprocess extends SubprocessRuntime {
  override async resolveExecutable(): Promise<never> {
    throw new Error('the composition harness never runs a subprocess')
  }

  override async terminalEnvironment(): Promise<{ platform: 'posix' | 'windows', defaultShell: string }> {
    return {
      platform: process.platform === 'win32' ? 'windows' : 'posix',
      defaultShell: process.platform === 'win32' ? 'pwsh' : 'bash',
    }
  }

  override spawn(): never {
    throw new Error('the composition harness never runs a subprocess')
  }

  override async spawnTerminal(): Promise<never> {
    throw new Error('the composition harness never runs a subprocess')
  }
}

/**
 * The `shell` seam, present only so `tool-bash` can register its tool. This
 * suite asserts the tool catalog, not command execution.
 */
class TestShell extends ShellExecutor {
  override resolve(): never {
    throw new Error('the composition harness never runs a shell command')
  }

  override async execute(): Promise<never> {
    throw new Error('the composition harness never runs a shell command')
  }
}

/** A Loader entry row as `cordis.patch.yml` writes it. */
export interface Row {
  id?: string
  name: string
  group?: boolean
  disabled?: boolean
  isolate?: Record<string, boolean>
  config?: Record<string, unknown>
  [key: string]: unknown
}

/** A `!!js` Loader expression, the shape the Loader's `interpolate` evaluates. */
interface JsExpr {
  __jsExpr: string
}

const isJsExpr = (value: unknown): value is JsExpr =>
  typeof value === 'object' && value !== null && '__jsExpr' in value

/** Read one `!!js` expression out of a parsed node or a freshly built value. */
function jsExprText(item: unknown): string {
  const direct = (item as JsExpr | undefined)?.__jsExpr
  if (typeof direct === 'string') return direct
  // Stringifying a PARSED document hands the tag its Scalar node, not the value.
  const wrapped = (item as { value?: unknown } | undefined)?.value
  const nested = (wrapped as JsExpr | undefined)?.__jsExpr
  if (typeof nested === 'string') return nested
  throw new Error(`composition helper: expected a !!js expression, got ${JSON.stringify(item)}`)
}

/**
 * The patch dialect's `!!js` tag.
 *
 * `resolve` keeps the expression source in a plain object so the read/reduce/
 * write cycle can re-emit it verbatim; `identify`/`stringify` write it back as
 * the `!!js <expr>` scalar the Loader's own YAML reader expects.
 */
const JS_TAG = {
  tag: 'tag:yaml.org,2002:js',
  resolve: (value: string): JsExpr => ({ __jsExpr: value }),
  identify: isJsExpr,
  stringify: jsExprText,
}

/** The declaration row and its child plugin rows, `!!js` nodes intact. */
export interface PatchDeclaration {
  readonly row: Row
  readonly plugins: Row[]
}

/**
 * Read every row the generated patch inserts: the main declaration, the four
 * child declarations, and the host-plane sidebar row. The file is parsed,
 * never pattern-matched: reductions below have to move real YAML nodes
 * (including tagged `!!js` scalars) around, and a text-level edit would quietly
 * drop the tag.
 * @returns all inserted rows, in patch order.
 */
export function readPatchInsertions(): Row[] {
  const patch = parse(readFileSync(join(repoRoot, 'cordis.patch.yml'), 'utf8'), { customTags: [JS_TAG] }) as Row[]
  return (patch[0]?.insert ?? []) as Row[]
}

/**
 * Read the generated patch's `preset-tavern-standard` declaration.
 * @returns the declaration row plus its declared child plugin rows.
 */
export function readPatchDeclaration(): PatchDeclaration {
  const inserted = readPatchInsertions()
  const row = inserted.find(candidate => candidate.id === PRESET_ROW_ID)
  if (row === undefined) throw new Error(`cordis.patch.yml no longer declares the "${PRESET_ROW_ID}" row`)
  const plugins = (row.config?.plugins ?? []) as Row[]
  if (plugins.length === 0) throw new Error(`cordis.patch.yml declares no plugins for "${PRESET_ROW_ID}"`)
  return { row, plugins }
}

/**
 * Reduce one child declaration's plugin list to {@link CHILD_MOUNTED_ROW_IDS}.
 * `tool-bash` is kept only where the child declares it; the platform-disabled
 * `tool-pwsh` row is dropped rather than mounting a Windows-only tool.
 * @param row - a `preset-tavern-child-*` declaration row.
 * @returns the reduced declaration row.
 */
export function mountedChildDeclaration(row: Row): Row {
  const plugins = (row.config?.plugins ?? []) as Row[]
  const byId = new Map(plugins.map(entry => [entry.id, entry]))
  const mounted = CHILD_MOUNTED_ROW_IDS.flatMap((id) => {
    const entry = byId.get(id)
    if (entry === undefined) return []
    const clone = structuredClone(entry)
    if (id === 'skill-filesystem') {
      const config = (clone.config ??= {}) as Record<string, unknown>
      config.watch = false
      config.includeDefaultRoots = false
    }
    return [clone]
  })
  return { ...row, config: { ...row.config, plugins: mounted } }
}

/**
 * Reduce a declaration's plugin list to {@link MOUNTED_ROW_IDS}, in order.
 *
 * Cloning keeps the parsed nodes (and their tags) untouched while the caller
 * rewrites the surrounding declaration.
 * @param plugins - the declared child plugin rows.
 * @returns the rows this host plane composes.
 */
export function mountedPluginRows(plugins: readonly Row[]): Row[] {
  const byId = new Map(plugins.map(row => [row.id, row]))
  return MOUNTED_ROW_IDS.map((id) => {
    const row = byId.get(id)
    if (row === undefined) throw new Error(`the generated preset no longer declares a "${id}" row`)
    const clone = structuredClone(row)
    // The skill watcher adds no composition-level behaviour and its startup
    // race would make the catalog flaky: the expression semantics stay
    // covered verbatim by tests/skill-discovery.spec.ts.
    if (id === 'skill-filesystem') {
      const config = (clone.config ??= {}) as Record<string, unknown>
      config.watch = false
      config.includeDefaultRoots = false
    }
    return clone
  })
}

/** The `stage-switch` row inside a tavern group row. */
export function stageSwitchRowOf(group: Row): Row {
  const children = (group.config ?? []) as unknown as Row[]
  const stageSwitch = children.find(row => row.id === 'stage-switch')
  if (stageSwitch === undefined) throw new Error('the tavern group declares no stage-switch row')
  return stageSwitch
}

/** The tavern group row of a declaration's plugin list. */
export function tavernGroupOf(plugins: readonly Row[]): Row {
  const group = plugins.find(row => row.id === TAVERN_ROW_ID)
  if (group === undefined) throw new Error(`the generated preset declares no "${TAVERN_ROW_ID}" group`)
  return group
}

/**
 * An in-memory `dsh-fs` backend with a real-filesystem fallback.
 *
 * `@deepseek-ai/dsh-fs` ships the abstract provider; a deployment composes a
 * concrete backend (the local one, a sandboxed one). The tavern rows resolve
 * `fs` through the host plane, so the composition needs one mounted: fixture
 * project files live in the memory map, and paths the map does not manage
 * (the preset package's own `skills/` tree, which the skill-filesystem row
 * discovers through the same `fs` service) fall through to the real host
 * filesystem, mirroring what the local backend does in a real profile.
 */
export class MemoryFs extends FileSystem {
  /** Absolute display path → file content. */
  readonly files = new Map<string, string>()

  override async resolve(path: string, opts?: { cwd?: string }): Promise<FsTarget> {
    const absolute = path.startsWith('/') ? path : join(opts?.cwd ?? '/', path)
    return { targetKey: FsTargetKey(`memory:${absolute}`), displayPath: absolute }
  }

  override processPath(target: FsTarget): string {
    return target.displayPath
  }

  override fileUrl(target: FsTarget): string {
    return pathToFileURL(target.displayPath).href
  }

  override contains(parent: FsTarget, child: FsTarget): boolean {
    return child.displayPath === parent.displayPath || child.displayPath.startsWith(`${parent.displayPath}/`)
  }

  override async stat(target: FsTarget): Promise<FsInfo | undefined> {
    const content = this.files.get(target.displayPath)
    if (content !== undefined) return { version: FsVersion('memory-v1'), type: 'file', size: content.length }
    try {
      const info = await statReal(target.displayPath)
      return {
        version: FsVersion('host-v1'),
        type: info.isDirectory() ? 'directory' : 'file',
        size: Number(info.size),
      }
    } catch {
      return undefined
    }
  }

  override async lstat(): Promise<undefined> {
    return undefined
  }

  override async readText(target: FsTarget): Promise<string> {
    const content = this.files.get(target.displayPath)
    if (content !== undefined) return content
    return await readFileReal(target.displayPath, 'utf8')
  }

  override async streamText(target: FsTarget): Promise<AsyncIterable<string>> {
    const content = this.files.get(target.displayPath)
    return (async function* () {
      if (content !== undefined) yield content
    })()
  }

  override async readBytes(): Promise<Uint8Array> {
    return new Uint8Array()
  }

  override async readByteRange(target: FsTarget, range: { offset: number, length: number }): Promise<Uint8Array> {
    const managed = this.files.get(target.displayPath)
    const bytes = managed !== undefined
      ? new TextEncoder().encode(managed)
      : new Uint8Array(await readFileReal(target.displayPath))
    return bytes.subarray(range.offset, range.offset + range.length)
  }

  override async listDir(target: FsTarget): Promise<FsDirEntry[]> {
    const prefix = target.displayPath.endsWith('/') ? target.displayPath : `${target.displayPath}/`
    const entries: FsDirEntry[] = []
    const seen = new Set<string>()
    try {
      for (const entry of await readdir(target.displayPath, { withFileTypes: true })) {
        seen.add(entry.name)
        const child = join(target.displayPath, entry.name)
        entries.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          target: { targetKey: FsTargetKey(`memory:${child}`), displayPath: child },
        })
      }
    } catch {
      // Not a real directory: virtual entries only.
    }
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue
      const name = path.slice(prefix.length).split('/')[0]!
      if (name === '' || seen.has(name)) continue
      seen.add(name)
      const child = join(target.displayPath, name)
      entries.push({ name, type: 'file', target: { targetKey: FsTargetKey(`memory:${child}`), displayPath: child } })
    }
    return entries
  }

  override async writeText(target: FsTarget, content: string): Promise<FsWriteOutcome> {
    const before = this.files.get(target.displayPath) ?? null
    this.files.set(target.displayPath, content)
    return {
      operation: before === null ? 'create' : 'update',
      version: FsVersion('memory-v1'),
      before,
      after: content,
    }
  }

  override async editText(): Promise<never> {
    throw new Error('the composition harness writes whole fixture files only')
  }
}

/** One scripted text answer, the shape a provider-neutral adapter streams. */
export function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: text.length } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/**
 * Scripted `llm` adapter: one queued response per model call, every request
 * recorded so the suite can assert on what the model actually received.
 */
export class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  private readonly script: StreamChunk[][] = []

  /** Queue one response; a turn that calls the model more often fails loud. */
  respond(response: StreamChunk[]): void {
    this.script.push(response)
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const entry = this.script.shift()
    if (entry === undefined) throw new Error('ScriptedAdapter: the script has no response left')
    for (const chunk of entry) yield chunk
  }
}

/** Every string a request carries, so assertions read the model's own input. */
export function requestText(request: GenerateOptions): string {
  const flatten = (value: unknown): string[] => {
    if (typeof value === 'string') return [value]
    if (Array.isArray(value)) return value.flatMap(flatten)
    if (value !== null && typeof value === 'object') return Object.values(value).flatMap(flatten)
    return []
  }
  return [request.system ?? '', ...request.messages.map(message => flatten(message.content).join('\n'))].join('\n')
}

/** The model-visible tool names of one request. */
export function requestTools(request: GenerateOptions): string[] {
  return (request.tools ?? []).map(tool => tool.name)
}

/** A live test composition: the loaded runtime plus its temporary directory. */
export interface Composition {
  readonly ctx: Context
  readonly adapter: ScriptedAdapter
  /** Temporary root: the Loader's baseUrl, and every agent's cwd. */
  readonly root: string
  /** The declaration row as mounted (already reduced to the supported rows). */
  readonly declaration: Row
  readonly fs: MemoryFs
  dispose(): Promise<void>
}

/**
 * The host plane this composition boots.
 *
 * Every row is a real DSH plugin except `test:memory-fs`, the backend for the
 * abstract `fs` capability a deployment supplies. `!!js` reaches plugin
 * config only through a preset row, so these rows carry none.
 */
const HOST_ROWS: Row[] = [
  { id: 'llm', name: '@deepseek-ai/dsh-llm' },
  { id: 'session', name: '@deepseek-ai/dsh-session' },
  { id: 'session-projection', name: '@deepseek-ai/dsh-session-projection' },
  { id: 'system-prompt', name: '@deepseek-ai/dsh-system-prompt' },
  { id: 'tools', name: '@deepseek-ai/dsh-tools' },
  { id: 'working-directory', name: '@deepseek-ai/dsh-working-directory', config: { defaultDirectory: tmpdir() } },
  { id: 'agents', name: '@deepseek-ai/dsh-agent' },
  { id: 'agent-loop', name: '@deepseek-ai/dsh-agent-loop', config: { agents: [] } },
  { id: 'token-meter', name: '@deepseek-ai/dsh-token-meter' },
  { id: 'skills', name: '@deepseek-ai/dsh-skill' },
  { id: 'shell-env', name: '@deepseek-ai/dsh-shell-env', config: {} },
  { id: 'subprocess', name: TEST_SUBPROCESS, config: {} },
  { id: 'shell', name: TEST_SHELL, config: {} },
  // dsh 0.2.1's SubagentRuntime injects `workingDirectory`; the spawn provider
  // is the official local backend the tavern delegation rows bind to.
  { id: 'subagents', name: '@deepseek-ai/dsh-subagent', config: {} },
  { id: 'subagent-spawn', name: '@deepseek-ai/dsh-subagent-spawn-in-process', config: {} },
  { id: 'memory-fs', name: MEMORY_FS, config: {} },
  { id: 'agent-presets', name: '@deepseek-ai/dsh-agent-preset-registry', config: { default: PRESET_ID } },
]

/** Specifier → module, the Loader's module table for this composition. */
const MODULES = new Map<string, unknown>([
  ['@deepseek-ai/dsh-llm', LlmRuntime],
  ['@deepseek-ai/dsh-session', SessionStore],
  ['@deepseek-ai/dsh-session-projection', SessionProjection],
  ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
  ['@deepseek-ai/dsh-tools', ToolRuntime],
  ['@deepseek-ai/dsh-working-directory', WorkingDirectory],
  ['@deepseek-ai/dsh-agent', AgentRegistry],
  ['@deepseek-ai/dsh-agent-loop', AgentLoop],
  ['@deepseek-ai/dsh-token-meter', TokenMeter],
  ['@deepseek-ai/dsh-skill', SkillRegistry],
  ['@deepseek-ai/dsh-shell-env', ShellEnv],
  [TEST_SUBPROCESS, TestSubprocess],
  [TEST_SHELL, TestShell],
  ['@deepseek-ai/dsh-subagent', SubagentRuntime],
  ['@deepseek-ai/dsh-subagent-spawn-in-process', SpawnInProcess],
  [MEMORY_FS, MemoryFs],
  ['@deepseek-ai/dsh-agent-preset-registry', AgentPresets],
  ['@deepseek-ai/dsh-agent-preset', AgentPreset],
  // The mounted preset rows, resolved by the registry's own entry tree.
  ['@deepseek-ai/dsh-persona', Persona],
  ['@deepseek-ai/dsh-skill-filesystem', SkillFilesystem],
  ['@deepseek-ai/dsh-tool-fs', ToolFs],
  ['@deepseek-ai/dsh-tool-fs-search', ToolFsSearch],
  ['@deepseek-ai/dsh-tool-skill', ToolSkill],
  ['@deepseek-ai/dsh-tool-bash', ToolBash],
  ['@deepseek-ai/dsh-tool-subagent', ToolSubagent],
  ['@ai4rpg/dsh-stage-switch', StageController],
  ['@ai4rpg/dsh-tavern-stages', TavernStages],
])

/**
 * Boot the test composition and mount-ready runtime.
 *
 * The preset itself is NOT mounted here: mounting is per-Agent
 * ({@link startAgent}), exactly as the registry's API requires.
 * @param files - fixture files, keyed by path relative to the temporary root.
 * @returns the live composition; the caller disposes it.
 */
export async function loadComposition(files: Record<string, string> = {}): Promise<Composition> {
  const root = await mkdtemp(join(tmpdir(), 'tavern-preset-composition-'))
  // The generated skill-filesystem row resolves this package's own
  // package.json through `createRequire(baseUrl)`; baseUrl is the composition
  // file's directory, so the package must be resolvable FROM THERE. Linking
  // this checkout (rather than copying skills/) keeps the real expression on
  // the real tree.
  await mkdir(join(root, 'node_modules', '@ai4rpg'), { recursive: true })
  await symlink(repoRoot, join(root, 'node_modules', '@ai4rpg', 'dsh-tavern-preset'), 'dir')

  const { row, plugins } = readPatchDeclaration()
  const declaration: Row = {
    ...row,
    config: { ...row.config, plugins: mountedPluginRows(plugins) },
  }
  // Every preset row travels through the Loader so the registry can resolve
  // `agentPreset: tavern-child-*`; child declarations carry a reduced tool set
  // (see mountedChildDeclaration). The host-plane sidebar row is not loaded.
  const declarations = readPatchInsertions()
    .filter(entry => entry.id?.startsWith('preset-'))
    .map(entry => entry.config?.id === PRESET_ID ? declaration : mountedChildDeclaration(entry))
  const configPath = join(root, 'cordis.yml')
  // Re-emitted through the same `!!js` tag, so the Loader evaluates the
  // expression instead of receiving its source text.
  await writeFile(configPath, stringify([...HOST_ROWS, ...declarations], {
    customTags: [JS_TAG],
    aliasDuplicateObjects: false,
    lineWidth: 0,
  }))

  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader, {})
  ctx.loader.builtins.include = Include
  ctx.loader.builtins.group = Group
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      const module = MODULES.get(specifier)
      if (module === undefined) throw new Error(`unexpected Loader import: ${specifier}`)
      return module
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()

  const host = await auditRows(ctx.loader)
  if (host.failed.length > 0 || host.pending.length > 0) {
    throw new Error(`host composition is not usable:\n${[...host.failed, ...host.pending].join('\n')}`)
  }

  const fs = ctx.get('fs') as MemoryFs
  for (const [path, content] of Object.entries(files)) {
    const target = await fs.resolve(path, { cwd: root })
    fs.files.set(target.displayPath, content)
  }

  const adapter = new ScriptedAdapter()
  ctx.llm.registerAdapter(['mock'], adapter)

  return {
    ctx,
    adapter,
    root,
    declaration,
    fs,
    dispose: async () => {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    },
  }
}

/** A created agent plus the preset identity its setup mounted. */
export interface StartedAgent {
  readonly agent: Agent
  readonly presetId: string
}

/**
 * Create a real loop-driven Agent joined to the mounted preset.
 *
 * The preset is mounted through the Agent's own setup callback — the same
 * seam `dsh-api-session-controller` uses — so the session header records the
 * preset and the agent's scope is parented to the preset's standing mount.
 * @param ctx - the composition's context.
 * @param id - session identity.
 * @param cwd - the session working directory.
 * @returns the published agent and the mounted preset's id.
 */
export async function startAgent(ctx: Context, id: string, cwd: string): Promise<StartedAgent> {
  let presetId = ''
  const handle = await ctx.agents.create({
    sessionId: SessionId(id),
    agentOptions: { provider: 'mock', model: 'mock' },
    meta: { cwd, agentPreset: PRESET_ID },
    setup: async (agentCtx: Context) => {
      presetId = (await ctx.agentPresets.mount(agentCtx, PRESET_ID)).id
    },
  })
  return { agent: handle.agent, presetId }
}

/** Poll a synchronous probe until it answers, failing loud on the deadline. */
export async function waitFor<T>(label: string, probe: () => T | undefined, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = probe()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

/**
 * Wait until the official `spawn` provider is registered. The delegation rows
 * bind to it at mount, so the tools exist only once it is present.
 * @param ctx - the composition's context.
 */
export function waitForSpawnProvider(ctx: Context): Promise<string> {
  return waitFor('the spawn subagent provider', () => ctx.subagents.list().includes('spawn') ? 'spawn' : undefined)
}

/**
 * Start one child through the same seam a delegation tool uses: the official
 * `spawn` provider plus an `agentPreset` selecting the child composition.
 * `delivery: 'caller'` keeps the result on the activation and needs no
 * persistence; the tool layer uses parent delivery in production.
 * @param ctx - the composition's context.
 * @param parent - the spawning agent.
 * @param agentPreset - the child preset id.
 * @param prompt - the child's task text.
 * @returns the managed activation.
 */
export async function startChildActivation(
  ctx: Context,
  parent: Agent,
  agentPreset: string,
  prompt: string,
) {
  const signal = AbortSignal.timeout(30_000)
  return await ctx.subagents.startActivation({
    provider: 'spawn',
    label: agentPreset,
    request: {
      parent,
      prompt: [{ type: 'text', text: prompt }],
      agentPreset,
    },
    signal,
    delivery: 'caller',
  })
}

/** Resolve on the agent's next `idle` status. */
export function waitForIdle(ctx: Context, agent: Agent): Promise<void> {
  return new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') {
        dispose()
        resolve()
      }
    })
  })
}

/**
 * Drive one full turn and wait for it to settle.
 * @param ctx - the composition's context.
 * @param agent - the agent to drive.
 * @param text - the user message's text.
 */
export async function runTurn(ctx: Context, agent: Agent, text: string): Promise<void> {
  const idle = waitForIdle(ctx, agent)
  agent.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }))
  await idle
}

/**
 * Seed the stage fold the way production writes it: a `stage-switch` notice.
 *
 * The pre-0.2.0 `{ kind: 'plugin', plugin: 'stage-switch' }` shape is neither
 * a valid `MessageSourceMap` member nor accepted by the persistence path.
 * @param session - the session to seed.
 * @param stage - the stage it is already in.
 */
export function seedStage(session: Session, stage: string): void {
  const summary = `Current stage: ${stage}`
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: summary }],
    source: { kind: 'stage-switch', form: 'notice', summary },
  }), { surfaceOp: 'append' })
}

/** The stage-switch row's config as mounted, typed for assertions. */
export interface StageConfig {
  readonly stages: ReadonlyArray<{ readonly name: string, readonly alias?: string, readonly instruction: string }>
  readonly section: string
  readonly language?: string
  readonly minHandoffTokens?: number
}

/** The mounted stage config, read from the declaration actually loaded. */
export function mountedStageConfig(composition: Composition): StageConfig {
  const tavern = tavernGroupOf((composition.declaration.config?.plugins ?? []) as Row[])
  return stageSwitchRowOf(tavern).config as unknown as StageConfig
}

/** A `dirname` spelling of one project-relative path, for fixture messages. */
export const parentOf = dirname
