# Tavern Cards preset — install guide

English | [中文](install-guide.zh.md)

`@ai4rpg/dsh-tavern-preset` is the **agent preset package** for the tavern-cards workflow on the DeepSeek Harness (dsh): one declared preset, `tavern-standard`, composing the stage machine, the project tooling, the three tavern skills, and four delegation tools backed by internal child presets. Installing it into a profile is one command; this guide covers what that command brings, how to verify it, the first-run smoke list, and how to upgrade or remove it.

## What the install brings

The install adds the declared `tavern-standard` preset — the official `standard` composition with the tavern group and four internal child presets appended and the persona prose replaced — plus the host-plane stage sidebar tab and the three tavern skills. The tavern plugins (`@ai4rpg/dsh-stage-switch`, `@ai4rpg/dsh-tavern-stages`, `@ai4rpg/dsh-ui-sidebar-stage`) arrive from npm as dependencies. [The preset README](../README.md) describes each piece and the customization points.

## Requirements

- `dsh` `>=0.2.2-rc.3 <0.3.0-0` — an installed CLI, or a dsh source checkout where you run the launcher through `pnpm dsh …`. The package declares this through `engines.dsh`, which dsh checks before loading it. The profile composes `dsh-base` + `dsh-web-app`, which provide the session, tool, skill, subagent, token-meter, and session-projection services the preset's rows resolve from.
- Node.js `>=24.9.0` and `pnpm` on `PATH`: `dsh plugin` forwards to pnpm (`npm install -g pnpm`, or enable corepack). The official desktop client is the exception — it installs through its own bundled pnpm and dsh, so it needs neither of them on this machine.
- Network access to the npm registry — the first command pulls dsh's own dependency tree into the profile.
- This preset package is **not an npm package**: install it from the preset folder in a cloned content repo (below), or from a tagged GitHub release tarball. Its tavern plugins arrive from npm as dependencies. The generated patch already embeds the four persona bodies; installation needs neither an upstream checkout nor a persona source package.
- A model provider and API key, configured in the Web UI under **Settings → Providers** before the first session.

## Install

```sh
dsh plugin --profile web add file:<absolute path to your tavern-content clone>/tavern-preset
```

From a dsh source checkout, prefix the launcher: `pnpm dsh plugin --profile web add file:<absolute path>`.

- The path is absolute: `dsh plugin` refuses a relative spec, and the shell does not expand `~` after `file:`. This installs a local checkout; for a GitHub release tarball or a Git install, see the next section. Upstream persona sources are needed only for regeneration, not installation.
- `web` is the profile the Web UI boots; use another profile name if that is where you want the preset. A profile that does not exist yet is created from the shipped template on first use.
- The command installs the package with pnpm, selects its bundle layer in `dsh.profile.bundles`, and resolves its dependencies into the profile. That resolution is what lets the preset's rows load (`@ai4rpg/dsh-stage-switch`, `@ai4rpg/dsh-tavern-stages`, the four `@deepseek-ai/dsh-tool-subagent` delegation rows, and the four child preset declarations) and what puts `tavern-cards-forge` (the CLI behind `tavern_forge`) where the tool finds it.
- Adding the tavern plugins by hand is unnecessary; the preset package is the single install path.
- When no `dsh` is on `PATH`, the repo-root `install.sh` / `install.ps1` falls back to `npx -y @deepseek-ai/dsh@0.2.2-rc.3`; if one is already installed, check `dsh --version` first, because an rc.1 host rejects this preset's `engines.dsh`.
- To make the tavern preset the default for new sessions, set `agent-presets.default: tavern-standard` in `settings.yaml` or on the Web settings page; that is a user-side choice.

### Install from a GitHub release (no clone)

Every `tavern-preset-v*` tag publishes a release carrying the packed preset and its `.sha256`. Use the version you want:

```sh
dsh plugin --profile web add https://github.com/ai4rpg/tavern-content/releases/download/tavern-preset-v0.3.0/ai4rpg-dsh-tavern-preset-0.3.0.tgz
```

Verify the download against the `.sha256` asset if you need to. The install is pinned to that URL: to upgrade, run the command with the newer release URL. The desktop client accepts the same URL through its bundled `dsh`.

For a Git install, point dsh at the repository and the package directory:

```sh
dsh plugin --profile web add 'git+https://github.com/ai4rpg/tavern-content.git#path:/tavern-preset'
```

The fragment does not need a commit: dsh installs the repository's default branch. Add a ref or a full commit before `&path:` to pin what runs — `#<branch>&path:/tavern-preset` or `#<40-character-commit>&path:/tavern-preset`. Only the full-commit form is updatable through dsh's plugin manager; the other Git forms install but must be reinstalled to upgrade. The release tarball is the simpler route.

