// Type declarations for the shared agent-file validation module.
// The implementation lives in the sibling `validate-agents.mjs` (plain Node
// ESM, runnable directly by `node` without a build step). This file gives
// TypeScript the shape for both `tests/agents-guard.spec.ts` and any future
// typed import.

export interface Violation {
  /** Agent file name, relative to the validated directory. */
  file: string
  /** Human-readable description of the contract violation. */
  message: string
}

/**
 * Validate every `*.md` file in an agents directory against the frontmatter +
 * body contract documented in `scripts/validate-agents.mjs`.
 * @param agentsDir - absolute or cwd-relative path to the directory.
 * @returns violations in stable (file, then message) order; empty when valid.
 */
export function validateAgents(agentsDir: string): Promise<Violation[]>
