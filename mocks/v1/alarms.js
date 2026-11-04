/**
 * Alternates between 10 and 11 alarms on successive polls so the alarm feed animation fires
 * during development. Remove this file to fall back to the static alarms.json.
 */
import { listAlarms, sourceObjectOf } from './_lib/alarms.js'

let callCount = 0

function demoAlarm() {
  const now = new Date().toISOString()
  return {
    id: 9999,
    severity: 4,
    state: 0,
    source: 999,
    sourceName: 'srv-demo-01',
    zoneUIN: 0,
    message: 'Demo: CPU utilization exceeded 95% threshold',
    repeatCount: 1,
    commentCount: 0,
    helpdeskReference: '',
    creationTime: now,
    lastChangeTime: now,
    ackByUserName: '',
    resolvedByUserName: '',
    categories: [],
  }
}

export default function getAlarms(req) {
  callCount++
  const alarms = callCount % 2 === 0 ? [...listAlarms(), demoAlarm()] : listAlarms()
  if (!req?.url?.includes('includeObjectDetails=true')) return alarms
  return alarms.map((alarm) => ({ ...alarm, sourceObject: sourceObjectOf(alarm) }))
}
