// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computed, effectScope, nextTick, ref } from 'vue'

const queryLog = vi.fn()
vi.mock('@/api/logsApi', () => ({ queryLog: (...args) => queryLog(...args) }))

const { useLogLiveTail } = await import('@/composables/useLogLiveTail')

const BASE_REQUEST = {
  filters: [],
  orderBy: [{ column: 'event_timestamp', descending: true }],
  limit: 100,
}

function tail(options) {
  const scope = effectScope()
  const api = scope.run(() =>
    useLogLiveTail('EventLog', ref(BASE_REQUEST), { recordIdColumn: 'event_id', ...options }),
  )
  return { ...api, stop: () => scope.stop() }
}

function apiError(message, status) {
  return Object.assign(new Error(message), { name: 'ApiError', status })
}

// Several flushes: a catch-up poll reads pages back to back, each a further microtask hop.
async function settle() {
  for (let i = 0; i < 64; i++) await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  queryLog.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useLogLiveTail', () => {
  it('seeds from the newest records with no cursor filter', async () => {
    queryLog.mockResolvedValue({ records: [{ event_id: 3 }, { event_id: 2 }] })
    const feed = tail()
    await settle()

    expect(queryLog).toHaveBeenCalledWith('EventLog', { ...BASE_REQUEST, offset: 0 })
    expect(feed.rows.value.map((r) => r.event_id)).toEqual([3, 2])
    feed.stop()
  })

  it('asks only for records after the newest one seen', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 3 }, { event_id: 2 }] })
    const feed = tail()
    await settle()

    queryLog.mockResolvedValueOnce({ records: [{ event_id: 5 }, { event_id: 4 }] })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(queryLog.mock.calls[1][1].filters).toEqual([
      { column: 'event_id', type: 'greater', value: 3 },
    ])
    // Newest first, new batch on top.
    expect(feed.rows.value.map((r) => r.event_id)).toEqual([5, 4, 3, 2])
    feed.stop()
  })

  // Syslog and SNMP traps name a record id column they never return.
  it('backs the timestamp cursor off a second and drops the overlap', async () => {
    queryLog.mockResolvedValueOnce({
      records: [{ msg: 'b', timestamp: '2026-08-19T10:00:05.000Z' }],
    })
    const feed = tail({ recordIdColumn: null, timeColumn: 'timestamp' })
    await settle()

    queryLog.mockResolvedValueOnce({
      records: [
        { msg: 'c', timestamp: '2026-08-19T10:00:06.000Z' },
        // Same second as the seed row, and the same row: must not appear twice.
        { msg: 'b', timestamp: '2026-08-19T10:00:05.000Z' },
      ],
    })
    vi.advanceTimersByTime(3000)
    await settle()

    // Second precision: the server's filter parser rejects milliseconds.
    expect(queryLog.mock.calls[1][1].filters).toEqual([
      { column: 'timestamp', type: 'greater', value: '2026-08-19T10:00:04Z' },
    ])
    expect(feed.rows.value.map((r) => r.msg)).toEqual(['c', 'b'])
    feed.stop()
  })

  it('holds new rows while paused and releases them on resume', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    const feed = tail()
    await settle()

    feed.pause()
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 2 }] })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(feed.rows.value.map((r) => r.event_id)).toEqual([1])
    expect(feed.pendingCount.value).toBe(1)

    feed.resume()
    expect(feed.rows.value.map((r) => r.event_id)).toEqual([2, 1])
    expect(feed.pendingCount.value).toBe(0)
    feed.stop()
  })

  it('drops the oldest rows past the buffer limit', async () => {
    queryLog.mockResolvedValueOnce({
      records: [{ event_id: 3 }, { event_id: 2 }, { event_id: 1 }],
    })
    const feed = tail({ bufferLimit: 2 })
    await settle()

    expect(feed.rows.value.map((r) => r.event_id)).toEqual([3, 2])
    feed.stop()
  })

  // `slice(0, <ref>)` coerces to 0: an empty feed with no error anywhere.
  it('accepts a reactive buffer limit', async () => {
    queryLog.mockResolvedValueOnce({
      records: [{ event_id: 3 }, { event_id: 2 }, { event_id: 1 }],
    })
    const feed = tail({ bufferLimit: computed(() => 2) })
    await settle()

    expect(feed.rows.value.map((r) => r.event_id)).toEqual([3, 2])
    feed.stop()
  })

  it('re-reads the buffer limit rather than capturing it once', async () => {
    const limit = ref(3)
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    const feed = tail({ bufferLimit: limit })
    await settle()

    limit.value = 1
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 3 }, { event_id: 2 }] })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(feed.rows.value.map((r) => r.event_id)).toEqual([3])
    feed.stop()
  })

  it('stops polling after a terminal failure and retries on resume', async () => {
    queryLog.mockRejectedValueOnce(apiError('Access denied', 403))
    const feed = tail()
    await settle()

    expect(feed.error.value).toBeTruthy()

    vi.advanceTimersByTime(9000)
    await settle()
    expect(queryLog).toHaveBeenCalledTimes(1)

    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    feed.resume()
    await settle()
    expect(feed.error.value).toBeNull()
    expect(feed.rows.value).toHaveLength(1)
    feed.stop()
  })

  it('keeps polling through a transient failure and recovers on the next tick', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    const feed = tail()
    await settle()

    queryLog.mockRejectedValueOnce(apiError('Request failed: 502', 502))
    vi.advanceTimersByTime(3000)
    await settle()

    expect(feed.error.value).toBeNull()
    expect(feed.reconnecting.value).toBe(true)
    expect(feed.rows.value.map((r) => r.event_id)).toEqual([1])

    queryLog.mockResolvedValueOnce({ records: [{ event_id: 2 }] })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(feed.reconnecting.value).toBe(false)
    expect(feed.rows.value.map((r) => r.event_id)).toEqual([2, 1])
    feed.stop()
  })

  it('does not advance the cursor over a failed poll', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 7 }] })
    const feed = tail()
    await settle()

    queryLog.mockRejectedValueOnce(apiError('Request failed: 502', 502))
    vi.advanceTimersByTime(3000)
    await settle()

    queryLog.mockResolvedValueOnce({ records: [] })
    vi.advanceTimersByTime(3000)
    await settle()

    const cursorFilter = { column: 'event_id', type: 'greater', value: 7 }
    expect(queryLog.mock.calls[1][1].filters).toEqual([cursorFilter])
    expect(queryLog.mock.calls[2][1].filters).toEqual([cursorFilter])
    feed.stop()
  })

  it('backs off while the failures continue and returns to cadence after one succeeds', async () => {
    queryLog.mockResolvedValueOnce({ records: [] })
    const feed = tail()
    await settle()

    queryLog.mockRejectedValue(apiError('Request failed: 503', 503))
    vi.advanceTimersByTime(3000)
    await settle()
    expect(queryLog).toHaveBeenCalledTimes(2)

    // The first failure retries on the normal cadence.
    vi.advanceTimersByTime(3000)
    await settle()
    expect(queryLog).toHaveBeenCalledTimes(3)

    // From the second, the delay doubles.
    vi.advanceTimersByTime(3000)
    await settle()
    expect(queryLog).toHaveBeenCalledTimes(3)

    vi.advanceTimersByTime(3000)
    await settle()
    expect(queryLog).toHaveBeenCalledTimes(4)

    queryLog.mockReset()
    queryLog.mockResolvedValue({ records: [] })
    vi.advanceTimersByTime(12_000)
    await settle()
    expect(queryLog).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(3000)
    await settle()
    expect(queryLog).toHaveBeenCalledTimes(2)
    feed.stop()
  })

  it('treats a network failure as transient', async () => {
    queryLog.mockRejectedValueOnce(apiError('Network error', 0))
    const feed = tail()
    await settle()

    expect(feed.error.value).toBeNull()
    expect(feed.reconnecting.value).toBe(true)
    feed.stop()
  })

  it('treats an error with no status as terminal', async () => {
    queryLog.mockRejectedValueOnce(new TypeError('row.map is not a function'))
    const feed = tail()
    await settle()

    expect(feed.error.value).toBeTruthy()
    vi.advanceTimersByTime(30_000)
    await settle()
    expect(queryLog).toHaveBeenCalledTimes(1)
    feed.stop()
  })

  it('does not run for a log with nothing monotonic to page on', async () => {
    const feed = tail({ recordIdColumn: null, timeColumn: null })
    await settle()

    expect(feed.supported.value).toBe(false)
    expect(queryLog).not.toHaveBeenCalled()
    feed.stop()
  })

  it('stops polling once the scope is disposed', async () => {
    queryLog.mockResolvedValue({ records: [] })
    const feed = tail()
    await settle()
    feed.stop()

    vi.advanceTimersByTime(30000)
    await settle()
    expect(queryLog).toHaveBeenCalledTimes(1)
  })
})

