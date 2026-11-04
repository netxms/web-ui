import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as incidentsApi from '@/api/incidentsApi'
import { alarmKeys } from './useAlarmQueries'
import { REALTIME_TIER, MODERATE_TIER } from './config'

export const incidentKeys = {
  all: () => ['incidents'],
  list: (params) => ['incidents', 'list', params],
  detail: (id) => ['incidents', 'detail', id],
  activity: (id) => ['incidents', 'detail', id, 'activity'],
}

/**
 * Comments and linked alarms arrive only with the detail (server IncidentSummary/Incident).
 *
 * @param {import('vue').MaybeRefOrGetter} [params] - `{ objectId }` to scope to one object
 */
export function useIncidents(params) {
  return useQuery({
    queryKey: computed(() => incidentKeys.list(toValue(params))),
    queryFn: () => incidentsApi.getIncidents(toValue(params) || {}),
    ...REALTIME_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} id
 */
export function useIncident(id) {
  return useQuery({
    queryKey: computed(() => incidentKeys.detail(toValue(id))),
    queryFn: () => incidentsApi.getIncident(toValue(id)),
    enabled: computed(() => toValue(id) != null),
    ...REALTIME_TIER,
  })
}

/**
 * Created, state changes, assignment, alarm links.
 * @param {import('vue').MaybeRefOrGetter} id
 */
export function useIncidentActivity(id) {
  return useQuery({
    queryKey: computed(() => incidentKeys.activity(toValue(id))),
    queryFn: () => incidentsApi.getIncidentActivity(toValue(id)),
    enabled: computed(() => toValue(id) != null),
    ...MODERATE_TIER,
  })
}

/**
 * Invalidates the whole incidents cache, and seeds the detail cache from the server's answer
 * (the updated incident) so the open detail repaints without waiting.
 */
function useIncidentMutation(mutationFn, { invalidateAlarms = false } = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (incident) => {
      if (incident?.id != null) {
        queryClient.setQueryData(incidentKeys.detail(incident.id), incident)
      }
      queryClient.invalidateQueries({ queryKey: incidentKeys.all() })
      // Resolving or closing an incident resolves or terminates its linked alarms.
      if (invalidateAlarms) {
        queryClient.invalidateQueries({ queryKey: alarmKeys.all() })
      }
    },
  })
}

/** Pass `sourceAlarmId` to link the alarm it was raised from. */
export function useCreateIncident() {
  return useIncidentMutation((body) => incidentsApi.createIncident(body))
}

/** The only editable field, per CMD_UPDATE_INCIDENT. */
export function useUpdateIncidentTitle() {
  return useIncidentMutation(({ incidentId, title }) =>
    incidentsApi.updateIncident(incidentId, { title }),
  )
}

/** `comment` is required for the blocked state; elsewhere it is appended as a normal comment. */
export function useChangeIncidentState() {
  return useIncidentMutation(
    ({ incidentId, state, comment }) =>
      incidentsApi.changeIncidentState(incidentId, { state, comment }),
    { invalidateAlarms: true },
  )
}

/** User id 0 clears the assignment. */
export function useAssignIncident() {
  return useIncidentMutation(({ incidentId, userId }) =>
    incidentsApi.assignIncident(incidentId, { userId }),
  )
}

/** Incident comments are add-only: the server has no update or delete. */
export function useAddIncidentComment() {
  return useIncidentMutation(({ incidentId, text }) =>
    incidentsApi.addIncidentComment(incidentId, { text }),
  )
}
