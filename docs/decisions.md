# Decisions

- Context goes in a separate `notice` message before the person's message, not into its text: titles, search and readers of people's words stay clean, and the notice is durable in the log.
- Who is `source.principal` (DSH's field); facts about the one message go in one new optional `source.envelope` object, so the contract adds a single field.
- Where the message was sent lives in `principal.chat`, since channel plugins already record it there.
- `replyTo`/`forwardedFrom` carry a few structured fields plus `details` strings, instead of modelling every channel's media and link types.
- The listener is prepended, so it runs after the channel plugins' own pre-step listeners and sees the sender they record there.
- Labels are flattened, brackets replaced and lengths capped in code points, as other gateways do (Hermes Agent, OpenClaw), since names come from other people.
- Times use the configured zone, else the message's `clientTimeZone`, else the machine's: the zone the sender's client reported is the best guess for whose clock the times are read against.
- The Web client claims agent messages by `source.principal.kind` and draws them itself, rather than each producer shipping its own Chat code: Chat allows one claim per message, and one renderer keyed on the shared field covers every producer.
- Agent messages are drawn in full on the assistant's side, not as DSH's collapsed `relay`/`notice` context row: a brief from another session or a job prompt is read like a message, and the collapsed row hides it.
- The row keeps Chat's group-tree position for a person's message (exchange, input, turn), so folding and exchanges behave as before.
