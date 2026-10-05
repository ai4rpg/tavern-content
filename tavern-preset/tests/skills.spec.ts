import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  TAVERN_SKILLS,
  mountPresetSkillComposition,
  skillsRoot,
  splitFrontmatter,
  type SkillHarness,
} from './helpers/skill-loader.ts'

/**
 * The preset package's skill wiring, read through a REAL Loader composition.
 *
 * The preset declares its `skill-filesystem` row with a `!!js`
 * `customSkillDirs` expression that resolves this package from the profile
 * directory. `!!js` is evaluated by the Loader alone, so the harness boots the
 * GENERATED row (taken from `cordis.patch.yml`) from a YAML file; a declaration
 * mounted as a JavaScript object would carry the expression as a string and
 * discover nothing. The last test pins exactly that difference.
 */

let harness: SkillHarness | undefined

afterEach(async () => {
  await harness?.dispose()
  harness = undefined
})

describe('preset skills through the Loader', () => {
  it('discovers exactly the three tavern skills from the generated !!js customSkillDirs', { timeout: 60_000 }, async () => {
    harness = await mountPresetSkillComposition()

    // The expression under test is the generated one, and it is the one the
    // Loader evaluated against the composition's base URL.
    expect(harness.skillDirsExpression).toContain(`createRequire(baseUrl).resolve('@ai4rpg/dsh-tavern-preset/package.json')`)
    // The temp composition carries it as a `!!js` scalar — the Loader dialect
    // that gets evaluated — not as a quoted string.
    const composition = await readFile(join(harness.root, 'cordis.yml'), 'utf8')
    expect(composition).toContain('- !!js process.getBuiltinModule')
    expect(composition).toContain(`resolve('@ai4rpg/dsh-tavern-preset/package.json')`)

    const summaries = await harness.listPresetSkills()
    expect(summaries).toHaveLength(3)
    expect(summaries.map(skill => skill.name).sort()).toEqual(['tavern-cards', 'tavern-design', 'tavern-ui'])
    for (const skill of summaries) {
      // `custom` is the customSkillDirs root: the skills come from the preset's
      // own directory, not from a project/user/bundled root.
      expect(skill.source, `${skill.name} source`).toBe('custom')
      expect(skill.provider, `${skill.name} provider`).toBe('filesystem')
    }
  })

  it('gives every skill a directory base pointing at this repository\'s skills/<name>', { timeout: 60_000 }, async () => {
    harness = await mountPresetSkillComposition()

    for (const name of TAVERN_SKILLS) {
      const skill = await harness.loadPresetSkill(name)
      if (skill === undefined) throw new Error(`${name} is not loadable`)

      expect(skill.resourceBase).toEqual({ kind: 'directory', path: join(skillsRoot, name) })
      const base = skill.resourceBase
      if (base?.kind !== 'directory') throw new Error(`${name} base is ${String(base?.kind)}`)
      // The tavern-stages provider appends relative references to this path, so
      // a trailing slash would produce doubled separators in the prompt.
      expect(base.path.endsWith('/')).toBe(false)
      expect(base.path.endsWith(join('skills', name))).toBe(true)
      // The body is read from the canonical file, symlink and all.
      expect(skill.path).toBe(join(skillsRoot, name, 'SKILL.md'))
    }
  })

  it('loads every skill body non-empty and equal to its SKILL.md body', { timeout: 60_000 }, async () => {
    harness = await mountPresetSkillComposition()

    for (const name of TAVERN_SKILLS) {
      const source = await readFile(join(skillsRoot, name, 'SKILL.md'), 'utf8')
      const { body } = splitFrontmatter(source)
      const heading = body.split('\n').find(line => line.startsWith('# '))
      if (heading === undefined) throw new Error(`${name}/SKILL.md has no heading`)

      const skill = await harness.loadPresetSkill(name)
      if (skill === undefined) throw new Error(`${name} is not loadable`)

      expect(skill.content.length, `${name} content is not empty`).toBeGreaterThan(0)
      expect(skill.content, `${name} content is its SKILL.md body`).toBe(body.trim())
      expect(skill.content, `${name} content carries its heading`).toContain(heading)
    }
  })

  it('control: the same declaration with the expression as a string discovers nothing', { timeout: 60_000 }, async () => {
    // `ctx.plugin(AgentPreset, config)` (and any other JavaScript-object
    // declaration) leaves `!!js` as the source text. The provider then resolves
    // that text as one relative path, finds no skills, and reports an empty
    // catalog instead of an error — which is why only a Loader can prove this
    // wiring, and why the three discovery assertions above are load-bearing.
    harness = await mountPresetSkillComposition({ expressionAsString: true })

    // Same text, no `!!js` tag: the provider reads it as one relative path.
    const composition = await readFile(join(harness.root, 'cordis.yml'), 'utf8')
    expect(composition).not.toContain('!!js')
    expect(harness.skillDirsExpression).toContain('createRequire(baseUrl)')
    await expect(harness.listPresetSkills()).resolves.toEqual([])
  })
})
