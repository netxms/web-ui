import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const api = vi.hoisted(() => ({ createSshTerminalSession: vi.fn() }))
vi.mock('@/api/sshTerminalApi', () => api)

const emulatorModule = vi.hoisted(() => ({ createEmulator: vi.fn() }))
vi.mock('@/utils/sshTerminalEmulator', () => emulatorModule)

const { useSshTerminalStore } = await import('@/stores/sshTerminalStore')

class FakeWebSocket {
  static instances = []

  constructor(url) {
    this.url = url
    this.readyState = 1
    this.listeners = {}
    this.closed = false
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type, fn) {
    ;(this.listeners[type] ||= []).push(fn)
  }

  send() {}

  close() {
    this.closed = true
    this.readyState = 3
  }

  control(message) {
    for (const fn of this.listeners.message || []) fn({ data: JSON.stringify(message) })
  }
}

function makeEmulator() {
  return {
    onData: vi.fn(),
    onBinary: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
    fit: () => ({ columns: 80, rows: 24 }),
    write: vi.fn(),
    reset: vi.fn(),
    dispose: vi.fn(),
  }
}

const NODE = { id: 42, name: 'sw-core', class: 'Node' }
const OTHER_NODE = { id: 43, name: 'sw-edge', class: 'Node' }

function leaveAttempt() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('sshTerminalStore', () => {
  let store

  async function connectSession(object = NODE) {
    const viewId = store.openFromMenu(object)
    const key = store.sessionKey(object.id, viewId)
    await store.controller(key).connect({ login: null })
    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0))
    FakeWebSocket.instances.at(-1).control({ type: 'connected' })
    await nextTick()
    return { viewId, key }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    api.createSshTerminalSession.mockReset()
    api.createSshTerminalSession.mockResolvedValue({ wsUrl: '/v1/ssh-terminal/t' })
    emulatorModule.createEmulator.mockReset()
    emulatorModule.createEmulator.mockImplementation(makeEmulator)
    store = useSshTerminalStore()
  })

  afterEach(() => {
    store.reset()
    vi.unstubAllGlobals()
  })

  describe('opening from the menu', () => {
    it('starts with one tab that connects when the view is ready', () => {
      const viewId = store.openFromMenu(NODE)
      const [session] = store.sessionsForObject(42)

      expect(viewId).toBe('ssh:1')
      expect(session.label).toBe('SSH Terminal')
      expect(session.autoConnect).toBe(true)
    })

    it('opens a second tab when the first one holds a live shell', async () => {
      await connectSession()
      const viewId = store.openFromMenu(NODE)

      expect(viewId).toBe('ssh:2')
      expect(store.sessionsForObject(42).map((s) => s.label)).toEqual([
        'SSH Terminal',
        'SSH Terminal 2',
      ])
    })

    it('reuses a tab with no live shell instead of piling up dead ones', () => {
      const first = store.openFromMenu(NODE)
      const second = store.openFromMenu(NODE)

      expect(second).toBe(first)
      expect(store.sessionsForObject(42)).toHaveLength(1)
    })

    it('keeps the tabs of each node apart', () => {
      store.openFromMenu(NODE)
      store.openFromMenu(OTHER_NODE)

      expect(store.sessionsForObject(42)).toHaveLength(1)
      expect(store.sessionsForObject(43)).toHaveLength(1)
    })
  })

  describe('arriving by URL', () => {
    it('creates the tab without connecting, so a link or reload never opens a shell by itself', () => {
      store.ensureSession(NODE, 'ssh:3')
      const session = store.getSession(store.sessionKey(42, 'ssh:3'))

      expect(session.phase).toBe('idle')
      expect(session.autoConnect).toBe(false)
      expect(session.label).toBe('SSH Terminal 3')
    })

    it('leaves an existing session alone', async () => {
      const { viewId, key } = await connectSession()
      store.ensureSession(NODE, viewId)

      expect(store.getSession(key).phase).toBe('connected')
      expect(store.sessionsForObject(42)).toHaveLength(1)
    })

    it('numbers a tab opened from the menu after one that arrived by URL', async () => {
      store.ensureSession(NODE, 'ssh:3')
      const key = store.sessionKey(42, 'ssh:3')
      await store.controller(key).connect({ login: null })
      await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBe(1))
      FakeWebSocket.instances[0].control({ type: 'connected' })

      expect(store.openFromMenu(NODE)).toBe('ssh:4')
    })
  })

  describe('live sessions', () => {
    it('lists live shells across nodes and not idle tabs', async () => {
      await connectSession(NODE)
      store.openFromMenu(OTHER_NODE)

      expect(store.liveSessions.map((s) => s.objectId)).toEqual([42])
    })

    it('stops listing a session once it is closed', async () => {
      const { key } = await connectSession()
      store.closeSession(key)

      expect(store.liveSessions).toEqual([])
      expect(store.sessionsForObject(42)).toEqual([])
      expect(FakeWebSocket.instances[0].closed).toBe(true)
    })
  })

  describe('leaving the page', () => {
    it('warns only while a shell is live', async () => {
      expect(leaveAttempt()).toBe(false)

      const { key } = await connectSession()
      await nextTick()
      expect(leaveAttempt()).toBe(true)

      store.closeSession(key)
      await nextTick()
      expect(leaveAttempt()).toBe(false)
    })
  })

  describe('sign-out', () => {
    it('closes every shell and forgets every tab', async () => {
      await connectSession(NODE)
      store.openFromMenu(OTHER_NODE)

      store.reset()

      expect(FakeWebSocket.instances[0].closed).toBe(true)
      expect(store.sessionsForObject(42)).toEqual([])
      expect(store.sessionsForObject(43)).toEqual([])
      await nextTick()
      expect(leaveAttempt()).toBe(false)
    })

    it('starts numbering from the first tab for the next user', () => {
      store.openFromMenu(NODE)
      store.reset()
      expect(store.openFromMenu(NODE)).toBe('ssh:1')
    })
  })
})
