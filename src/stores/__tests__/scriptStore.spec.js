import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const scriptApi = vi.hoisted(() => ({
  executeScript: vi.fn(),
  stopScriptExecution: vi.fn(),
}))
vi.mock('@/api/scriptApi', () => scriptApi)

const { useScriptStore } = await import('@/stores/scriptStore')

class FakeWebSocket {
  static OPEN = 1
  static instances = []

  constructor(url) {
    this.url = url
    this.readyState = 0
    this.listeners = {}
    this.sent = []
    this.closed = null
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type, fn) {
    ;(this.listeners[type] ||= []).push(fn)
  }

  emit(type, event) {
    for (const fn of this.listeners[type] || []) fn(event)
  }

  open() {
    this.readyState = 1
  }

  frame(msg) {
    this.emit('message', { data: JSON.stringify(msg) })
  }

  send(data) {
    this.sent.push(JSON.parse(data))
  }

  close(code, reason) {
    this.closed = { code, reason }
  }
}

const STREAM = {
  executionId: 17,
  token: 't',
  expiresIn: 30,
  wsUrl: '/v1/script-executions/output/t',
}

let pinia
let store

/** Start a streamed run and hand back its (open) socket. */
async function startRun() {
  scriptApi.executeScript.mockResolvedValue(STREAM)
  await store.execute(42)
  const ws = FakeWebSocket.instances.at(-1)
  ws.open()
  return ws
}

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  scriptApi.executeScript.mockReset()
  scriptApi.stopScriptExecution.mockReset().mockResolvedValue(null)
  store = useScriptStore()
  store.source = 'println("a"); return 7;'
  store.parameters = 'x, y'
})

afterEach(() => {
  store.reset()
  pinia._e.stop()
  vi.unstubAllGlobals()
})

