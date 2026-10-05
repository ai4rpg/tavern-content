# @ai4rpg/tavern-agents

The four tavern named-subagent personas (`check-agent`, `conversion-agent`,
`schema-agent`, `first-message-agent`) as plain markdown files, synced from
upstream [ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards).

English | [中文](README.zh.md)

`@ai4rpg/dsh-tavern-stages` resolves this package through its own dependency
graph, reads `agents/*.md`, and registers one `tavern:<name>` subagent
provider per persona (the frontmatter `description` becomes the bound tool's
description). The preset package's generator declares one `tool-subagent` row
per persona from the same source, so the tool rows and the registered
providers cannot drift.

## Layout contract

- `agents/*.md` — one persona per file: YAML frontmatter with exactly `name`
  (must match the file stem) and `description`, body below. The bodies are
  upstream-synced and never edited here; wording changes go upstream.
- `agents/LICENSE.md` — the directory license notice, regenerated on every
  sync; it is not a persona.

## Commands

- `npm run sync` — wipe and rebuild `agents/` from upstream
  (`TAVERN_CARDS_ROOT` must point at your [tavern-cards](https://github.com/ai4rpg/tavern-cards) checkout; there is no default),
  then validate the frontmatter/body contract.
- `npm test` — the same contract plus the layout guard (the four current
  personas exist; the package name the plugin resolves by is unchanged).

## Adding, renaming, removing personas

Adding a persona is safe: the plugin registers an extra provider with no
bound tool row. Renaming or removing one is a breaking change, because the preset's
`tool-subagent-*` rows bind by name and would dangle. Coordinate such changes
with a preset regeneration.

## License

CC BY-NC-SA 4.0 (see `LICENSE.md`).
