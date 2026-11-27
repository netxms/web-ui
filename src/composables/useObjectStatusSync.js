import { watch, onScopeDispose } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { getObject } from '@/api/objectsApi'
import { useAlarms } from '@/queries/useAlarmQueries'
import {
  statusAffectingSources,
  collectAncestorIds,
  collectObjectIds,
  patchStatuses,
} from '@/utils/objectStatusSync'

// The WebAPI does not push object changes, and the object tree is cached for minutes, so
// without this a node's status in the tree and header lags its alarms until a reload.
// Mounted once, from DefaultLayout.

/** Beyond this many objects to reread (a link flap), the cached lists are refetched instead. */
export const MAX_STATUS_READS = 100

/** Object caches whose entries carry `status`, raw or adapted, flat or nested in `children`. */
const STATUS_CACHES = new Set(['subTree', 'children', 'list', 'delegated'])

const isStatusCache = (query) =>
  query.queryKey[0] === 'objects' && STATUS_CACHES.has(query.queryKey[1])
const isDetail = (query) => query.queryKey[0] === 'objects' && query.queryKey[1] === 'detail'

export function useObjectStatusSync() {
  const queryClient = useQueryClient()
  const { data } = useAlarms()
  let previous = null
  let pending = new Set()
  let running = false
  let stopped = false

  watch(data, (alarms) => {
    if (!alarms) {
      previous = null
      return
    }
    if (previous) {
      for (const id of statusAffectingSources(previous, alarms)) pending.add(id)
    }
    previous = alarms
    schedule()
  })

  onScopeDispose(() => {
    stopped = true
  })

  // One refresh at a time; sources that change meanwhile go in the next one.
  function schedule() {
    if (running || stopped || pending.size === 0) return
    const sources = pending
    pending = new Set()
    running = true
    refreshObjectStatuses(queryClient, sources)
      .catch(() => {})
      .finally(() => {
        running = false
        schedule()
      })
  }
}

/**
 * Rereads `sources` and their ancestors in the cached trees (status propagates up), as far as
 * any of them is cached, and writes the statuses into every cached copy.
 *
 * @param {import('@tanstack/vue-query').QueryClient} queryClient
 * @param {Set<number>} sources
 */
export async function refreshObjectStatuses(queryClient, sources) {
  const cache = queryClient.getQueryCache()
  const withData = (predicate) =>
    cache.findAll({ predicate: (query) => predicate(query) && query.state.data != null })

  const targets = new Set(sources)
  const cached = new Set()
  for (const query of withData(isStatusCache)) {
    if (query.queryKey[1] === 'subTree') {
      collectAncestorIds(query.state.data, query.queryKey[2], sources, targets)
    }
    collectObjectIds(query.state.data, cached)
  }
  // Route params give string ids, so `detail('15')` and `detail(15)` are both possible.
  for (const query of withData(isDetail)) cached.add(Number(query.queryKey[2]))

  const ids = [...targets].filter((id) => cached.has(id))
  if (ids.length === 0) return

  if (ids.length > MAX_STATUS_READS) {
    await queryClient.invalidateQueries({
      predicate: (query) =>
        isStatusCache(query) || (isDetail(query) && targets.has(Number(query.queryKey[2]))),
    })
    return
  }

  const startedAt = Date.now()
  const results = await Promise.allSettled(
    ids.map((id) => getObject(id, { priority: 'background' })),
  )
  const docs = new Map()
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) docs.set(ids[index], result.value)
  })
  if (docs.size === 0) return
  const statusById = new Map([...docs].map(([id, doc]) => [id, doc.status]))

  // A cache entry refetched while these reads were out is newer than they are.
  for (const query of withData(isStatusCache)) {
    if (query.state.dataUpdatedAt > startedAt) continue
    const patched = patchStatuses(query.state.data, statusById)
    // The rest of the entry is as old as before, so it keeps its age and refetches on schedule.
    if (patched !== query.state.data) {
      queryClient.setQueryData(query.queryKey, patched, { updatedAt: query.state.dataUpdatedAt })
    }
  }
  for (const query of withData(isDetail)) {
    const doc = docs.get(Number(query.queryKey[2]))
    if (doc && query.state.dataUpdatedAt <= startedAt) queryClient.setQueryData(query.queryKey, doc)
  }
}
