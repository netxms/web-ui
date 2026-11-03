import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/vue-query'
import { queryClient, resyncAfterReconnect } from '../config'

const retry = queryClient.getDefaultOptions().queries.retry

describe('default retry policy', () => {
  it.each([401, 403, 404])('never retries a deterministic %i', (status) => {
    expect(retry(0, { status })).toBe(false)
  })

  // A 502/503/504 means the server is already saturated; connectionStore recovers with one probe.
  it.each([502, 503, 504])('never retries gateway failure %i', (status) => {
    expect(retry(0, { status })).toBe(false)
  })

  it('still retries errors that may be transient', () => {
    expect(retry(0, { status: 500 })).toBe(true)
    expect(retry(1, { status: 500 })).toBe(true)
    expect(retry(2, { status: 500 })).toBe(false)
  })

  it('retries a network error, which carries no status', () => {
    expect(retry(0, { status: 0 })).toBe(true)
    expect(retry(0, undefined)).toBe(true)
  })
})

describe('resyncAfterReconnect', () => {
  /**
   * `count` mounted queries that already hold data. The initial fetch is awaited before the
   * caller installs its spies, so observed calls come from the resync alone.
   */
  async function clientWithQueries(count) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const observers = []
    for (let i = 0; i < count; i++) {
      const observer = new QueryObserver(client, {
        queryKey: ['thing', i],
        queryFn: () => Promise.resolve(i),
        staleTime: 60_000,
      })
      observer.subscribe(() => {})
      observers.push(observer)
    }
    await Promise.all(observers.map((observer) => observer.refetch()))
    return { client, observers }
  }

  it('refetches every mounted query when no outage start is known', async () => {
    const { client } = await clientWithQueries(10)
    const refetchQueries = vi.spyOn(client, 'refetchQueries').mockResolvedValue(undefined)

    await resyncAfterReconnect(client)

    // One targeted refetch per active query, rather than one cache-wide refetch storm.
    expect(refetchQueries).toHaveBeenCalledTimes(10)
    for (const call of refetchQueries.mock.calls) {
      expect(call[0]).toMatchObject({ exact: true })
      // A query that started fetching since must not be cancelled and started again.
      expect(call[1]).toMatchObject({ cancelRefetch: false })
    }
  })

  it('keeps data that arrived after the outage began', async () => {
    const { client } = await clientWithQueries(4)
    const [before, , after] = client.getQueryCache().getAll()
    const outageStartedAt = Date.now()
    before.setState({ dataUpdatedAt: outageStartedAt - 1000 })
    after.setState({ dataUpdatedAt: outageStartedAt + 1000 })
    for (const query of client.getQueryCache().getAll()) {
      if (query !== before && query !== after) query.setState({ dataUpdatedAt: outageStartedAt })
    }
    const refetchQueries = vi.spyOn(client, 'refetchQueries').mockResolvedValue(undefined)

    await resyncAfterReconnect(client, { outageStartedAt })

    const refetched = refetchQueries.mock.calls.map((call) => call[0].queryKey)
    expect(refetched).toEqual([before.queryKey])
    expect(after.isStale()).toBe(false)
  })

  it('refetches a query that failed during the outage', async () => {
    const { client } = await clientWithQueries(1)
    const [query] = client.getQueryCache().getAll()
    const outageStartedAt = Date.now()
    query.setState({
      dataUpdatedAt: outageStartedAt - 5000,
      status: 'error',
      errorUpdatedAt: outageStartedAt + 10,
    })
    const refetchQueries = vi.spyOn(client, 'refetchQueries').mockResolvedValue(undefined)

    await resyncAfterReconnect(client, { outageStartedAt })

    expect(refetchQueries).toHaveBeenCalledTimes(1)
  })

  it('leaves a query that is already fetching alone', async () => {
    const { client } = await clientWithQueries(2)
    const [fetching] = client.getQueryCache().getAll()
    const outageStartedAt = Date.now() + 60_000 // every query's data predates it
    fetching.setState({ fetchStatus: 'fetching' })
    const refetchQueries = vi.spyOn(client, 'refetchQueries').mockResolvedValue(undefined)

    await resyncAfterReconnect(client, { outageStartedAt })

    const refetched = refetchQueries.mock.calls.map((call) => call[0].queryKey)
    expect(refetched).not.toContainEqual(fetching.queryKey)
    expect(refetched).toHaveLength(1)
  })

  it('keeps at most a few refetches in flight at a time', async () => {
    const { client } = await clientWithQueries(12)
    let inFlight = 0
    let peak = 0
    vi.spyOn(client, 'refetchQueries').mockImplementation(async () => {
      peak = Math.max(peak, ++inFlight)
      await new Promise((resolve) => setTimeout(resolve, 0))
      inFlight--
    })

    await resyncAfterReconnect(client)

    expect(client.refetchQueries).toHaveBeenCalledTimes(12)
    expect(peak).toBeGreaterThan(0)
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('does nothing to refetch when no query is mounted', async () => {
    const client = new QueryClient()
    const refetchQueries = vi.spyOn(client, 'refetchQueries')

    await resyncAfterReconnect(client)

    expect(refetchQueries).not.toHaveBeenCalled()
  })
})
