/**
 * Turn the metadata a channel plugin records on a user message into the
 * short context the model reads: who sent it, where, when, and what it
 * replies to or was forwarded from.
 *
 * The input is the message's `source`:
 * - `principal`: DSH's field for the caller behind a user message,
 *   `{ kind, channel, id, name?, username?, chat?: { id, name?, thread? } }`.
 * - `envelope`: facts about this one message,
 *   `{ sentAt?, replyTo?, forwardedFrom? }` (see README.md, "Metadata contract").
 *
 * Everything that came from a channel (names, chat titles, quoted text) was
 * written by people, so labels are flattened to one line, brackets are
 * neutralised and lengths are capped before they reach the model.
 */

/** Source kind of the notice this plugin puts before a message. */
export const NOTICE_KIND = 'message-context'

/** Longest one-line label (a name, a chat title, a detail), in characters. */
export const LABEL_LIMIT = 80

/** Longest DSH notice summary (`CONTEXT_SUMMARY_MAX_CHARS` in dsh-llm). */
export const SUMMARY_LIMIT = 120

/** Principal kinds for senders that are not people. */
export const AGENT_KINDS = Object.freeze(['dsh-session', 'cron-job', 'external'])

const CHANNEL_NAMES = {
  telegram: 'Telegram',
  matrix: 'Matrix',
  web: 'Web',
  deltachat: 'Delta Chat',
  discord: 'Discord',
  slack: 'Slack',
  email: 'Email',
}

const ID_LABELS = {
  'telegram-user': 'user id',
  'oidc-user': 'oidc sub',
  'deltachat-user': 'key',
}

/** Kinds whose id is already a readable handle, shown as is. */
const SELF_DESCRIBING_IDS = new Set(['matrix-user'])

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/g

/**
 * One line of text from a channel, safe inside the bracketed context line:
 * control and direction characters and newlines become spaces, runs of space
 * collapse, square brackets become round ones, and the result is cut to
 * `limit` characters (by code point, so CJK text and emoji are not split).
 * @param value - any value; non-strings give undefined.
 * @param limit - most characters kept.
 * @returns the label, or undefined when nothing printable is left.
 */
export function cleanLabel(value, limit = LABEL_LIMIT) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const flat = String(value).replace(CONTROL, ' ').replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, ' ').trim()
  if (flat.length === 0) return undefined
  const chars = [...flat]
  return chars.length <= limit ? flat : `${chars.slice(0, Math.max(1, limit - 1)).join('').trimEnd()}…`
}

/**
 * Quoted text as `> ` lines, cut near `limit` characters at a line or word
 * break when one is close. Brackets are kept: a quote line cannot close the
 * context line, since every line starts with `> `.
 * @param text - the quoted text.
 * @param limit - most characters kept.
 * @returns the quote block, or undefined for empty text.
 */
export function quoteBlock(text, limit) {
  if (typeof text !== 'string') return undefined
  let shown = text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim()
  if (shown.length === 0) return undefined
  let note = ''
  const chars = [...shown]
  if (chars.length > limit) {
    const head = chars.slice(0, limit).join('')
    let cut = Math.max(head.lastIndexOf('\n'), head.lastIndexOf(' '))
    if (cut < head.length * 0.8) cut = head.length
    note = `\n> […${chars.length - [...head.slice(0, cut)].length} more characters]`
    shown = head.slice(0, cut).trimEnd()
  }
  return shown.split('\n').map((line) => `> ${line}`).join('\n') + note
}

const formatters = new Map()

function formatterFor(timeZone) {
  let formatter = formatters.get(timeZone)
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

/**
 * Whether this runtime knows a time zone name.
 * @param timeZone - an IANA name or `UTC`.
 */
export function knownTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone.trim().length === 0) return false
  try {
    formatterFor(timeZone.trim())
    return true
  } catch {
    return false
  }
}

