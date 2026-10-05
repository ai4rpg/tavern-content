# Tavern Cards preset — install guide

English | [中文](install-guide.zh.md)

`@ai4rpg/dsh-tavern-preset` is the **agent preset package** for the tavern-cards workflow on the DeepSeek Harness (dsh): one declared preset, `tavern-standard`, composing the stage machine, the project tooling, the three tavern skills, and the named-subagent delegation tools. Installing it into a profile is one command; this guide covers what that command brings, how to verify it, the first-run smoke list, and how to upgrade or remove it.

## What the install brings

| Piece | What it is |
|---|---|
| `preset-tavern-standard` | The preset declaration: one `@deepseek-ai/dsh-agent-preset` row with `config.id: tavern-standard`, roster `order: 5`, and the `Tavern Cards` display metadata (single language — fixed when the package is generated). Sessions select it from the preset chip. |
| `ui-sidebar-stage` row | The stage sidebar tab, mounted at the host level. It is passive UI: it injects no prompt text and registers no tools. |
| `@ai4rpg/dsh-tavern-stages` (dependency) | The plugin: the stage configuration for `dsh-stage-switch`, the `tavern_forge` project tool with focus tracking and the completion predicate, and four named-subagent providers (`tavern:check-agent`, …). |
| `@ai4rpg/dsh-stage-switch` (dependency) | The stage machine (`route → design → planning → content → ui`), `goto_stage`, the `/stage` command, and the review dialog. |
| `@ai4rpg/dsh-ui-sidebar-stage` (dependency) | The browser module behind the sidebar tab. |
| `skills/` and `persona.yml` (shipped in this package) | The three tavern skill bodies (`tavern-design`, `tavern-cards`, `tavern-ui`) and the writing-oriented persona prose. The preset's `skill-filesystem` row exposes the skills through `customSkillDirs`. |

Everything else in the preset is the official `standard` composition (file tools, search, jobs, plan mode, compaction, delegation, web, …): `tavern-standard` is that composition with the tavern group appended and the persona prose replaced.

## Requirements

- `dsh` on the `0.2` line — an installed CLI, or a dsh source checkout where you run the launcher through `pnpm dsh …`. The profile composes `dsh-base` + `dsh-web-app`, which provide the session, tool, skill, subagent, token-meter, and session-projection services the preset's rows resolve from.
- Node.js `^22.19 || >=24` and `pnpm` on `PATH`: `dsh plugin` forwards to pnpm (`npm install -g pnpm`, or enable corepack).
- Network access to the npm registry — the first command pulls dsh's own dependency tree into the profile.
- This preset package is a **local checkout, not an npm package**: the install command points at the preset folder inside the cloned content repo. The plugin it pulls in (`@ai4rpg/dsh-tavern-stages`) arrives from npm as its dependency; the persona content package (`@ai4rpg/tavern-agents`) rides the preset's own `file:` dependency on its sibling folder in the same repo.
- A model provider and API key, configured in the Web UI under **Settings → Providers** before the first session.

## Install

```sh
dsh plugin --profile web add file:<absolute path to your tavern-content clone>/tavern-preset
```

From a dsh source checkout, prefix the launcher: `pnpm dsh plugin --profile web add file:<absolute path>`.

- The path is absolute: `dsh plugin` refuses a relative spec, and the shell does not expand `~` after `file:`. This preset package is a local checkout, not an npm package; the plugin it pulls in (`@ai4rpg/dsh-tavern-stages`) arrives from npm as a regular dependency. The persona content package resolves inside the cloned repo: the preset's `file:../tavern-agents` dependency points at its sibling folder.
- `web` is the profile the Web UI boots; use another profile name if that is where you want the preset. A profile that does not exist yet is created from the shipped template on first use.
- The command installs the package with pnpm, selects its bundle layer in `dsh.profile.bundles`, and resolves its dependencies into the profile. That resolution is what lets the preset's rows load (`@ai4rpg/dsh-stage-switch`, `@ai4rpg/dsh-tavern-stages`, the four `@deepseek-ai/dsh-tool-subagent` rows) and what puts `tavern-cards-forge` (the CLI behind `tavern_forge`) where the tool finds it.
- `@ai4rpg/dsh-tavern-stages` arrives as a dependency, so adding it by hand is unnecessary; the preset package is the single install path.
- To make the tavern preset the default for new sessions, set `agent-presets.default: tavern-standard` in `settings.yaml` or on the Web settings page; that is a user-side choice.

## Verify

```sh
dsh --profile web --dump-config | grep -nE 'tavern-preset|preset-tavern-standard|ui-sidebar-stage'
```

The dump prints one `# == <layer>` comment per source layer. You should see `# == @ai4rpg/dsh-tavern-preset` followed by the `preset-tavern-standard` row (declaring `config.id: tavern-standard`) and the `ui-sidebar-stage` row. A missing layer means the package is not installed in that profile; a declaration that failed to mount stays on the roster with a diagnostic; read it verbatim.

## First run

```sh
dsh web        # or: dsh --profile <name>
```

