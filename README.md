# tavern-content

The tavern content repo for the [tavern-cards](https://github.com/ai4rpg/tavern-cards) workflow on the DeepSeek Harness (dsh): everything that is content or configuration rather than plugin code, in one clone. Neither package here ships on npm; the plugins they compose (`@ai4rpg/dsh-tavern-stages`, `@ai4rpg/dsh-stage-switch`, …) install from npm as the preset package's dependencies.

English | [中文](README.zh.md)

- `tavern-preset/` — `@ai4rpg/dsh-tavern-preset`, the agent preset package: the declared `tavern-standard` preset, the three tavern skills, the persona prose, the host-plane sidebar row. **The install entry point** — see `tavern-preset/docs/install-guide.md`.
- `tavern-agents/` — `@ai4rpg/tavern-agents`, the four named-subagent personas (CC BY-NC-SA), carried into the profile by the preset package's `file:` dependency.

## Install

Clone this repo, then:

```sh
git clone https://github.com/ai4rpg/tavern-content
dsh plugin --profile web add file:<absolute path to the clone>/tavern-preset
```

## License

Per package: `tavern-preset` is MIT for its code with the `skills/` bodies under CC BY-NC-SA 4.0 (see its `LICENSE.md`); `tavern-agents` is CC BY-NC-SA 4.0 throughout (see its `LICENSE.md`).
