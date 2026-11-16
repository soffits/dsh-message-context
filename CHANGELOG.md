# Changelog

## [Unreleased]

## [0.3.0]

### Added

- Messages are described whatever their source kind, so a send a channel mirrors into a session under its own kind (Telegram's `telegram-post`) gets its line too; only this plugin's notices are skipped.
- A sender that is not a person can carry `chat` on its principal, naming where it posted the message: `[Message from scheduled job "Check-in", posted to Telegram "Notify"]`.

## [0.2.0]

### Added

- Web UI: a message whose `source.principal` is an agent (`dsh-session`, `cron-job`, `external`) is drawn on the assistant's side with a line naming its sender, instead of as the owner's bubble. Covers `open_session`/`prompt_session` messages, scheduled job prompts and sends channel plugins mirror into sessions, keyed on the principal only.

## [0.1.0]

### Added

- First release: a context notice before each user message that carries `source.principal` or `source.envelope`, with sender, channel, chat, send time, reply and forward. Settings for each part, the time zone, the quote length and the channels to cover.
