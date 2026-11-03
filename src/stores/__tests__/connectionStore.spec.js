import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'

const getServerStatus = vi.fn()
vi.mock('@/api/serverApi', () => ({ getServerStatus: () => getServerStatus() }))

const logout = vi.fn()
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ logout }) }))

const { useConnectionStore, FAST_ATTEMPTS } = await import('@/stores/connectionStore')

const PROBE_INTERVAL_MS = 3000
const SLOW_PROBE_INTERVAL_MS = 15000

/** Advance one probe cycle: fire the timer, then let the awaited probe settle. */
async function tick(ms) {
  await vi.advanceTimersByTimeAsync(ms)
  await flushPromises()
}

describe('connectionStore reconnect probe', () => {
  let pinia

  beforeEach(() => {
    vi.useFakeTimers()
    getServerStatus.mockReset()
    logout.mockReset()
    pinia = createPinia()
    setActivePinia(pinia)
  })

  afterEach(() => {
    vi.useRealTimers()
    pinia._e.stop()
  })

  it('does not open the banner when the first probe finds the server up', async () => {
    getServerStatus.mockResolvedValue(true)
    const store = useConnectionStore()

    await store.startReconnecting()

    expect(store.isReconnecting).toBe(false)
  })

  // Fast probing ends sooner than a routine server restart, and the session is still valid.
  it('keeps probing past the fast phase instead of logging out', async () => {
    getServerStatus.mockResolvedValue(false)
    const store = useConnectionStore()

    await store.startReconnecting()
    for (let i = 0; i < FAST_ATTEMPTS; i++) await tick(PROBE_INTERVAL_MS)

    expect(store.attemptCount).toBe(FAST_ATTEMPTS)
    expect(store.isReconnecting).toBe(true)
    expect(store.isSlowRetry).toBe(true)
    expect(logout).not.toHaveBeenCalled()

    await tick(SLOW_PROBE_INTERVAL_MS)
    expect(store.attemptCount).toBe(FAST_ATTEMPTS + 1)
    expect(store.isReconnecting).toBe(true)
  })

  it('backs off to the slow interval once the fast phase is over', async () => {
    getServerStatus.mockResolvedValue(false)
    const store = useConnectionStore()

    await store.startReconnecting()
    for (let i = 0; i < FAST_ATTEMPTS; i++) await tick(PROBE_INTERVAL_MS)

    await tick(PROBE_INTERVAL_MS)
    expect(store.attemptCount).toBe(FAST_ATTEMPTS) // no probe at the fast pace any more

    await tick(SLOW_PROBE_INTERVAL_MS - PROBE_INTERVAL_MS)
    expect(store.attemptCount).toBe(FAST_ATTEMPTS + 1)
  })

  it('recovers from a long outage and announces the reconnect', async () => {
    getServerStatus.mockResolvedValue(false)
    const store = useConnectionStore()
    const onReconnected = vi.fn()
    window.addEventListener('app:reconnected', onReconnected)

    await store.startReconnecting()
    for (let i = 0; i < FAST_ATTEMPTS; i++) await tick(PROBE_INTERVAL_MS)

    getServerStatus.mockResolvedValue(true)
    await tick(SLOW_PROBE_INTERVAL_MS)

    expect(store.isReconnecting).toBe(false)
    expect(store.attemptCount).toBe(0)
    expect(store.isSlowRetry).toBe(false)
    expect(onReconnected).toHaveBeenCalledTimes(1)
    window.removeEventListener('app:reconnected', onReconnected)
  })

  it('stops the loop on stop()', async () => {
    getServerStatus.mockResolvedValue(false)
    const store = useConnectionStore()

    await store.startReconnecting()
    await tick(PROBE_INTERVAL_MS)
    store.stop()
    await tick(PROBE_INTERVAL_MS * 5)

    expect(store.isReconnecting).toBe(false)
    expect(store.attemptCount).toBe(0)
  })

  // The resync skips data that arrived after this moment, so it is when the failure was first
  // reported: in a burst, requests keep completing while the confirming probe waits.
  it('reports when the outage began in the reconnect event', async () => {
    vi.setSystemTime(new Date('2026-09-18T10:00:00Z'))
    getServerStatus.mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-09-18T10:00:02Z')) // the probe itself takes time
      return false
    })
    const store = useConnectionStore()
    const onReconnected = vi.fn()
    window.addEventListener('app:reconnected', onReconnected)

    await store.startReconnecting()
    getServerStatus.mockResolvedValue(true)
    await tick(PROBE_INTERVAL_MS)

    expect(onReconnected).toHaveBeenCalledTimes(1)
    expect(onReconnected.mock.calls[0][0].detail).toEqual({
      outageStartedAt: new Date('2026-09-18T10:00:00Z').getTime(),
    })
    window.removeEventListener('app:reconnected', onReconnected)
  })

  it('starts a new outage window for each outage', async () => {
    const store = useConnectionStore()
    const onReconnected = vi.fn()
    window.addEventListener('app:reconnected', onReconnected)

    vi.setSystemTime(new Date('2026-09-18T10:00:00Z'))
    getServerStatus.mockResolvedValue(false)
    await store.startReconnecting()
    getServerStatus.mockResolvedValue(true)
    await tick(PROBE_INTERVAL_MS)

    vi.setSystemTime(new Date('2026-09-18T11:00:00Z'))
    getServerStatus.mockResolvedValue(false)
    await store.startReconnecting()
    getServerStatus.mockResolvedValue(true)
    await tick(PROBE_INTERVAL_MS)

    expect(onReconnected.mock.calls[1][0].detail.outageStartedAt).toBe(
      new Date('2026-09-18T11:00:00Z').getTime(),
    )
    window.removeEventListener('app:reconnected', onReconnected)
  })
})
