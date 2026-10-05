# @ai4rpg/dsh-tavern-preset

The **agent preset** for the [tavern-cards](https://github.com/ai4rpg/tavern-cards) workflow on the DeepSeek Harness (dsh).

English | [中文](README.zh.md)

Installing this package is the normal way to get the tavern workflow: it declares one preset, `tavern-standard`, that composes

- [`@ai4rpg/dsh-tavern-stages`](https://www.npmjs.com/package/@ai4rpg/dsh-tavern-stages) — the stage config, the project-workspace tooling (`tavern_forge`, focus tracking, the completion predicate), and the four named-subagent providers;
- [`@ai4rpg/dsh-stage-switch`](https://www.npmjs.com/package/@ai4rpg/dsh-stage-switch) — the stage machine those stages run on;
- the three tavern skills `tavern-design`, `tavern-cards`, `tavern-ui` — shipped in this package's `skills/` directory (CC BY-NC-SA, see [License](#license));
- a writing-oriented persona prose override;
- [`@ai4rpg/dsh-ui-sidebar-stage`](https://www.npmjs.com/package/@ai4rpg/dsh-ui-sidebar-stage) — the stage tab in the right sidebar (a host-plane row, not a preset row).

Tavern context is **per-session**: it loads only in sessions started on this preset, so sessions on any other preset stay tavern-free (free of the stage instruction, the `goto_stage`/`tavern_forge` tools, and the tavern skills). Preset selection comes with DSH's web UI.

## Install

```sh
dsh plugin --profile <name> add file:<absolute path to this checkout>
```

This package is a local checkout, not an npm package; the plugin it pulls in (`@ai4rpg/dsh-tavern-stages`) ships on npm. The install command points at the folder on disk; use an absolute path, since `dsh plugin` refuses a relative spec. See `docs/install-guide.md` for the full recipe.

Verify the profile composition:

```sh
dsh --profile <name> --dump-config | grep -n 'tavern-preset\|preset-tavern-standard\|ui-sidebar-stage'
```

The dump should show a `# == @ai4rpg/dsh-tavern-preset` layer, the `preset-tavern-standard` declaration row, and an active `ui-sidebar-stage` row. Then start the profile and pick **Tavern Cards** from the new-session preset chip (a blank session can still switch). To make it the default for new sessions, set `agent-presets.default: tavern-standard` in `settings.yaml` / the Web settings page; that is a user-side choice.

Prerequisites: a dsh profile on the 0.2 line (`dsh-base` / `dsh-web-app` compose the session, tool, skill, subagent, token-meter, and session-projection services the preset's rows resolve from). No extra setup step: the profile's pnpm install resolves this package's dependencies, and the preset rows resolve them by name.

## What the preset contains

The patch inserts a declaration whose `plugins` list **is** the official `standard` composition with exactly three edits, so upgrading the base moves the preset with it:

| Edit | What it does |
|---|---|
| Persona row replaced with `persona.yml` | Writing-oriented prose only; the mechanism stays the base's (the template leaves `complete` and `includeRuntimeContext` unset), so plan-mode sections and runtime contexts still render and children inherit the full host prompt. |
| `skill-filesystem` row gains `customSkillDirs` | A `!!js` expression resolved against the loader's `baseUrl` points at this package's own `skills/` directory, so the official skill catalog exposes the three tavern skills. |
| The `tavern` group is appended | One `cordis:group` with `isolate: { stage: true }` (the stage service must not leak into the root realm): the stage-switch row (config = the plugin package's `tavernCardsStageConfig` + `language: zh`), the tavern-stages row (`subagents.enabled: true`), and one `tool-subagent-*` row per `agents/*.md` of the plugin. |

The group's delegation rows are generated from the plugin's `loadTavernAgents()`, so the tools and the providers they bind to cannot drift. `persona` stays unset on those rows: the agent body is prepended to the child's first prompt, and a persona section would override the host persona.

The patch also activates the stage sidebar tab on the host plane. The tab cannot ride the preset: the browser module roster only scans the main Loader tree, and preset rows live in a separate tree. It is passive UI (no prompt section, no tool).

**The preset is a snapshot.** Editing it in the Web editor replaces its whole `plugins` list, and later upgrades of this package or of the plugin leave that edited copy untouched; regenerate or re-apply the preset to pick changes up. The preset id `tavern-standard` is a resume contract: sessions record it and are refused if it disappears.

## Customize

### Per-tool model & reasoning effort

The four delegation tools inherit the session's model route and (by default) its connection-level reasoning effort; the generated rows leave `agentOptions` **unset**, because different models accept different effort values and forcing `max` can error on some. Route, effort, and `maxTokens` are native `AgentOptions` on each `tool-subagent-*` row. To pin a per-tool model or force an effort, edit the row in the patch you deploy (the installed `cordis.patch.yml`, or a patch layer of your own):

```yaml
    - id: tool-subagent-check-agent
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: tavern:check-agent
        toolName: check-agent
        enableRunInBackground: false
        backgroundMode: one-shot
        maxDepth: provider-managed
        agentOptions:
          model: deepseek-chat          # per-tool model route (optional)
          # reasoningEffort: high        # max | high | medium | low (optional)
          # maxTokens: 8192             # (optional)
```

A preset is a snapshot: reinstalling or regenerating (`npm run gen`) restores the shipped rows; keep lasting edits in your own patch layer.

### Disabling the subagent tools

Set `subagents.enabled: false` on the `@ai4rpg/dsh-tavern-stages` row to keep the four providers from registering. The stage and forge features are unaffected.

## Requirements

- dsh `0.2.0-rc.2` line (`@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` for the Web profile).
- Node `^22.19 || >=24` (the `!!js` skill-dir expression uses `process.getBuiltinModule`).

## Develop

```sh
npm run gen     # regenerate cordis.patch.yml from the base + persona.yml + the plugin exports
npm test        # artifact equation + real Loader composition + skill discovery
npm run typecheck
```

| Path | What it is |
|---|---|
| `cordis.patch.yml` | **Generated, committed.** `tests/preset.spec.ts` fails when it drifts from `scripts/gen-preset.mjs`. |
| `persona.yml` | The preset's persona row — the single editable source for that prose. |
| `skills/` | The three skill bodies as the DSH edition (each forge invocation written as a `tavern_forge({ command, args })` call). Synced from upstream by `scripts/sync-skills.mjs`. |
| `scripts/gen-preset.mjs` | The derived generator (base patch + persona + plugin exports). |
| `scripts/sync-skills.mjs` | Upstream skill sync (`TAVERN_CARDS_ROOT` must point at a [tavern-cards](https://github.com/ai4rpg/tavern-cards) checkout). |

`@ai4rpg/dsh-tavern-stages` ships on npm; plain `npm install` resolves it from the registry. To test local plugin changes, link a local checkout instead: `npm install --no-save <path to your tavern-stages checkout>`; a directory install keeps the plugin resolving its `@deepseek-ai/*` tree from its own `node_modules`. The personas need no linking: this package depends on the sibling `@ai4rpg/tavern-agents` folder directly (`file:../tavern-agents`).

## License

Repository code is MIT (`LICENSE.md`). The three skill bodies under `skills/` are synced from [ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards) and licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.en) (attribution, non-commercial, share-alike); see `skills/LICENSE.md`.
