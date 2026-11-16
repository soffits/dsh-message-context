# dsh-message-context

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that tells the model who sent each message, in which chat, when, and what it replies to.

When several people talk to one agent through Telegram, Matrix, the Web UI, or when agents prompt each other, the model only sees text. Channel plugins already know the rest. This plugin reads what they record on the message and puts one short context line in front of it, in the same format for every channel:

```
[Telegram message from Ana Silva (@ana, user id 123) in "Groceries", sent Mon 2026-03-02 09:41 UTC-05:00]
[Replying to a message from you (the assistant) (sent Mon 2026-03-02 09:40 UTC-05:00)]
> Buy milk?
```

```
[Web message from nya (oidc sub 2f1c…), sent Mon 2026-03-02 09:45 UTC-05:00]
[Matrix message from Ana (@ana:example.org) in "Home"]
[Message from the agent in DSH session session-7b2e…, not typed by a person]
```

The person's message itself is never changed. The context goes in a separate notice message (`form: 'notice'`) right before it, which is saved in the session log with the step, so session titles, search and anything else that reads people's words still sees only what they wrote. A message with no metadata (the owner typing in the Web UI, a scheduled prompt) gets nothing.

## Install

```sh
dsh plugin --profile web add @soffits/dsh-message-context
```

The bundle adds one host row, `message-context`. It has no tools and no UI, so enabling or disabling it is safe while sessions run.

Channel plugins that render their own sender line should be updated to versions that only record metadata, otherwise the model sees both.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `include.sender` | `true` | Who sent the message, and on which channel |
| `include.ids` | `true` | Account ids next to the name (`user id`, `oidc sub`, Matrix id) |
| `include.chat` | `true` | The chat, room or topic name |
| `include.time` | `true` | When the message was sent |
| `include.reply` | `true` | The message it replies to, with its text |
| `include.forward` | `true` | Where a forwarded message comes from |
| `timeZone` | `""` | Zone for times. Empty: the message's own `clientTimeZone`, else the machine's |
| `maxQuote` | `2000` | Longest replied-to text shown, in characters |
| `channels` | `[]` | Only these channels (`telegram`, `web`, `matrix`, `dsh`, ...). Empty: all |

Names, chat titles and other labels come from other people, so they are flattened to one line, brackets are replaced and lengths are capped (counted in characters, so CJK text and emoji are cut cleanly) before the model sees them.

## Metadata contract

For authors of channel plugins. Everything lives on the user message's `source` and must be plain JSON with no credentials, since it is stored in session logs.

**`source.principal`** is DSH's own field for the caller behind a user message. Fill it for every message a person (or another agent) sends through your channel:

```js
{
  kind: 'telegram-user',      // unique per channel; see below for the shared agent kinds
  channel: 'telegram',        // short channel id, shown as "Telegram"
  id: '123',                  // stable account id
  name: 'Ana Silva',          // display name, optional
  username: 'ana',            // handle, optional
  chat: { id: '-100…', thread: 7, name: 'Groceries' }, // where it was sent, optional
}
```

Kinds the renderer knows by name: `telegram-user` (`user id`), `oidc-user` (`oidc sub`), `matrix-user` (the Matrix id as is), `deltachat-user` (`key`). Any other kind is shown as `id <id>`. Senders that are not people use the shared kinds `dsh-session` (another session, `id` is its session id), `cron-job` (a scheduled job) and `external` (an outside script), and are never presented as a person. A principal of kind `owner` is the owner and gets no line.

**`source.envelope`** holds facts about this one message. All fields are optional:

```js
{
  sentAt: 1772462460000,      // Unix ms, when it was sent on the channel
  replyTo: {
    from: { kind: 'telegram-user', id: '456', name: 'Bo', username: 'bo' }, // or { role: 'assistant' } / { role: 'sender' }
    sentAt: 1772462400000,
    text: 'Buy milk?',          // the replied-to text, or the part the person quoted
    quoted: false,              // true when `text` is only the quoted part
    details: ['contains a photo, attached'], // short facts the format doesn't model
  },
  forwardedFrom: {
    from: { name: 'channel "News" (@news)' },
    sentAt: 1772460000000,
    details: ['https://t.me/news/42'],
  },
}
```

`from.role: 'assistant'` means the agent's own earlier message, `'sender'` the same person's earlier message.

Rules for producers:

- Don't add context to the person's text. If your channel already puts reply or forward context into the text, leave `replyTo` and `forwardedFrom` out, or the model reads it twice.
- Set the fields when you build the message, or in an `agent/pre-step` listener registered without `prepend`. This plugin's listener is prepended, so it runs after yours and sees what you recorded.

## How it works

One `agent/pre-step` listener, registered first in the chain. After the other listeners have run, it walks the messages entering the step and puts a notice (`source.kind: 'message-context'`, `form: 'notice'`, `messageId` pointing at the message) before each one that has a principal or an envelope. DSH's own agent-to-agent messages (`agent-message`, `team-message`) carry their sender already and are left alone.

## Development

```sh
npm install
npm run check
npm test
```

## License

MIT
