// The Web client's transcript row for messages agents sent, run without a
// browser: client.js registers its factory with window.__ModuleLoader__, so
// the test supplies that loader, a tiny React stand-in and the primitives.
import assert from 'node:assert/strict'
import test from 'node:test'
import { AGENT_KINDS } from '../src/render.js'

let factory
globalThis.window = { __ModuleLoader__: { load: (entry) => { factory = entry.factory } } }
await import('../client.js')

const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
  useMemo: (make) => make(),
}
const primitives = { MarkdownText: 'MarkdownText', IconAgentPresetOutlineRegular: 'AgentIcon', IconAlarmClockOutlineRegular: 'ClockIcon' }
const client = factory((name) => {
  if (name === 'react') return react
  if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives
  throw new Error(`unexpected module ${name}`)
})

const t = (key) => client.en[key]
const session = { kind: 'dsh-session', channel: 'dsh', id: 'session-1a2b3c4d-0000' }
const job = { kind: 'cron-job', channel: 'cron', id: 'job-7', name: 'Morning brief' }

function message({ source, content = [{ type: 'text', text: 'hi' }], surfaceOp = 'append', seq = 12 }) {
  return { type: 'user/message', seq, time: Date.UTC(2026, 10, 16, 19, 5), surfaceOp, data: { id: 'msg-1', role: 'user', content, source } }
}

const match = client.agentMessageDefinition.match['user/message']

test('the agent kinds are the ones the host renderer treats as not people', () => {
  assert.deepEqual([...client.AGENT_KINDS], [...AGENT_KINDS])
})

test('a message is claimed on Chat by its principal alone, whatever its source kind', () => {
  assert.equal(client.agentMessageDefinition.target, 'chat')
  const claim = { id: 'msg-1', role: 'start', exclusive: true }
  assert.deepEqual(match(message({ source: { kind: 'user', rpcId: 'r', principal: session } })), claim, 'prompt_session / open_session')
  assert.deepEqual(match(message({ source: { kind: 'schedule', principal: job } })), claim, 'a scheduled job prompt')
  assert.deepEqual(match(message({ source: { kind: 'telegram-post', form: 'notice', summary: 's', principal: job } })), claim, 'a send mirrored into a topic session')
  assert.deepEqual(match(message({ source: { kind: 'user', principal: { kind: 'external', channel: 'external', id: 'backup.sh' } } })), claim)
})

test('people, the owner and unmarked messages are left to Chat', () => {
  assert.equal(match(message({ source: { kind: 'user', rpcId: 'web-1' } })), null, 'the owner typing in the Web UI')
  assert.equal(match(message({ source: { kind: 'user', principal: { kind: 'owner' } } })), null)
  assert.equal(match(message({ source: { kind: 'user', principal: { kind: 'telegram-user', channel: 'telegram', id: '1' } } })), null)
  assert.equal(match(message({ source: { kind: 'user', principal: { kind: 'oidc-user', channel: 'web', id: 'sub' } } })), null)
  assert.equal(match(message({ source: { kind: 'restart-resume', form: 'notice', summary: 'Resumed' } })), null, 'plugin notices keep their notice row')
  assert.equal(match(message({ source: { kind: 'user', principal: null } })), null)
  assert.equal(match(message({ source: { kind: 'user', principal: session }, surfaceOp: { op: 'replace' } })), null, 'a compaction copy is not drawn')
  assert.equal(match({ type: 'assistant/message', seq: 3, data: {} }), null)
})

test('the row takes the place Chat gives a person\'s message', () => {
  const step = (n) => ({ kind: 'step', turn: { turn: 4 }, step: { step: n } })
  assert.equal(client.groupTreeOf(step(1), true), 'exchange', 'a prompt that starts a turn opens an exchange')
  assert.equal(client.groupTreeOf(step(3), true), 'input', 'a steer is an input of its turn')
  assert.equal(client.groupTreeOf(step(3), false), 'turn', 'a record that started nothing stays out of the folded work')
  assert.equal(client.groupTreeOf({ kind: 'turn', turn: { turn: 2 } }, false), 'turn')
  assert.equal(client.groupTreeOf({ kind: 'unresolved' }, true), undefined)
})

test('the Definition records the sender, the inbox claim and the content', () => {
  const event = message({
    source: { kind: 'user', principal: session },
    content: [{ type: 'text', text: 'Brief' }, { type: 'image', attachment: { id: 'i', name: 'a.png' } }, { type: 'file', attachment: { id: 'f', name: 'n.txt' } }],
  })
  const reader = { previous: (kind) => (kind === 'inbox-next-turn' ? { state: { currentClaimed: new Set(['msg-1']) } } : undefined) }
  const state = client.agentMessageDefinition.start({}, { event }, reader)
  assert.deepEqual(state, {
    seq: 12,
    time: event.time,
    sender: session,
    claimed: true,
    text: 'Brief',
    images: [{ attachment: { id: 'i', name: 'a.png' }, label: 'a.png' }],
    files: [{ id: 'f', name: 'n.txt' }],
  })
  const node = client.agentMessageDefinition.buildViewNode({ key: 'k', id: 'msg-1', state, start: { location: { kind: 'step', turn: { turn: 1 }, step: { step: 1 } } }, matches: [] })
  assert.equal(node.kind, client.NODE_KIND)
  assert.equal(node.groupTree, 'exchange')
  assert.equal(client.agentMessageDefinition.start({}, { event }, { previous: () => undefined }).claimed, false)
})

test('the sender line names the session, this session, a job or an outside caller', () => {
  assert.deepEqual(client.senderLabel(session, 'session-other', t), { label: 'Session 1a2b3c4d', title: session.id, icon: 'session' })
  assert.equal(client.senderLabel(session, session.id, t).label, 'This session')
  assert.equal(client.senderLabel(job, 's', t).label, 'Scheduled job Morning brief')
  assert.equal(client.senderLabel({ kind: 'cron-job', id: 'job-9' }, 's', t).label, 'Scheduled job job-9')
  assert.equal(client.senderLabel({ kind: 'external', id: 'x', name: 'backup.sh' }, 's', t).label, 'backup.sh')
  assert.equal(client.senderLabel({ kind: 'external' }, 's', t).label, 'Outside caller')
})

test('the view draws the sender line, the text, pictures and files', () => {
  const rendered = []
  const view = client.AgentMessageView({
    node: { data: { seq: 1, time: Date.UTC(2026, 10, 16), sender: job, claimed: true, text: 'Done **now**', images: [{ attachment: { id: 'i' } }], files: [{ name: 'n.txt' }] } },
    sessionId: 's',
    loadImage: 'loader',
    renderFactorySlot: (name, props) => {
      rendered.push([name, props])
      return 'gallery'
    },
    t,
  })
  assert.equal(view.props['data-agent-message'], 'cron-job')
  const [head, body, gallery, files] = view.children
  assert.ok(head.children.some((child) => child?.children?.includes('Scheduled job Morning brief')))
  assert.equal(body.children[0].type, 'MarkdownText')
  assert.equal(body.children[0].props.text, 'Done **now**')
  assert.equal(gallery, 'gallery')
  assert.deepEqual(rendered, [['conversation.images.content', { images: [{ attachment: { id: 'i' } }], loadImage: 'loader', align: 'start' }]])
  assert.equal(files.children[0].children[0], '📎 n.txt')
})

test('every English string has a Chinese one', () => {
  assert.deepEqual(Object.keys(client.zh).sort(), Object.keys(client.en).sort())
})
