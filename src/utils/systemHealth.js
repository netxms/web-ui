import { normalizeSeverity, normalizeState } from './alarmDisplay'

/** Worst first, then the "not monitored" states. */
export const NODE_STATUS_ORDER = [4, 3, 2, 1, 0, 5, 6, 7]

/** @param {Array<{ severity: number|string }>} alarms */
export function countAlarmSeverities(alarms) {
  const counts = { critical: 0, major: 0, minor: 0, warning: 0, normal: 0 }
  for (const alarm of alarms ?? []) {
    const key = normalizeSeverity(alarm.severity)
    counts[key in counts ? key : 'normal']++
  }
  return counts
}

/**
 * Terminated alarms leave the active list, so they are not counted.
 * @param {Array<{ state: number|string }>} alarms
 */
export function countAlarmStates(alarms) {
  const counts = { outstanding: 0, acknowledged: 0, resolved: 0 }
  for (const alarm of alarms ?? []) {
    const key = normalizeState(alarm.state)
    if (key in counts) counts[key]++
  }
  return counts
}

/**
 * Statuses outside 0-7 fold into Unknown (5), matching `getStatusInfo`.
 * @param {Array<{ status?: number, isInMaintenanceMode?: boolean }>} nodes
 * @returns {{ total: number, maintenance: number, byStatus: Record<number, number> }}
 */
export function summarizeNodes(nodes) {
  const byStatus = Object.fromEntries(NODE_STATUS_ORDER.map((status) => [status, 0]))
  let maintenance = 0
  for (const node of nodes ?? []) {
    const status = node.status in byStatus ? node.status : 5
    byStatus[status]++
    if (node.isInMaintenanceMode) maintenance++
  }
  return { total: (nodes ?? []).length, maintenance, byStatus }
}
