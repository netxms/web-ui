import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// client.js imports the auth store for the session token; stubbing it avoids needing a
// vue-query injection context.
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ sessionGuid: 'test-session', logout: vi.fn() }),
}))

const { get, post, put, del, ApiError, SERVER_UNAVAILABLE_STATUSES } = await import('../client')
const { NO_RETRY_STATUSES } = await import('@/queries/config')

/** Minimal fetch Response stand-in. */
function respond(status, body = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob()),
  }
}

let forbiddenEvents
let unavailableEvents

beforeEach(() => {
  forbiddenEvents = []
  unavailableEvents = []
  window.addEventListener('app:forbidden', collect)
  window.addEventListener('app:server-unavailable', collectUnavailable)
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  window.removeEventListener('app:forbidden', collect)
  window.removeEventListener('app:server-unavailable', collectUnavailable)
})

function collect(event) {
  forbiddenEvents.push(event.detail)
}

function collectUnavailable() {
  unavailableEvents.push(true)
}

describe('403 handling', () => {
  it('does not announce a 403 from a read', async () => {
    globalThis.fetch.mockResolvedValue(respond(403, { message: 'Access denied' }))

    await expect(get('/v1/objects/1/sub-tree')).rejects.toThrow('Access denied')
    expect(forbiddenEvents).toEqual([])
  })

  it('announces a 403 from a write the user triggered', async () => {
    globalThis.fetch.mockResolvedValue(respond(403, { message: 'Access denied' }))

    await expect(post('/v1/actions', { name: 'x' })).rejects.toThrow('Access denied')
    expect(forbiddenEvents).toHaveLength(1)
    expect(forbiddenEvents[0]).toMatchObject({ method: 'POST', path: '/v1/actions' })
  })

  it('announces a 403 from every other write verb', async () => {
    globalThis.fetch.mockResolvedValue(respond(403, {}))

    await expect(put('/v1/actions/1', {})).rejects.toThrow()
    await expect(del('/v1/actions/1')).rejects.toThrow()
    expect(forbiddenEvents.map((d) => d.method)).toEqual(['PUT', 'DELETE'])
  })

  it('still honours suppressForbidden on a query-shaped POST', async () => {
    // Log and object queries are reads that happen to use POST.
    globalThis.fetch.mockResolvedValue(respond(403, {}))

    await expect(post('/v1/logs/EventLog/query', {}, { suppressForbidden: true })).rejects.toThrow()
    expect(forbiddenEvents).toEqual([])
  })

  it('reports the status on the error so callers can branch on it', async () => {
    globalThis.fetch.mockResolvedValue(respond(403, { message: 'Access denied' }))

    await expect(get('/v1/whatever')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    })
  })
})

/**
 * `app:server-unavailable` is the only trigger for the reconnect probe, which is what clears a
 * query the retry policy refused to retry, so the two status lists must agree.
 */
describe('server-unavailable announcement', () => {
  it.each([...SERVER_UNAVAILABLE_STATUSES])('announces %i so the probe starts', async (status) => {
    globalThis.fetch.mockResolvedValue(respond(status, {}))

    await expect(get('/v1/objects')).rejects.toMatchObject({ status })
    expect(unavailableEvents).toHaveLength(1)
  })

  it('announces a network failure, which has no status at all', async () => {
    globalThis.fetch.mockRejectedValue(new TypeError('failed to fetch'))

    await expect(get('/v1/objects')).rejects.toMatchObject({ status: 0 })
    expect(unavailableEvents).toHaveLength(1)
  })

  it('stays quiet for a failure the retry policy still retries', async () => {
    globalThis.fetch.mockResolvedValue(respond(500, {}))

    await expect(get('/v1/objects')).rejects.toThrow()
    expect(unavailableEvents).toEqual([])
  })

  it('stays quiet for a status the caller declared its own', async () => {
    // `POST /v1/ai/chat` answers 503 when no AI provider is configured; that is not an
    // unreachable server.
    globalThis.fetch.mockResolvedValue(respond(503, { reason: 'AI assistant is not available' }))

    await expect(post('/v1/ai/chat', {}, { suppressUnavailable: true })).rejects.toMatchObject({
      status: 503,
      message: 'AI assistant is not available',
    })
    expect(unavailableEvents).toEqual([])
  })

  it('still announces a network failure to a caller that suppresses statuses', async () => {
    // suppressUnavailable speaks for a status the server chose. Nothing answered here at all.
    globalThis.fetch.mockRejectedValue(new TypeError('failed to fetch'))

    await expect(post('/v1/ai/chat', {}, { suppressUnavailable: true })).rejects.toMatchObject({
      status: 0,
    })
    expect(unavailableEvents).toHaveLength(1)
  })

  it('announces every 5xx the retry policy refuses to retry', () => {
    const unretried5xx = [...NO_RETRY_STATUSES].filter((status) => status >= 500)
    expect(unretried5xx.length).toBeGreaterThan(0)
    for (const status of unretried5xx) {
      expect(SERVER_UNAVAILABLE_STATUSES.has(status), `${status} is never retried`).toBe(true)
    }
  })
})

