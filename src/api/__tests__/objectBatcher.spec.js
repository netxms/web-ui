// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createObjectBatcher, BULK_MAX_IDS } from '../objectBatcher'
import { ApiError } from '../client'

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ sessionGuid: 'test-session', logout: vi.fn() }),
}))

const doc = (id, extra = {}) => ({ id, name: `obj-${id}`, ...extra })

/** Resolves once the batcher's setTimeout(0) flush and the awaited fetch have run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 5))

function setup({ bulk, one, maxIds } = {}) {
  const fetchBulk = vi.fn(
    bulk ?? (async ({ ids }) => ({ objects: ids.map((id) => doc(id)), notFound: [], denied: [] })),
  )
  const fetchOne = vi.fn(one ?? (async (id) => doc(id)))
  const batcher = createObjectBatcher({ fetchBulk, fetchOne, maxIds })
  return { batcher, fetchBulk, fetchOne }
}

describe('createObjectBatcher', () => {
  it('coalesces calls made in the same tick into one bulk request', async () => {
    const { batcher, fetchBulk, fetchOne } = setup()

    const results = await Promise.all([batcher.load(1), batcher.load(2), batcher.load(3)])

    expect(results.map((r) => r.id)).toEqual([1, 2, 3])
    expect(fetchBulk).toHaveBeenCalledTimes(1)
    expect(fetchBulk.mock.calls[0][0]).toEqual({ ids: [1, 2, 3] })
    expect(fetchOne).not.toHaveBeenCalled()
  })

  it('sends a repeated id once and resolves every caller', async () => {
    const { batcher, fetchBulk } = setup()

    const [a, b] = await Promise.all([batcher.load(7), batcher.load(7)])

    expect(fetchBulk.mock.calls[0][0].ids).toEqual([7])
    expect(a).toBe(b)
  })

  it('splits more than maxIds into several requests', async () => {
    const { batcher, fetchBulk } = setup({ maxIds: 2 })

    await Promise.all([1, 2, 3, 4, 5].map((id) => batcher.load(id)))

    expect(fetchBulk.mock.calls.map((call) => call[0].ids)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('uses the server cap by default', () => {
    expect(BULK_MAX_IDS).toBe(500)
  })

  it('groups by delegate and sends the delegate along', async () => {
    const { batcher, fetchBulk } = setup()

    await Promise.all([batcher.load(1), batcher.load(2, { delegate: 700 })])

    const bodies = fetchBulk.mock.calls.map((call) => call[0])
    expect(bodies).toContainEqual({ ids: [1] })
    expect(bodies).toContainEqual({ ids: [2], delegate: 700 })
  })

  /**
   * Callers of the single-object GET branch on error.status: 403 renders "no access"
   * inline, and useObjectsByIds reports both as unresolved.
   */
  it('rejects denied and missing ids with the statuses the single GET used', async () => {
    const { batcher } = setup({
      bulk: async () => ({ objects: [doc(1)], notFound: [2], denied: [3] }),
    })

    const results = await Promise.allSettled([1, 2, 3].map((id) => batcher.load(id)))

    expect(results[0].value.id).toBe(1)
    expect(results[1].reason).toBeInstanceOf(ApiError)
    expect(results[1].reason.status).toBe(404)
    expect(results[2].reason.status).toBe(403)
  })

  it('passes a partial document through unchanged', async () => {
    const { batcher } = setup({
      bulk: async () => ({ objects: [doc(5, { partial: true })], notFound: [], denied: [] }),
    })

    expect(await batcher.load(5, { delegate: 700 })).toMatchObject({ id: 5, partial: true })
  })

  it('asks at interactive priority if any caller is interactive', async () => {
    const { batcher, fetchBulk } = setup()

    await Promise.all([
      batcher.load(1, { priority: 'background' }),
      batcher.load(2, { priority: 'interactive' }),
    ])

    expect(fetchBulk.mock.calls[0][1].priority).toBe('interactive')
  })

  it('stays at background priority when every caller is background', async () => {
    const { batcher, fetchBulk } = setup()

    await batcher.load(1, { priority: 'background' })

    expect(fetchBulk.mock.calls[0][1].priority).toBe('background')
  })

  it('rejects only the caller that aborted', async () => {
    let release
    const { batcher, fetchBulk } = setup({
      bulk: ({ ids }) =>
        new Promise((resolve) => {
          release = () => resolve({ objects: ids.map((id) => doc(id)), notFound: [], denied: [] })
        }),
    })
    const controller = new AbortController()

    const aborted = batcher.load(1, { signal: controller.signal })
    const kept = batcher.load(2)
    await flush()
    controller.abort()
    release()

    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    await expect(kept).resolves.toMatchObject({ id: 2 })
    expect(fetchBulk.mock.calls[0][1].signal.aborted).toBe(false)
  })

  it('aborts the shared request once every caller has gone', async () => {
    const { batcher, fetchBulk } = setup({ bulk: () => new Promise(() => {}) })
    const a = new AbortController()
    const b = new AbortController()

    const pa = batcher.load(1, { signal: a.signal }).catch((error) => error)
    const pb = batcher.load(2, { signal: b.signal }).catch((error) => error)
    await flush()
    a.abort()
    b.abort()

    expect((await pa).name).toBe('AbortError')
    expect((await pb).name).toBe('AbortError')
    expect(fetchBulk.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('does not send a request when every caller aborted before the flush', async () => {
    const { batcher, fetchBulk } = setup()
    const controller = new AbortController()

    const pending = batcher.load(1, { signal: controller.signal }).catch((error) => error)
    controller.abort()
    await flush()

    expect((await pending).name).toBe('AbortError')
    expect(fetchBulk).not.toHaveBeenCalled()
  })

  /** A server without the endpoint routes the POST to v1/objects/:object-id: 405. */
  it('falls back to single requests for good when the server has no bulk endpoint', async () => {
    const { batcher, fetchBulk, fetchOne } = setup({
      bulk: async () => {
        throw new ApiError('Method not allowed', 405, null)
      },
    })

    const first = await Promise.all([batcher.load(1), batcher.load(2)])
    const later = await batcher.load(3)

    expect(first.map((r) => r.id)).toEqual([1, 2])
    expect(later.id).toBe(3)
    expect(fetchBulk).toHaveBeenCalledTimes(1)
    expect(fetchOne.mock.calls.map((call) => call[0])).toEqual([1, 2, 3])
  })

  it('falls back without the delegate when the delegate is unreadable or gone', async () => {
    for (const status of [403, 404]) {
      const { batcher, fetchBulk, fetchOne } = setup({
        bulk: async () => {
          throw new ApiError('nope', status, null)
        },
      })

      expect((await batcher.load(1, { delegate: 700 })).id).toBe(1)
      // The endpoint itself exists, so the next call still goes through it.
      await batcher.load(2, { delegate: 700 })
      expect(fetchBulk).toHaveBeenCalledTimes(2)
      expect(fetchOne.mock.calls[0][1]).not.toHaveProperty('delegate')
    }
  })

  it('rejects every caller with the error when the bulk request fails otherwise', async () => {
    const { batcher, fetchOne } = setup({
      bulk: async () => {
        throw new ApiError('Bad gateway', 502, null)
      },
    })

    const results = await Promise.allSettled([batcher.load(1), batcher.load(2)])

    expect(results.map((r) => r.reason?.status)).toEqual([502, 502])
    expect(fetchOne).not.toHaveBeenCalled()
  })
})
