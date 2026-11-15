# tavern-content

The tavern content repo for the [tavern-cards](https://github.com/ai4rpg/tavern-cards) workflow on the DeepSeek Harness (dsh): everything that is content or configuration rather than plugin code, in one clone. The preset package stays off npm (a GitHub checkout or a release tarball); the plugins it composes (`@ai4rpg/dsh-tavern-stages`, `@ai4rpg/dsh-stage-switch`, …) install from npm as the preset package's dependencies.

English | [中文](README.zh.md)

- `tavern-preset/` — `@ai4rpg/dsh-tavern-preset`, the agent preset package: the declared `tavern-standard` preset, the three tavern skills, the persona prose, the host-plane sidebar row. **The install entry point** — see `tavern-preset/docs/install-guide.md`.
- Upstream [tavern-cards](https://github.com/ai4rpg/tavern-cards) — the development input for skill synchronization and the four child personas. Regeneration reads an approved main snapshot through `TAVERN_CARDS_ROOT`; ordinary installation needs only this repo's committed preset and skills, not the upstream checkout.

## Install

Hand the content in this section to your AI agent and let it follow along. Doing it by hand works too — every command below is copy-paste ready. There are two deployment targets: a command-line profile such as `web`, and the `desktop` profile owned by the official desktop client (Electron).

| Target profile | Install |
|---|---|
| `web` and similar (started from a terminal) | `bash install.sh --profile web --verify` — the script downloads this repo to `~/tavern-content` (an existing checkout is pulled forward instead), then installs the preset package into the profile, which brings the tavern plugins in from npm as its dependencies. On Windows, run `powershell -ExecutionPolicy Bypass -File install.ps1` instead |
| The official desktop client (`desktop`) | Install from inside the app: run `dsh plugin --profile desktop add file:<absolute path to your clone>/tavern-preset` with the client's bundled `dsh` (the **Manage dsh command…** menu item registers it on `PATH`), or paste the same path into the sidebar **Plugins** page. From a terminal, `bash install.sh --profile desktop` is the same route: it prepares the checkout and runs that bundled `dsh` for you |

After a desktop install, quit the client completely and reopen it — **Tavern Cards** appearing in a new session's preset chip means it worked. The desktop client ships dsh, node, and pnpm; a command-line profile needs dsh itself.

Step-by-step instructions, success criteria, upgrade and uninstall, troubleshooting, and the no-clone routes (release tarball or Git) are in [`tavern-preset/docs/install-guide.md`](tavern-preset/docs/install-guide.md). For what gets installed and how to customize it, see [`tavern-preset/README.md`](tavern-preset/README.md). Re-running the script updates the checkout and reinstalls; `--remove` uninstalls the preset while keeping the checkout, and all flags are in the script header.

## License

The preset's code is MIT. The synced `skills/`, upstream test snapshots, and persona text embedded in `cordis.patch.yml` are CC BY-NC-SA 4.0; see [`tavern-preset/LICENSE.md`](tavern-preset/LICENSE.md).
