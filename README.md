# tavern-content

The tavern content repo for the [tavern-cards](https://github.com/ai4rpg/tavern-cards) workflow on the DeepSeek Harness (dsh): everything that is content or configuration rather than plugin code, in one clone. Neither package here ships on npm; the plugins they compose (`@ai4rpg/dsh-tavern-stages`, `@ai4rpg/dsh-stage-switch`, …) install from npm as the preset package's dependencies.

English | [中文](README.zh.md)

- `tavern-preset/` — `@ai4rpg/dsh-tavern-preset`, the agent preset package: the declared `tavern-standard` preset, the three tavern skills, the persona prose, the host-plane sidebar row. **The install entry point** — see `tavern-preset/docs/install-guide.md`.
- `tavern-agents/` — `@ai4rpg/tavern-agents`, the four named-subagent personas (CC BY-NC-SA), carried into the profile by the preset package's `file:` dependency.

## Install

Hand the content in this section to your AI agent and let it follow along. Doing it by hand works too — every command below is copy-paste ready. There are two deployment targets: a command-line profile such as `web`, and the `desktop` profile owned by the official desktop client (Electron).

| Target profile | Install |
|---|---|
| `web` and similar (started from a terminal) | `bash install.sh --profile web --verify` — the script downloads this repo to `~/tavern-content` (an existing checkout is pulled forward instead), then installs the preset package into the profile, which brings the tavern plugins in from npm as its dependencies. On Windows, run `powershell -ExecutionPolicy Bypass -File install.ps1` instead |
| The official desktop client (`desktop`) | Install from inside the app: run `dsh plugin --profile desktop add file:<absolute path to your clone>/tavern-preset` with the client's bundled `dsh` (the **Manage dsh command…** menu item registers it on `PATH`), or paste the same path into the sidebar **Plugins** page. From a terminal, `bash install.sh --profile desktop` is the same route: it prepares the checkout and runs that bundled `dsh` for you |

After a desktop install, quit the client completely and reopen it — **Tavern Cards** appearing in a new session's preset chip means it worked. Desktop installs need nothing on your machine: dsh, node, and pnpm all ship with the app, while a command-line profile just needs dsh itself.

Step-by-step instructions, what success looks like, upgrade and uninstall, and troubleshooting are in [`tavern-preset/docs/install-guide.md`](tavern-preset/docs/install-guide.md): the desktop client under “Official desktop client”, command-line profiles under “Install” and “Verify”. For what gets installed and how to customize it, see [`tavern-preset/README.md`](tavern-preset/README.md).

Re-running the script updates the checkout and reinstalls; `--remove` uninstalls the preset while keeping the checkout. All flags are in the script header.

Manual install (without the script):

```sh
git clone https://github.com/ai4rpg/tavern-content
dsh plugin --profile web add file:<absolute path to the clone>/tavern-preset
```

## License

Per package: `tavern-preset` is MIT for its code with the `skills/` bodies under CC BY-NC-SA 4.0 (see its `LICENSE.md`); `tavern-agents` is CC BY-NC-SA 4.0 throughout (see its `LICENSE.md`).