describe('useLogLiveTail without history', () => {
  it('hides the seed but polls on from its newest record', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 3 }, { event_id: 2 }] })
    const feed = tail({ history: false })
    await settle()
    expect(feed.rows.value).toEqual([])

    queryLog.mockResolvedValueOnce({ records: [{ event_id: 4 }] })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(queryLog.mock.calls[1][1].filters).toEqual([
      { column: 'event_id', type: 'greater', value: 3 },
    ])
    expect(feed.rows.value.map((r) => r.event_id)).toEqual([4])
    feed.stop()
  })

  it('does not bring a hidden seed row back through the timestamp cursor overlap', async () => {
    queryLog.mockResolvedValueOnce({
      records: [{ msg: 'old', timestamp: '2026-08-19T10:00:05.000Z' }],
    })
    const feed = tail({ history: false, recordIdColumn: null, timeColumn: 'timestamp' })
    await settle()

    queryLog.mockResolvedValueOnce({
      records: [
        { msg: 'new', timestamp: '2026-08-19T10:00:05.000Z' },
        { msg: 'old', timestamp: '2026-08-19T10:00:05.000Z' },
      ],
    })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(queryLog.mock.calls[1][1].filters).toEqual([
      { column: 'timestamp', type: 'greater', value: '2026-08-19T10:00:04Z' },
    ])
    expect(feed.rows.value.map((r) => r.msg)).toEqual(['new'])
    feed.stop()
  })

  it('hides the seed of a tail that only becomes supported later', async () => {
    const recordIdColumn = ref(null)
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    const feed = tail({ history: false, recordIdColumn })
    await settle()
    expect(queryLog).not.toHaveBeenCalled()

    recordIdColumn.value = 'event_id'
    await settle()
    expect(feed.rows.value).toEqual([])

    queryLog.mockResolvedValueOnce({ records: [{ event_id: 2 }] })
    vi.advanceTimersByTime(3000)
    await settle()
    expect(feed.rows.value.map((r) => r.event_id)).toEqual([2])
    feed.stop()
  })

  it('keeps what arrives after an empty seed', async () => {
    queryLog.mockResolvedValueOnce({ records: [] })
    const feed = tail({ history: false })
    await settle()

    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(feed.rows.value.map((r) => r.event_id)).toEqual([1])
    feed.stop()
  })

  it('hides a seed that lands while paused', async () => {
    let resolveSeed
    queryLog.mockReturnValueOnce(new Promise((resolve) => (resolveSeed = resolve)))
    const feed = tail({ history: false })
    feed.pause()
    resolveSeed({ records: [{ event_id: 1 }] })
    await settle()

    expect(feed.pendingCount.value).toBe(0)
    feed.stop()
  })

  it('hides the seed again after a restart', async () => {
    const enabled = ref(true)
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    const feed = tail({ history: false, enabled })
    await settle()

    enabled.value = false
    await nextTick()
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 2 }] })
    enabled.value = true
    await settle()

    expect(feed.rows.value).toEqual([])
    feed.stop()
  })

  it('hides a seed that only lands on the retry after a transient failure', async () => {
    queryLog.mockRejectedValueOnce(apiError('Bad Gateway', 502))
    const feed = tail({ history: false })
    await settle()

    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(queryLog).toHaveBeenCalledTimes(2)
    expect(feed.rows.value).toEqual([])
    feed.stop()
  })
})

