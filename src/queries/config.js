import { QueryClient } from '@tanstack/vue-query'
import { mapConcurrent } from '@/utils/concurrencyLimit'
import { SERVER_UNAVAILABLE_STATUSES } from '@/api/client'

/** Object tree structure, server info */
export const STATIC_TIER = {
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
}

/** Object details, properties */
export const MODERATE_TIER = {
  staleTime: 60 * 1000,
  gcTime: 15 * 60 * 1000,
  refetchOnWindowFocus: true,
}

/** DCI current values */
export const VOLATILE_TIER = {
  staleTime: 30 * 1000,
  gcTime: 5 * 60 * 1000,
  refetchOnWindowFocus: true,
  refetchInterval: 60 * 1000,
}

/** Alarms, events */
export const REALTIME_TIER = {
  staleTime: 0,
  gcTime: 2 * 60 * 1000,
  refetchOnWindowFocus: true,
  refetchInterval: 30 * 1000,
}

/**
 * The 5xx statuses come from the client because not retrying is only safe for those it
 * announces as `app:server-unavailable`: the reconnect probe brings the query back.
 */
export const NO_RETRY_STATUSES = new Set([401, 403, 404, ...SERVER_UNAVAILABLE_STATUSES])

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 401/403/404 are deterministic. 502/503/504 mean the server is already saturated, and
      // retrying grows the burst; `connectionStore` recovers with a single probe.
      retry: (failureCount, error) =>
        NO_RETRY_STATUSES.has(error?.status) ? false : failureCount < 2,
      refetchOnWindowFocus: false,
      staleTime: 60 * 1000,
    },
  },
})

/**
 * Queries are marked stale without fetching, and only what is on screen is refetched, a few at
 * a time: a refetch burst can knock a saturated server over again. Data newer than
 * `outageStartedAt` and queries already fetching are left alone.
 *
 * @param {import('@tanstack/vue-query').QueryClient} [client]
 * @param {object} [options]
 * @param {number} [options.outageStartedAt] - `Date.now()` when the outage was first
 *   reported; omitted, every query that is not fetching counts as stale
 */
export async function resyncAfterReconnect(client = queryClient, { outageStartedAt } = {}) {
  const cutoff = outageStartedAt ?? Infinity
  const predicate = (query) =>
    query.state.fetchStatus !== 'fetching' && query.state.dataUpdatedAt < cutoff
  client.invalidateQueries({ predicate, refetchType: 'none' })
  const stale = client.getQueryCache().findAll({ type: 'active', stale: true, predicate })
  await mapConcurrent(stale, (query) =>
    client.refetchQueries({ queryKey: query.queryKey, exact: true }, { cancelRefetch: false }),
  )
}

export const queryClientOptions = { queryClient }
export { queryClient }