1. Open http://127.0.0.1:3080 and configure your provider in **Settings → Providers**.
2. Create a session and pick **Tavern Cards** in the preset chip (a blank session can still switch presets). Point the working directory at the folder you want the card project in.
3. Smoke list, in that session:
   - The first turn carries the `route` stage instruction; `/stage <name>` switches stages immediately from the composer (a user switch, no dialog), and the model can call `goto_stage`, whose switch is presented for your approval in a review dialog.
   - `tavern_forge` is in the model's tool list; the composer also offers `/tavern-forge` and `/tavern-pack`.
   - The `skill` tool catalog lists `tavern-design`, `tavern-cards`, and `tavern-ui`; loading one returns its body plus the base directory of its `references/` documents.
   - The four delegation tools are present: `check-agent`, `conversion-agent`, `first-message-agent`, `schema-agent`.
   - The stage tab appears in the right sidebar (in a session on another preset it shows an empty state).
   - The `Current stage policy:` line appears in the runtime context once the session has a focused card project and the current stage's deliverable reads complete. That signal is file-based and observation-driven, so it stays silent on an empty workspace and for files written through `bash`: write project files with the tracked editor tools (`write` / `edit`).
4. The stage flow is `route → design → planning → content → ui`; a full transition writes a handoff document to `<session workspace>/handoff/<session id>/<stage>.md`, while a light transition (below the configured `minHandoffTokens`) writes nothing.

For a full regression pass (per-layer prompts from session isolation to the end-to-end workflow), see [testing-prompts.md](testing-prompts.md).

## Review dialog language

The shipped preset declares `language: zh` on its `stage-switch` row, so the `goto_stage` review dialog is Chinese out of the box. The choice lives in the composition; installing patches nothing afterwards.

For English, set that field to `en` in the preset you run. Because the row sits inside the preset declaration, the change belongs to the copy you compose: override the `preset-tavern-standard` row with your own bundle, or edit the installed `cordis.patch.yml`. Replace that file rather than editing it in place (pnpm hardlinks installed files), and note that a reinstall or upgrade restores `zh`.

## Isolation

Tavern context is per session. Only sessions started on `tavern-standard` receive the stage prompts, `goto_stage` / `tavern_forge`, the tavern skills, and the four delegation tools. Sessions on any other preset, and every other profile on the same machine, stay tavern-free. The sidebar tab is the one shared piece: it is mounted host-level because the browser module roster only scans the host tree, and it is passive (free of prompt text and tools); a non-tavern session shows its empty state.

## Upgrade and uninstall

**Upgrade.** Pull the checkout forward (`git pull`), then re-run the install command; the profile re-installs from the folder:

```sh
dsh plugin --profile web add file:<absolute path to your tavern-content clone>/tavern-preset
```

The checkout is the release; there are no version numbers to name. If the lockfile keeps the previously installed copy, `remove` the package and `add` it again. New sessions use the new version; a running session keeps the revision it started with.

**A preset is a snapshot.** `tavern-standard` is the official `standard` composition plus the tavern group, captured when the package was generated. Editing it — from the Web UI's preset surface (Creator mode authors an override of `preset-tavern-standard` by row id) or by editing the installed patch — replaces the complete `plugins` list, and a later upgrade of the plugin or the preset package does not merge into that edited copy. To pick up upstream changes after editing, reinstall the package or re-apply your edit on top of the new version.

**Uninstall.**

```sh
dsh plugin --profile web remove @ai4rpg/dsh-tavern-preset
```

This removes the preset and its dependencies from the profile. Sessions that ran on `tavern-standard` can then no longer resume — a session records the preset id it ran on and re-resolves it at resume — so finish them first if you may want them back.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `dsh plugin` fails with `pnpm was not found` | `dsh plugin` runs pnpm: install it (`npm install -g pnpm`) or enable corepack, then retry. |
| The install runs out of memory | Retry with a larger heap: `NODE_OPTIONS=--max-old-space-size=6144 dsh plugin …`. |
| The preset does not appear in the chip | Check the dump (see Verify). A missing layer means the package is not installed in that profile; a refused declaration keeps its diagnostic on the roster. No restart is needed — refresh the page. |
| No `goto_stage` or `tavern_forge` in a session | The session is not on `tavern-standard`. Check the session header and pick the tavern preset for a new session. |
| The `skill` catalog does not list the tavern skills | Reinstall the package, then check that `node_modules/@ai4rpg/dsh-tavern-preset/skills/` holds the three directories the preset's `skill-filesystem` row points at. |
| The four delegation tools are missing | Same first check as above (the session's preset); if the session is on `tavern-standard`, the tavern group failed to mount — read the diagnostic shown at session creation. |
| `Current stage policy:` never appears | Expected on an empty workspace and after `bash`-only file writes: the signal needs tracked file observations. Write project files with `write` / `edit`. |
| The wrong review-dialog language | Set `language` on the preset's `stage-switch` row (`zh` shipped, `en` for English), as described above. |
| An upgrade changed nothing | Open a NEW session (running sessions keep their revision), and remember that an edited preset is not merged — reinstall or re-apply. |
| A former tavern session refuses to resume after removal | The preset id is a resume contract: reinstall the package to resume that session. |

## License

Repository code is MIT — see `LICENSE.md`. The three skill bodies under `skills/` are synced from [ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards) and licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — see `skills/LICENSE.md`.