## Official desktop client (Electron)

The desktop client does not read the `web` profile. It reads the application-owned `desktop` profile (`$DSH_HOME/profiles/desktop`), which a standalone npm-installed `dsh` CLI refuses on all three paths — boot, `--dump-config`, and `dsh plugin` — with one message:

`error: profile "desktop" is managed exclusively by the Electron application`

So the `--profile web` command above does not apply to the desktop client: whatever lands in `web` is invisible to the desktop window. Three routes work there; the first is the least work.

### 1. The client's own bundled dsh (recommended)

The client ships a CLI that may manage the `desktop` profile. It runs on the application's bundled pnpm, so this machine needs neither node nor pnpm:

- Register it from the client's **Manage dsh command…** menu item (macOS installs `/usr/local/bin/dsh`; Windows registers it on the current user's PATH), or
- call the launcher inside the application bundle directly: macOS `DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`, Windows `<install dir>\resources\runtime\cli\bin\dsh.cmd`.

Launch the desktop client once so the application creates its profile, then **quit it completely** (⌘Q on macOS, system tray included on Windows; while the app runs, package operations wait for the profile write lock):

```sh
dsh plugin --profile desktop add file:<absolute path to tavern-preset inside your tavern-content clone>
```

Reopen the client to pick the change up. The repo's `bash install.sh --profile desktop` (Windows: `powershell -ExecutionPolicy Bypass -File install.ps1 -ProfileName desktop`) prepares the checkout, probes for that dsh, and runs those two commands for you; when the probe finds nothing (for example before you register the command on PATH), point `--desktop-cli <path>` at the launcher in the application bundle, or take route 2.

### 2. The sidebar Plugins page

The client's sidebar **Plugins** page manages the current profile. Its install field accepts an absolute local directory path (a `file:` prefix works too) or the Git address from “Install from a GitHub release”: enter `<clone>/tavern-preset` or that spec. This route needs no terminal and no command on PATH.

### 3. plugin_manager in a session

A desktop session's agent can also install through the host's built-in `plugin_manager`, with the same local directory spec `file:<clone>/tavern-preset` as the target. **This route has a precondition: the session must run the `cordis` preset** — `plugin_manager` is switched off in both the `dsh-base` and `dsh-web-app` layers and only the `cordis` preset's sessions carry it. A `Tavern Cards` session does not, so it cannot install the preset it is running on; start a `cordis`-preset session first.

### Self-check

- Self-check: in the desktop profile's `package.json`, `dependencies` should carry `@ai4rpg/dsh-tavern-preset` (a local directory install records a `file:` spec; a GitHub install records the release URL or the Git spec) and `dsh.profile.bundles` should list `@ai4rpg/dsh-tavern-preset`.
- Activation: after quitting and reopening the client completely, a new session's preset chip offers **Tavern Cards** and the right sidebar shows the stage tab.
- Do not manage the desktop client with `--profile web` commands, and do not edit its profile files by hand.


## Verify

```sh
dsh --profile web --dump-config | grep -nE 'tavern-preset|preset-tavern-standard|ui-sidebar-stage'
```

