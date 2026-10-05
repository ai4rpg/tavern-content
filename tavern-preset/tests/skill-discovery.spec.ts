import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DECOY_SKILL,
  OTHER_PRESET_ID,
  PRESET_ID,
  TAVERN_SKILLS,
  mountPresetSkillComposition,
  repoRoot,
  skillsRoot,
  splitFrontmatter,
  type SkillHarness,
  type TavernSkill,
} from './helpers/skill-loader.ts'

/**
 * What the model can see, and who can see it.
 *
 * `dsh-tool-skill` renders each skill's `description` into the model-facing
 * catalog, and the description is the SKILL.md frontmatter verbatim: it is the
 * routing copy a Chinese-language model matches on, so the latin retrieval
 * terms have to survive alongside the prose. Visibility is layer-scoped — the
 * provider registers into the calling preset's layer — and these tests pin both
 * directions of that boundary: nothing leaks out of the preset, and the preset
 * sees nothing that is not its own.
 */

let harness: SkillHarness | undefined

afterEach(async () => {
  await harness?.dispose()
  harness = undefined
})

/**
 * Per-skill routing terms, quoted from the frontmatter: CJK prose plus the
 * latin keys a model searching for "SillyTavern card tooling" matches on.
 */
const DISCOVERY_TERMS: Record<TavernSkill, readonly string[]> = {
  'tavern-design': ['叙事设计', 'design-spec', 'tavern-cards'],
  'tavern-cards': ['世界书', 'SillyTavern', 'MVU'],
  'tavern-ui': ['前端', 'Vue 3', 'tavern_helper_template'],
}

describe('tavern skill descriptions inside the preset scope', () => {
  it('lists the three skills for a preset session, with frontmatter-identical bilingual copy', { timeout: 60_000 }, async () => {
    harness = await mountPresetSkillComposition()
    const { ctx } = harness

    // The read is the consumer's: an explicit scope (the preset the session
    // selected), a cwd, and an abort signal.
    const summaries = await harness.withPresetScope(PRESET_ID, scope =>
      ctx.skills.list({ scope, cwd: repoRoot, signal: AbortSignal.timeout(30_000) }))

    expect(summaries.map(skill => skill.name).sort()).toEqual(['tavern-cards', 'tavern-design', 'tavern-ui'])
    for (const summary of summaries) {
      const name = summary.name as TavernSkill
      const { data } = splitFrontmatter(await readFile(join(skillsRoot, name, 'SKILL.md'), 'utf8'))

      expect(summary.description, `${name} description is not empty`).not.toBe('')
      expect(summary.description, `${name} description is the SKILL.md frontmatter`).toBe(data.description)
      for (const term of DISCOVERY_TERMS[name]) {
        expect(summary.description, `${name} exposes the "${term}" retrieval term`).toContain(term)
      }
      // Bilingual copy: prose in Chinese, identifiers in latin script.
      expect(summary.description, `${name} carries Chinese prose`).toMatch(/[\u4e00-\u9fff]/)
      expect(summary.description, `${name} carries latin retrieval terms`).toMatch(/[A-Za-z]{2,}/)
    }
  })

  it('keeps the loaded body and description in sync with the file', { timeout: 60_000 }, async () => {
    harness = await mountPresetSkillComposition()

    for (const name of TAVERN_SKILLS) {
      const { data, body } = splitFrontmatter(await readFile(join(skillsRoot, name, 'SKILL.md'), 'utf8'))
      const skill = await harness.loadPresetSkill(name)
      if (skill === undefined) throw new Error(`${name} is not loadable`)

      expect(skill.description).toBe(data.description)
      expect(skill.content).toBe(body.trim())
    }
  })
})

describe('preset scope isolation', () => {
  it('does not leak tavern skills into another preset\'s scope', { timeout: 60_000 }, async () => {
    harness = await mountPresetSkillComposition()
    const { ctx } = harness

    const other = await harness.withPresetScope(OTHER_PRESET_ID, scope =>
      ctx.skills.list({ scope, cwd: repoRoot, signal: AbortSignal.timeout(30_000) }))

    expect(other.map(skill => skill.name)).toEqual([DECOY_SKILL])
  })

  it('does not leak tavern skills into an unscoped global read', { timeout: 60_000 }, async () => {
    harness = await mountPresetSkillComposition()

    // A session that selected no preset reads the global layer alone.
    const global = await harness.listGlobalSkills()
    expect(global.map(skill => skill.name)).toEqual([])

    // ...and the preset scope still sees its three, so the empty read above is
    // isolation rather than an empty catalog.
    expect((await harness.listPresetSkills()).map(skill => skill.name).sort())
      .toEqual(['tavern-cards', 'tavern-design', 'tavern-ui'])
  })
})