describe('other failures', () => {
  it('wraps a network failure as a status-0 ApiError', async () => {
    globalThis.fetch.mockRejectedValue(new TypeError('failed to fetch'))

    await expect(get('/v1/objects')).rejects.toMatchObject({ status: 0 })
  })

  it('surfaces the server message for a generic failure', async () => {
    globalThis.fetch.mockResolvedValue(respond(500, { message: 'Internal error' }))

    const error = await get('/v1/objects').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(500)
    expect(error.message).toBe('Internal error')
  })

  it('prefers the server reason, which is the field the WebAPI emits', async () => {
    globalThis.fetch.mockResolvedValue(respond(400, { reason: 'Error in line 3: syntax error' }))

    const error = await get('/v1/objects').catch((e) => e)
    expect(error.message).toBe('Error in line 3: syntax error')
    expect(error.data).toEqual({ reason: 'Error in line 3: syntax error' })
  })

  it('falls back to the status when the body carries no explanation', async () => {
    globalThis.fetch.mockResolvedValue(respond(400, { reason: '' }))
    await expect(get('/v1/objects')).rejects.toThrow('Request failed: 400')

    globalThis.fetch.mockResolvedValue(respond(400, {}))
    await expect(get('/v1/objects')).rejects.toThrow('Request failed: 400')
  })
})

/**
 * Views that resolve a list fan out one request per item; over HTTP/2 the whole burst lands at
 * once (no 6-per-origin cap) and the server or its proxy times out.
 */
describe('request concurrency limit', () => {
  /** Requests reach `fetch` only after an await chain, so settle by polling, not by tick. */
  async function waitForCalls(count) {
    for (let i = 0; i < 500 && globalThis.fetch.mock.calls.length < count; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    return globalThis.fetch.mock.calls.length
  }

  /** Give anything further a chance to start, so "exactly N" means the cap held. */
  async function settleAndCount() {
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 1))
    return globalThis.fetch.mock.calls.length
  }

  const paths = () => globalThis.fetch.mock.calls.map(([url]) => url)

  let outstanding

  /** A fetch stand-in whose calls never settle on their own, so a test can hold slots open. */
  function deferredFetch() {
    const settlers = []
    outstanding = settlers
    globalThis.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          settlers.push(() => resolve(respond(200, { ok: true })))
        }),
    )
    return {
      settle: (index) => settlers[index](),
      /** Settling frees slots, which starts queued requests, which register more. */
      async settleAll() {
        for (let done = 0, guard = 0; done < settlers.length && guard < 100; guard++) {
          while (done < settlers.length) settlers[done++]()
          await settleAndCount()
        }
      },
    }
  }

  // A failed assertion would otherwise leave every slot held and hang the whole file.
  afterEach(async () => {
    for (const settle of outstanding ?? []) settle()
    outstanding = null
    await new Promise((resolve) => setTimeout(resolve, 1))
  })

  it('never has more than the cap in flight', async () => {
    const fetches = deferredFetch()
    const requests = Array.from({ length: 20 }, (_, i) => get(`/v1/objects/${i}`))

    await waitForCalls(6)
    expect(await settleAndCount()).toBe(6)

    fetches.settle(0)
    expect(await waitForCalls(7)).toBe(7)

    await fetches.settleAll()
    await Promise.all(requests)
    expect(globalThis.fetch).toHaveBeenCalledTimes(20)
  })

  it('lets an interactive request jump a queue of background work', async () => {
    const fetches = deferredFetch()
    const background = Array.from({ length: 12 }, (_, i) =>
      get(`/v1/objects/${i}`, { priority: 'background' }),
    )
    await waitForCalls(6)

    const interactive = get('/v1/alarms')
    expect(await settleAndCount()).toBe(6) // every slot busy, nothing new went out

    fetches.settle(0)
    await waitForCalls(7)
    expect(paths()[6]).toBe('/api/v1/alarms')

    await fetches.settleAll()
    await Promise.all([...background, interactive])
  })

  it('drops a queued request that is aborted before it starts', async () => {
    const fetches = deferredFetch()
    const inFlight = Array.from({ length: 6 }, (_, i) => get(`/v1/objects/${i}`))
    await waitForCalls(6)

    const controller = new AbortController()
    const queued = get('/v1/objects/99', { signal: controller.signal })
    controller.abort()
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })

    await fetches.settleAll()
    await Promise.all(inFlight)
    // It never reached the network, and never held a slot on the way out.
    expect(paths()).not.toContain('/api/v1/objects/99')
    expect(globalThis.fetch).toHaveBeenCalledTimes(6)
  })

  it('does not report the server unavailable when a request is aborted', async () => {
    globalThis.fetch.mockRejectedValue(new DOMException('aborted', 'AbortError'))

    await expect(get('/v1/objects')).rejects.toMatchObject({ name: 'AbortError' })
    expect(unavailableEvents).toEqual([])
  })

  it('frees the slot when a request fails', async () => {
    globalThis.fetch.mockRejectedValue(new TypeError('failed to fetch'))

    const failures = Array.from({ length: 10 }, () => get('/v1/objects').catch((error) => error))
    const results = await Promise.all(failures)

    expect(results).toHaveLength(10)
    expect(globalThis.fetch).toHaveBeenCalledTimes(10)
  })
})
