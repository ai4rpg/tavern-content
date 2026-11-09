// DSH integration of the upstream CLI. Keep the rules in the copied skill,
// not in the MIT plugin. Strict anchors make upstream drift a sync error.
function replaceOnce(text, from, to, label) {
  if (text.split(from).length !== 2) throw new Error(`mechanical-check overlay: upstream anchor changed: ${label}`)
  return text.replace(from, to)
}

export function mechanicalCheckModule(source) {
  let text = replaceOnce(source,
    "import { readFileSync, existsSync } from 'node:fs'",
    "import { readFileSync, existsSync, realpathSync } from 'node:fs'\nimport { fileURLToPath } from 'node:url'",
    'entrypoint imports')
  const argvStart = text.indexOf('const argv = process.argv.slice(2)')
  const argvEnd = text.indexOf('const han = ', argvStart)
  if (argvStart < 0 || argvEnd < 0) throw new Error('mechanical-check overlay: argv boundary changed')
  const argv = text.slice(argvStart, argvEnd).trimEnd()
  text = text.slice(0, argvStart) + text.slice(argvEnd)
  text = replaceOnce(text,
    "function extract(file) {\n  const raw = readUtf8(file).replace(/\\r\\n/g, '\\n')",
    "function extract(file, text) {\n  const raw = text.replace(/^\\uFEFF/, '').replace(/\\r\\n/g, '\\n')",
    'text extractor')
  text = replaceOnce(text,
    "const report = []\n\nfor (const file of files) {\n  if (!existsSync(file)) {\n    console.error(`文件不存在: ${file}`)\n    process.exit(2)\n  }\n  const { hard: rawUnits, check: checkUnits, prose: proseUnits } = extract(file)",
    "// A complete decoded snapshot, shared by CLI, write feedback and read-only review.\nexport function checkText(file, text) {\n  if (typeof text !== 'string' || text.includes('\\u0000')) throw new Error('检查内容不是有效的 UTF-8 文本')\n  const { hard: rawUnits, check: checkUnits, prose: proseUnits } = extract(file, text)",
    'scan entry')
  text = replaceOnce(text, '  report.push({\n    file,', '  return {\n    file,', 'report return')
  text = replaceOnce(text,
    "    latin,\n  })\n}\n\nconst failed = report.some",
    "    latin,\n  }\n}\n\nfunction main() {\n" + argv + "\n\nconst report = files.map((file) => {\n  if (!existsSync(file)) {\n    console.error(`文件不存在: ${file}`)\n    process.exit(2)\n  }\n  return checkText(file, readUtf8(file))\n})\n\nconst failed = report.some",
    'CLI boundary')
  text = replaceOnce(text,
    'if (failed && !soft) process.exit(1)',
    "return failed && !soft ? 1 : 0\n}\n\n// Node 24.0/24.1 lack import.meta.main; resolve only the entrypoint identity,\n// never file content. Missing/import-only argv must not trigger the CLI.\nlet isMain = import.meta.main\nif (isMain === undefined && process.argv[1]) {\n  try { isMain = realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { isMain = false }\n}\nif (isMain) process.exitCode = main()",
    'guarded CLI')
  return text
}

const fallback = '### 自动检查与手动兜底\n\n通过 `write` / `edit` 写入或修改已规划、已注册的条目与开场白后，工具会附带「机械检查」报告。按报告修正，规则允许的例外需说明理由；文件已落盘，检查命中不表示写入失败，也不会自动回滚或阻止注册、打包。报告只覆盖当次送检全文，不代替语义审稿。\n\n未收到报告、报告提示未完成，或经 bash / 外部编辑器修改时，才手动兜底：先调用 `skill` 取得 tavern-cards 的 `resourceBase.path`，再运行 `node <resourceBase.path>/scripts/mechanical-check.mjs <文件路径>`。不要为了触发检查而重复写入；读不到文件或检查未完成不能当作通过。\n\n`check-agent` 使用只读专用工具 `tavern_check({ paths: [...] })` 检查当前实际文件，再独立检查语义、适用范围和跨条目问题。不依赖主代理口述的「已通过」，也不重复手算脚本已给出的词表和断句指标；机器零命中不等于文字质量通过。\n\n'

const docs = {
  'SKILL.md': [
    ['- **mechanical-check**：条目或开场白落盘后的机械自检，检查破折号、模糊词、否定转折、极端程度词、元叙事标记、`{{user}}` 宏，以及断句（短尾比例、单句分句数上限）。用法见 `references/composition.md` 步骤 7。',
      '- **机械检查**：DSH 的 `write` / `edit` 后自动返回报告；未运行时才手动兜底。`check-agent` 通过只读 `tavern_check` 独立复查。流程与兜底见 `references/composition.md#自动检查与手动兜底`，判据见 `references/rules-check.md`。'],
  ],
  'references/composition.md': [
    ['7. **机械自检**：文件落盘后立即运行 `node scripts/mechanical-check.mjs {file}`（脚本位于本 skill 的 `scripts/` 目录，`{file}` 传条目文件路径），不通过就地修正后再进入步骤 8。脚本检查破折号、模糊词、否定转折、极端程度词、元叙事标记、`{{user}}` 宏，以及断句（短尾比例、单句分句数上限）。EJS 与酒馆宏不参与判定；含连续拉丁字母的行只作提示，人工排除合规术语。有硬违规或断句超阈值时退出码为 1。断句项命中「例外」（台词、紧张场景）时可保留，在自检记录里写明理由。',
      '7. **机械自检**：处理写入工具返回的自动报告，按规则修正并说明合法例外；未收到报告或检查未完成时才手动兜底（见「自动检查与手动兜底」）。'],
    ['### 独立检查上下文（禁词扫描）', fallback + '### 独立检查上下文（禁词扫描）'],
    ['送检时向 task 字符串传入需检查条目的**文件路径**，并附内容类型与所属角色/世界观提示。',
      '送检时在委派 prompt 中传入需检查条目的**文件路径**，并附内容类型与所属角色/世界观提示；check-agent 先用 `tavern_check` 检查当前文件，再独立语义审稿。'],
    ['| 执行   | 主代理内部推理       | 主代理运行 mechanical-check.mjs | 子代理独立上下文           |',
      '| 执行   | 主代理内部推理       | 写后自动报告，未运行时手动兜底 | 子代理只读工具复查 + 独立语义审稿 |'],
    ['| 不通过  | —                 | 就地修正，不注册      | 改完全部问题并自查无同类新问题后再重扫 |',
      '| 不通过  | —                 | 报告问题并要求修正；不自动回滚或阻断 | 改完全部问题并自查无同类新问题后再重扫 |'],
  ],
  'references/contents-creation/first-message.md': [
    ['   - 运行 `node scripts/mechanical-check.mjs {file}`，不通过就地修正；断句项命中「例外」（台词、紧张场景）时可保留，在自检记录里写明理由',
      '   - 处理写入工具返回的自动机械报告并修正；未运行时按 `references/composition.md` 的「自动检查与手动兜底」补查，合法例外写明理由'],
    ['   - 调用 `check-agent` 检查正文',
      '   - 调用 `check-agent`，传入文件路径，由其用只读 `tavern_check` 复查并独立审稿'],
  ],
}

export function mechanicalCheckDocs(path, source) {
  let text = source
  for (const [from, to] of docs[path] ?? []) text = replaceOnce(text, from, to, path)
  return text
}
