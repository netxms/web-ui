/**
 * In-memory AI messages with the server's status rules. Times count from the first request, so a
 * seeded request is never already expired.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const LONG_REPORT = [
  'The weekly review of the access layer found **three** switches worth a look.',
  '',
  '## Findings',
  '',
  '| Switch | Finding | Since |',
  '| --- | --- | --- |',
  '| access-sw-04 | CRC errors on port 12 | 6 days |',
  '| access-sw-11 | Fan speed above baseline | 2 days |',
  '| access-sw-17 | Uplink at 92% during backups | 3 weeks |',
  '',
  '## Suggested next steps',
  '',
  '1. Replace the patch cable on `access-sw-04` port 12.',
  '2. Check the air flow in the rack that holds `access-sw-11`.',
  '3. Move the backup window, or add a second uplink to `access-sw-17`.',
  '',
  '```',
  'port 12: 18422 CRC errors, 0 collisions, link flaps 3',
  '```',
  '',
  ...Array.from(
    { length: 12 },
    (_, i) =>
      `Paragraph ${i + 1} of the supporting detail, long enough to make this panel scroll ` +
      'while its footer stays in view.',
  ),
].join('\n')

function seed() {
  const now = Date.now()
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z')
  const message = (id, fields, { age, life }) => ({
    id,
    guid: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    status: 'pending',
    sourceTaskId: 0,
    sourceTaskType: '',
    relatedObjectId: 0,
    isInitiator: true,
    readTime: null,
    creationTime: iso(now - age),
    expirationTime: iso(now - age + life),
    ...fields,
  })
  const task = (userPrompt, contextObjectId = 0) => ({
    spawnTaskData: { taskType: 'ai_chat', userPrompt, contextObjectId },
  })

  return [
    message(
      12,
      {
        type: 'approvalRequest',
        title: 'Restart the agent on web-01',
        text:
          'The agent on **web-01** has stopped answering twice today. A restart usually clears ' +
          'this. Collection from this node pauses for about a minute.',
        relatedObjectId: 502,
        ...task('Restart the agent on web-01 and confirm that data collection resumes.', 502),
      },
      { age: 2 * HOUR, life: DAY },
    ),
    message(
      11,
      {
        type: 'approvalRequest',
        status: 'read',
        readTime: iso(now - HOUR),
        title: 'Rotate the SNMP community on the access switches',
        text: 'The community string on these switches was last changed over a year ago.',
        ...task('Rotate the SNMP community on every switch in the Access Layer container.'),
      },
      { age: DAY - 40 * MINUTE, life: DAY },
    ),
    message(
      10,
      {
        type: 'alert',
        title:
          'The shared volume of the web cluster is filling up faster than the retention policy ' +
          'can free it, and will run out of space within four days at the current rate of growth',
        text: 'The volume grew by 3% a day for the past week.',
        relatedObjectId: 501,
      },
      { age: 30 * MINUTE, life: 7 * DAY },
    ),
    message(
      9,
      {
        type: 'informational',
        title: 'Weekly review of the access layer',
        text: LONG_REPORT,
      },
      { age: 5 * HOUR, life: 7 * DAY },
    ),
    message(
      8,
      {
        type: 'approvalRequest',
        status: 'approved',
        readTime: iso(now - 20 * HOUR),
        title: 'Clear the agent cache on web-01',
        text: 'The cache had grown past its limit.',
        relatedObjectId: 502,
        ...task('Clear the agent cache on web-01.', 502),
      },
      { age: 22 * HOUR, life: 2 * DAY },
    ),
    message(
      7,
      {
        type: 'approvalRequest',
        status: 'rejected',
        readTime: iso(now - 26 * HOUR),
        title: 'Disable the threshold on interface traffic',
        text: 'The threshold has fired 40 times this week without an outage.',
        ...task('Disable the interface traffic threshold on the core switches.'),
      },
      { age: 27 * HOUR, life: 2 * DAY },
    ),
    message(
      6,
      {
        type: 'informational',
        status: 'read',
        readTime: iso(now - 2 * DAY),
        title: 'Monthly availability report',
        text: 'All monitored services stayed above their availability targets last month.',
        isInitiator: false,
      },
      { age: 3 * DAY, life: 7 * DAY },
    ),
  ]
}

/** id -> message */
let store = null

function load() {
  store ??= new Map(seed().map((message) => [message.id, message]))
  return store
}

export function messageIdFromUrl(req) {
  return Number(req.url.match(/\/messages\/(\d+)/)?.[1])
}

export function listMessages() {
  return [...load().values()]
}

/** @returns {{ message?: object, error?: number, reason?: string }} */
export function setMessageStatus(id, status) {
  const message = load().get(id)
  if (!message) return { error: 404, reason: 'Message not found' }

  if (status === 'read') {
    if (message.status === 'pending') message.status = 'read'
    message.readTime ??= new Date().toISOString().replace(/\.\d+Z$/, 'Z')
    return { message }
  }

  const open = message.status === 'pending' || message.status === 'read'
  if (message.type !== 'approvalRequest' || !open) {
    return { error: 409, reason: 'Operation is not applicable to this message' }
  }
  message.status = status
  return { message }
}

/** @returns {boolean} whether it existed */
export function deleteMessage(id) {
  return load().delete(id)
}
