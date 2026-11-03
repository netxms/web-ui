import { computed, toValue } from 'vue'
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/vue-query'
import * as logsApi from '@/api/logsApi'
import { adaptBaseObject } from '@/api/objectAdapters'
import { DEFAULT_PAGE_SIZE } from '@/utils/logQueryModel'
import { MODERATE_TIER, STATIC_TIER, VOLATILE_TIER } from './config'

/** Server-side cap: `offset` + `limit` may not exceed this (MAX_LOG_QUERY_WINDOW). */
export const MAX_LOG_QUERY_WINDOW = 100000

export const logKeys = {
  all: () => ['logs'],
  list: () => ['logs', 'list'],
  schema: (name) => ['logs', 'schema', name],
  query: (name, request) => ['logs', 'query', name, request],
  record: (name, recordId) => ['logs', 'record', name, recordId],
}

/** Access filtering is server-side, so this list decides what the catalog and sidebar show. */
export function useLogs() {
  return useQuery({
    queryKey: logKeys.list(),
    queryFn: () => logsApi.getLogs(),
    ...STATIC_TIER,
  })
}

/**
 * Static for the lifetime of a server.
 *
 * @param {import('vue').MaybeRefOrGetter<string|null>} name
 */
export function useLogSchema(name) {
  return useQuery({
    queryKey: computed(() => logKeys.schema(toValue(name))),
    queryFn: () => logsApi.getLogDetails(toValue(name)),
    enabled: computed(() => !!toValue(name)),
    ...STATIC_TIER,
  })
}

/**
 * The API returns no total row count, so another page is assumed whenever the server filled
 * the requested limit, up to the server's paging window.
 *
 * @param {import('vue').MaybeRefOrGetter<string|null>} name
 * @param {import('vue').MaybeRefOrGetter<object|null>} request - body without `offset`
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 */
export function useLogQuery(name, request, options = {}) {
  const { enabled = true } = options

  return useInfiniteQuery({
    queryKey: computed(() => logKeys.query(toValue(name), toValue(request))),
    queryFn: ({ pageParam }) =>
      logsApi.queryLog(toValue(name), { ...toValue(request), offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      const limit = toValue(request)?.limit ?? DEFAULT_PAGE_SIZE
      if (lastPage.count < limit) return undefined
      const next = lastPageParam + lastPage.count
      return next + limit <= MAX_LOG_QUERY_WINDOW ? next : undefined
    },
    enabled: computed(() => !!toValue(name) && !!toValue(request) && !!toValue(enabled)),
    ...MODERATE_TIER,
    refetchOnWindowFocus: false,
  })
}

/**
 * Single record including the `detail` columns that query results omit.
 *
 * @param {import('vue').MaybeRefOrGetter<string|null>} name
 * @param {import('vue').MaybeRefOrGetter<number|string|null>} recordId
 */
export function useLogRecord(name, recordId) {
  return useQuery({
    queryKey: computed(() => logKeys.record(toValue(name), toValue(recordId))),
    queryFn: () => logsApi.getLogRecord(toValue(name), toValue(recordId)),
    enabled: computed(() => !!toValue(name) && toValue(recordId) != null),
    ...STATIC_TIER,
  })
}

/** A mutation: fired from a menu action and shown once, not cached. */
export function useLogQuerySql() {
  return useMutation({
    mutationFn: ({ name, request }) => logsApi.getLogQuerySql(name, request),
  })
}

/**
 * There is no `/v1/events`: this is an EventLog query through the generic log API. Column names
 * are the `EventLog` entry in the server's `s_logs[]`.
 *
 * @param {import('vue').MaybeRefOrGetter<number>} [limit]
 */
export function useRecentEvents(limit = 10) {
  const request = computed(() => ({
    filters: [],
    orderBy: [{ column: 'event_timestamp', descending: true }],
    offset: 0,
    limit: toValue(limit),
  }))

  return useQuery({
    queryKey: computed(() => logKeys.query(RECENT_EVENTS_LOG, request.value)),
    queryFn: () => logsApi.queryLog(RECENT_EVENTS_LOG, request.value),
    select: adaptRecentEvents,
    ...VOLATILE_TIER,
  })
}

const RECENT_EVENTS_LOG = 'EventLog'

/**
 * Source names come from the response's `resolvedValues`; ids the caller cannot read are
 * omitted there, so the name falls back to the bare id.
 *
 * @param {{records?: object[], resolvedValues?: {objects?: Record<string, object>}}} page
 */
export function adaptRecentEvents(page) {
  const objects = page?.resolvedValues?.objects ?? {}
  return (page?.records ?? []).map((record) => {
    const source = objects[record.event_source] ?? null
    return {
      id: record.event_id,
      timestamp: record.event_timestamp,
      severity: record.event_severity,
      message: record.event_message ?? '',
      sourceObject: source ? adaptBaseObject(source) : null,
      sourceObjectName: source?.name ?? (record.event_source ? `[${record.event_source}]` : ''),
    }
  })
}
