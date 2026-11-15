import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync, writeFileSync, symlinkSync, cpSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
// The synced script stays the single rule implementation; it has no typings.
// @ts-expect-error JavaScript skill content is deliberately not a TS package
import { checkText } from '../skills/tavern-cards/scripts/mechanical-check.mjs'
// @ts-expect-error Build/sync overlay is plain JavaScript
import { mechanicalCheckModule, mechanicalCheckDocs } from '../scripts/mechanical-check-overlay.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const script = join(root, 'skills/tavern-cards/scripts/mechanical-check.mjs')
const upstream = join(root, 'tests/fixtures/mechanical-upstream')
const temporary: string[] = []
afterEach(() => { for (const dir of temporary.splice(0)) rmSync(dir, { force: true, recursive: true }) })
function fixture(text: string | Buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'mechanical-engine-'))
  temporary.push(dir)
  const file = join(dir, '中文 file.txt')
  writeFileSync(file, text)
  return file
}
function cli(file?: string, ...args: string[]) {
  return spawnSync(process.execPath, [script, ...args, ...file ? [file] : []], { encoding: 'utf8' })
}

describe('single-source mechanical rules', () => {
  it('is safe to import with CLI-looking argv: no content reads, output or process exit', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      `process.argv=['node','not-the-script','missing-file.txt']; await import(${JSON.stringify(pathToFileURL(script).href)}); console.log('imported');`,
    ], { encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('imported\n')
    expect(result.stderr).toBe('')
  })
  it.each([
    '她把窗边的旧木椅搬到门口。\n',
    '她似乎走开了——这是本卡的写作要点。\n',
    '这是 {{user}} 的行李。\n',
    '<% const state = "似乎——本卡"; %>\n{{getvar::似乎}}\n她提起木桶。\n',
    '她将靠在门边的木板搬进屋里，关门。\n'.repeat(5),
    '她关上房门，提起旧木桶，绕过长桌，走到窗边，放下手中的木桶。\n'.repeat(3),
    '\ufeff她似乎走开了。\r\n',
  ])('keeps CLI JSON identical to checkText for %s', text => {
    const file = fixture(text)
    const run = cli(file, '--json')
    const json = JSON.parse(run.stdout)
    // TextDecoder strips a UTF-8 BOM like the upstream CLI; fs reads do too.
    expect(json.files).toEqual([checkText(file, text)])
    expect(run.status).toBe(json.failed ? 1 : 0)
  })
  for (const legacy of [false, true]) {
    it(`runs the CLI through a symlink (legacy entrypoint=${legacy})`, ({ skip }) => {
      const file = fixture('她似乎走开了。')
      const dir = temporary.at(-1)!
      const link = join(dir, 'linked-checker.mjs')
      let entry = script
      if (legacy) {
        entry = join(dir, 'legacy-checker.mjs')
        writeFileSync(entry, readFileSync(script, 'utf8').replace('let isMain = import.meta.main', 'let isMain = undefined'))
      }
      try {
        symlinkSync(entry, link)
      } catch (error) {
        // Windows without Developer Mode/admin may forbid file symlinks. This
        // is an unavailable test capability, not a passing product assertion.
        if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) {
          skip('Windows file-symlink permission is unavailable')
          return
        }
        throw error
      }
      for (const flags of [[], ['--preserve-symlinks-main']]) {
        const result = spawnSync(process.execPath, [...flags, link, '--json', file], { encoding: 'utf8' })
        expect(result.status).toBe(1)
        expect(JSON.parse(result.stdout).failed).toBe(true)
      }
    })
  }
  it('falls back safely when import.meta.main is unavailable', () => {
    const file = fixture('她似乎走开了。')
    const legacy = join(temporary.at(-1)!, 'legacy-checker.mjs')
    writeFileSync(legacy, readFileSync(script, 'utf8').replace('let isMain = import.meta.main', 'let isMain = undefined'))
    const run = spawnSync(process.execPath, [legacy, '--json', file], { encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(JSON.parse(run.stdout).files).toEqual([checkText(file, '她似乎走开了。')])
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e',
      `process.argv=['node','missing-entry.mjs','missing-file.txt']; await import(${JSON.stringify(pathToFileURL(legacy).href)}); console.log('imported');`,
    ], { encoding: 'utf8' })
    expect(imported.status).toBe(0)
    expect(imported.stdout).toBe('imported\n')
    expect(imported.stderr).toBe('')
    const existing = spawnSync(process.execPath, ['--input-type=module', '-e',
      `process.argv=['node',${JSON.stringify(script)},'missing-file.txt']; await import(${JSON.stringify(pathToFileURL(legacy).href)}); console.log('imported');`,
    ], { encoding: 'utf8' })
    expect(existing.status).toBe(0)
    expect(existing.stdout).toBe('imported\n')
    expect(existing.stderr).toBe('')
  })
  it('preserves soft mode, UTF-8 refusal and usage statuses', () => {
    const file = fixture('她似乎走开了。')
    const soft = cli(file, '--json', '--soft')
    expect(soft.status).toBe(0)
    expect(JSON.parse(soft.stdout).failed).toBe(true)
    expect(cli().status).toBe(2)
    expect(cli(file + '.missing').status).toBe(2)
    for (const bytes of [Buffer.from('正文', 'utf16le'), Buffer.from([0xff, 0xfe, 0x61, 0x00]), Buffer.from([0xd6, 0xd0, 0xce, 0xc4])]) {
      const run = cli(fixture(bytes))
      expect(run.status).toBe(2)
      expect(run.stderr).toContain('UTF-8')
    }
  })
  it('keeps literal hits, code exclusion and segmentation threshold behavior', () => {
    const hard = checkText('entry.yaml', '描述: 她似乎走开了——这是本卡。')
    expect(hard.hard.map((hit: { id: string }) => hit.id)).toEqual(['dash', 'vague', 'meta'])
    expect(checkText('0.txt', '她将靠在门边的木板搬进屋里，关门。\n'.repeat(5)).clause.tailFail).toBe(true)
    expect(checkText('0.txt', '她将靠在门边的木板搬进屋里，关门。\n'.repeat(2)).clause.tailFail).toBe(false)
    expect(checkText('0.txt', '「她将靠在门边的木板搬进屋里，关门。」\n'.repeat(5)).clause.tailFail).toBe(false)
    expect(checkText('0.txt', '<% const x="似乎——" %>').hard).toEqual([])
    expect(() => checkText('0.txt', '\0')).toThrow('UTF-8')
  })
})