describe('useLogLiveTail timestamp cursor wire format', () => {
  it('never puts milliseconds in the cursor filter', async () => {
    queryLog.mockResolvedValueOnce({
      records: [{ msg: 'a', timestamp: '2026-08-19T10:00:05.123Z' }],
    })
    const feed = tail({ recordIdColumn: null, timeColumn: 'timestamp' })
    await settle()

    queryLog.mockResolvedValueOnce({ records: [] })
    vi.advanceTimersByTime(3000)
    await settle()

    const cursor = queryLog.mock.calls[1][1].filters[0].value
    expect(cursor).not.toMatch(/\.\d/)
    expect(cursor).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    feed.stop()
  })
})

// The seed is history and must not flash as arrivals on mount.
describe('useLogLiveTail arrival marking', () => {
  it('stamps rows that arrive live and leaves the seed unstamped', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    const feed = tail()
    await settle()

    expect(feed.rows.value[0].arrivedAt).toBeNull()

    queryLog.mockResolvedValueOnce({ records: [{ event_id: 2 }] })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(feed.rows.value[0].arrivedAt).toEqual(expect.any(Number))
    expect(feed.rows.value[1].arrivedAt).toBeNull()
    feed.stop()
  })

  it('re-stamps rows released from pause', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    const feed = tail()
    await settle()

    feed.pause()
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 2 }] })
    vi.advanceTimersByTime(3000)
    await settle()

    const heldAt = Date.now()
    vi.advanceTimersByTime(60_000)
    feed.resume()

    expect(feed.rows.value[0].arrivedAt).toBeGreaterThan(heldAt)
    feed.stop()
  })
})

