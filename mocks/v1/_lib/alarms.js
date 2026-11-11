/**
 * In-memory alarms with wire names, so the state changes stick for the session. The mock has no
 * object behind most sources; those read as nodes.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getObject } from './objectStore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const readJson = (file) => JSON.parse(readFileSync(file, 'utf-8'))

// The demo data center's alarms: one per active threshold in its DCI fixtures.
let alarms = [
  ...readJson(join(__dirname, '..', 'alarms.json')),
  ...readJson(join(__dirname, 'dataCenterAlarms.json')),
]

const STATE = { acknowledged: 1, resolved: 2 }

export function listAlarms() {
  return alarms
}

export function sourceObjectOf(alarm) {
  const object = getObject(alarm.source)
  return {
    id: alarm.source,
    class: object?.class ?? 'Node',
    name: alarm.sourceName,
    category: 0,
    status: object?.status ?? 0,
  }
}

/**
 * Answers one of the state change routes: 404 for an alarm that is gone, otherwise 204.
 *
 * @param {'acknowledged'|'resolved'|'terminated'} state
 */
export function changeState(req, res, state) {
  const id = Number(req.url.split('?')[0].split('/').at(-2))
  const alarm = alarms.find((entry) => entry.id === id)
  res.statusCode = alarm ? 204 : 404
  if (alarm) {
    if (state === 'terminated') alarms = alarms.filter((entry) => entry !== alarm)
    else alarm.state = STATE[state]
  }
  res.end()
}
