# Maintainer notes

A DeepSeek Harness plugin: one `agent/pre-step` listener that renders channel metadata on user messages as a notice before them, and a Web client that draws messages agents sent as theirs instead of the owner's bubble. No tools. Users read `README.md`; this file and `docs/` are for whoever changes the code.

## Layout

- `index.js`: the plugin row. Config schema and the listener registration.
- `src/render.js`: pure rendering from a message `source` to `{ text, summary }`: labels, times, reply and forward blocks. No DSH imports.
- `src/pre-step.js`: the listener; inserts one notice per described message.
- `src/options.js`: Config to the settings the renderer reads.
- `client.js`: the Web client, plain JS in DSH's module-loader format (no build). A Chat conversation Definition that claims `user/message` events whose `source.principal.kind` is an agent kind, and the keyed `conversation.chat.node` renderer for them. Its `AGENT_KINDS` must equal the one in `src/render.js` (a test checks).

## Rules for changes

- Never change the person's message; context goes in the notice only.
- Everything from a channel is untrusted: every label goes through `cleanLabel`, quoted text through `quoteBlock`.
- The line format is read by people's own tools and rules, so treat a format change as a breaking change.
- Read only `source.principal` and `source.envelope`; no channel-specific fields beyond what the README's contract lists. The client decides from `source.principal.kind` alone, never from text or a producer's own source kind.

## Working on the project

- Everything in the repo is English.
- Conventional Commits, one-line subjects; squash merges; PR titles are Conventional Commit subjects.
- Versions follow semver from the commit types since the last tag (below 1.0: `feat` or breaking is minor, `fix` patch); `.github/scripts/release-bump-check.py <version>` before tagging.
- Ordinary implementation choices go in `docs/decisions.md` with a one-line reason.
- Releases: after bumping the version and `CHANGELOG.md` and merging, pushing the tag `vX.Y.Z` runs `.github/workflows/publish.yml`, which publishes to npm by trusted publishing (OIDC, with provenance, no stored token; the package's trusted publisher on npmjs.com names this repo and `publish.yml`, so renaming either breaks it) and creates the GitHub release. Don't publish by hand.
