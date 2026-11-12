// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSshTerminalController } from '@/utils/sshTerminalController'

class FakeSocket {
  constructor(url) {
    this.url = url
    this.readyState = 1
    this.listeners = {}
    this.sent = []
    this.closedByClient = false
  }

  addEventListener(type, fn) {
    ;(this.listeners[type] ||= []).push(fn)
  }

  emit(type, event) {
    for (const fn of this.listeners[type] || []) fn(event)
  }

  send(data) {
    this.sent.push(data)
  }

  close() {
    this.closedByClient = true
    this.readyState = 3
    this.emit('close', { code: 1000 })
  }

  control(message) {
    this.emit('message', { data: JSON.stringify(message) })
  }

  output(...bytes) {
    this.emit('message', { data: Uint8Array.from(bytes).buffer })
  }

  serverClose(code) {
    this.readyState = 3
    this.emit('close', { code })
  }

  get frames() {
    return this.sent
  }

  get inputText() {
    return this.sent
      .filter((frame) => typeof frame !== 'string')
      .map((frame) => new TextDecoder().decode(frame))
      .join('')
  }

  get controlMessages() {
    return this.sent.filter((frame) => typeof frame === 'string').map((frame) => JSON.parse(frame))
  }
}

function makeEmulator(size = { columns: 120, rows: 40 }) {
  const handlers = {}
  return {
    size,
    written: [],
    attached: null,
    disposed: false,
    onData: (fn) => (handlers.data = fn),
    onBinary: (fn) => (handlers.binary = fn),
    type: (text) => handlers.data(text),
    attach(host) {
      this.attached = host
    },
    detach() {
      this.attached = null
    },
    fit() {
      return this.attached ? this.size : null
    },
    write(data) {
      this.written.push(data)
    },
    focus: vi.fn(),
    clear: vi.fn(),
    reset: vi.fn(),
    dispose() {
      this.disposed = true
    },
    get text() {
      return this.written.filter((chunk) => typeof chunk === 'string').join('')
    },
  }
}

const NOT_FOUND = Object.assign(new Error('nope'), { status: 404, data: { reason: 'Invalid' } })
const AGENT_FAILURE = () =>
  Object.assign(new Error('x'), { status: 502, data: { reason: 'Remote connect failed' } })
const NETWORK_FAILURE = () => Object.assign(new Error('Network error'), { status: 0, data: null })

