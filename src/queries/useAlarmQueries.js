import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as alarmsApi from '@/api/alarmsApi'
import { mapConcurrent } from '@/utils/concurrencyLimit'
import { REALTIME_TIER, MODERATE_TIER, STATIC_TIER } from './config'

export const alarmKeys = {
  all: () => ['alarms'],
  list: (params) => ['alarms', 'list', params],
  detail: (id) => ['alarms', 'detail', id],
  comments: (id) => ['alarms', 'detail', id, 'comments'],
  events: (id) => ['alarms', 'detail', id, 'events'],
  // Not under `all()`: every state change invalidates that, and this list is heavy.
  sourceObjects: () => ['alarmSourceObjects'],
}

/**
 * `GET /v1/alarms` honours only `rootObject` and `includeObjectDetails`; `state` and `severity`
 * are filtered client-side and kept out of the query key, so consumers of the same subtree
 * share one cached list and one poll.
 */
export function splitAlarmParams(params) {
  const { rootObject, includeObjectDetails, state, severity } = params ?? {}
  return {
    server: {
      ...(rootObject != null ? { rootObject } : {}),
      ...(includeObjectDetails != null ? { includeObjectDetails } : {}),
    },
    client: { state, severity },
  }
}

export function applyAlarmFilters(alarms, { state, severity }) {
  if (!alarms) return alarms
  let list = alarms
  // 0=Outstanding, 1=Acknowledged, 2=Resolved, 3=Terminated
  if (state != null) list = list.filter((a) => a.state === state)
  if (severity != null) list = list.filter((a) => a.severity === severity)
  return list
}

/**
 * No server-side paging: each call fetches the whole list for its subtree.
 *
 * @param {import('vue').MaybeRefOrGetter} [params]
 * @param {number} [params.rootObject] - restrict to a subtree
 * @param {number} [params.state] - client-side
 * @param {number} [params.severity] - client-side
 * @param {object} [options]
 * @param {import('vue').MaybeRefOrGetter<boolean>} [options.enabled]
 */
export function useAlarms(params, options = {}) {
  const { enabled } = options
  const split = computed(() => splitAlarmParams(toValue(params)))

  const query = useQuery({
    queryKey: computed(() => alarmKeys.list(split.value.server)),
    queryFn: () => alarmsApi.getAlarms(split.value.server),
    ...REALTIME_TIER,
    ...(enabled === undefined ? {} : { enabled: computed(() => !!toValue(enabled)) }),
  })

  // Not in `select`: it is memoized on data and function identity, so a change to the client
  // filters alone would not re-run it.
  const data = computed(() => applyAlarmFilters(query.data.value, split.value.client))

  return { ...query, data }
}

/**
 * Full detail (alarm key, originating rule/event, related DCI, ...).
 * @param {import('vue').MaybeRefOrGetter} id
 */
export function useAlarm(id) {
  return useQuery({
    queryKey: computed(() => alarmKeys.detail(toValue(id))),
    queryFn: () => alarmsApi.getAlarm(toValue(id)),
    enabled: computed(() => toValue(id) != null),
    ...REALTIME_TIER,
  })
}

/**
 * The source object of every alarm, by object id, for its icon: list entries have no class or
 * category. `includeObjectDetails` adds them but makes the list far heavier, so this is read on
 * the static tier and not with each poll. A source newer than this answer is not in the map.
 */
export function useAlarmSourceObjects() {
  return useQuery({
    queryKey: alarmKeys.sourceObjects(),
    queryFn: () => alarmsApi.getAlarms({ includeObjectDetails: true }),
    select: (alarms) =>
      new Map(
        alarms
          .filter((alarm) => alarm.sourceObject)
          .map((alarm) => [alarm.source, alarm.sourceObject]),
      ),
    ...STATIC_TIER,
  })
}

/**
 * The alarm's DCI id, 0 for none. Only the details have it. For a menu, so without the polling
 * of `useAlarm`.
 *
 * @param {import('vue').MaybeRefOrGetter} id
 */
export function useAlarmDci(id) {
  return useQuery({
    queryKey: computed(() => alarmKeys.detail(toValue(id))),
    queryFn: () => alarmsApi.getAlarm(toValue(id)),
    enabled: computed(() => toValue(id) != null),
    select: (alarm) => alarm?.dci ?? 0,
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} id
 */
export function useAlarmComments(id) {
  return useQuery({
    queryKey: computed(() => alarmKeys.comments(toValue(id))),
    queryFn: () => alarmsApi.getAlarmComments(toValue(id)),
    enabled: computed(() => toValue(id) != null),
    ...MODERATE_TIER,
  })
}

/**
 * Flat list, newest first, correlation via parentId. Needs "view event log" access.
 * @param {import('vue').MaybeRefOrGetter} id
 */
export function useAlarmEvents(id) {
  return useQuery({
    queryKey: computed(() => alarmKeys.events(toValue(id))),
    queryFn: () => alarmsApi.getAlarmEvents(toValue(id)),
    enabled: computed(() => toValue(id) != null),
    // 403 is a terminal answer.
    retry: (failureCount, error) => error?.status !== 403 && failureCount < 2,
    ...MODERATE_TIER,
  })
}

export function useCreateAlarmComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ alarmId, text }) => alarmsApi.createAlarmComment(alarmId, text),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alarmKeys.all() }),
  })
}

export function useUpdateAlarmComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ alarmId, commentId, text }) =>
      alarmsApi.updateAlarmComment(alarmId, commentId, text),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alarmKeys.all() }),
  })
}

export function useDeleteAlarmComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ alarmId, commentId }) => alarmsApi.deleteAlarmComment(alarmId, commentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alarmKeys.all() }),
  })
}

export function useAcknowledgeAlarm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (alarmId) => alarmsApi.acknowledgeAlarm(alarmId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alarmKeys.all() }),
  })
}

export function useResolveAlarm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (alarmId) => alarmsApi.resolveAlarm(alarmId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alarmKeys.all() }),
  })
}

export function useTerminateAlarm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (alarmId) => alarmsApi.terminateAlarm(alarmId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: alarmKeys.all() }),
  })
}

const ALARM_ACTION_REQUESTS = {
  acknowledge: (id, options) => alarmsApi.acknowledgeAlarm(id, options),
  resolve: (id, options) => alarmsApi.resolveAlarm(id, options),
  terminate: (id, options) => alarmsApi.terminateAlarm(id, options),
}

/**
 * A state change on any number of alarms. The WebAPI has no bulk route, so this is one request
 * per alarm, settled each, with one list refetch at the end. Refusals come back in `failed`
 * rather than as the client's 403 toast, which would stack one per alarm.
 *
 * @returns mutation taking `{ action: 'acknowledge'|'resolve'|'terminate', ids: number[],
 *   onProgress?: (done: number) => void }` and resolving to
 *   `{ succeeded: number[], failed: Array<{ id: number, error: Error }> }`
 */
export function useAlarmBulkAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ action, ids, onProgress }) => {
      const succeeded = []
      const failed = []
      let done = 0
      await mapConcurrent(ids, async (id) => {
        try {
          await ALARM_ACTION_REQUESTS[action](id, { suppressForbidden: true })
          succeeded.push(id)
        } catch (error) {
          failed.push({ id, error })
        }
        onProgress?.(++done)
      })
      return { succeeded, failed }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: alarmKeys.all() }),
  })
}
