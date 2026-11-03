import { describe, it, expect, vi } from 'vitest'
import { createDciValueBatcher, BULK_MAX_DCI_ITEMS } from '../dciValueBatcher'
import { ApiError } from '../client'

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({ sessionGuid: 'test-session', logout: vi.fn() }),
}))

/** Resolves once the batcher's setTimeout(0) flush and the awaited fetches have run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 5))

/** A server answer: one value per item, at its index, except those it is told to refuse. */
function bulkAnswer({ items }, refuse = () => false) {
  const values = []
  const errors = []
  items.forEach((item, index) => {
    if (refuse(item)) errors.push({ index, reason: 'Access denied' })
    else values.push({ index, ownerId: item.objectId, id: item.dciId, value: `v${item.dciId}` })
  })
  return { values, errors }
}

function setup({ bulk, perObject, maxItems } = {}) {
  const fetchBulk = vi.fn(bulk ?? (async (body) => bulkAnswer(body)))
  const fetchObjectValues = vi.fn(
    perObject ??
      (async (objectId) => ({
        objectId,
        values: [1, 2, 3].map((id) => ({ ownerId: objectId, id, value: `all${id}` })),
      })),
  )
  const batcher = createDciValueBatcher({ fetchBulk, fetchObjectValues, maxItems })
  return { batcher, fetchBulk, fetchObjectValues }
}

const item = (objectId, dciId, cell) => ({ objectId, dciId, ...cell })

