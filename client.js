window.__ModuleLoader__.load({
  id: '@soffits/dsh-message-context',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /** Locale namespace of this client. */
    const NS = 'message-context'

    /**
     * Principal kinds of senders that are not people, as in src/render.js
     * (`AGENT_KINDS`); test/client.test.js keeps the two lists equal.
     */
    const AGENT_KINDS = Object.freeze(['dsh-session', 'cron-job', 'external'])

    /** Chat node kind and conversation Definition kind of a message an agent sent. */
    const NODE_KIND = 'agent-message'

    const en = {
      fromSession: 'Session {id}',
      fromThisSession: 'This session',
      fromJob: 'Scheduled job {name}',
      fromExternal: '{name}',
      unknownSender: 'Outside caller',
      sentBy: 'Sent by an agent, not typed by a person',
      file: 'file',
      copy: 'Copy',
      copied: 'Copied',
      code: 'Code',
      wrap: 'Wrap',
      unwrap: 'Unwrap',
      footnotes: 'Footnotes',
    }

    const zh = {
      fromSession: '会话 {id}',
      fromThisSession: '本会话',
      fromJob: '定时任务 {name}',
      fromExternal: '{name}',
      unknownSender: '外部调用方',
      sentBy: '由智能体发送，不是人输入的',
      file: '文件',
      copy: '复制',
      copied: '已复制',
      code: '代码',
      wrap: '自动换行',
      unwrap: '不换行',
      footnotes: '脚注',
    }

    function text(value) {
      return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
    }

    /**
     * The sender of a message when it is not a person: its `source.principal`
     * when the kind is one of the agent kinds.
     * @param source - the message's durable source.
     * @returns the principal, or null for people, the owner and unmarked messages.
     */
    function agentSender(source) {
      const principal = source !== null && typeof source === 'object' ? source.principal : undefined
      if (principal === null || typeof principal !== 'object') return null
      return AGENT_KINDS.includes(principal.kind) ? principal : null
    }

    /**
     * Claim a user-role message an agent sent on the Chat target, whatever
     * its source kind, so Chat does not draw it as the owner's bubble. Only
     * append-origin copies: a compaction replacement is never drawn.
     * @param event - Client history event.
     * @returns the claim, or null.
     */
    function matchAgentMessage(event) {
      if (event?.type !== 'user/message' || event.surfaceOp !== 'append') return null
      const data = event.data
      if (data === null || typeof data !== 'object' || agentSender(data.source) === null) return null
      return { id: String(data.id), role: 'start', exclusive: true }
    }

    /**
     * Where the row sits in Chat's group tree, by the same rules Chat uses for
     * a person's message: a message the inbox handed to Step 1 opens an
     * exchange, one handed in later is an input of its Turn, and a message
     * only recorded into the log (never claimed) stays in its Turn outside
     * the folded work.
     * @param location - the message's Location.
     * @param claimed - whether an inbox claim took the message.
     * @returns the group-tree position, or undefined outside a Turn.
     */
    function groupTreeOf(location, claimed) {
      if (location?.kind !== 'step' && location?.kind !== 'turn') return undefined
      if (!claimed) return 'turn'
      return location.kind === 'step' && location.step?.step === 1 ? 'exchange' : 'input'
    }

    /**
     * Split recorded content into the text and the attachments the row shows.
     * @param content - the message's content blocks.
     * @returns `{ text, images, files }`.
     */
    function readContent(content) {
      const blocks = Array.isArray(content) ? content : []
      const body = blocks
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n')
        .trim()
      const images = []
      const files = []
      for (const block of blocks) {
        if (block?.attachment === undefined || block.attachment === null) continue
        if (block.type === 'image') {
          const name = text(block.attachment.name)
          images.push(name === undefined ? { attachment: block.attachment } : { attachment: block.attachment, label: name })
        } else if (block.type === 'file') {
          files.push(block.attachment)
        }
      }
      return { text: body, images, files }
    }

    function isClaimed(reader, id) {
      for (const kind of ['inbox-next-turn', 'inbox-next-step']) {
        const claimed = reader?.previous?.(kind)?.state?.currentClaimed
        if (claimed instanceof Set && claimed.has(id)) return true
      }
      return false
    }

    const agentMessageDefinition = {
      kind: NODE_KIND,
      target: 'chat',
      match: { 'user/message': matchAgentMessage },
      start: (_context, match, reader) => {
        const event = match.event
        const id = String(event.data.id)
        return {
          seq: event.seq,
          time: event.time,
          sender: agentSender(event.data.source),
          claimed: isClaimed(reader, id),
          ...readContent(event.data.content),
        }
      },
      update: (context) => context.state,
      buildViewNode: (context) => {
        if (context.state === undefined) return null
        const location = context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' }
        return {
          key: context.key,
          kind: NODE_KIND,
          id: context.id,
          target: 'chat',
          anchorSeq: context.state.seq,
          location,
          visibility: 'visible',
          groupTree: groupTreeOf(location, context.state.claimed),
          data: context.state,
        }
      },
    }

    function fill(template, values) {
      return template.replace(/\{(\w+)\}/g, (whole, key) => (values[key] === undefined ? whole : values[key]))
    }

    function shortSession(id) {
      return id.replace(/^session-/, '').slice(0, 8)
    }

    /**
     * The row's sender label.
     * @param sender - the agent principal.
     * @param sessionId - the session this transcript belongs to.
     * @param t - locale reader.
     * @returns `{ label, title, icon }`; `title` is the full id for hover.
     */
    function senderLabel(sender, sessionId, t) {
      const id = text(sender.id)
      const name = text(sender.name)
      if (sender.kind === 'dsh-session') {
        if (id !== undefined && id === sessionId) return { label: t('fromThisSession'), title: id, icon: 'session' }
        return { label: fill(t('fromSession'), { id: id === undefined ? '?' : shortSession(id) }), title: id, icon: 'session' }
      }
      if (sender.kind === 'cron-job') {
        return { label: fill(t('fromJob'), { name: name ?? id ?? '?' }), title: id, icon: 'job' }
      }
      const who = name ?? id
      return { label: who === undefined ? t('unknownSender') : fill(t('fromExternal'), { name: who }), title: id, icon: 'external' }
    }

    function messageTime(time) {
      if (time === undefined || time === null) return null
      const date = new Date(time)
      if (Number.isNaN(date.getTime())) return null
      return {
        clock: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        iso: date.toISOString(),
        full: date.toLocaleString(),
      }
    }

    const ICONS = {
      session: 'IconAgentPresetOutlineRegular',
      job: 'IconAlarmClockOutlineRegular',
      external: 'IconLinkOutlineRegular',
    }

    /** Row styles; theme tokens keep it in step with light and dark. */
    const CSS = `
.dmc-agent{display:flex;flex-direction:column;gap:6px;min-width:0;padding:2px 0 2px 12px;border-left:2px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35))}
.dmc-agentHead{display:flex;align-items:center;gap:6px;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}
.dmc-agentIcon{display:inline-flex;flex:none}
.dmc-agentWho{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dmc-agentTime{flex:none;margin-left:auto;font:var(--dsw-font-xxs-12,12px/16px inherit)}
.dmc-agentBody{min-width:0;color:var(--dsw-alias-label-primary)}
.dmc-agentPlain{white-space:pre-wrap;overflow-wrap:anywhere}
.dmc-agentFiles{display:flex;flex-wrap:wrap;gap:6px}
.dmc-agentFile{max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:.5px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:var(--dsw-radius-md,8px);padding:4px 10px;font-size:13px;color:var(--dsw-alias-label-secondary)}
`

    function markdownLabels(t) {
      return {
        code: {
          copyLabel: t('copy'),
          copiedLabel: t('copied'),
          toolbarLabels: { codeLabel: t('code'), wrapLabel: t('wrap'), unwrapLabel: t('unwrap') },
        },
        footnotes: t('footnotes'),
      }
    }

    /**
     * Keyed Chat renderer of one message an agent sent: on the assistant's
     * side of the transcript, under a line naming the sender.
     * @param props - `node`, `sessionId`, `loadImage`, `renderFactorySlot` and `t` from the Chat node slot.
     */
    function AgentMessageView(props) {
      const { node, sessionId, loadImage, renderFactorySlot, t } = props
      const data = node.data
      const labels = React.useMemo(() => markdownLabels(t), [t])
      const sender = senderLabel(data.sender, sessionId, t)
      const time = messageTime(data.time)
      const Icon = primitives[ICONS[sender.icon]]
      const Markdown = primitives.MarkdownText
      return h(
        'div',
        { className: 'dmc-agent', 'data-agent-message': data.sender.kind },
        h(
          'div',
          { className: 'dmc-agentHead', title: t('sentBy') },
          h('span', { className: 'dmc-agentIcon', 'aria-hidden': true }, Icon === undefined ? null : h(Icon, { size: 14 })),
          h('span', { className: 'dmc-agentWho', title: sender.title }, sender.label),
          time === null ? null : h('time', { className: 'dmc-agentTime', dateTime: time.iso, title: time.full }, time.clock),
        ),
        data.text.length === 0
          ? null
          : h(
              'div',
              { className: 'dmc-agentBody' },
              Markdown === undefined ? h('div', { className: 'dmc-agentPlain' }, data.text) : h(Markdown, { text: data.text, labels }),
            ),
        data.images.length === 0 || typeof renderFactorySlot !== 'function'
          ? null
          : renderFactorySlot('conversation.images.content', { images: data.images, loadImage, align: 'start' }),
        data.files.length === 0
          ? null
          : h(
              'div',
              { className: 'dmc-agentFiles' },
              ...data.files.map((file, index) =>
                h('span', { key: `file-${index}`, className: 'dmc-agentFile', title: file.name }, `📎 ${file.name ?? t('file')}`),
              ),
            ),
      )
    }

    /** Required client services. */
    const inject = ['slots', 'locale']

    /**
     * Register the Definition and its renderer while Chat is present.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => {
        const offEn = ctx.locale.register(NS, 'en', en)
        const offZh = ctx.locale.register(NS, 'zh', zh)
        return () => {
          offZh()
          offEn()
        }
      }, 'dsh-message-context: dictionaries')
      if (typeof document !== 'undefined') {
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.plugin = '@soffits/dsh-message-context'
          style.textContent = CSS
          document.head.appendChild(style)
          return () => style.remove()
        }, 'dsh-message-context: styles')
      }
      ctx.inject(['uiConversation'], (scope) => {
        scope.uiConversation.events.register(agentMessageDefinition)
      })
      ctx.slots.inject('conversation.chat.node', () =>
        ctx.slots.register({ name: 'conversation.chat.node', key: NODE_KIND, locale: NS }, AgentMessageView),
      )
    }

    exports.NS = NS
    exports.AGENT_KINDS = AGENT_KINDS
    exports.NODE_KIND = NODE_KIND
    exports.apply = apply
    exports.inject = inject
    exports.agentSender = agentSender
    exports.agentMessageDefinition = agentMessageDefinition
    exports.groupTreeOf = groupTreeOf
    exports.readContent = readContent
    exports.senderLabel = senderLabel
    exports.AgentMessageView = AgentMessageView
    exports.en = en
    exports.zh = zh
    return module.exports
  },
})
