import { get, post, put } from './client'

/**
 * Incident management endpoints.
 *
 * Server-side semantics: closed is terminal, blocking requires a comment, one incident
 * per alarm, and resolve/close cascade to the linked alarms.
 *
 * Every mutation answers with the updated incident detail, so callers refresh from the
 * response instead of issuing a second GET.
 */

/**
 * @typedef {Object} IncidentSummary
 * @property {number} id
 * @property {number} state              0 open, 1 inProgress, 2 blocked, 3 resolved, 4 closed
 * @property {string} stateName
 * @property {string} title
 * @property {number} sourceObjectId
 * @property {string} sourceObjectName
 * @property {number} assignedUserId     0 when unassigned
 * @property {string|null} assignedUserName null when unassigned (see normalizeIncident)
 * @property {number} alarmCount
 * @property {string} creationTime       ISO timestamp
 * @property {string} lastChangeTime     ISO timestamp
 */

/**
 * @typedef {Object} IncidentComment
 * @property {number} id
 * @property {number} incidentId
 * @property {number} userId
 * @property {string} userName
 * @property {string} creationTime  ISO timestamp
 * @property {string} text
 * @property {boolean} aiGenerated
 */

/**
 * @typedef {IncidentSummary} Incident
 * @property {number} sourceAlarmId       0 when not created from an alarm
 * @property {number} createdByUser       0 when auto-created by an EPP rule
 * @property {string|null} createdByUserName
 * @property {number} resolvedByUser
 * @property {string|null} resolvedByUserName
 * @property {string|null} resolveTime
 * @property {number} closedByUser
 * @property {string|null} closedByUserName
 * @property {string|null} closeTime
 * @property {number[]} linkedAlarms
 * @property {IncidentComment[]} comments
 */

/**
 * @typedef {Object} IncidentActivityEntry
 * @property {number} id
 * @property {number} incidentId
 * @property {string} timestamp    ISO timestamp
 * @property {number} userId
 * @property {string|null} userName
 * @property {number} activityType 0 created, 1 stateChange, 2 assigned, 3 alarmLinked,
 *                                 4 alarmUnlinked, 5 commentAdded, 6 updated
 * @property {string|null} oldValue
 * @property {string|null} newValue
 * @property {string|null} details
 */

/** Incident lifecycle states, matching the server's IncidentState enum. */
export const INCIDENT_STATE = {
  OPEN: 0,
  IN_PROGRESS: 1,
  BLOCKED: 2,
  RESOLVED: 3,
  CLOSED: 4,
}

/** Activity types, matching the server's IncidentActivity constants. */
export const INCIDENT_ACTIVITY = {
  CREATED: 0,
  STATE_CHANGE: 1,
  ASSIGNED: 2,
  ALARM_LINKED: 3,
  ALARM_UNLINKED: 4,
  COMMENT_ADDED: 5,
  UPDATED: 6,
}

/**
 * Unassigned incidents (user id 0) arrive with `assignedUserName: "system"`, because the server
 * resolves id 0 to the built-in account; drop the name so every consumer treats them as
 * unassigned. The created/resolved/closed names stay: there 0 means the server did it.
 *
 * @template {{ assignedUserId?: number, assignedUserName?: string|null }} T
 * @param {T} incident
 * @returns {T}
 */
export function normalizeIncident(incident) {
  if (!incident || incident.assignedUserId) return incident
  return { ...incident, assignedUserName: null }
}

/**
 * List incidents, newest first. Closed incidents are included unless filtered out.
 *
 * @param {Object} [params]
 * @param {number} [params.objectId] scope to one source object
 * @param {number[]} [params.states] incident states to include (all when omitted)
 * @param {string|number} [params.from] earliest creation time
 * @param {string|number} [params.to] latest creation time
 * @param {number} [params.limit] maximum rows (server default 1000, maximum 10000)
 * @returns {Promise<IncidentSummary[]>}
 */
export function getIncidents(params = {}) {
  const query = new URLSearchParams()
  if (params.objectId != null) query.set('objectId', params.objectId)
  if (params.states?.length) query.set('state', params.states.join(','))
  if (params.from != null) query.set('from', params.from)
  if (params.to != null) query.set('to', params.to)
  if (params.limit) query.set('limit', params.limit)

  const qs = query.toString()
  return get(`/v1/incidents${qs ? `?${qs}` : ''}`).then((list) =>
    Array.isArray(list) ? list.map(normalizeIncident) : list,
  )
}

/**
 * @param {number} id
 * @returns {Promise<Incident>}
 */
export function getIncident(id) {
  return get(`/v1/incidents/${id}`).then(normalizeIncident)
}

/**
 * @param {number} id
 * @returns {Promise<IncidentActivityEntry[]>}
 */
export function getIncidentActivity(id) {
  return get(`/v1/incidents/${id}/activity`)
}

/**
 * Create an incident. Rejects with 409 when `sourceAlarmId` already belongs to another
 * incident.
 *
 * @param {{ sourceObjectId: number, title: string, initialComment?: string, sourceAlarmId?: number }} body
 * @returns {Promise<Incident>}
 */
export function createIncident(body) {
  return post('/v1/incidents', body).then(normalizeIncident)
}

/**
 * Update an incident. Title is the only mutable field.
 *
 * @param {number} id
 * @param {{ title: string }} body
 * @returns {Promise<Incident>}
 */
export function updateIncident(id, body) {
  return put(`/v1/incidents/${id}`, body).then(normalizeIncident)
}

/**
 * Change incident state. A comment is required for the blocked state; elsewhere it is
 * optional and appended as a normal comment.
 *
 * @param {number} id
 * @param {{ state: number, comment?: string|null }} body
 * @returns {Promise<Incident>}
 */
export function changeIncidentState(id, body) {
  return post(`/v1/incidents/${id}/state`, body).then(normalizeIncident)
}

/**
 * Assign an incident. User id 0 clears the assignment.
 *
 * @param {number} id
 * @param {{ userId: number }} body
 * @returns {Promise<Incident>}
 */
export function assignIncident(id, body) {
  return post(`/v1/incidents/${id}/assign`, body).then(normalizeIncident)
}

/**
 * Add a comment. Incident comments are add-only — the server has no update or delete.
 *
 * @param {number} id
 * @param {{ text: string }} body
 * @returns {Promise<Incident>}
 */
export function addIncidentComment(id, body) {
  return post(`/v1/incidents/${id}/comments`, body).then(normalizeIncident)
}
