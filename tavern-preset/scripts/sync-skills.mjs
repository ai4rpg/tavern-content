#!/usr/bin/env node
// Sync the three tavern-cards skill bodies into `skills/` (the canonical source
// the generated preset patch points `skill-filesystem.customSkillDirs` at), as
// a DSH-plugin-specific edition: every forge invocation becomes the actual
// model tool call form `tavern_forge({ command, args })` and no shell fallback
// is mentioned. Skill-local scripts are synced too, except the forge CLI bundle
// (`tavern-cards-forge.mjs`), which stays external.
//
// The three skill bodies are CC BY-NC-SA content: they are NOT under this
// repository's root MIT license and carry their own terms (see `LICENSE.md` and
// `skills/LICENSE.md`).
//
// Pipeline (after copying from TAVERN_CARDS_ROOT):
//   1. rewriteToolFirst           — targeted overlays where a CLI-only idiom
//                                  (stdin pipe, `\` continuation, raw CLI
//                                  framing) has no tool equivalent
//   2. rewriteForgeToolReferences — global: forge CLI mentions -> tavern_forge,
//                                  bash fences around tool calls -> text, then
//                                  tavernForgeToCall turns every invocation into
//                                  the `tavern_forge({ command, args })` form
//   3. removeMisleadingScriptSentences — drop "scripts live here" lines
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = process.env.TAVERN_CARDS_ROOT
if (sourceRoot === undefined) {
  console.error('TAVERN_CARDS_ROOT is not set — point it at a checkout of github.com/ai4rpg/tavern-cards')
  process.exit(1)
}
const skillsRoot = join(root, 'skills')

const skills = [
  'tavern-design',
  'tavern-cards',
  'tavern-ui',
]

/**
 * License notice for the synced skill tree. The skill bodies originate from the
 * upstream ai4rpg/tavern-cards repo and are deliberately NOT under this
 * repository's root MIT license: they carry their own CC BY-NC-SA 4.0 terms.
 * Written into `skills/LICENSE.md` on every sync because the tree is wiped and
 * rebuilt — a hand-added file would be lost on the next run. License changes go
 * here, not into the tree.
 */
const skillsLicenseMd = `# License — skills/

Copyright (c) 2026 ai4rpg

本目录下的 \`tavern-design\` / \`tavern-cards\` / \`tavern-ui\` 三个技能同步自
[github.com/ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards)，
**不受仓库根目录 \`LICENSE.md\`（MIT）的约束**，整体按
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh)
授权：

- **署名（BY）**：使用或再分发时须保留本版权与协议链接，并对修改之处作出说明；
- **非商业（NC）**：不得将本目录内容或其衍生作品用于商业性目的；
- **相同方式共享（SA）**：对本目录内容的改编再分发时，须以 CC BY-NC-SA 4.0
  （或其后版本的相同条款）提供。

完整法律文本见 <https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode>。

> 本文件由 \`scripts/sync-skills.mjs\` 在每次技能同步时生成；如需调整许可条款，
> 请修改该脚本，手改本文件会在下次同步时被覆盖。
`

/**
 * Targeted DSH overlay rewrites. Each `old` matches the freshly copied
 * SOURCE text (run before rewriteForgeToolReferences). These are spots
 * where a pure CLI->tool rename would leave a shell-only idiom behind
 * (stdin pipe, backslash continuation) or need prose-level framing.
 * Their `new` text is already in final `tavern_forge({ command, args })`
 * call form, which tavernForgeToCall skips (no `tavern_forge <cmd>` shape).
 * If an `old` snippet is not found (upstream wording drifted), we warn
 * and skip instead of failing.
 */
