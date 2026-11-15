import { afterEach, describe, expect, it } from 'vitest'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { join } from 'node:path'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import {
  loadComposition, startAgent, startChildActivation, textResponse, runTurn,
  requestText, requestTools, type Composition,
} from './helpers/composition.ts'

const compositions: Composition[] = []
afterEach(async () => { for (const composition of compositions.splice(0)) await composition.dispose() })
const fixtures = {
  '.cardrc.json': JSON.stringify({ projects: { Demo: { state_file: 'cards/Demo/state.json' } } }),
  'cards/Demo/创作规划.yaml': 'entries:\n  - name: entry\n    type: 角色\n    path: 世界书/角色/entry.yaml\nfirst_messages:\n  - output_path: 开场白/0.txt\n',
}
let counter = 0
function toolResponse(name: string, args: object): StreamChunk[] {
  const id = ToolCallId(`mechanical-${++counter}`)
  const argumentsJson = JSON.stringify(args)
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 10 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

/** Read the real persistence backend after the live loop's durability barrier. */
async function storedEvents(composition: Composition, id: SessionId): Promise<readonly SessionEvent[]> {
  const live = composition.ctx.sessions.get(id)
  if (live !== undefined) await composition.ctx.sessions.flush(live)
  await composition.ctx.sessionPersistence.flush()
  const handle = await composition.ctx.sessionPersistence.open(id, 'read')
  try { return (await handle.read()).events } finally { await handle.close() }
}

/** Report insertion is once per saved call, after its result and before the next answer. */
function assertReportOrder(events: readonly SessionEvent[], count: number): void {
  const results = events.filter(event => event.type === 'tool/result')
  const reports = events.filter(event => event.type === 'user/message'
    && event.data.source.kind === 'tavern-mechanical-check')
  const enqueued = events.filter(event => event.type === 'agent/inbox/spliced'
    && event.data.inserted.some(message => message.source.kind === 'tavern-mechanical-check'))
  expect(results).toHaveLength(count)
  expect(reports).toHaveLength(count)
  expect(enqueued).toHaveLength(count)
  for (let index = 0; index < count; index++) {
    const result = results[index]!
    expect(result.type === 'tool/result' && result.data.message.isError).not.toBe(true)
    expect(result.seq).toBeLessThan(enqueued[index]!.seq)
    expect(enqueued[index]!.seq).toBeLessThan(reports[index]!.seq)
    const nextAnswer = events.find(event => event.type === 'assistant/message' && event.seq > reports[index]!.seq)
    expect(nextAnswer).toBeDefined()
    if (index + 1 < count) expect(nextAnswer!.seq).toBeLessThan(results[index + 1]!.seq)
  }
}

describe('automatic mechanical feedback in the generated preset', () => {
  it('returns a real report to the parent writer without failing the saved write', { timeout: 60_000 }, async () => {
    const composition = await loadComposition(fixtures)
    compositions.push(composition)
    const { agent } = await startAgent(composition.ctx, 'mechanical-parent', composition.root)
    composition.adapter.respond(toolResponse('write', { file_path: 'cards/Demo/世界书/角色/entry.yaml', content: '描述: 她似乎走开了。' }))
    composition.adapter.respond(textResponse('will fix'))
    await runTurn(composition.ctx, agent, 'Write the planned entry.')
    expect(composition.fs.files.get(join(composition.root, 'cards/Demo/世界书/角色/entry.yaml'))).toBe('描述: 她似乎走开了。')
    const request = requestText(composition.adapter.requests.at(-1)!)
    expect(request).toContain('机械检查有命中')
    expect(request).toContain('模糊词')
    expect(request.match(/机械检查 \[checked\]/g)).toHaveLength(1)
    expect(requestTools(composition.adapter.requests[0]!)).not.toContain('tavern_check')
    assertReportOrder(await storedEvents(composition, agent.id), 1)

    composition.adapter.respond(toolResponse('edit', { file_path: 'cards/Demo/世界书/角色/entry.yaml', old_string: '似乎', new_string: '' }))
    composition.adapter.respond(textResponse('fixed'))
    await runTurn(composition.ctx, agent, 'Fix the flagged phrase.')
    expect(composition.fs.files.get(join(composition.root, 'cards/Demo/世界书/角色/entry.yaml'))).toBe('描述: 她走开了。')
    expect(requestText(composition.adapter.requests.at(-1)!)).toContain('机械项零命中')
    assertReportOrder(await storedEvents(composition, agent.id), 2)
  })

  it('keeps an unclassified saved write successful while reporting incomplete instead of passed', { timeout: 60_000 }, async () => {
    const composition = await loadComposition(fixtures)
    compositions.push(composition)
    const { agent } = await startAgent(composition.ctx, 'mechanical-unclassified', composition.root)
    composition.adapter.respond(toolResponse('write', { file_path: 'cards/Demo/unclassified.txt', content: '她走开了。' }))
    composition.adapter.respond(textResponse('classification needed'))
    await runTurn(composition.ctx, agent, 'Write a file outside the declared prose outputs.')
    expect(composition.fs.files.get(join(composition.root, 'cards/Demo/unclassified.txt'))).toBe('她走开了。')
    const next = requestText(composition.adapter.requests.at(-1)!)
    expect(next).toContain('机械检查 [incomplete]')
    expect(next).not.toContain('机械项零命中')
    const events = await storedEvents(composition, agent.id)
    const result = events.find(event => event.type === 'tool/result')
    expect(result?.type === 'tool/result' && result.data.message.isError).not.toBe(true)
    expect(events.filter(event => event.type === 'user/message' && event.data.source.kind === 'tavern-mechanical-check')).toHaveLength(1)
  })

  it('does not leak mechanical hooks or reviewer tools into another preset', { timeout: 60_000 }, async () => {
    const composition = await loadComposition(fixtures)
    compositions.push(composition)
    await startAgent(composition.ctx, 'mounted-tavern-parent', composition.root)
    await composition.ctx.plugin(Object.assign(async (ctx: typeof composition.ctx) => {
      await ctx.agentPresets.register({ id: 'plain-test', name: 'Plain', plugins: [] })
    }, { inject: ['agentPresets'] }))
    const { agent } = await startAgent(composition.ctx, 'plain-agent', composition.root, 'plain-test')
    // The unrelated preset has no filesystem editor, so dispatch a minimal
    // successful write-shaped fixture through the global pipeline to verify
    // another preset's mounted listener is not admitted by scope routing.
    composition.ctx.tools.register({
      name: 'write', description: 'test-only write', parameters: { type: 'object', properties: {} },
      output: { schema: {}, render: () => [{ type: 'text', text: 'saved' }] },
      execute: async () => ({ path: join(composition.root, 'cards/Demo/开场白/0.txt'), after: '她似乎走开了。' }),
    })
    const callId = ToolCallId(`plain-${++counter}`)
    const batch = await composition.ctx.tools.execute({
      calls: [{ type: 'tool-call', id: callId, name: 'write', arguments: '{}' }],
      agent, signal: new AbortController().signal,
    })
    expect(batch.results).toHaveLength(1)
    expect(batch.results[0]!.callId).toBe(callId)
    expect(batch.results[0]!.result.isError).toBe(false)
    expect(batch.results[0]!.result.additionalContexts).toBeUndefined()
    expect(batch.additionalContexts).toEqual([])
    expect(composition.ctx.tools.get('tavern_check', agent)).toBeUndefined()
  })

  it('checks first-message child write/edit in its own scope before its next model request', { timeout: 60_000 }, async () => {
    const composition = await loadComposition(fixtures)
    compositions.push(composition)
    const { agent } = await startAgent(composition.ctx, 'mechanical-child-parent', composition.root)
    composition.adapter.respond(toolResponse('write', { file_path: 'cards/Demo/开场白/0.txt', content: '她似乎走开了。' }))
    composition.adapter.respond(toolResponse('edit', { file_path: 'cards/Demo/开场白/0.txt', old_string: '似乎', new_string: '' }))
    composition.adapter.respond(textResponse('done'))
    const activation = await startChildActivation(composition.ctx, agent, 'tavern-child-first-message-agent', 'Write and fix the opening.')
    await activation.result
    const requests = composition.adapter.requests
    expect(requestText(requests[1]!)).toContain('机械检查有命中')
    expect(requestText(requests[2]!)).toContain('机械项零命中')
    expect(requestText(requests[2]!).match(/机械检查 \[checked\]/g)).toHaveLength(2)
    expect(composition.fs.files.get(join(composition.root, 'cards/Demo/开场白/0.txt'))).toBe('她走开了。')
    expect(requestTools(requests[0]!)).not.toContain('tavern_check')
    assertReportOrder(await storedEvents(composition, activation.childId), 2)
    const parentEvents = await storedEvents(composition, agent.id)
    expect(parentEvents.some(event => event.type === 'user/message'
      && event.data.source.kind === 'tavern-mechanical-check')).toBe(false)
  })

  it('lets the read-only reviewer independently scan the actual current file, not a parent assertion', { timeout: 60_000 }, async () => {
    const composition = await loadComposition({ ...fixtures, 'cards/Demo/开场白/0.txt': '她似乎走开了。' })
    compositions.push(composition)
    const { agent } = await startAgent(composition.ctx, 'mechanical-review-parent', composition.root)
    composition.adapter.respond(toolResponse('write', { file_path: 'cards/Demo/开场白/0.txt', content: 'must not save' }))
    composition.adapter.respond(toolResponse('tavern_check', { paths: ['cards/Demo/开场白/0.txt'] }))
    composition.adapter.respond(textResponse('found vague phrase'))
    const activation = await startChildActivation(composition.ctx, agent, 'tavern-child-check-agent', 'Parent claims mechanical passed. Review this opening.')
    await activation.result
    const first = composition.adapter.requests[0]!
    expect(requestText(composition.adapter.requests[1]!)).toContain('unknown tool')
    const second = composition.adapter.requests[2]!
    expect(requestTools(first)).toContain('tavern_check')
    for (const forbidden of ['write', 'edit', 'apply_patch', 'bash', 'pwsh', 'tavern_forge', 'goto_stage']) expect(requestTools(first)).not.toContain(forbidden)
    expect(requestText(second)).toContain('机械检查有命中')
    expect(requestText(second)).toContain('模糊词')
    expect(composition.fs.files.get(join(composition.root, 'cards/Demo/开场白/0.txt'))).toBe('她似乎走开了。')
    expect(requestText(second).match(/机械检查 \[checked\]/g)).toHaveLength(1)
    const results = (await storedEvents(composition, activation.childId)).filter(event => event.type === 'tool/result')
    expect(results).toHaveLength(2)
    expect(results[0]!.type === 'tool/result' && results[0]!.data.message.isError).toBe(true)
    expect(results[1]!.type === 'tool/result' && results[1]!.data.message.isError).not.toBe(true)
  })
})