// Past a full page, the rest is older than what came back, so the tail reads downwards until
// a page comes back short.
describe('useLogLiveTail catching up on a burst', () => {
  /** `records` newest-first, as the server returns them. */
  function page(from, count) {
    return Array.from({ length: count }, (_, i) => ({ event_id: from - i }))
  }

  /** Serves `available` (newest first) the way the server pages it: cursor filters, then limit. */
  function serve(available) {
    queryLog.mockImplementation(async (_name, body) => {
      let records = available.value
      for (const f of body.filters ?? []) {
        if (f.type === 'greater') records = records.filter((r) => r.event_id > f.value)
        if (f.type === 'less') records = records.filter((r) => r.event_id < f.value)
      }
      return { records: records.slice(0, body.limit) }
    })
  }

  it.each([true, false])(
    'catches up on a burst after an empty seed, with history %s',
    async (history) => {
      const available = ref([])
      serve(available)
      const feed = tail({ history })
      await settle()

      available.value = page(250, 250)
      vi.advanceTimersByTime(3000)
      await settle()

      expect(feed.rows.value).toHaveLength(250)
      expect(feed.rows.value.every((r) => typeof r.arrivedAt === 'number')).toBe(true)

      vi.advanceTimersByTime(3000)
      await settle()
      expect(queryLog.mock.calls.at(-1)[1].filters).toEqual([
        { column: 'event_id', type: 'greater', value: 250 },
      ])
      feed.stop()
    },
  )

  it('does not page below the seed, which is the newest page by definition', async () => {
    queryLog.mockResolvedValueOnce({ records: page(100, 100) })
    const feed = tail()
    await settle()

    expect(queryLog).toHaveBeenCalledTimes(1)
    feed.stop()
  })

  it('keeps reading older pages until one comes back short', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    const feed = tail()
    await settle()

    queryLog.mockResolvedValueOnce({ records: page(250, 100) })
    queryLog.mockResolvedValueOnce({ records: page(150, 100) })
    queryLog.mockResolvedValueOnce({ records: page(50, 49) })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(queryLog).toHaveBeenCalledTimes(4)
    // Bounded above by the oldest row already read, and still above the cursor.
    expect(queryLog.mock.calls[2][1].filters).toEqual([
      { column: 'event_id', type: 'greater', value: 1 },
      { column: 'event_id', type: 'less', value: 151 },
    ])
    expect(feed.rows.value).toHaveLength(250)
    feed.stop()
  })

  it('advances the cursor to the newest row read, not the oldest', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    const feed = tail()
    await settle()

    queryLog.mockResolvedValueOnce({ records: page(201, 100) })
    queryLog.mockResolvedValueOnce({ records: page(101, 2) })
    vi.advanceTimersByTime(3000)
    await settle()

    queryLog.mockResolvedValueOnce({ records: [] })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(queryLog.mock.calls[3][1].filters).toEqual([
      { column: 'event_id', type: 'greater', value: 201 },
    ])
    feed.stop()
  })

  it('keeps the whole boundary second when paging on a timestamp', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ msg: 'a', timestamp: '2026-08-19T10:00:00Z' }] })
    const feed = tail({ recordIdColumn: null, timeColumn: 'timestamp' })
    await settle()

    queryLog.mockResolvedValueOnce({
      records: Array.from({ length: 100 }, (_, i) => ({
        msg: `b${i}`,
        timestamp: '2026-08-19T10:00:30Z',
      })),
    })
    queryLog.mockResolvedValueOnce({ records: [] })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(queryLog.mock.calls[2][1].filters[1]).toEqual({
      column: 'timestamp',
      type: 'less',
      value: '2026-08-19T10:00:31Z',
    })
    feed.stop()
  })

  // The inclusive upper bound repeats a page when one second holds more rows than fit in one.
  it('stops paging when a page brings nothing new', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ msg: 'a', timestamp: '2026-08-19T10:00:00Z' }] })
    const feed = tail({ recordIdColumn: null, timeColumn: 'timestamp' })
    await settle()

    const burst = Array.from({ length: 100 }, (_, i) => ({
      msg: `b${i}`,
      timestamp: '2026-08-19T10:00:30Z',
    }))
    queryLog.mockResolvedValue({ records: burst })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(queryLog).toHaveBeenCalledTimes(3)
    feed.stop()
  })

  it('stops paging after a fixed number of requests however large the buffer', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    const feed = tail({ bufferLimit: 100_000 })
    await settle()

    // Distinct pages every time, so nothing but the cap can end the catch-up.
    let top = 100_000
    queryLog.mockImplementation(() => {
      const records = page(top, 100)
      top -= 100
      return Promise.resolve({ records })
    })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(queryLog).toHaveBeenCalledTimes(1 + 1 + 8)
    feed.stop()
  })

  it('stops paging once the poll has filled the buffer', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ event_id: 1 }] })
    const feed = tail({ bufferLimit: 150 })
    await settle()

    queryLog.mockResolvedValue({ records: page(1000, 100) })
    vi.advanceTimersByTime(3000)
    await settle()

    // One page short of the limit, one that reaches it, and no more.
    expect(queryLog).toHaveBeenCalledTimes(3)
    feed.stop()
  })
})

