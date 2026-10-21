# @ai4rpg/tavern-agents

The four tavern named-subagent personas (`check-agent`, `conversion-agent`,
`schema-agent`, `first-message-agent`) as plain markdown files, synced from
upstream [ai4rpg/tavern-cards](https://github.com/ai4rpg/tavern-cards).

English | [中文](README.zh.md)

`@ai4rpg/dsh-tavern-stages` exposes the `loadTavernAgents()` loader this
package was built for. The preset generator consumes it at development time:
it reads `agents/*.md` and embeds each persona's body and frontmatter
`description` into a `tavern-child-*` preset in `cordis.patch.yml`. The
installed preset does not load this package at runtime; the generated patch is
the runtime copy. The package is a generator-time devDependency of the preset
package, not a runtime dependency.

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
  personas exist; the package name the generator resolves by is unchanged).

## Adding, renaming, removing personas

Adding a persona is safe for the source package, but the generated preset only
gains a delegation row and child preset after `npm run gen`. Renaming or
removing one is a breaking change, because the existing `tavern-child-*` ids
are recorded by sessions and the `tool-subagent-*` rows bind by name. Coordinate
such changes with a preset regeneration and keep the ids stable for old sessions.

## License

CC BY-NC-SA 4.0 (see `LICENSE.md`).