describe('sshTerminalController', () => {
  let sockets
  let emulator
  let createSession
  let visible
  let controller

  function build() {
    return createSshTerminalController({
      key: '42/ssh:1',
      viewId: 'ssh:1',
      objectId: 42,
      objectName: 'sw-core',
      label: 'SSH Terminal',
      deps: {
        createSession,
        openSocket: (url) => {
          const socket = new FakeSocket(url)
          sockets.push(socket)
          return socket
        },
        createEmulator: async () => emulator,
        isPageVisible: () => visible,
      },
    })
  }

  /** Attach, connect and take the server's `connected` notification. */
  async function connectAs(credentials = { login: null }) {
    await controller.attach({})
    await controller.connect(credentials)
    await vi.advanceTimersByTimeAsync(0)
    sockets.at(-1).control({ type: 'connected' })
    await vi.advanceTimersByTimeAsync(0)
    return sockets.at(-1)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    sockets = []
    emulator = makeEmulator()
    visible = true
    createSession = vi.fn(async () => ({ wsUrl: '/v1/ssh-terminal/t' }))
    controller = build()
  })

  afterEach(() => {
    controller.dispose()
    vi.useRealTimers()
  })

  describe('connecting', () => {
    it('asks for the size the terminal measured, with the stored credentials', async () => {
      await connectAs({ login: null })

      expect(createSession).toHaveBeenCalledTimes(1)
      const [objectId, body] = createSession.mock.calls[0]
      expect(objectId).toBe(42)
      expect(body).toEqual({ columns: 120, rows: 40, terminalType: 'xterm-256color' })
    })

    it('sends typed credentials when the user gave some', async () => {
      await connectAs({ login: 'admin', password: 's3cret', keyId: 5 })

      expect(createSession.mock.calls[0][1]).toMatchObject({
        login: 'admin',
        password: 's3cret',
        keyId: 5,
      })
    })

    it('reports connecting until the server says the session is ready', async () => {
      await controller.attach({})
      const pending = controller.connect({ login: null })
      expect(controller.state.phase).toBe('connecting')
      await pending
      await vi.advanceTimersByTimeAsync(0)
      expect(controller.state.phase).toBe('connecting')

      sockets[0].control({ type: 'connected' })
      expect(controller.state.phase).toBe('connected')
    })

    it('keeps the password out of the reactive state that Pinia and devtools can see', async () => {
      await connectAs({ login: 'admin', password: 's3cret', keyId: 0 })
      expect(JSON.stringify(controller.state)).not.toContain('s3cret')
      expect(controller.state.login).toBe('admin')
    })

    it('returns to the connect form with the reason when the first attempt fails', async () => {
      createSession.mockRejectedValueOnce(AGENT_FAILURE())
      await controller.attach({})
      await controller.connect({ login: 'admin', password: 'wrong' })
      await vi.advanceTimersByTimeAsync(60_000)

      expect(controller.state.phase).toBe('idle')
      expect(controller.state.message.title).toBe('Could not connect or log in')
      expect(createSession).toHaveBeenCalledTimes(1)
    })

    it('returns to the connect form when the socket is refused before the session starts', async () => {
      await controller.attach({})
      await controller.connect({ login: null })
      await vi.advanceTimersByTimeAsync(0)
      sockets[0].serverClose(1008)

      expect(controller.state.phase).toBe('idle')
      expect(controller.state.message.title).toMatch(/expired/)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(createSession).toHaveBeenCalledTimes(1)
    })
  })

  describe('while connected', () => {
    it('writes output to the terminal as raw bytes', async () => {
      const socket = await connectAs()
      socket.output(104, 105)
      expect(emulator.written.at(-1)).toEqual(new Uint8Array([104, 105]))
    })

    it('sends keystrokes as binary frames, UTF-8 encoded', async () => {
      const socket = await connectAs()
      emulator.type('ls\r')
      emulator.type(String.fromCharCode(0xe9))
      expect(socket.inputText).toBe(`ls\r${String.fromCharCode(0xe9)}`)
    })

    it('drops keystrokes before the session is ready, so a typed secret cannot echo later', async () => {
      await controller.attach({})
      await controller.connect({ login: null })
      await vi.advanceTimersByTimeAsync(0)
      emulator.type('early')
      expect(sockets[0].sent).toEqual([])
    })

    it('paces a large paste in small frames, in order', async () => {
      const socket = await connectAs()
      const text = 'x'.repeat(10000)
      emulator.type(text)
      expect(socket.sent).toHaveLength(1)
      expect(socket.sent[0].length).toBe(4096)

      await vi.advanceTimersByTimeAsync(1000)
      expect(socket.sent.map((frame) => frame.length)).toEqual([4096, 4096, 1808])
      expect(socket.inputText).toBe(text)
    })

    it('sends a resize only when the size really changed', async () => {
      const socket = await connectAs()
      controller.resize()
      expect(socket.controlMessages.filter((m) => m.type === 'resize')).toEqual([])

      emulator.size = { columns: 100, rows: 30 }
      controller.resize()
      controller.resize()
      expect(socket.controlMessages.filter((m) => m.type === 'resize')).toEqual([
        { type: 'resize', columns: 100, rows: 30 },
      ])
    })

    it('does not tell the server about the size of a hidden terminal', async () => {
      const socket = await connectAs()
      controller.detach()
      controller.resize()
      expect(socket.controlMessages).toEqual([])
    })

    it('sends a keepalive frame only while connected', async () => {
      const socket = await connectAs()
      await vi.advanceTimersByTimeAsync(90_000)
      const pings = () => socket.controlMessages.filter((m) => m.type === 'ping').length
      expect(pings()).toBe(3)

      socket.serverClose(1000)
      await vi.advanceTimersByTimeAsync(90_000)
      expect(pings()).toBe(3)
    })

    it('keeps the session and output when the view goes away and comes back', async () => {
      const socket = await connectAs()
      controller.detach()
      socket.output(65)
      expect(emulator.written.at(-1)).toEqual(new Uint8Array([65]))

      await controller.attach({})
      expect(controller.state.phase).toBe('connected')
      expect(createSession).toHaveBeenCalledTimes(1)
      expect(socket.closedByClient).toBe(false)
    })

    it('catches the shell up on a size change made while the view was away', async () => {
      const socket = await connectAs()
      controller.detach()
      emulator.size = { columns: 90, rows: 20 }
      await controller.attach({})
      expect(socket.controlMessages).toContainEqual({ type: 'resize', columns: 90, rows: 20 })
    })
  })

  describe('when the session ends', () => {
    it('does not reconnect after the user logs out, and says so', async () => {
      const socket = await connectAs()
      socket.control({ type: 'close', reason: 'normal' })
      socket.serverClose(1000)
      await vi.advanceTimersByTimeAsync(120_000)

      expect(controller.state.phase).toBe('ended')
      expect(controller.state.message.severity).toBe('info')
      expect(createSession).toHaveBeenCalledTimes(1)
    })

    it('reconnects on Enter once ended, and ignores other keys', async () => {
      const socket = await connectAs()
      socket.control({ type: 'close', reason: 'normal' })
      socket.serverClose(1000)

      emulator.type('x')
      await vi.advanceTimersByTimeAsync(0)
      expect(createSession).toHaveBeenCalledTimes(1)

      emulator.type('\r')
      await vi.advanceTimersByTimeAsync(0)
      expect(createSession).toHaveBeenCalledTimes(2)
    })

    it('does not reconnect by itself after an overflow', async () => {
      const socket = await connectAs()
      socket.control({ type: 'close', reason: 'overflow' })
      socket.serverClose(1000)
      await vi.advanceTimersByTimeAsync(120_000)

      expect(controller.state.phase).toBe('ended')
      expect(controller.state.message.severity).toBe('error')
      expect(createSession).toHaveBeenCalledTimes(1)
    })

    it('stays ended with the reason when a manual reconnect fails', async () => {
      const socket = await connectAs()
      socket.control({ type: 'close', reason: 'normal' })
      socket.serverClose(1000)

      createSession.mockRejectedValueOnce(AGENT_FAILURE())
      await controller.reconnect()
      expect(controller.state.phase).toBe('ended')
      expect(controller.state.message.title).toBe('Could not connect or log in')
    })
  })

  describe('after losing the connection', () => {
    it('reconnects by itself with the retained password, in a marked new shell', async () => {
      const first = await connectAs({ login: 'admin', password: 's3cret', keyId: 0 })
      first.serverClose(1006)
      expect(controller.state.phase).toBe('reconnecting')
      expect(emulator.text).toMatch(/connection lost/i)

      await vi.advanceTimersByTimeAsync(1000)
      expect(createSession).toHaveBeenCalledTimes(2)
      expect(createSession.mock.calls[1][1]).toMatchObject({ login: 'admin', password: 's3cret' })

      sockets[1].control({ type: 'connected' })
      expect(controller.state.phase).toBe('connected')
      expect(emulator.text).toMatch(/new shell/i)
    })

    it('undoes what the dead program left on, so the new shell starts on the main screen', async () => {
      const first = await connectAs()
      first.serverClose(1006)
      await vi.advanceTimersByTimeAsync(1000)
      sockets[1].control({ type: 'connected' })
      // Alternate screen off.
      expect(emulator.text).toContain('\x1b[?1049l')
    })

    it('stops after three attempts the device could have counted as failed logins', async () => {
      const first = await connectAs()
      createSession.mockImplementation(async () => {
        throw AGENT_FAILURE()
      })
      first.serverClose(1006)
      await vi.advanceTimersByTimeAsync(600_000)

      expect(createSession).toHaveBeenCalledTimes(1 + 3)
      expect(controller.state.phase).toBe('ended')
      expect(controller.state.message.title).toBe('Could not connect or log in')
    })

    it('does not count failures that never reached the device as failed logins', async () => {
      const first = await connectAs()
      createSession.mockImplementation(async () => {
        throw NETWORK_FAILURE()
      })
      first.serverClose(1006)
      await vi.advanceTimersByTimeAsync(40_000)

      expect(createSession.mock.calls.length).toBeGreaterThan(1 + 3)
      expect(controller.state.phase).toBe('reconnecting')
    })

    it('gives up after the attempt limit even when nothing reached the device', async () => {
      const first = await connectAs()
      createSession.mockImplementation(async () => {
        throw NETWORK_FAILURE()
      })
      first.serverClose(1006)
      await vi.advanceTimersByTimeAsync(3_600_000)

      expect(createSession).toHaveBeenCalledTimes(1 + 10)
      expect(controller.state.phase).toBe('ended')
    })

    it('stops at once on an answer retrying cannot change', async () => {
      const first = await connectAs()
      createSession.mockImplementation(async () => {
        throw NOT_FOUND
      })
      first.serverClose(1006)
      await vi.advanceTimersByTimeAsync(600_000)

      expect(createSession).toHaveBeenCalledTimes(2)
      expect(controller.state.phase).toBe('ended')
    })

    it('waits for the browser tab to be visible before opening a shell', async () => {
      const first = await connectAs()
      visible = false
      first.serverClose(1006)
      await vi.advanceTimersByTimeAsync(600_000)
      expect(createSession).toHaveBeenCalledTimes(1)
      expect(controller.state.phase).toBe('reconnecting')

      visible = true
      controller.onPageVisible()
      await vi.advanceTimersByTimeAsync(0)
      expect(createSession).toHaveBeenCalledTimes(2)
    })

    it('starts the failed-login count over after a session that worked', async () => {
      const first = await connectAs()
      createSession.mockRejectedValueOnce(AGENT_FAILURE()).mockRejectedValueOnce(AGENT_FAILURE())
      first.serverClose(1006)
      await vi.advanceTimersByTimeAsync(3000)
      await vi.advanceTimersByTimeAsync(5000)
      sockets[1].control({ type: 'connected' })
      expect(controller.state.phase).toBe('connected')

      createSession.mockImplementation(async () => {
        throw AGENT_FAILURE()
      })
      sockets[1].serverClose(1006)
      await vi.advanceTimersByTimeAsync(600_000)
      expect(createSession).toHaveBeenCalledTimes(1 + 3 + 3)
    })
  })

  describe('when the user stops it', () => {
    it('disconnect closes the socket and does not reconnect', async () => {
      const socket = await connectAs()
      controller.disconnect()
      await vi.advanceTimersByTimeAsync(120_000)

      expect(socket.closedByClient).toBe(true)
      expect(controller.state.phase).toBe('ended')
      expect(controller.state.message.severity).toBe('info')
      expect(createSession).toHaveBeenCalledTimes(1)
    })

    it('cancel during the first attempt aborts the request and returns to the form', async () => {
      let signal
      createSession.mockImplementation((_id, _body, options) => {
        signal = options.signal
        return new Promise(() => {})
      })
      await controller.attach({})
      controller.connect({ login: null })
      await vi.advanceTimersByTimeAsync(0)

      controller.disconnect()
      expect(signal.aborted).toBe(true)
      expect(controller.state.phase).toBe('idle')
      expect(controller.state.message).toBeNull()
    })

    it('cancel during a reconnect wait stops the retries', async () => {
      const first = await connectAs()
      first.serverClose(1006)
      controller.disconnect()
      await vi.advanceTimersByTimeAsync(120_000)

      expect(createSession).toHaveBeenCalledTimes(1)
      expect(controller.state.phase).toBe('ended')
    })

    it('uses an answer that arrives after a cancel only to release the channel', async () => {
      let answer
      createSession.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
      await controller.attach({})
      controller.connect({ login: null })
      await vi.advanceTimersByTimeAsync(0)
      controller.disconnect()

      answer({ wsUrl: '/v1/ssh-terminal/late' })
      await vi.advanceTimersByTimeAsync(0)

      expect(sockets).toHaveLength(1)
      expect(sockets[0].closedByClient).toBe(true)
      expect(controller.state.phase).toBe('idle')
    })

    it('a new login starts on a clean terminal, without the last session on it', async () => {
      const socket = await connectAs()
      socket.output(65)
      controller.disconnect()
      controller.showForm()

      await controller.connect({ login: 'other', password: 'x', keyId: 0 })

      expect(emulator.reset).toHaveBeenCalledTimes(1)
    })

    it('a reconnect keeps the scrollback', async () => {
      await connectAs()
      controller.disconnect()

      await controller.reconnect()

      expect(emulator.reset).not.toHaveBeenCalled()
    })

    it('tells the view whether a session has started, so a login attempt can stay on the form', async () => {
      await controller.attach({})
      const pending = controller.connect({ login: null })
      expect(controller.state.hadSession).toBe(false)
      await pending
      await vi.advanceTimersByTimeAsync(0)
      sockets[0].control({ type: 'connected' })
      expect(controller.state.hadSession).toBe(true)

      controller.disconnect()
      controller.reconnect()
      expect(controller.state.phase).toBe('connecting')
      expect(controller.state.hadSession).toBe(true)

      controller.showForm()
      expect(controller.state.hadSession).toBe(false)
    })

    it('going back to the form forgets the password', async () => {
      const socket = await connectAs({ login: 'admin', password: 's3cret', keyId: 0 })
      socket.control({ type: 'close', reason: 'normal' })
      socket.serverClose(1000)

      controller.showForm()
      expect(controller.state.phase).toBe('idle')

      // Nothing to reconnect with until the form supplies credentials again.
      emulator.type('\r')
      await vi.advanceTimersByTimeAsync(0)
      expect(createSession).toHaveBeenCalledTimes(1)
    })

    it('dispose ends everything: socket, retries and the emulator', async () => {
      const socket = await connectAs()
      socket.serverClose(1006)
      controller.dispose()
      await vi.advanceTimersByTimeAsync(120_000)

      expect(createSession).toHaveBeenCalledTimes(1)
      expect(emulator.disposed).toBe(true)
      expect(controller.state.phase).toBe('disposed')
    })

    it('dispose during an emulator load does not leave one behind', async () => {
      let resolveEmulator
      const late = createSshTerminalController({
        key: 'k',
        viewId: 'ssh:2',
        objectId: 42,
        objectName: 'sw-core',
        label: 'SSH Terminal 2',
        deps: {
          createSession,
          openSocket: () => null,
          createEmulator: () => new Promise((resolve) => (resolveEmulator = resolve)),
          isPageVisible: () => true,
        },
      })
      const attached = late.attach({})
      late.dispose()
      const lateEmulator = makeEmulator()
      resolveEmulator(lateEmulator)
      await attached
      expect(lateEmulator.disposed).toBe(true)
    })
  })
})
