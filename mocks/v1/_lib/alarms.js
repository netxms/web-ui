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

/** The alarm named by `/v1/alarms/{id}/<action>`, or undefined. */
export function alarmOfActionUrl(req) {
  const id = Number(req.url.split('?')[0].split('/').at(-2))
  return alarms.find((entry) => entry.id === id)
}

const comments = new Map()
let nextCommentId = 1

export function commentsOf(alarm) {
  return comments.get(alarm.id) ?? []
}

/** As the server answers it: the new comment, and the list's `commentCount` follows. */
export function addComment(alarm, text) {
  const comment = {
    id: nextCommentId++,
    alarmId: alarm.id,
    userId: 1,
    userName: 'admin',
    lastChangeTime: new Date().toISOString(),
    text,
  }
  comments.set(alarm.id, [...commentsOf(alarm), comment])
  alarm.commentCount = commentsOf(alarm).length
  return comment
}

const SEVERITY_NAMES = ['normal', 'warning', 'minor', 'major', 'critical']

/** Reads like the assistant's answer on a real server: findings first, then what to do. */
export function suggestedComment(alarm) {
  const neighbours = alarms.filter((entry) => entry.source === alarm.source && entry !== alarm)
  const repeats =
    alarm.repeatCount > 1 ? `It has repeated ${alarm.repeatCount} times.` : 'It has not repeated.'
  const context = neighbours.length
    ? `${alarm.sourceName} has ${neighbours.length} other active alarm${neighbours.length === 1 ? '' : 's'}, so look at them together.`
    : `No other alarm is active on ${alarm.sourceName}, so this looks like a single fault.`
  return [
    `This is a ${SEVERITY_NAMES[alarm.severity] ?? 'unknown'} alarm on ${alarm.sourceName}: "${alarm.message}".`,
    '',
    '**What I found:**',
    `- It was raised at ${alarm.creationTime}. ${repeats}`,
    `- ${context}`,
    '',
    '**Recommended actions:**',
    '1. Acknowledge the alarm, so others can see someone is looking at it.',
    `2. Check ${alarm.sourceName} directly, starting with what the message names.`,
    '3. If the cause was a planned change, resolve the alarm and note the change here.',
  ].join('\n')
}

/**
 * Answers one of the state change routes: 404 for an alarm that is gone, otherwise 204.
 *
 * @param {'acknowledged'|'resolved'|'terminated'} state
 */
export function changeState(req, res, state) {
  const alarm = alarmOfActionUrl(req)
  res.statusCode = alarm ? 204 : 404
  if (alarm) {
    if (state === 'terminated') alarms = alarms.filter((entry) => entry !== alarm)
    else alarm.state = STATE[state]
  }
  res.end()
}
