// The preset-side REAL composition obligation (dsh docs/testing.md): the
// generated `tavern-standard` declaration is mounted through the real Loader
// (`tests/helpers/composition.ts` harness), a real loop-driven Agent joins it,
// and the assertions cover what the MODEL sees — the persona prose, the stage
// instruction, the tavern tool surface — plus the skill catalog the
// `skill-filesystem` row's `!!js` expression resolves.
//
// Deliberately NOT asserted here: the standard toolset rows (bash, fs, jobs,
// plan mode, compaction, …). They are the official base composition; their
// wiring is pinned statically by `tests/preset.spec.ts`, and booting that
// whole stack is not this host plane's job (the harness mounts only
// `MOUNTED_ROW_IDS`).
import { afterEach, describe, expect, it } from 'vitest'
import {
  DELEGATION_TOOLS,
  PRESET_ID,
  loadComposition,
  mountedStageConfig,
  requestText,
  requestTools,
  runTurn,
  startAgent,
  textResponse,
  waitForTavernProviders,
  type Composition,
} from './helpers/composition.ts'

const compositions: Composition[] = []

afterEach(async () => {
  for (const composition of compositions.splice(0).reverse()) await composition.dispose()
})

describe('tavern-standard through the real loader', () => {
  it('mounts on the declared preset id and registers the four tavern providers', { timeout: 60_000 }, async () => {
    const composition = await loadComposition()
    compositions.push(composition)
    const { presetId } = await startAgent(composition.ctx, 'providers', composition.root)

    // The resume contract: the mounted preset id is the declared one.
    expect(presetId).toBe(PRESET_ID)
    // The tavern-stages row registered one provider per agent, asynchronously
    // inside the preset mount — the delegation tools bind to these names.
    const providers = await waitForTavernProviders(composition.ctx)
    expect(providers).toEqual(DELEGATION_TOOLS.map(name => `tavern:${name}`))
  })

  it('injects the persona prose and the route stage instruction into the first request, with the full tavern tool surface', { timeout: 60_000 }, async () => {
    const composition = await loadComposition()
    compositions.push(composition)
    const { agent } = await startAgent(composition.ctx, 'first-request', composition.root)
    await waitForTavernProviders(composition.ctx)

    composition.adapter.respond(textResponse('acknowledged'))
    await runTurn(composition.ctx, agent, 'Hello')

    const request = composition.adapter.requests.at(-1)!
    const text = requestText(request)
    // The persona row is the shipped prose override (not the official base).
    expect(text).toContain('SillyTavern character cards')
    // A fresh session opens in route; stage-switch injected its instruction.
    const config = mountedStageConfig(composition)
    expect(config.language).toBe('zh')
    const route = config.stages.find(stage => stage.name === 'route')
    expect(route).toBeDefined()
    expect(text).toContain(route!.instruction.slice(0, 40))
    // The tavern surface: the stage machine's jump tool, the forge tool, and
    // the four named delegation tools — all model-visible on turn one.
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