describe('repeatable DSH sync overlay', () => {
  const blobs = [
    ['SKILL.md', 'dd785a23415cef9d116a68b0ca2c5f55bc05bb9e'],
    ['references/composition.md', 'd1820a72179797fcc3f3cc1c506af678864ee048'],
    ['references/contents-creation/first-message.md', '62926917e32745fbef47b89040e361f4257edb75'],
    ['scripts/mechanical-check.mjs', 'd2b4fd4f7c387d3d37f76fcaef10647ed0e38ffe'],
  ] as const
  it.each(blobs)('keeps the independent upstream input %s at its pinned git blob', (path, blob) => {
    const bytes = readFileSync(join(upstream, 'tavern-cards', path))
    expect(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')).toBe(blob)
  })
  it('recreates the import-safe module from the pinned upstream CLI', () => {
    const original = readFileSync(join(upstream, 'tavern-cards/scripts/mechanical-check.mjs'), 'utf8')
    expect(mechanicalCheckModule(original)).toBe(readFileSync(script, 'utf8'))
    expect(() => mechanicalCheckModule(original.replace('  report.push({', '  unexpected({'))).toThrow('anchor changed')
  })
  it('recreates complete checked-in docs and the script through the real sync pipeline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mechanical-sync-'))
    temporary.push(dir)
    cpSync(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true })
    const run = spawnSync(process.execPath, [join(dir, 'scripts/sync-skills.mjs')], {
      env: { ...process.env, TAVERN_CARDS_ROOT: upstream }, encoding: 'utf8',
    })
    expect(run.status, run.stderr).toBe(0)
    for (const [path] of blobs) {
      const relative = join('skills/tavern-cards', path)
      expect(readFileSync(join(dir, relative), 'utf8'), relative).toBe(readFileSync(join(root, relative), 'utf8'))
    }
  })
  it('documents automatic feedback once, with explicit manual and review fallback', () => {
    const skill = readFileSync(join(root, 'skills/tavern-cards/SKILL.md'), 'utf8')
    const composition = readFileSync(join(root, 'skills/tavern-cards/references/composition.md'), 'utf8')
    const opening = readFileSync(join(root, 'skills/tavern-cards/references/contents-creation/first-message.md'), 'utf8')
    expect(skill).toContain('write` / `edit` 后自动返回报告')
    expect(composition).toContain('resourceBase.path')
    expect(composition).toContain('bash / 外部编辑器')
    expect(composition).toContain('不会自动回滚或阻止注册、打包')
    expect(composition.match(/### 自动检查与手动兜底/g)).toHaveLength(1)
    expect(opening).not.toContain('运行 `node scripts/mechanical-check.mjs')
    expect(opening).toContain('只读 `tavern_check`')
    expect(() => mechanicalCheckDocs('SKILL.md', 'changed upstream')).toThrow('anchor changed')
  })
})
