/**
 * In-memory alarms with wire names, so the state changes stick for the session. Source objects
 * are all nodes here: the mock has no object behind most of them.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let alarms = JSON.parse(readFileSync(join(__dirname, '..', 'alarms.json'), 'utf-8'))

const STATE = { acknowledged: 1, resolved: 2 }

export function listAlarms() {
  return alarms
}

export function sourceObjectOf(alarm) {
  return { id: alarm.source, class: 'Node', name: alarm.sourceName, category: 0, status: 0 }
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