/**
 * A moment as the model reads it: weekday, date, local time and UTC offset,
 * such as `Mon 2026-03-02 09:41 UTC+01:00`.
 * @param epochMs - milliseconds since the epoch.
 * @param timeZone - zone to show it in.
 * @returns the text, or undefined for a value that is not a time.
 */
export function formatMoment(epochMs, timeZone) {
  if (typeof epochMs !== 'number' || !Number.isFinite(epochMs)) return undefined
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(epochMs).map((part) => [part.type, part.value]))
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : parts.timeZoneName.slice(3)
  return `${parts.weekday} ${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} UTC${offset}`
}

function channelName(channel) {
  const id = cleanLabel(channel, 32)
  if (id === undefined) return undefined
  return CHANNEL_NAMES[id.toLowerCase()] ?? id.charAt(0).toUpperCase() + id.slice(1)
}

function quoted(value) {
  const label = cleanLabel(value)
  return label === undefined ? undefined : `"${label.replace(/"/g, "'")}"`
}

/** `@handle` from a username that may or may not carry the `@` already. */
function handle(username) {
  const label = cleanLabel(username, 64)
  if (label === undefined) return undefined
  return label.startsWith('@') ? label : `@${label}`
}

/** The ids part of a person's line: `@ana, user id 123`. */
function personIds(principal) {
  const parts = []
  const at = handle(principal.username)
  const id = cleanLabel(principal.id, 128)
  if (at !== undefined && at !== id) parts.push(at)
  if (id !== undefined) {
    if (SELF_DESCRIBING_IDS.has(principal.kind)) parts.push(id)
    else parts.push(`${ID_LABELS[principal.kind] ?? 'id'} ${id}`)
  }
  return parts
}

/**
 * Who a principal is, in a few words, for a reply's or forward's author.
 * @param party - a principal-shaped object, or `{ role: 'assistant' | 'sender' }`.
 * @returns the description, or undefined when it names nobody.
 */
export function describeParty(party) {
  if (party === null || typeof party !== 'object') return undefined
  if (party.role === 'assistant') return 'you (the assistant)'
  if (party.role === 'sender') return 'the same sender (their own earlier message)'
  const name = cleanLabel(party.name)
  const id = cleanLabel(party.id, 128)
  if (party.kind === 'dsh-session') return `the agent in DSH session ${id ?? 'unknown'}${name === undefined ? '' : ` (${name})`}`
  if (party.kind === 'cron-job') return `scheduled job ${quoted(party.name) ?? id ?? 'unknown'}`
  const at = handle(party.username)
  if (name !== undefined) return at === undefined ? name : `${name} (${at})`
  if (at !== undefined) return at
  return id
}

function timeText(epochMs, timeZone) {
  return formatMoment(epochMs, timeZone)
}

/**
 * The first line: who sent the message, where and when.
 * @param principal - `source.principal`, or undefined.
 * @param sentAt - `envelope.sentAt`, or undefined.
 * @param options - resolved settings (`include`, `timeZone`).
 * @returns the line, or undefined when there is nothing to say.
 */
export function senderLine(principal, sentAt, options) {
  const { include } = options
  const time = include.time ? timeText(sentAt, options.timeZone) : undefined
  const sent = time === undefined ? '' : `, sent ${time}`
  const known = principal !== null && typeof principal === 'object' && principal.kind !== 'owner' && include.sender
  if (!known) return time === undefined ? undefined : `[Message sent ${time}]`
  const name = cleanLabel(principal.name)
  const id = cleanLabel(principal.id, 128)
  if (principal.kind === 'dsh-session') {
    return `[Message from the agent in DSH session ${id ?? 'unknown'}${name === undefined ? '' : ` (${name})`}, not typed by a person${sent}]`
  }
  if (principal.kind === 'cron-job') {
    return `[Message from scheduled job ${quoted(principal.name) ?? id ?? 'unknown'}${include.ids && name !== undefined && id !== undefined ? ` (${id})` : ''}${sent}]`
  }
  if (principal.kind === 'external') return `[Message from ${name ?? id ?? 'an outside caller'}, an outside caller${sent}]`
  const channel = channelName(principal.channel)
  const head = channel === undefined ? 'Message' : `${channel} message`
  const ids = include.ids ? personIds(principal) : []
  const who = name !== undefined
    ? (ids.length === 0 ? name : `${name} (${ids.join(', ')})`)
    : (ids.length === 0 ? 'an unnamed sender' : ids.join(', '))
  const chat = include.chat ? quoted(principal.chat?.name) : undefined
  return `[${head} from ${who}${chat === undefined ? '' : ` in ${chat}`}${sent}]`
}