const toolFirstRewrites = [
  {
    file: 'tavern-cards/SKILL.md',
    old: '## 工具参考\n\n脚本工具均位于本 skill 的 `scripts/` 目录下。\n\n- **tavern-cards-forge**：离线打包/解包/配置工具，完整命令用法与数据模型见 `references/manual.md`。',
    new: '## 工具参考\n\n- **tavern_forge**（DSH 插件模型工具）：forge 命令的唯一入口，调用形式 `tavern_forge({ command, args })`：`command` 为子命令（init / configure / patch / query / pack / unpack / split / export / validate-mvu），`args` 为子命令后的参数数组。下文示例均为这一调用形式。人类快捷：`/tavern-forge <command> <args…>`、`/tavern-pack <project>`。\n- 完整子命令、选项与数据模型见 `references/manual.md`。',
  },
  {
    file: 'tavern-cards/references/conventions.md',
    old: '从 stdin/管道读取：\n\n```bash\necho \'[{"op":"add",...}]\' | node scripts/tavern-cards-forge.mjs patch {project}\n```',
    new: '将 JSON 直接作为参数传入：\n\n```text\ntavern_forge({ command: "patch", args: ["{project}", "[{\\"op\\":\\"add\\",...}]"] })\n```',
  },
  {
    file: 'tavern-cards/references/mvu/initvar.md',
    old: '```bash\nnode scripts/tavern-cards-forge.mjs patch {project} \\\n  \'[{"op":"add","path":"/initvar_overrides/开场白~11.txt","value":"开场白/initvar/1.yaml"}]\'\n```',
    new: '```text\ntavern_forge({ command: "patch", args: ["{project}", "[{\\"op\\":\\"add\\",\\"path\\":\\"/initvar_overrides/开场白~11.txt\\",\\"value\\":\\"开场白/initvar/1.yaml\\"}"] })\n```',
  },
  {
    file: 'tavern-cards/references/mvu/initvar.md',
    old: '```bash\nnode scripts/tavern-cards-forge.mjs patch {project} \\\n  \'[\n    {"op":"add","path":"/initvar_overrides/开场白~11.txt","value":"开场白/initvar/1.yaml"},\n    {"op":"add","path":"/initvar_overrides/开场白~12.txt","value":"开场白/initvar/2.yaml"}\n  ]\'\n```',
    new: '```text\ntavern_forge({ command: "patch", args: ["{project}", "[{\\"op\\":\\"add\\",\\"path\\":\\"/initvar_overrides/开场白~11.txt\\",\\"value\\":\\"开场白/initvar/1.yaml\\"},{\\"op\\":\\"add\\",\\"path\\":\\"/initvar_overrides/开场白~12.txt\\",\\"value\\":\\"开场白/initvar/2.yaml\\"}]"] })\n```',
  },
  {
    file: 'tavern-cards/references/manual.md',
    old: '`node scripts/tavern-cards-forge.mjs` 是一个离线 CLI 工具，用于在 SillyTavern 角色卡 (PNG) / 世界书 (JSON) 与可编辑的项目目录之间互相转换。',
    new: '`tavern_forge`（DSH 插件模型工具，参数 `command` + `args`）是 forge 命令的唯一入口，用于在 SillyTavern 角色卡 (PNG) / 世界书 (JSON) 与可编辑的项目目录之间互相转换。',
  },
  {
    file: 'tavern-cards/references/manual.md',
    // The upstream synopsis carries a confusing `[patch]` placeholder token;
    // rewritten it would surface as a stray literal "patch" args element.
    old: 'node scripts/tavern-cards-forge.mjs patch <project> [patch] [--file <path>] [--state <path>] [--dry-run] [--no-backup]',
    new: 'tavern_forge({ command: "patch", args: ["<project>", "<JSON-patch-ops>", "--file <path>", "--state <path>", "--dry-run", "--no-backup"] })',
  },
  {
    file: 'tavern-cards/references/manual.md',
    old: '对 state.json 应用 RFC 6902 JSON Patch。输入优先级：`--file` > 参数 > stdin。',
    new: '对 state.json 应用 RFC 6902 JSON Patch。输入优先级：`--file` > 参数。',
  },
  {
    file: 'tavern-cards/references/manual.md',
    old: '```bash\nnode scripts/tavern-cards-forge.mjs patch {project} --file ./patches/update.json\nnode scripts/tavern-cards-forge.mjs patch {project} \'[{"op":"remove","path":"/entryManifest/region/废弃地点"}]\'\nnode scripts/tavern-cards-forge.mjs patch {project} --file ./patches/update.json --dry-run\n# 从 stdin\necho \'[{"op":"remove","path":"/entryManifest/region/废弃地点"}]\' | node scripts/tavern-cards-forge.mjs patch {project}\n```',
    new: '```text\ntavern_forge({ command: "patch", args: ["{project}", "--file", "./patches/update.json"] })\ntavern_forge({ command: "patch", args: ["{project}", "[{\\"op\\":\\"remove\\",\\"path\\":\\"/entryManifest/region/废弃地点\\"}]"] })\ntavern_forge({ command: "patch", args: ["{project}", "--file", "./patches/update.json", "--dry-run"] })\n```',
  },
  {
    file: 'tavern-ui/references/environments/tavern-helper-template.md',
    old: '| 调用方式 | `node scripts/tavern-cards-forge.mjs <command>` | webpack watch 自动触发 / `pnpm sync` |',
    new: '| 调用方式 | `tavern_forge({ command, args })` | webpack watch 自动触发 / `pnpm sync` |',
  },
]

