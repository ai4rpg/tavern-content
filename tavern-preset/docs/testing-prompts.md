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

**Pass:** the model names all four delegation tools. If absent, confirm the session is on `tavern-standard` and the declared tavern group carries the four `tool-subagent-*` rows with `provider: spawn` and an `agentPreset` naming an existing `tavern-child-*` preset; a missing `spawn` provider (dsh 0.2.1's `dsh-subagent-spawn-in-process`) leaves the delegation tool unregistered — the row stays mounted and registers the tool when the provider appears. Read the diagnostic shown at session creation if the group itself failed.

**Model & reasoning-effort default (worth one check):** the shipped preset leaves every `tool-subagent-*` row's `agentOptions` unset, so a child starts on the parent session's provider, model, reasoning effort, output-token limit, and working directory — the same defaults as a plain `subagent` child. To pin a per-tool model or force a different effort, edit the declared preset — the Web preset editor saves an override row into the profile patch — then open a NEW session: a running session keeps the preset revision it started with.

## Layer 3 — minimal delegation smoke (the core mechanism)

First create a file with one deliberate violation, using the main agent's tracked editor tools:

```
Write sample-entry.txt in the current directory with a short character-entry
paragraph that contains exactly one banned-word violation, for example an
八股微表情 such as 嘴角微微上扬. Use the write tool, not bash.
```

Then delegate a read-only review:

```
Delegate to check-agent: read sample-entry.txt and report every violation you
find. Do not modify the file. Wait for the completion notification before
telling me the result.
```

**Observe:**
- The model calls the `check-agent` tool instead of reviewing the file itself.
- The tool returns immediately with an activation id (`{ kind: 'activation', subagentId }`); the review text is **not** in the tool result. The model continues only after the completion notification arrives.
- The completion notification contains the reviewer's 「通过 / 不通过」 verdict and, for a failure, the location, violation type, original text, and suggestion.
- `sample-entry.txt` is unchanged: the `check-agent` child is read-only (`tool-fs` with `write` and `edit` off) and has no shell.
- The notification carries the "reviewer / 审稿师" persona voice, confirming the agent body reached the child's preset persona.

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
do not write the body content yourself. Treat each delegation as asynchronous:
wait for the completion notification before moving to the next step that
depends on it, and let the main agent apply any fix check-agent reports.
```

**Observe:**
- In `content`, the model actively calls `schema-agent` / `first-message-agent` / `check-agent`.
- Each delegation returns an activation id first; the model waits for the corresponding completion notification before using the result.
- `check-agent` reviews from an **independent, read-only context** (it is not primed by the main agent's just-written text, and it cannot edit the manuscript); the main agent applies its suggested fixes.
- `schema-agent` and `first-message-agent` write with `write` / `edit` — **not** `bash` redirection: bash file writes emit no `fs/observed`, so they never feed the project-focus tracker behind `stage:policy`. Only `conversion-agent` has shell tools, for `node scripts/validate-conversion-outline.mjs`.
- `/tavern-pack <project>` produces a card artifact.

## Layer 5 — triage prompt (when a delegation fails)

```
The last check-agent call did not produce the expected review. Do not retry —
first answer:
1. What was the `prompt` argument you passed?
2. What activation id did the tool return, and did the completion notification
   arrive?
3. What did the notification say (or what error text did it carry)?
4. Which tools did the child see on its first turn?
```

This isolates whether the failure is the parent's prompt, the child's tool catalog, the model route, or a missing completion notification.

## Verify the world, not the self-report

For every delegation that is supposed to write a file, re-read the file from outside the model's turn (a shell in the working directory, or the next turn's `read`) and assert the content. The preset repo's keyless test suite asserts the request shape; this hands-on pass asserts the durable world state — the two are complementary.
