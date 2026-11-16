/**
 * Settings as the renderer uses them, from the plugin's Config.
 */

import { knownTimeZone } from './render.js'

/** Zone of this process. */
export function processTimeZone() {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** What each `include` flag shows; all are on unless turned off. */
export const INCLUDE_KEYS = Object.freeze(['sender', 'ids', 'chat', 'time', 'reply', 'forward'])

/**
 * @param config - the plugin's Config (any field may be missing).
 * @returns `{ options, warning }`: settings for `renderContext`, and a warning
 *   when `timeZone` names a zone this runtime does not know (it is ignored).
 */
export function resolveOptions(config = {}) {
  const include = Object.fromEntries(INCLUDE_KEYS.map((key) => [key, config.include?.[key] !== false]))
  const wanted = typeof config.timeZone === 'string' ? config.timeZone.trim() : ''
  const valid = wanted.length > 0 && knownTimeZone(wanted)
  const maxQuote = Number.isSafeInteger(config.maxQuote) && config.maxQuote > 0 ? config.maxQuote : 2000
  const channels = Array.isArray(config.channels)
    ? config.channels.filter((channel) => typeof channel === 'string' && channel.trim().length > 0).map((channel) => channel.trim())
    : []
  return {
    options: Object.freeze({
      include: Object.freeze(include),
      timeZone: valid ? wanted : undefined,
      fallbackTimeZone: processTimeZone(),
      maxQuote,
      channels: Object.freeze(channels),
    }),
    warning: wanted.length > 0 && !valid ? `timeZone ${JSON.stringify(wanted)} is not a known time zone; using each message's own zone` : undefined,
  }
}
