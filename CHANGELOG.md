# Changelog

## [Unreleased]

## [0.2.0]

### Added

- Web UI: a message whose `source.principal` is an agent (`dsh-session`, `cron-job`, `external`) is drawn on the assistant's side with a line naming its sender, instead of as the owner's bubble. Covers `open_session`/`prompt_session` messages, scheduled job prompts and sends channel plugins mirror into sessions, keyed on the principal only.

## [0.1.0]

### Added

- First release: a context notice before each user message that carries `source.principal` or `source.envelope`, with sender, channel, chat, send time, reply and forward. Settings for each part, the time zone, the quote length and the channels to cover.