describe('createDciValueBatcher', () => {
  it('coalesces lists asked for in the same tick into one request', async () => {
    const { batcher, fetchBulk } = setup()

    const [a, b] = await Promise.all([
      batcher.load([item(1, 10), item(1, 11)]),
      batcher.load([item(2, 20)]),
    ])

    expect(fetchBulk).toHaveBeenCalledTimes(1)
    expect(fetchBulk.mock.calls[0][0]).toEqual({
      items: [item(1, 10), item(1, 11), item(2, 20)],
    })
    expect(Object.keys(a)).toEqual(['1:10', '1:11'])
    expect(b['2:20'].value).toBe('v20')
  })

  it('sends a DCI two callers share once', async () => {
    const { batcher, fetchBulk } = setup()

    const [a, b] = await Promise.all([batcher.load([item(1, 10)]), batcher.load([item(1, 10)])])

    expect(fetchBulk.mock.calls[0][0].items).toEqual([item(1, 10)])
    expect(a['1:10']).toBe(b['1:10'])
  })

  it('maps values to items by index and drops the index', async () => {
    const cell = { column: 'FREE', instance: 'C:' }
    const { batcher } = setup()

    const values = await batcher.load([item(5, 7), item(5, 7, cell)])

    expect(Object.keys(values)).toEqual(['5:7', '5:7:["FREE","C:"]'])
    expect(values['5:7']).not.toHaveProperty('index')
  })

  it('leaves out the items the server cannot serve', async () => {
    const { batcher } = setup({ bulk: async (body) => bulkAnswer(body, (i) => i.dciId === 11) })

    const values = await batcher.load([item(1, 10), item(1, 11)])

    expect(Object.keys(values)).toEqual(['1:10'])
  })

  it('splits more than maxItems into several requests', async () => {
    const { batcher, fetchBulk } = setup({ maxItems: 2 })

    const values = await batcher.load([1, 2, 3, 4, 5].map((id) => item(1, id)))

    expect(fetchBulk.mock.calls.map(([body]) => body.items.length)).toEqual([2, 2, 1])
    expect(Object.keys(values)).toHaveLength(5)
    expect(values['1:5'].value).toBe('v5')
  })

  it('uses the server cap by default', () => {
    expect(BULK_MAX_DCI_ITEMS).toBe(500)
  })

  it('groups by delegate and sends the delegate along', async () => {
    const { batcher, fetchBulk } = setup()

    await Promise.all([batcher.load([item(1, 10)]), batcher.load([item(2, 20)], { delegate: 700 })])

    expect(fetchBulk.mock.calls.map(([body]) => body)).toEqual([
      { items: [item(1, 10)] },
      { items: [item(2, 20)], delegate: 700 },
    ])
  })

  it('sends in the background lane unless a caller is interactive', async () => {
    const { batcher, fetchBulk } = setup()

    await batcher.load([item(1, 10)], { priority: 'background' })
    await Promise.all([
      batcher.load([item(1, 10)], { priority: 'background' }),
      batcher.load([item(1, 11)]),
    ])

    expect(fetchBulk.mock.calls.map(([, options]) => options.priority)).toEqual([
      'background',
      'interactive',
    ])
  })

  it('rejects every call of a failed request', async () => {
    const { batcher } = setup({
      bulk: async () => {
        throw new ApiError('Request failed: 500', 500, null)
      },
    })

    const results = await Promise.allSettled([
      batcher.load([item(1, 10)]),
      batcher.load([item(2, 20)]),
    ])

    expect(results.map((r) => r.reason?.status)).toEqual([500, 500])
  })

  it('reads again without a delegate that is refused', async () => {
    const { batcher, fetchBulk } = setup({
      bulk: async (body) => {
        if (body.delegate) throw new ApiError('Access denied', 403, null)
        return bulkAnswer(body)
      },
    })

    const values = await batcher.load([item(1, 10)], { delegate: 700 })

    expect(fetchBulk.mock.calls.map(([body]) => body.delegate)).toEqual([700, undefined])
    expect(values['1:10'].value).toBe('v10')
  })

  /** Older servers have no such route: 404, or 405 for the method. */
  it.each([404, 405])('falls back to per-object lists on %i, for good', async (status) => {
    const { batcher, fetchBulk, fetchObjectValues } = setup({
      bulk: async () => {
        throw new ApiError('Not found', status, null)
      },
    })

    const values = await batcher.load([item(1, 2), item(1, 3), item(4, 1)])
    await batcher.load([item(1, 2)])

    expect(fetchBulk).toHaveBeenCalledTimes(1)
    expect(fetchObjectValues.mock.calls.map(([id]) => id)).toEqual([1, 4, 1])
    expect(values['1:3'].value).toBe('all3')
    expect(values['4:1'].value).toBe('all1')
  })

  it('tells a missing route from a missing delegate', async () => {
    const { batcher, fetchBulk, fetchObjectValues } = setup({
      bulk: async () => {
        throw new ApiError('Not found', 404, null)
      },
    })

    const values = await batcher.load([item(1, 2)], { delegate: 700 })

    expect(fetchBulk.mock.calls.map(([body]) => body.delegate)).toEqual([700, undefined])
    expect(fetchObjectValues).toHaveBeenCalledTimes(1)
    expect(values['1:2'].value).toBe('all2')
  })

  it('keeps the other objects when one object fails in the fallback', async () => {
    const { batcher } = setup({
      bulk: async () => {
        throw new ApiError('Method not allowed', 405, null)
      },
      perObject: async (objectId) => {
        if (objectId === 1) throw new ApiError('Access denied', 403, null)
        return { values: [{ ownerId: objectId, id: 1, value: 'x' }] }
      },
    })

    const values = await batcher.load([item(1, 1), item(2, 1)])

    expect(Object.keys(values)).toEqual(['2:1'])
  })

  it('cancels the shared request only when every caller has left', async () => {
    let signal
    const { batcher } = setup({
      bulk: (body, options) => {
        signal = options.signal
        return new Promise(() => {})
      },
    })
    const first = new AbortController()
    const second = new AbortController()

    const a = batcher.load([item(1, 10)], { signal: first.signal })
    const b = batcher.load([item(1, 11)], { signal: second.signal })
    await flush()
    first.abort()
    expect(signal.aborted).toBe(false)
    second.abort()
    expect(signal.aborted).toBe(true)

    await expect(a).rejects.toMatchObject({ name: 'AbortError' })
    await expect(b).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('asks nothing for an empty list', async () => {
    const { batcher, fetchBulk } = setup()

    expect(await batcher.load([])).toEqual({})
    await flush()
    expect(fetchBulk).not.toHaveBeenCalled()
  })
})
