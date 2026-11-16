import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Config, apply, name } from '../index.js'
import { resolveOptions } from '../src/options.js'

test('Config fills every default', () => {
  assert.deepEqual(Config({}), {
    include: { sender: true, ids: true, chat: true, time: true, reply: true, forward: true },
    timeZone: '',
    maxQuote: 2000,
    channels: [],
  })
  assert.equal(Config({ include: { ids: false } }).include.ids, false)
  assert.throws(() => Config({ maxQuote: 5 }))
})

test('an unknown time zone is ignored with a warning', () => {
  const { options, warning } = resolveOptions({ timeZone: 'Mars/Olympus' })
  assert.equal(options.timeZone, undefined)
  assert.match(warning, /Mars\/Olympus/)
  assert.equal(resolveOptions({ timeZone: ' UTC ' }).options.timeZone, 'UTC')
})

test('apply registers one outermost global pre-step listener', () => {
  const calls = []
  apply({ on: (event, listener, options) => calls.push({ event, listener, options }) }, Config({}))
  assert.equal(name, 'message-context')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].event, 'agent/pre-step')
  assert.deepEqual(calls[0].options, { global: true, prepend: true })
})
