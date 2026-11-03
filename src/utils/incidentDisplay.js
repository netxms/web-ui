// The lifecycle guards mirror the server (Incident::changeState) and the legacy client's
// updateActionStates. Keep them in step with both.

import { INCIDENT_ACTIVITY, INCIDENT_STATE } from '@/api/incidentsApi'

const incidentStateConfig = {
  open: {
    label: 'Open',
    severity: 'warn',
    icon: 'pi pi-exclamation-circle',
    color: 'var(--p-yellow-600)',
  },
  inProgress: {
    label: 'In Progress',
    severity: 'info',
    icon: 'pi pi-spinner',
    color: 'var(--p-blue-500)',
  },
  blocked: {
    label: 'Blocked',
    severity: 'danger',
    icon: 'pi pi-ban',
    color: 'var(--p-red-500)',
  },
  resolved: {
    label: 'Resolved',
    severity: 'success',
    icon: 'pi pi-check-circle',
    color: 'var(--p-green-500)',
  },
  closed: {
    label: 'Closed',
    severity: 'secondary',
    icon: 'pi pi-lock',
    color: 'var(--p-text-muted-color)',
  },
}

/** Indexed by the server's IncidentState value. */
const STATE_KEY_BY_VALUE = ['open', 'inProgress', 'blocked', 'resolved', 'closed']

/** Accepts the server's integer 0-4 or an already-normalized key. */
export function normalizeIncidentState(value) {
  if (typeof value === 'string') {
    const key = value.trim()
    if (incidentStateConfig[key]) return key
    // Tolerate 'IN_PROGRESS', 'In Progress', 'in-progress' and plain 'open'.
    const collapsed = key.toLowerCase().replaceAll(/[\s_-]/g, '')
    const match = STATE_KEY_BY_VALUE.find((k) => k.toLowerCase() === collapsed)
    return match ?? 'open'
  }
  return STATE_KEY_BY_VALUE[value] ?? 'open'
}

export function getIncidentState(incident) {
  const key = normalizeIncidentState(incident?.state)
  return incidentStateConfig[key] ?? incidentStateConfig.open
}

export function incidentStateValue(incident) {
  return STATE_KEY_BY_VALUE.indexOf(normalizeIncidentState(incident?.state))
}

/** Closed is terminal server-side (`RCC_INCIDENT_CLOSED`). */
export function canModify(incident) {
  return incident != null && normalizeIncidentState(incident.state) !== 'closed'
}

export function canBlock(incident) {
  const state = incident && normalizeIncidentState(incident.state)
  return state != null && state !== 'blocked' && state !== 'resolved' && state !== 'closed'
}

export function canStart(incident) {
  const state = incident && normalizeIncidentState(incident.state)
  return state === 'open' || state === 'blocked'
}

export function canResolve(incident) {
  const state = incident && normalizeIncidentState(incident.state)
  return state != null && state !== 'resolved' && state !== 'closed'
}

export function canReopen(incident) {
  return incident != null && normalizeIncidentState(incident.state) === 'resolved'
}

export function canClose(incident) {
  return incident != null && normalizeIncidentState(incident.state) !== 'closed'
}

export const canAssign = canModify
export const canComment = canModify

/** Indexed by the server's IncidentActivity value. */
const incidentActivityConfig = [
  { label: 'Created', icon: 'pi pi-plus-circle' },
  { label: 'State changed', icon: 'pi pi-arrow-right-arrow-left' },
  { label: 'Assigned', icon: 'pi pi-user' },
  { label: 'Alarm linked', icon: 'pi pi-link' },
  { label: 'Alarm unlinked', icon: 'pi pi-times' },
  { label: 'Comment added', icon: 'pi pi-comment' },
  { label: 'Updated', icon: 'pi pi-pencil' },
]

export function getIncidentActivity(entry) {
  return incidentActivityConfig[entry?.activityType] ?? { label: 'Unknown', icon: 'pi pi-circle' }
}

/**
 * The server logs raw user ids, 0 meaning unassigned. `[id]` without a name: `GET /v1/users`
 * requires "manage users" rights.
 *
 * @param {string|number|null} value
 * @param {(id: number) => string|null|undefined} [resolveUserName]
 */
function activityUserLabel(value, resolveUserName) {
  if (value == null || value === '') return ''
  const id = Number(value)
  if (!Number.isInteger(id)) return String(value)
  if (id === 0) return 'Unassigned'
  return resolveUserName?.(id) || `[${id}]`
}

/**
 * @param {object} entry
 * @param {(id: number) => string|null|undefined} [resolveUserName]
 */
export function describeIncidentActivity(entry, resolveUserName) {
  if (!entry) return ''
  if (entry.activityType === INCIDENT_ACTIVITY.ASSIGNED) {
    const from = activityUserLabel(entry.oldValue, resolveUserName)
    const to = activityUserLabel(entry.newValue, resolveUserName)
    if (from && to) return `${from} -> ${to}`
    return to || from
  }
  if (entry.oldValue && entry.newValue) return `${entry.oldValue} -> ${entry.newValue}`
  return entry.newValue || entry.details || ''
}

export { INCIDENT_ACTIVITY, INCIDENT_STATE }
