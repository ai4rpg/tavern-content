// The preset-side REAL composition obligation (dsh docs/testing.md): the
// generated `tavern-standard` declaration is mounted through the real Loader
// (`tests/helpers/composition.ts` harness), a real loop-driven Agent joins it,
// and the assertions cover what the MODEL sees — the persona prose, the stage
// instruction, the tavern tool surface — plus the skill catalog the
// `skill-filesystem` row's `!!js` expression resolves.
//
// The delegation e2e below starts a child through the official `spawn` provider
// with the same `agentPreset` binding the tool rows use, then reads the child's
// first request: its system prompt is the agent body and its tool catalog is the
// child preset's reduced set.
//
// Deliberately NOT asserted here: the standard toolset rows (bash, fs, jobs,
// plan mode, compaction, …). They are the official base composition; their
// wiring is pinned statically by `tests/preset.spec.ts`, and booting that
// whole stack is not this host plane's job (the harness mounts only
// `MOUNTED_ROW_IDS` and `CHILD_MOUNTED_ROW_IDS`).
import { afterEach, describe, expect, it } from 'vitest'
import { loadTavernAgents } from '@ai4rpg/dsh-tavern-stages'
import {
  DELEGATION_TOOLS,
  PRESET_ID,
  loadComposition,
  mountedStageConfig,
  requestText,
  requestTools,
  runTurn,
  startAgent,
  startChildActivation,
  textResponse,
  waitForSpawnProvider,
  type Composition,
} from './helpers/composition.ts'

const compositions: Composition[] = []

afterEach(async () => {
  for (const composition of compositions.splice(0).reverse()) await composition.dispose()
})

/** Start one child and return the model request it produced. */
async function childRequest(
  composition: Composition,
  presetId: string,
  prompt = 'Run your task.',
) {
  composition.adapter.respond(textResponse('done'))
  const { agent } = await startAgent(composition.ctx, `parent-${presetId}`, composition.root)
  const activation = await startChildActivation(composition.ctx, agent, presetId, prompt)
  await activation.result
  return composition.adapter.requests.at(-1)!
}

describe('tavern-standard through the real loader', () => {
  it('mounts on the declared preset id and exposes the official spawn provider', { timeout: 60_000 }, async () => {
    const composition = await loadComposition()
    compositions.push(composition)
    const { presetId } = await startAgent(composition.ctx, 'providers', composition.root)

    // The resume contract: the mounted preset id is the declared one.
    expect(presetId).toBe(PRESET_ID)
    // dsh 0.2.1 owns delegation: every tavern row binds this one provider.
    expect(await waitForSpawnProvider(composition.ctx)).toBe('spawn')
  })

  it('injects the persona prose and the route stage instruction into the first request, with the full tavern tool surface', { timeout: 60_000 }, async () => {
    const composition = await loadComposition()
    compositions.push(composition)
    const { agent } = await startAgent(composition.ctx, 'first-request', composition.root)
    await waitForSpawnProvider(composition.ctx)

    composition.adapter.respond(textResponse('acknowledged'))
    await runTurn(composition.ctx, agent, 'Hello')

    const request = composition.adapter.requests.at(-1)!
    const text = requestText(request)
    // The persona row is the shipped prose override (not the official base)
    // and carries no `{{cwd}}` suffix: 0.2.1 interpolates strictly.
    expect(text).toContain('SillyTavern character cards')
    expect(text).not.toContain('Your working directory is')
    // A fresh session opens in route; stage-switch injected its instruction.
    const config = mountedStageConfig(composition)
    expect(config.language).toBe('zh')
    const route = config.stages.find(stage => stage.name === 'route')
    expect(route).toBeDefined()
    // The patch carries the localized display alias without changing the
    // durable stage name the switch records.
    expect(route!.alias).toBe('路由')
    expect(text).toContain(route!.instruction.slice(0, 40))
    // The tavern surface: the stage machine's jump tool, the forge tool, and
    // the four delegation tools — all model-visible on turn one.
    const tools = requestTools(request)
    expect(tools).toContain('goto_stage')
    expect(tools).toContain('tavern_forge')
    for (const tool of DELEGATION_TOOLS) expect(tools).toContain(tool)
  })

  it('resolves the three tavern skills to directory bases inside the installed package', { timeout: 60_000 }, async () => {
    const composition = await loadComposition()
    compositions.push(composition)
    await startAgent(composition.ctx, 'skill-catalog', composition.root)

    // The `!!js` customSkillDirs expression was evaluated by the Loader (a
    // stringly-degraded expression would yield zero skills here). The skills
    // live in the preset's scope layer, so the read goes through the same
    // scoped lease `tests/skill-discovery.spec.ts` uses.
    const registry = composition.ctx.get('skills')
    expect(registry).toBeDefined()
    const lease = await composition.ctx.agentPresets.acquireScope(PRESET_ID)
    try {
      const listed = await registry!.list({
        scope: lease.key,
        cwd: composition.root,
        signal: AbortSignal.timeout(30_000),
      })
      const tavern = listed.filter(skill => skill.name.startsWith('tavern-'))
      expect(tavern.map(skill => skill.name).sort()).toEqual(['tavern-cards', 'tavern-design', 'tavern-ui'])
      for (const skill of tavern) {
        const base = skill.resourceBase
        expect(base?.kind, `${skill.name} resolves to a directory base`).toBe('directory')
        if (base?.kind === 'directory') {
          expect(base.path).toContain('/skills/')
        }
      }
    } finally {
      await lease[Symbol.asyncDispose]()
    }
  })
})

