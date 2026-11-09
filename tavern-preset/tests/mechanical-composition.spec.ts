import { afterEach, describe, expect, it } from 'vitest'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { join } from 'node:path'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
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
    const result = await composition.ctx.tools.execute({
      name: 'write', arguments: {}, callId: ToolCallId(`plain-${++counter}`), agent, signal: new AbortController().signal,
    })
    expect(result.isError).toBe(false)
    expect(result.additionalContexts).toBeUndefined()
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
  })

  it('lets the read-only reviewer independently scan the actual current file, not a parent assertion', { timeout: 60_000 }, async () => {
    const composition = await loadComposition({ ...fixtures, 'cards/Demo/开场白/0.txt': '她似乎走开了。' })
    compositions.push(composition)
    const { agent } = await startAgent(composition.ctx, 'mechanical-review-parent', composition.root)
    composition.adapter.respond(toolResponse('tavern_check', { paths: ['cards/Demo/开场白/0.txt'] }))
    composition.adapter.respond(textResponse('found vague phrase'))
    const activation = await startChildActivation(composition.ctx, agent, 'tavern-child-check-agent', 'Parent claims mechanical passed. Review this opening.')
    await activation.result
    const first = composition.adapter.requests[0]!
    const second = composition.adapter.requests[1]!
    expect(requestTools(first)).toContain('tavern_check')
    for (const forbidden of ['write', 'edit', 'bash', 'pwsh', 'tavern_forge', 'goto_stage']) expect(requestTools(first)).not.toContain(forbidden)
    expect(requestText(second)).toContain('机械检查有命中')
    expect(requestText(second)).toContain('模糊词')
    expect(composition.fs.files.get(join(composition.root, 'cards/Demo/开场白/0.txt'))).toBe('她似乎走开了。')
    expect(requestText(second).match(/机械检查 \[checked\]/g)).toHaveLength(1)
  })
})
