import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as alarmsApi from '@/api/alarmsApi'
import { REALTIME_TIER, MODERATE_TIER } from './config'

export const alarmKeys = {
  all: () => ['alarms'],
  list: (params) => ['alarms', 'list', params],
  detail: (id) => ['alarms', 'detail', id],
  comments: (id) => ['alarms', 'detail', id, 'comments'],
  events: (id) => ['alarms', 'detail', id, 'events'],
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
