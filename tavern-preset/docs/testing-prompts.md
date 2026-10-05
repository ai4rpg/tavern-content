# Tavern Cards preset — regression prompts

Layered end-to-end prompts for a real `dsh` profile with the `tavern-standard` preset installed (see [install-guide.md](install-guide.md); 中文指南见 [install-guide.zh.md](install-guide.zh.md)). Run them in order, from mechanism to workflow; each layer has a clear observation point. The Web smoke list in the install guide is the quick pass; this page is the full regression pass after a plugin or preset change. The prompt blocks may be run in either UI language.

## Layer 0 — per-session isolation

Open two sessions on the same working directory: one on **Tavern Cards**, one on plain **Standard** (or any non-tavern preset).

**Pass:** in the tavern session, the first turn shows the route stage instruction and `goto_stage` / `tavern_forge`. The non-tavern session shows neither at any point: it stays free of tavern tools, stage policy text, and tavern skills in any catalog listing. The stage sidebar tab may appear in both (it is the one host-plane passenger): it injects no prompt text and registers no tools, and shows an empty state in the non-tavern session. The `/tavern-forge` and `/tavern-pack` commands may still appear in the composer for all sessions (commands are UI-plane); they do not reach the model context.

## Layer 1 — are the tavern skills discoverable?

The three tavern skills ship inside the preset package's own `skills/` and are exposed by the preset's `skill-filesystem` row through `customSkillDirs` (the patch resolves the installed package's `skills/` with a `!!js` expression); the plugin leaves skill registration to the preset.

```
Which skills can you load with the `skill` tool? List them. Then load
tavern-design and tell me what it says to do first.
```

**Watch for:** the `<available_skills>` catalog names all three (`tavern-design`, `tavern-cards`, `tavern-ui`), and `skill("tavern-design")` returns the skill body plus a `<skill_resources>` base-directory hint pointing at the installed `skills/tavern-design` directory (that hint is what stops the model from searching the whole disk for `references/`). If a skill is missing, confirm the installed package ships the three directories (`ls ~/.dsh/profiles/<profile>/node_modules/.pnpm/ | grep tavern-preset`, then into its `skills/`) and that its `skill-filesystem` row carries `customSkillDirs` plus a `tool-skill` row. The preset repo's own `tests/skills.spec.ts` / `tests/skill-discovery.spec.ts` pin that half.

## Layer 2 — are the delegation tools registered?

```
List the tools you currently have, especially whether check-agent,
conversion-agent, schema-agent, and first-message-agent are present.
Do not call anything — just list the names.
```

**Pass:** the model names all four delegation tools. If absent, check the browser console for `subagent provider "tavern:..." not registered yet` (the tool rows mount when their provider appears), and confirm the declared preset's tavern group carries the four `tool-subagent-*` rows with `subagents.enabled: true` on its tavern-stages row.

**Model & reasoning-effort default (worth one check):** the shipped preset leaves every `tool-subagent-*` row's `agentOptions` unset, so children follow the deployment/connection route and effort like a plain `subagent` child (a model that rejects `reasoning_effort: max` works out of the box). To pin a per-tool model or force an effort, edit the declared preset — the Web preset editor saves an override row into the profile patch — then open a NEW session: a running session keeps the preset revision it started with.

## Layer 3 — minimal delegation smoke (the core mechanism)

Delegate a trivial write-file task and verify the world, not the self-report:

```
Delegate to check-agent: have it write a file proof.txt in the current
directory using bash, with the content PROOF_OK. Report the result back.
```

**Observe:**
- The model calls the `check-agent` tool instead of writing the file itself.
- The child completes the write with the tools it has (`bash` redirection like `printf PROOF_OK > proof.txt`, or the standard `write`).
- `proof.txt` actually exists in the working directory and contains `PROOF_OK` — **re-read the file**; do not trust the model's summary.
- The returned text carries the "reviewer / 审稿师" persona voice, confirming the agent body reached the child's first prompt.

## Layer 4 — real workflow (end to end)

Walk the design → planning → content flow and let subagents own the focused work:

```
I want to create a SillyTavern character card. First align the requirements:
- Theme: a cyberpunk detective
- Form: charactercard
- MVU: enabled
- UI: text status bar

After aligning, use the tavern-design skill to produce design-spec.md,
then move to planning. In content, have schema-agent write schema.ts,
first-message-agent write the opening, and after each entry run check-agent
for the banned-word scan. Delegate each step to the matching subagent —
do not write the body content yourself.
```

**Observe:**
- In `content`, the model actively calls `schema-agent` / `first-message-agent` / `check-agent`.
- `check-agent` reviews from an **independent context** (it is not primed by the main agent's just-written text).
- Children write project files with `write` / `edit` — **not** `bash` redirection: bash file writes emit no `fs/observed`, so they never feed the project-focus tracker behind `stage:policy`.
- `/tavern-pack <project>` produces a card artifact.

## Layer 5 — triage prompt (when a delegation fails)

```
The last check-agent call failed. Do not retry — first answer:
1. What was the `prompt` argument you passed?
2. The child's raw error text?
3. Which tools did the child see on its first turn?
```

This isolates whether the failure is the parent's prompt, the child's tool catalog, or the model route.

## Verify the world, not the self-report

For every delegation that is supposed to write a file, re-read the file from outside the model's turn (a shell in the working directory, or the next turn's `read`) and assert the content. The preset repo's keyless test suite asserts the request shape; this hands-on pass asserts the durable world state — the two are complementary.
