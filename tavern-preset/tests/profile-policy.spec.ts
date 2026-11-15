import { afterEach, describe, expect, it } from 'vitest'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { loadComposition, startAgent, type Composition } from './helpers/composition.ts'

const compositions: Composition[] = []
afterEach(async () => { for (const composition of compositions.splice(0)) await composition.dispose() })

async function managementCall(composition: Composition, id: string) {
  const { agent } = await startAgent(composition.ctx, id, composition.root)
  const callId = ToolCallId(`management-${id}`)
  const batch = await composition.ctx.tools.execute({
    calls: [{ type: 'tool-call', id: callId, name: 'plugin_manager', arguments: '{"action":"list_plugins"}' }],
    agent, signal: AbortSignal.timeout(30_000),
  })
  expect(batch.results).toHaveLength(1)
  expect(batch.results[0]!.callId).toBe(callId)
  return { agent, result: batch.results[0]!.result }
}

describe('generated rc.3 profile-dependent plugin management row', () => {
  it('stays disabled without profileContext', { timeout: 60_000 }, async () => {
    const composition = await loadComposition({}, { pluginManager: { profile: false, mode: 'danger-full-access' } })
    compositions.push(composition)
    const { agent } = await startAgent(composition.ctx, 'no-profile', composition.root)
    expect(composition.ctx.tools.get('plugin_manager', agent)).toBeUndefined()
    expect(composition.pluginCalls).toEqual([])
  })

  it('activates with profileContext but refuses without approval under read-only policy', { timeout: 60_000 }, async () => {
    const composition = await loadComposition({}, { pluginManager: { profile: true, mode: 'read-only' } })
    compositions.push(composition)
    const { agent, result } = await managementCall(composition, 'profile-no-approval')
    expect(composition.ctx.tools.get('plugin_manager', agent)).toBeDefined()
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('requires approval')
    expect(composition.pluginCalls).toEqual([])
  })

  it('permits a non-mutating management call only in full access', { timeout: 60_000 }, async () => {
    const composition = await loadComposition({}, { pluginManager: { profile: true, mode: 'danger-full-access' } })
    compositions.push(composition)
    const { agent, result } = await managementCall(composition, 'profile-full-access')
    expect(composition.ctx.tools.get('plugin_manager', agent)).toBeDefined()
    expect(result.isError).toBe(false)
    expect(composition.pluginCalls).toEqual(['list_plugins'])
    expect(result.value).toBe('{"entries":[],"total":0,"nextOffset":null}')
  })
})