function detailList(details) {
  if (!Array.isArray(details)) return []
  return details.map((detail) => cleanLabel(detail, 200)).filter((detail) => detail !== undefined).slice(0, 8)
}

/**
 * What the message replies to: a header line and the quoted text.
 * @param replyTo - `envelope.replyTo`.
 * @param options - resolved settings (`timeZone`, `maxQuote`).
 * @returns the block, or undefined without a reply.
 */
export function replyBlock(replyTo, options) {
  if (replyTo === null || typeof replyTo !== 'object') return undefined
  const who = describeParty(replyTo.from)
  const details = []
  const time = timeText(replyTo.sentAt, options.timeZone)
  if (time !== undefined) details.push(`sent ${time}`)
  details.push(...detailList(replyTo.details))
  const quote = quoteBlock(replyTo.text, options.maxQuote)
  const part = quote !== undefined && replyTo.quoted === true ? '; the sender quoted only this part' : ''
  const head = `[Replying to ${who === undefined ? 'a message' : `a message from ${who}`}${details.length === 0 ? '' : ` (${details.join('; ')})`}${part}]`
  return quote === undefined ? head : `${head}\n${quote}`
}

/**
 * Where a forwarded message comes from; its text is the message itself.
 * @param forwardedFrom - `envelope.forwardedFrom`.
 * @param options - resolved settings (`timeZone`).
 * @returns the line, or undefined without a forward.
 */
export function forwardLine(forwardedFrom, options) {
  if (forwardedFrom === null || typeof forwardedFrom !== 'object') return undefined
  const who = describeParty(forwardedFrom.from)
  const details = []
  const time = timeText(forwardedFrom.sentAt, options.timeZone)
  if (time !== undefined) details.push(`originally sent ${time}`)
  details.push(...detailList(forwardedFrom.details))
  return `[Forwarded from ${who ?? 'an unknown source'}${details.length === 0 ? '' : ` (${details.join('; ')})`}]`
}

/**
 * The context for one user message, from its source.
 * @param source - the message's `source`.
 * @param options - resolved settings: `include` flags, `timeZone` (used when
 *   set, else the message's `clientTimeZone`, else `fallbackTimeZone`),
 *   `maxQuote`, `channels`.
 * @returns `{ text, summary }`, or undefined when the source carries nothing to show.
 */
export function renderContext(source, options) {
  if (source === null || typeof source !== 'object' || source.kind !== 'user') return undefined
  const principal = source.principal !== null && typeof source.principal === 'object' ? source.principal : undefined
  const envelope = source.envelope !== null && typeof source.envelope === 'object' ? source.envelope : {}
  if (options.channels.length > 0 && !options.channels.includes(principal?.channel)) return undefined
  const timeZone = options.timeZone ?? (knownTimeZone(source.clientTimeZone) ? source.clientTimeZone : options.fallbackTimeZone)
  const resolved = { ...options, timeZone }
  const lines = [
    senderLine(principal, envelope.sentAt, resolved),
    options.include.reply ? replyBlock(envelope.replyTo, resolved) : undefined,
    options.include.forward ? forwardLine(envelope.forwardedFrom, resolved) : undefined,
  ].filter((line) => line !== undefined)
  if (lines.length === 0) return undefined
  const text = lines.join('\n')
  const first = lines[0].split('\n')[0]
  const summary = [...first].length <= SUMMARY_LIMIT ? first : `${[...first].slice(0, SUMMARY_LIMIT - 1).join('')}…`
  return { text, summary }
}
