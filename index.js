/**
 * @soffits/dsh-message-context: show the model who sent each message, where,
 * when, and what it replies to, from the metadata channel plugins record on
 * the message. See README.md for the metadata contract and the settings.
 */
import z from '@deepseek-ai/schemastery'
import { createPreStep } from './src/pre-step.js'
import { resolveOptions } from './src/options.js'

export const name = 'message-context'
export const inject = ['agents']

const flag = (description) => z.boolean().default(true).description(description)

export const Config = z.object({
  include: z.object({
    sender: flag('Who sent the message: name, channel and the chat or topic.'),
    ids: flag('The sender\'s account ids next to their name (user id, oidc sub, Matrix id).'),
    chat: flag('The chat, room or topic the message was sent in.'),
    time: flag('When the message was sent.'),
    reply: flag('The message it replies to, with its text.'),
    forward: flag('Where a forwarded message comes from.'),
  }).default({}).description('What the context line shows.'),
  timeZone: z.string().default('')
    .description('Time zone for message times. Empty: the zone the message came with (clientTimeZone), else this machine\'s.'),
  maxQuote: z.natural().min(100).max(20000).default(2000).description('Longest replied-to text shown, in characters.'),
  channels: z.array(z.string()).default([])
    .description('Only these channels (telegram, web, matrix, dsh, ...). Empty: every channel.'),
})

export function apply(ctx, config) {
  const { options, warning } = resolveOptions(config)
  if (warning !== undefined) ctx.logger?.warn?.(`[message-context] ${warning}`)
  const preStep = createPreStep(options)
  ctx.on('agent/pre-step', (payload, next) => preStep(payload, next), { global: true, prepend: true })
}
