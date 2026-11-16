import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPreStep } from '../src/pre-step.js'
import { resolveOptions } from '../src/options.js'
import { NOTICE_KIND } from '../src/render.js'

const { options } = resolveOptions({ timeZone: 'UTC' })
const principal = { kind: 'telegram-user', channel: 'telegram', id: '5', name: 'Bo' }

function user(id, source) {
  return Object.freeze({ id, role: 'user', content: [{ type: 'text', text: `text ${id}` }], source: Object.freeze(source) })
}

/** Run listeners as Cordis runs a waterfall: the first one is outermost. */
function waterfall(listeners, messages) {
  const queue = [...listeners]
  const dispatch = () => {
    const listener = queue.shift()
    if (listener === undefined) return Promise.resolve({ kind: 'enter', messages })
    return listener({ messages }, dispatch)
  }
  return dispatch()
}

test('a notice goes right before each message with metadata, the message is unchanged', async () => {
  const tagged = user('m1', { kind: 'user', rpcId: 'r1', principal })
  const plain = user('m2', { kind: 'user', rpcId: 'r2' })
  const decision = await waterfall([createPreStep(options)], [tagged, plain])
  assert.equal(decision.messages.length, 3)
  const [notice, first, second] = decision.messages
  assert.equal(notice.source.kind, NOTICE_KIND)
  assert.equal(notice.source.form, 'notice')
  assert.equal(notice.source.messageId, 'm1')
  assert.equal(notice.role, 'user')
  assert.equal(notice.content[0].text, '[Telegram message from Bo (user id 5)]')
  assert.ok(Object.isFrozen(notice.source))
  assert.equal(first, tagged)
  assert.equal(second, plain)
})

test('the decision is returned as is when nothing has metadata or the step is rejected', async () => {
  const plain = [user('m1', { kind: 'user', rpcId: 'r1' })]
  const preStep = createPreStep(options)
  const entered = { kind: 'enter', messages: plain }
  assert.equal(await preStep({}, async () => entered), entered)
  const rejected = { kind: 'reject' }
  assert.equal(await preStep({}, async () => rejected), rejected)
})

test('an inner listener that records the sender is seen, since this one runs outermost', async () => {
  const bare = user('m1', { kind: 'user', rpcId: 'r1' })
  const tagger = async (_payload, next) => {
    const decision = await next()
    return { ...decision, messages: decision.messages.map((message) => ({ ...message, source: { ...message.source, principal } })) }
  }
  const decision = await waterfall([createPreStep(options), tagger], [bare])
  assert.equal(decision.messages.length, 2)
  assert.equal(decision.messages[0].content[0].text, '[Telegram message from Bo (user id 5)]')
})

test('a message that already has its notice does not get another', async () => {
  const tagged = user('m1', { kind: 'user', principal })
  const preStep = createPreStep(options)
  const once = await waterfall([preStep], [tagged])
  const again = await waterfall([createPreStep(options)], once.messages)
  assert.equal(again.messages.length, 2)
})

test('notices from other producers and agent messages are left alone', async () => {
  const relay = user('m1', { kind: 'agent-message', form: 'relay', senderSessionId: 's' })
  const decision = await waterfall([createPreStep(options)], [relay])
  assert.equal(decision.messages.length, 1)
})
