/**
 * The `agent/pre-step` listener: before each user message that carries
 * channel metadata, a notice with its context.
 *
 * The listener is registered first in the chain (`prepend`), so the code after
 * `await next()` runs last and sees the messages after every other listener
 * has recorded its sender on them. The notice is its own message with a
 * producer source (`form: 'notice'`), committed to the session log with the
 * step; the person's message itself is never changed, so DSH's session title
 * and anything reading people's words see only what they wrote.
 */

import { randomUUID } from 'node:crypto'
import { NOTICE_KIND, renderContext } from './render.js'

function freeze(value) {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

/**
 * The notice that goes before one message, or undefined when the message
 * carries no metadata to show.
 * @param message - a message entering a step.
 * @param options - resolved settings (see `resolveOptions`).
 */
export function noticeFor(message, options) {
  if (message?.role !== 'user') return undefined
  const context = renderContext(message.source, options)
  if (context === undefined) return undefined
  return freeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: context.text }],
    source: { kind: NOTICE_KIND, form: 'notice', summary: context.summary, messageId: message.id },
  })
}

/**
 * The listener.
 * @param options - resolved settings (see `resolveOptions`).
 * @returns `(payload, next) => decision`.
 */
export function createPreStep(options) {
  return async function messageContextPreStep(_payload, next) {
    const decision = await next()
    if (decision?.kind !== 'enter' || !Array.isArray(decision.messages)) return decision
    const described = new Set(decision.messages
      .filter((message) => message?.source?.kind === NOTICE_KIND)
      .map((message) => message.source.messageId))
    const messages = []
    let changed = false
    for (const message of decision.messages) {
      const notice = described.has(message?.id) ? undefined : noticeFor(message, options)
      if (notice !== undefined) {
        messages.push(notice)
        changed = true
      }
      messages.push(message)
    }
    return changed ? { ...decision, messages } : decision
  }
}