describe('useLogLiveTail dedupe bounds', () => {
  it('forgets rows that have already dropped out of the buffer', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ msg: 'a', timestamp: '2026-08-19T10:00:00Z' }] })
    const feed = tail({ recordIdColumn: null, timeColumn: 'timestamp', bufferLimit: 2 })
    await settle()

    queryLog.mockResolvedValueOnce({
      records: [
        { msg: 'c', timestamp: '2026-08-19T10:00:02Z' },
        { msg: 'b', timestamp: '2026-08-19T10:00:01Z' },
      ],
    })
    vi.advanceTimersByTime(3000)
    await settle()
    expect(feed.rows.value.map((r) => r.msg)).toEqual(['c', 'b'])

    // Byte-identical to 'a', whose key went with it when it left the buffer.
    queryLog.mockResolvedValueOnce({
      records: [{ msg: 'a', timestamp: '2026-08-19T10:00:00Z' }],
    })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(feed.rows.value.map((r) => r.msg)).toEqual(['a', 'c'])
    feed.stop()
  })

  // A page can be larger than the buffer; the newest keys must survive, since the cursor
  // overlap offers those rows again on the next poll.
  it('keeps the keys of the rows it is still showing when one page overflows the set', async () => {
    queryLog.mockResolvedValueOnce({
      records: [
        { msg: 'c', timestamp: '2026-08-19T10:00:03Z' },
        { msg: 'b', timestamp: '2026-08-19T10:00:02Z' },
        { msg: 'a', timestamp: '2026-08-19T10:00:01Z' },
      ],
    })
    const feed = tail({ recordIdColumn: null, timeColumn: 'timestamp', bufferLimit: 2 })
    await settle()
    expect(feed.rows.value.map((r) => r.msg)).toEqual(['c', 'b'])

    // The overlap the backed-off cursor creates: both rows come back, neither is new.
    queryLog.mockResolvedValueOnce({
      records: [
        { msg: 'c', timestamp: '2026-08-19T10:00:03Z' },
        { msg: 'b', timestamp: '2026-08-19T10:00:02Z' },
      ],
    })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(feed.rows.value.map((r) => r.msg)).toEqual(['c', 'b'])
    feed.stop()
  })

  it('still suppresses a row it is holding when the cursor overlap re-offers it', async () => {
    queryLog.mockResolvedValueOnce({ records: [{ msg: 'a', timestamp: '2026-08-19T10:00:05Z' }] })
    const feed = tail({ recordIdColumn: null, timeColumn: 'timestamp', bufferLimit: 2 })
    await settle()

    queryLog.mockResolvedValueOnce({
      records: [{ msg: 'a', timestamp: '2026-08-19T10:00:05Z' }],
    })
    vi.advanceTimersByTime(3000)
    await settle()

    expect(feed.rows.value.map((r) => r.msg)).toEqual(['a'])
    feed.stop()
  })
})
