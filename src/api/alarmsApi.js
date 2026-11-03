import { get, post, put, del } from './client'

/**
 * One entry of `GET /v1/alarms`, with the server's wire names (no normalization layer): the
 * current severity is `severity`, the source name `sourceName`, and ack/resolve users arrive as
 * names. `GET /v1/alarms/{id}` is a different shape (numeric user ids, no `sourceName` or
 * `commentCount`, plus event and rule details); AlarmDetailsView merges the two.
 *
 * @typedef {object} AlarmListEntry
 * @property {number} id
 * @property {number} severity - current severity, 0=Normal .. 4=Critical
 * @property {number} state - 0=Outstanding, 1=Acknowledged, 2=Resolved, 3=Terminated
 * @property {number} source - source object id
 * @property {string} sourceName - source object name
 * @property {number} zoneUIN
 * @property {string} message
 * @property {number} repeatCount
 * @property {number} commentCount
 * @property {string} helpdeskReference
 * @property {string} creationTime
 * @property {string} lastChangeTime
 * @property {string} ackByUserName - '' when not acknowledged
 * @property {string} resolvedByUserName - '' when not resolved
 * @property {Array} categories
 * @property {object} [sourceObject] - only with `includeObjectDetails`
 */

/**
 * The server reads only `rootObject` and `includeObjectDetails` and returns the whole list for
 * the subtree (no paging); state and severity are filtered client-side in `useAlarms()`.
 *
 * @param {object} [params]
 * @param {number} [params.rootObject] - restrict to a subtree; 0 or absent means all
 * @param {boolean} [params.includeObjectDetails] - embed full source object details
 */
export function getAlarms(params = {}) {
  const query = new URLSearchParams()
  if (params.rootObject != null) query.set('rootObject', params.rootObject)
  if (params.includeObjectDetails != null) {
    query.set('includeObjectDetails', params.includeObjectDetails)
  }

  const qs = query.toString()
  return get(`/v1/alarms${qs ? `?${qs}` : ''}`)
}

export function getAlarm(id) {
  return get(`/v1/alarms/${id}`)
}

export function acknowledgeAlarm(id) {
  return post(`/v1/alarms/${id}/acknowledge`)
}

export function resolveAlarm(id) {
  return post(`/v1/alarms/${id}/resolve`)
}

export function terminateAlarm(id) {
  return post(`/v1/alarms/${id}/terminate`)
}

export function getAlarmComments(id) {
  return get(`/v1/alarms/${id}/comments`)
}

export function createAlarmComment(id, text) {
  return post(`/v1/alarms/${id}/comments`, { text })
}

export function updateAlarmComment(id, commentId, text) {
  return put(`/v1/alarms/${id}/comments/${commentId}`, { text })
}

export function deleteAlarmComment(id, commentId) {
  return del(`/v1/alarms/${id}/comments/${commentId}`)
}

// Related events require system-wide "view event log" access on top of read access to
// the alarm; a lacking user gets 403, which the details view renders inline (no toast).
export function getAlarmEvents(id) {
  return get(`/v1/alarms/${id}/events`, { suppressForbidden: true })
}
