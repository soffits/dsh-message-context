# Maintainer notes

A DeepSeek Harness host plugin: one `agent/pre-step` listener that renders channel metadata on user messages as a notice before them. No tools, no client part. Users read `README.md`; this file and `docs/` are for whoever changes the code.

## Layout

- `index.js`: the plugin row. Config schema and the listener registration.
- `src/render.js`: pure rendering from a message `source` to `{ text, summary }`: labels, times, reply and forward blocks. No DSH imports.
- `src/pre-step.js`: the listener; inserts one notice per described message.
- `src/options.js`: Config to the settings the renderer reads.

## Rules for changes

- Never change the person's message; context goes in the notice only.
- Everything from a channel is untrusted: every label goes through `cleanLabel`, quoted text through `quoteBlock`.
- The line format is read by people's own tools and rules, so treat a format change as a breaking change.
- Read only `source.principal` and `source.envelope`; no channel-specific fields beyond what the README's contract lists.

## Working on the project

- Everything in the repo is English.
- Conventional Commits, one-line subjects; squash merges; PR titles are Conventional Commit subjects.
- Versions follow semver from the commit types since the last tag (below 1.0: `feat` or breaking is minor, `fix` patch); `.github/scripts/release-bump-check.py <version>` before tagging.
- Ordinary implementation choices go in `docs/decisions.md` with a one-line reason.