/** Apply the targeted DSH overlay rewrites. */
async function rewriteToolFirst() {
  for (const { file, old, new: replacement } of toolFirstRewrites) {
    const full = join(skillsRoot, file)
    if (!existsSync(full)) continue
    const text = await readFile(full, 'utf8')
    if (text.includes(old)) {
      await writeFile(full, text.replaceAll(old, replacement))
    } else if (!text.includes(replacement)) {
      // Neither the pre-rewrite nor the rewritten form is present: the
      // upstream wording likely drifted. The source phrasing is still a
      // safe fallback, so warn instead of failing.
      console.warn('warn: tool-first rewrite not applied (upstream drifted?): ' + file)
    }
  }
}

/** Forge subcommands the tool accepts. */
const FORGE_COMMANDS = new Set([
  'init', 'configure', 'patch', 'query', 'pack', 'unpack', 'split', 'export', 'validate-mvu',
])

/**
 * Tokenize the argument portion of a `tavern_forge <command> <args…>` line.
 * Single-quoted groups stay intact; `[group]` meta-syntax (usage signatures)
 * is stripped to its inner text. Returns plain string tokens.
 */
function tokenizeArgs(rest) {
  const tokens = []
  let i = 0
  while (i < rest.length) {
    const c = rest[i]
    if (c === ' ' || c === '\t') { i += 1; continue }
    if (c === "'") {
      const end = rest.indexOf("\'", i + 1)
      if (end === -1) { tokens.push(rest.slice(i + 1)); break }
      tokens.push(rest.slice(i + 1, end))
      i = end + 1
    } else if (c === '[') {
      const end = rest.indexOf(']', i + 1)
      if (end === -1) { tokens.push(rest.slice(i + 1)); break }
      tokens.push(rest.slice(i + 1, end).trim())
      i = end + 1
    } else {
      let j = i
      while (j < rest.length && rest[j] !== ' ' && rest[j] !== '\t') j += 1
      tokens.push(rest.slice(i, j))
      i = j
    }
  }
  return tokens
}

/**
 * Render one args-array element in JSON string form — the exact wire shape a
 * model must produce. JS-style single quotes (used before) are not valid
 * JSON, and live models copied the single-quoted fragment verbatim inside a
 * string argument, producing `"args": "[\"proj\", '[…]]'` rejections.
 */
function quoteArg(value) {
  return JSON.stringify(value)
}

/**
 * Rewrite every `tavern_forge <command> <args…>` invocation into the actual
 * model tool call form `tavern_forge({ command: "<cmd>", args: [...] })`.
 * Only runs after the CLI->tool rename, so it sees the final command text.
 */
