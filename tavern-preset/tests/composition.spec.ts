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
import { sep } from 'node:path'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  DELEGATION_TOOLS,
  PRESET_ID,
  loadComposition,
  mountedStageConfig,
  requestText,
  requestTools,
  readPatchInsertions,
  resumeAgent,
  type Row,
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
    // dsh 0.2.2 owns delegation: every tavern row binds this one provider.
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
    // and carries no `{{cwd}}` suffix: 0.2.2 interpolates strictly.
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
          expect(base.path).toContain(`${sep}skills${sep}`)
        }
      }
    } finally {
      await lease[Symbol.asyncDispose]()
    }
  })
})

describe('tavern child presets through delegation', () => {
  it('dispatches all four tools with rc.3 name receipts and durable parent completion notices', { timeout: 120_000 }, async () => {
    const composition = await loadComposition()
    compositions.push(composition)
    const { ctx, adapter } = composition
    const { agent } = await startAgent(ctx, 'tool-delegation-parent', composition.root)
    await waitForSpawnProvider(ctx)
    for (const tool of DELEGATION_TOOLS) {
      const ended = Promise.withResolvers<string>()
      const starts: { id: string, parentSessionId: string }[] = []
      const order: string[] = []
      const offStart = ctx.on('subagent/start', info => {
        order.push('start')
        starts.push({ id: info.id, parentSessionId: info.parentSessionId })
      })
      const off = ctx.on('subagent/end', info => {
        order.push('end')
        ended.resolve(info.stopReason)
      })
      adapter.respond(textResponse(`completed ${tool}`))
      adapter.respond(textResponse(`received ${tool}`))
      const callId = ToolCallId(`delegate-${tool}`)
      try {
        // A service-level call has scope and execution context but is not a
        // committed model step, so it deliberately supplies no fake log field.
        const batch = await ctx.tools.execute({
          calls: [{ type: 'tool-call', id: callId, name: tool, arguments: JSON.stringify({ description: `Run ${tool}`, prompt: 'Return your result.' }) }],
          agent, signal: AbortSignal.timeout(60_000),
        })
        expect(batch.results).toHaveLength(1)
        expect(batch.results[0]!.callId).toBe(callId)
        const result = batch.results[0]!.result
        expect(result.isError).toBe(false)
        if (result.isError) throw new Error(JSON.stringify(result))
        expect(result.value).toEqual({ kind: 'activation', name: expect.any(String) })
        const childId = await ctx.subagents.resolveName(agent, (result.value as { name: string }).name, AbortSignal.timeout(60_000))
        expect(await ended.promise).toBe('completed')
        expect(order).toEqual(['start', 'end'])
        expect(starts).toEqual([{ id: childId, parentSessionId: agent.id }])
        await agent.whenIdle()
        const notices = agent.session.snapshotEvents().filter(event => event.type === 'user/message'
          && event.data.source.kind === 'subagent-settled' && event.data.source.senderSessionId === childId)
        expect(notices).toHaveLength(1)
        expect(requestText(adapter.requests.at(-1)!)).toContain(`completed ${tool}`)
        await ctx.sessions.flush(agent.session)
        const parentLog = await ctx.sessionPersistence.open(agent.id, 'read')
        try {
          const durableNotices = (await parentLog.read()).events.filter(event => event.type === 'user/message'
            && event.data.source.kind === 'subagent-settled' && event.data.source.senderSessionId === childId)
          expect(durableNotices).toEqual(notices)
        } finally { await parentLog.close() }
        const stored = await ctx.sessionPersistence.open(childId, 'read')
        try {
          expect(stored.header.agentPreset).toBe(`tavern-child-${tool}`)
          expect((await stored.read()).events.some(event => event.type === 'assistant/message')).toBe(true)
        } finally { await stored.close() }
        const listed = await ctx.tools.execute({
          calls: [{ type: 'tool-call', id: ToolCallId(`list-${tool}`), name: 'list_agents', arguments: '{}' }],
          agent, signal: AbortSignal.timeout(60_000),
        })
        expect(listed.results).toHaveLength(1)
        const rows = listed.results[0]!.result
        if (rows.isError) throw new Error(JSON.stringify(rows))
        expect(rows.value).toContainEqual(expect.objectContaining({ name: (result.value as { name: string }).name, status: 'inactive' }))
      } finally { off(); offStart() }
    }
  })

  it('keeps a settled child visible to list_agents after a parent cold resume', { timeout: 120_000 }, async () => {
    const composition = await loadComposition()
    compositions.push(composition)
    const { ctx, adapter } = composition
    const started = await startAgent(ctx, 'lifecycle-parent', composition.root)
    await waitForSpawnProvider(ctx)
    adapter.respond(textResponse('child completed'))
    adapter.respond(textResponse('parent noted the notice'))
    const batch = await ctx.tools.execute({
      calls: [{ type: 'tool-call', id: ToolCallId('lifecycle-delegate'), name: 'check-agent', arguments: JSON.stringify({ description: 'Run check-agent', prompt: 'Return your result.' }) }],
      agent: started.agent, signal: AbortSignal.timeout(60_000),
    })
    const result = batch.results[0]!.result
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error(JSON.stringify(result))
    const receipt = result.value as { kind: 'activation', name: string }
    await started.agent.whenIdle()
    await ctx.sessions.flush(started.agent.session)
    await started.dispose()

    const resumed = await resumeAgent(ctx, 'lifecycle-parent')
    try {
      expect(resumed.presetId).toBe(PRESET_ID)
      const listed = await ctx.tools.execute({
        calls: [{ type: 'tool-call', id: ToolCallId('lifecycle-list'), name: 'list_agents', arguments: '{}' }],
        agent: resumed.agent, signal: AbortSignal.timeout(60_000),
      })
      expect(listed.results).toHaveLength(1)
      const rows = listed.results[0]!.result
      if (rows.isError) throw new Error(JSON.stringify(rows))
      expect(rows.value).toContainEqual(expect.objectContaining({ name: receipt.name, status: 'inactive' }))
    } finally { await resumed.dispose() }
  })

  it('runs check-agent with its own body and a read-only tool surface', { timeout: 60_000 }, async () => {
    const composition = await loadComposition()
    compositions.push(composition)
    const request = await childRequest(composition, 'tavern-child-check-agent', 'Review the entry.')

    const text = requestText(request)
    // Runtime composition needs only the shipped declaration, not source files.
    const child = readPatchInsertions().find(row => row.config?.id === 'tavern-child-check-agent')!
    const persona = (child.config!.plugins as Row[]).find(row => row.id === 'persona')!
    expect(text).toContain(String(persona.config!.prefix))
    expect(text).toContain('# check-agent')
    expect(text).toContain('**审稿师**')

    const tools = requestTools(request)
    for (const tool of ['read', 'glob', 'grep', 'skill', 'tavern_check']) expect(tools).toContain(tool)
    expect(text).toContain('## DSH 机械复查')
    // The reviewer reports; it never edits, runs commands, or sees the parent's
    // stage/delegation surface.
    for (const tool of ['write', 'edit', 'apply_patch', 'bash', 'pwsh', 'goto_stage', 'tavern_forge']) {
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
      expect(tools, presetId).not.toContain('tavern_check')
    }
  })
})