describe('tavern child presets through delegation', () => {
  it('runs check-agent with its own body and a read-only tool surface', { timeout: 60_000 }, async () => {
    const composition = await loadComposition()
    compositions.push(composition)
    const request = await childRequest(composition, 'tavern-child-check-agent', 'Review the entry.')

    const text = requestText(request)
    // The persona prefix is the agent body from loadTavernAgents().
    const checkAgent = (await loadTavernAgents()).find(agent => agent.name === 'check-agent')!
    expect(text).toContain(checkAgent.body)
    expect(text).toContain('# check-agent')
    expect(text).toContain('**审稿师**')

    const tools = requestTools(request)
    for (const tool of ['read', 'glob', 'grep', 'skill']) expect(tools).toContain(tool)
    // The reviewer reports; it never edits, runs commands, or sees the parent's
    // stage/delegation surface.
    for (const tool of ['write', 'edit', 'bash', 'pwsh', 'goto_stage', 'tavern_forge']) {
      expect(tools, tool).not.toContain(tool)
    }
  })

  it('gives conversion-agent shell access and keeps the other two children narrow', { timeout: 60_000 }, async () => {
    const composition = await loadComposition()
    compositions.push(composition)

    const conversion = await childRequest(composition, 'tavern-child-conversion-agent')
    const conversionText = requestText(conversion)
    expect(conversionText).toContain('# conversion-agent')
    const conversionTools = requestTools(conversion)
    // tool-bash is platform-gated: bash on POSIX, pwsh on Windows.
    expect(conversionTools.includes('bash') || conversionTools.includes('pwsh')).toBe(true)

    for (const [presetId, marker] of [
      ['tavern-child-schema-agent', '# schema-agent'],
      ['tavern-child-first-message-agent', '# first-message-agent'],
    ] as const) {
      const request = await childRequest(composition, presetId)
      expect(requestText(request)).toContain(marker)
      const tools = requestTools(request)
      expect(tools, presetId).toContain('read')
      expect(tools, presetId).not.toContain('goto_stage')
      expect(tools, presetId).not.toContain('tavern_forge')
      expect(tools, presetId).not.toContain('bash')
      expect(tools, presetId).not.toContain('pwsh')
    }
  })
})