function tavernForgeToCall(text) {
  return text.replace(
    /tavern_forge[ \t]+([A-Za-z][A-Za-z-]*)([^\n`]*)/g,
    (match, command, rest) => {
      if (!FORGE_COMMANDS.has(command)) return match
      const args = tokenizeArgs(rest).map(quoteArg).join(', ')
      return `tavern_forge({ command: \"${command}\", args: [${args}] })`
    },
  )
}

/**
 * Rewrite every forge CLI mention into the DSH model tool `tavern_forge`:
 * most-specific prefixes first so the bare-name replace never mangles a
 * `node scripts/...` path; bash fences around tool calls become `text`;
 * finally every invocation is converted to the `tavern_forge({ ... })` call.
 */
async function rewriteForgeToolReferences(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await rewriteForgeToolReferences(full)
    } else if (entry.isFile()) {
      const text = await readFile(full, 'utf8')
      let updated = text
        .replaceAll('node scripts/tavern-cards-forge.mjs', 'tavern_forge')
        .replaceAll('scripts/tavern-cards-forge.mjs', 'tavern_forge')
        .replaceAll('tavern-cards-forge', 'tavern_forge')
      updated = updated.replace(
        /^([ \t]*)```bash\n((?:[ \t]*#.*\n)*)[ \t]*tavern_forge /gm,
        '$1```text\n$2$1tavern_forge ',
      )
      updated = tavernForgeToCall(updated)
      if (updated !== text) await writeFile(full, updated)
    }
  }
}

/** Remove stale "scripts live under this skill's scripts/ dir" lines. */
async function removeMisleadingScriptSentences() {
  for (const name of skills) {
    const file = join(skillsRoot, name, 'SKILL.md')
    if (!existsSync(file)) continue
    const text = await readFile(file, 'utf8')
    const updated = text
      .split('\n')
      .filter(line => !line.includes('脚本工具均位于'))
      .join('\n')
    if (updated !== text) await writeFile(file, updated)
  }
}

/**
 * Extract every `args: [...]` array on a line with a bracket-balanced scan
 * that respects JSON string contents (an element may contain `]`, e.g. a
 * JSONPath query). Regex extraction is not reliable here: a line with two
 * tool calls makes a greedy match swallow the prose between them.
 */
function extractArgsArrays(line) {
  const arrays = []
  let start = line.indexOf('args: [')
  while (start !== -1) {
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start + 6; i < line.length; i += 1) {
      const c = line[i]
      if (escaped) { escaped = false; continue }
      if (inString) {
        if (c === '\\') escaped = true
        else if (c === '"') inString = false
        continue
      }
      if (c === '"') { inString = true; continue }
      if (c === '[') depth += 1
      else if (c === ']') {
        depth -= 1
        if (depth === 0) {
          arrays.push(line.slice(start + 6, i + 1))
          start = line.indexOf('args: [', i)
          break
        }
      }
    }
    if (depth !== 0) break
  }
  return arrays
}

/**
 * Lint every generated `tavern_forge({ ... })` example: the `args: [...]`
 * array must parse as JSON, because a model copies it verbatim into the tool
 * call. The call object itself uses JS literal syntax (unquoted keys), but
 * the array is pure JSON. Single-quoted elements (the pre-fix style) fail
 * here, so any upstream drift or overlay regression surfaces at sync time.
 */
async function lintToolCallExamples() {
  const violations = []
  const visit = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await visit(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const lines = (await readFile(full, 'utf8')).split('\n')
        for (const [index, line] of lines.entries()) {
          if (!line.includes('tavern_forge(')) continue
          for (const array of extractArgsArrays(line)) {
            try {
              JSON.parse(array)
            } catch {
              violations.push(`${full}:${index + 1}: args array is not valid JSON: ${line.trim().slice(0, 100)}`)
            }
          }
        }
      }
    }
  }
  await visit(skillsRoot)
  return violations
}

await rm(skillsRoot, { recursive: true, force: true })
await mkdir(skillsRoot, { recursive: true })

for (const name of skills) {
  const from = join(sourceRoot, name)
  const to = join(skillsRoot, name)
  if (!existsSync(from)) {
    console.warn(`skip missing skill: ${from}`)
    continue
  }
  await mkdir(to, { recursive: true })
  await cp(join(from, 'SKILL.md'), join(to, 'SKILL.md'), { force: true })
  for (const part of ['references', 'assets']) {
    const src = join(from, part)
    if (existsSync(src)) await cp(src, join(to, part), { recursive: true, force: true })
  }
  const scriptsSrc = join(from, 'scripts')
  if (existsSync(scriptsSrc)) {
    await cp(scriptsSrc, join(to, 'scripts'), {
      recursive: true,
      force: true,
      filter: src => !src.endsWith('tavern-cards-forge.mjs'),
    })
  }
  console.log(`synced ${name}`)
}

await rewriteToolFirst()
await rewriteForgeToolReferences(skillsRoot)
await removeMisleadingScriptSentences()
await writeFile(join(skillsRoot, 'LICENSE.md'), skillsLicenseMd)
const lintViolations = await lintToolCallExamples()
for (const violation of lintViolations) console.error('error: ' + violation)
if (lintViolations.length > 0) process.exitCode = 1
console.log('synced skills as DSH edition: forge invocations -> tavern_forge({ command, args })')
