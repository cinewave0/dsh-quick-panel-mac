/**
 * Demo host for the standalone companion.
 *
 * Serves the real `panel/` assets and a seeded state document over the same
 * HTTP contract `index.js` uses, so the macOS window can be inspected without
 * DSH running. Only the data is fake; the panel, preload bridge and Electron
 * helper are the shipping code.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const panelRoot = join(import.meta.dirname, '..', 'panel')

const assets = {
  '/quick-panel/panel': ['index.html', 'text/html; charset=utf-8'],
  '/quick-panel/panel.css': ['panel.css', 'text/css; charset=utf-8'],
  '/quick-panel/panel.js': ['panel.js', 'text/javascript; charset=utf-8'],
  '/quick-panel/panel-icon.png': ['icon.png', 'image/png'],
}

const now = Date.now()
const minute = 60 * 1000

const state = {
  rev: 1,
  todos: [
    { id: 'todo-1', text: '在 macOS 上验收浮岛与面板', done: false },
    { id: 'todo-2', text: '确认托盘菜单和 Cmd 快捷键', done: false },
    { id: 'todo-3', text: 'Windows 侧回归（维护者）', done: true },
  ],
  reminders: [{ id: 'rem-1', text: '把验收结论贴到 PR', at: now + 25 * minute }],
  settings: { lockApproval: false },
  activeSessionId: 'session-demo',
  sessionLabel: 'macOS 移植验收 · a1b2c3',
  recentSessions: [
    { sessionId: 'session-demo' },
    { sessionId: 'session-prev' },
    { sessionId: 'session-older' },
  ],
  feed: [
    { kind: 'user', text: '把快捷面板也跑一下 macOS', time: now - 9 * minute },
    {
      kind: 'assistant',
      time: now - 8 * minute,
      blocks: [
        { kind: 'reasoning', text: '先看 Electron 路径解析和平台分支…' },
        { kind: 'text', text: '已在 macOS 上拉起浮岛；托盘、Dock 和菜单按平台分支处理。' },
      ],
    },
    { kind: 'tool-result', name: 'bash', isError: false },
    {
      kind: 'assistant',
      time: now - 5 * minute,
      blocks: [{ kind: 'tool-call', name: 'edit' }],
    },
    { kind: 'user', text: '窗口高度能拖吗', time: now - 2 * minute },
  ],
  usage: {
    sessionTokens: 18422,
    sessionOutputTokens: 3610,
    tps: 42.7,
    thirtyDayTokens: 1284390,
    sessionCount: 23,
    contextPercent: 18,
    contextTokens: 33210,
    contextWindow: 184320,
    workingDirectory: '~/dsh',
    model: 'deepseek-flash',
    modelProvider: 'deepseek',
    reasoningEffort: 'high',
    balance: { status: 'unavailable' },
  },
}

const sendJson = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

const stateDocument = () => ({
  ok: true,
  rev: state.rev,
  todos: state.todos,
  reminders: state.reminders,
  settings: state.settings,
  activeSessionId: state.activeSessionId,
  sessionLabel: state.sessionLabel,
  recentSessions: state.recentSessions,
  switchRequest: null,
  companionOpen: true,
  feed: state.feed,
  feedSource: 'host',
  feedHasOlder: false,
  partial: null,
  running: false,
  latest: state.feed.at(-1) ? state.feed.at(-1).text || '' : '',
  approval: null,
  question: null,
  questionAnswer: null,
  dshFocused: false,
  dshVisible: false,
  usage: state.usage,
})

const readBody = (request) =>
  new Promise((resolve) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch (_error) {
        resolve({})
      }
    })
  })

const applyAction = (body) => {
  if (Array.isArray(body.todos)) {
    state.todos = body.todos
    state.rev += 1
    return {}
  }
  if (Array.isArray(body.reminders)) {
    state.reminders = body.reminders
    state.rev += 1
    return {}
  }
  if (body.type === 'set-approval-lock') {
    state.settings = { ...state.settings, lockApproval: Boolean(body.enabled) }
    return { ok: true, settings: state.settings }
  }
  if (body.type === 'switch-session') {
    state.activeSessionId = String(body.sessionId || state.activeSessionId)
    return { ok: true, id: `switch-${state.rev}` }
  }
  return {}
}

/**
 * Start the demo host.
 * @param {number} port - 0 picks a free port.
 * @returns {Promise<{ origin: string, close: () => Promise<void> }>}
 */
export async function startDemoHost(port = 0) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')

    if (request.method === 'GET' && assets[url.pathname]) {
      const [file, type] = assets[url.pathname]
      response.writeHead(200, { 'content-type': type })
      response.end(readFileSync(join(panelRoot, file)))
      return
    }

    if (url.pathname === '/quick-panel/state') {
      sendJson(response, 200, stateDocument())
      return
    }

    if (url.pathname === '/quick-panel/action') {
      const body = await readBody(request)
      const patch = applyAction(body)
      sendJson(response, 200, { ok: true, rev: state.rev, ...patch })
      return
    }

    if (url.pathname === '/quick-panel/upload') {
      sendJson(response, 200, {
        ok: true,
        receiptId: `demo-${Date.now()}`,
        kind: 'file',
        name: url.searchParams.get('name') || 'file',
      })
      return
    }

    sendJson(response, 404, { ok: false, error: 'not-found' })
  })

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
  const address = server.address()
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}
