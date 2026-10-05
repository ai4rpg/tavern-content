# tavern-content

The tavern content repo for the [tavern-cards](https://github.com/ai4rpg/tavern-cards) workflow on the DeepSeek Harness (dsh): everything that is content or configuration rather than plugin code, in one clone. Neither package here ships on npm; the plugins they compose (`@ai4rpg/dsh-tavern-stages`, `@ai4rpg/dsh-stage-switch`, …) install from npm as the preset package's dependencies.

English | [中文](README.zh.md)

- `tavern-preset/` — `@ai4rpg/dsh-tavern-preset`, the agent preset package: the declared `tavern-standard` preset, the three tavern skills, the persona prose, the host-plane sidebar row. **The install entry point** — see `tavern-preset/docs/install-guide.md`.
- `tavern-agents/` — `@ai4rpg/tavern-agents`, the four named-subagent personas (CC BY-NC-SA), carried into the profile by the preset package's `file:` dependency.

## Install

The installer script automates the manual flow below: it downloads this repo to `~/tavern-content` (an existing checkout is pulled forward instead), then installs the preset package into a dsh profile, which brings the tavern plugins in from npm as its dependencies.

```sh
curl -fsSL https://raw.githubusercontent.com/ai4rpg/tavern-content/main/install.sh -o install.sh
bash install.sh --profile web --verify
```

On Windows, fetch `install.ps1` the same way and run it with `powershell -ExecutionPolicy Bypass -File install.ps1`. Inside an existing clone, run `bash install.sh` in place. Re-running the script updates the checkout and reinstalls; `--remove` uninstalls the preset while keeping the checkout. See the script header for all flags.

Manual install:

```sh
git clone https://github.com/ai4rpg/tavern-content
dsh plugin --profile web add file:<absolute path to the clone>/tavern-preset
```

## License

Per package: `tavern-preset` is MIT for its code with the `skills/` bodies under CC BY-NC-SA 4.0 (see its `LICENSE.md`); `tavern-agents` is CC BY-NC-SA 4.0 throughout (see its `LICENSE.md`).