describe('scriptStore streamed execution', () => {
  it('asks for a stream and connects to the URL it is given', async () => {
    const ws = await startRun()

    expect(scriptApi.executeScript).toHaveBeenCalledWith(42, {
      script: 'println("a"); return 7;',
      parameters: ['x', 'y'],
      stream: true,
    })
    expect(ws.url).toMatch(/\/v1\/script-executions\/output\/t$/)
    expect(store.executing).toBe(true)
  })

  it('joins output chunks into one block, then shows the result', async () => {
    const ws = await startRun()
    ws.frame({ type: 'output', data: 'line 1\nli' })
    ws.frame({ type: 'output', data: 'ne 2\n' })
    ws.frame({ type: 'result', data: 7 })
    ws.frame({ type: 'completed' })

    expect(store.output).toEqual([
      { type: 'output', text: 'line 1\nline 2\n' },
      { type: 'result', text: '7' },
    ])
    expect(store.executing).toBe(false)
  })

  it('opens a new output block when the last one was cleared mid-run', async () => {
    const ws = await startRun()
    vi.useFakeTimers()
    ws.frame({ type: 'output', data: 'before\n' })
    store.clearOutput()
    ws.frame({ type: 'output', data: 'after\n' })
    // The stream hands over a burst merged, once per interval.
    vi.advanceTimersByTime(100)
    vi.useRealTimers()

    expect(store.output).toEqual([{ type: 'output', text: 'after\n' }])
  })

  it('shows a null result as null', async () => {
    const ws = await startRun()
    ws.frame({ type: 'result', data: null })
    expect(store.output).toEqual([{ type: 'result', text: 'null' }])
  })

  it('reports a runtime error with its message and line', async () => {
    const ws = await startRun()
    ws.frame({
      type: 'error',
      message: 'Script execution failed',
      diagnostic: { lineNumber: 2, code: 13, message: 'Error 13 in line 2: NULL' },
    })

    expect(store.output).toEqual([
      {
        type: 'error',
        reason: 'Script execution failed',
        detail: 'Error 13 in line 2: NULL',
        warnings: [],
      },
    ])
    expect(store.errorLine).toBe(2)
    expect(store.executing).toBe(false)
  })

  it('reports a compilation error from the POST, with line and warnings', async () => {
    const warnings = [{ lineNumber: 1, message: 'w' }]
    scriptApi.executeScript.mockRejectedValue(
      Object.assign(new Error('Script compilation failed'), {
        data: {
          reason: 'Script compilation failed',
          diagnostic: { error: { lineNumber: 4, message: 'syntax error' }, warnings },
        },
      }),
    )
    await store.execute(42)

    expect(store.output).toEqual([
      { type: 'error', reason: 'Script compilation failed', detail: 'syntax error', warnings },
    ])
    expect(store.errorLine).toBe(4)
    expect(store.executing).toBe(false)
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('takes the result straight from a server that does not stream', async () => {
    scriptApi.executeScript.mockResolvedValue({ result: { a: 1 } })
    await store.execute(42)

    expect(store.output).toEqual([{ type: 'result', text: '{\n  "a": 1\n}' }])
    expect(store.executing).toBe(false)
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('reports a stream that closes without a final frame', async () => {
    const ws = await startRun()
    ws.frame({ type: 'output', data: 'partial' })
    ws.emit('close', { code: 1006, reason: '' })

    expect(store.output.at(-1)).toEqual({
      type: 'error',
      reason: 'Lost the connection to the running script',
      detail: 'Connection closed (code 1006)',
    })
    expect(store.executing).toBe(false)
  })

  it('ignores the close that follows a final frame', async () => {
    const ws = await startRun()
    ws.frame({ type: 'result', data: 1 })
    ws.frame({ type: 'completed' })
    ws.emit('close', { code: 1000, reason: '' })

    expect(store.output).toEqual([{ type: 'result', text: '1' }])
  })
})

describe('scriptStore stop', () => {
  it('asks over the socket and waits for the server to confirm', async () => {
    const ws = await startRun()
    store.stop()

    expect(ws.sent).toEqual([{ type: 'stop' }])
    expect(store.stopping).toBe(true)
    expect(store.executing).toBe(true)

    ws.frame({ type: 'stopped' })
    expect(store.output).toEqual([{ type: 'stopped', text: 'Script stopped' }])
    expect(store.executing).toBe(false)
    expect(store.stopping).toBe(false)
  })

  it('uses the REST stop while the socket is still connecting', async () => {
    scriptApi.executeScript.mockResolvedValue(STREAM)
    await store.execute(42)
    store.stop()

    expect(scriptApi.stopScriptExecution).toHaveBeenCalledWith(17)
    expect(FakeWebSocket.instances[0].sent).toEqual([])
  })

  it('stops a script that is still compiling before its stream connects', async () => {
    let answer
    scriptApi.executeScript.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const running = store.execute(42)
    store.stop()
    expect(scriptApi.stopScriptExecution).not.toHaveBeenCalled()

    answer(STREAM)
    await running

    expect(scriptApi.stopScriptExecution).toHaveBeenCalledWith(17)
    expect(FakeWebSocket.instances).toHaveLength(1)
    const order = [
      scriptApi.stopScriptExecution.mock.invocationCallOrder[0],
      scriptApi.executeScript.mock.invocationCallOrder[0],
    ]
    expect(order[0]).toBeGreaterThan(order[1])
  })

  it('drops the connection on a second press the server has not answered', async () => {
    const ws = await startRun()
    store.stop()
    store.stop()

    expect(ws.closed).not.toBeNull()
    expect(store.output).toEqual([{ type: 'stopped', text: 'Script stopped' }])
    expect(store.executing).toBe(false)

    ws.frame({ type: 'output', data: 'late' })
    ws.emit('close', { code: 1000, reason: '' })
    expect(store.output).toEqual([{ type: 'stopped', text: 'Script stopped' }])
  })

  it('reads a close after a stop request as stopped', async () => {
    const ws = await startRun()
    store.stop()
    ws.emit('close', { code: 1000, reason: '' })

    expect(store.output).toEqual([{ type: 'stopped', text: 'Script stopped' }])
    expect(store.executing).toBe(false)
  })

  it('lets a new run start once the old one is done, ignoring the old socket', async () => {
    const first = await startRun()
    first.frame({ type: 'completed' })
    const second = await startRun()
    first.frame({ type: 'output', data: 'stale' })
    second.frame({ type: 'output', data: 'fresh' })

    expect(store.output).toEqual([{ type: 'output', text: 'fresh' }])
  })
})
