/** Validated generator input, never loaded by an installed profile. */
export interface AgentSource {
  readonly name: string
  readonly description: string
  readonly body: string
}
export const REQUIRED_AGENTS: readonly string[]
export function loadAgents(sourceRoot?: string): Promise<AgentSource[]>