The desktop client skips this section: `--dump-config` is refused there too, so use the desktop self-check above.

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
   - The four delegation tools are present: `check-agent`, `conversion-agent`, `first-message-agent`, `schema-agent`. They bind the official `spawn` provider and select the internal `tavern-child-*` presets; a call returns an activation receipt (the child's name), and the child's answer arrives as a completion notification. Wait for that notification before continuing with work that depends on it. Do not select a `Tavern child · *` preset for a user session.
   - The child tool surfaces are narrow: `check-agent` has read/glob/grep/skill but no `write`/`edit`/shell; only `conversion-agent` has shell tools for its validation script.
   - The stage tab appears in the right sidebar and labels the stages in Chinese (`路由`, `设计`, `规划`, `内容`, `界面`); `/stage` and `goto_stage` still take the durable English names. In a session on another preset the tab shows an empty state.
   - The `Current stage policy:` line appears in the runtime context once the session has a focused card project and the current stage's deliverable reads complete. That signal is file-based and observation-driven, so it stays silent on an empty workspace and for files written through `bash`: write project files with the tracked editor tools (`write` / `edit`).
4. The stage flow is `route → design → planning → content → ui`; a full transition writes a handoff document to `<session workspace>/handoff/<session id>/<stage>.md`, while a light transition (below the configured `minHandoffTokens`) writes nothing.

For a full regression pass (per-layer prompts from session isolation to the end-to-end workflow), see [testing-prompts.md](testing-prompts.md).

## Review dialog language

The shipped preset declares `language: zh` on its `stage-switch` row, so the `goto_stage` review dialog is Chinese out of the box. The choice lives in the composition; installing patches nothing afterwards.

For English, set that field to `en` in the preset you run. Because the row sits inside the preset declaration, the change belongs to the copy you compose: override the `preset-tavern-standard` row with your own bundle, or edit the installed `cordis.patch.yml`. Replace that file rather than editing it in place (pnpm hardlinks installed files), and note that a reinstall or upgrade restores `zh`.

## Isolation

Tavern context is per session. Sessions started on `tavern-standard` receive the stage prompts, `goto_stage` / `tavern_forge`, the tavern skills, and the four delegation tools. The `tavern-child-*` declarations are registered eagerly with the preset registry. They are meant for delegation: a child session binds the one its delegation row selected, and that child gets its own persona, tool set, and the skills it needs — but not the parent's stage or forge surface. A user session started directly on one therefore lacks that surface, which is why they are marked internal. Other profiles on the same machine stay outside this session's composition. The sidebar tab is the one shared piece: it is mounted host-level because the browser module roster only scans the host tree, and it is passive (free of prompt text and tools); a non-tavern session shows its empty state.

## Upgrade and uninstall

**Upgrade.** For a checkout install, pull the checkout forward (`git pull`) and re-run the install command. For a GitHub release install, run the same `add` command with the newer release URL. If the lockfile keeps the previously installed copy, `remove` the package and `add` it again. New sessions use the new version; a running session keeps the revision it started with. For the desktop profile, use the same commands with `--profile desktop` and the client's bundled `dsh`.

**A preset is a snapshot.** `tavern-standard` is the official `standard` composition plus the tavern group and the four internal child presets, captured when the package was generated. Editing it — from the Web UI's preset surface (Creator mode authors an override of `preset-tavern-standard` by row id) or by editing the installed patch — replaces the complete `plugins` list, and a later upgrade of the plugin or the preset package does not merge into that edited copy. To pick up upstream changes after editing, reinstall the package or re-apply your edit on top of the new version.

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
| The four delegation tools are missing | Same first check as above (the session's preset); if the session is on `tavern-standard`, the tavern group failed to mount or the `spawn` provider is absent — read the diagnostic shown at session creation. |
| A delegation call returns at once with an activation receipt (the child's name) | Expected: dsh 0.2.2 delegation is asynchronous. The final answer arrives in the parent's completion notification; wait for it instead of reading the tool result. |
| A child never picks up its persona or tools | Check that the delegation row names an existing `tavern-child-*` id in `agentPreset`; those ids are a resume contract, so do not rename them. |
| `Current stage policy:` never appears | Expected on an empty workspace and after `bash`-only file writes: the signal needs tracked file observations. Write project files with `write` / `edit`. |
| The wrong review-dialog language | Set `language` on the preset's `stage-switch` row (`zh` shipped, `en` for English), as described above. |
| An upgrade changed nothing | Open a NEW session (running sessions keep their revision), and remember that an edited preset is not merged — reinstall or re-apply. |
| A former tavern session refuses to resume after removal | The preset id is a resume contract: reinstall the package to resume that session. |
| `dsh plugin --profile desktop …` fails with `profile "desktop" is managed exclusively by the Electron application` | That is the npm-installed standalone CLI, which cannot change the desktop profile. Use the client's own bundled `dsh`, the sidebar Plugins page, or `plugin_manager`, as in “Official desktop client”. |
| Nothing appears in the desktop client after installing | Quit the client completely (system tray included) and reopen it; also confirm `dsh.profile.bundles` in the desktop profile lists `@ai4rpg/dsh-tavern-preset`. |
| The desktop profile is not initialized yet | Launch the desktop client once (it creates `$DSH_HOME/profiles/desktop`), quit it completely, then run the install command or `install.sh --profile desktop`. |
| The desktop client cannot find pnpm | The client's bundled `dsh` never looks for pnpm on `PATH`; it uses the copy the application ships. This error usually means the command ran on the npm-installed `dsh` instead. |
| A session has no `plugin_manager` tool | It is enabled only for `cordis`-preset sessions (`dsh-base` and `dsh-web-app` both switch it off). Use the client's bundled `dsh` or the Plugins page, or start a `cordis`-preset session. |
| The preset chip still has no Tavern Cards after installing | `desktop` and `web` are two separate profiles, and each sees only its own installs; confirm you installed into the desktop one, then restart the client completely. |

## License

Repository code is MIT — see `LICENSE.md`. The three skill bodies under `skills/` are synced from [ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards) and licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) — see `skills/LICENSE.md`.
