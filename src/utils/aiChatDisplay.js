// AI assistant chat wording, ported from the legacy client so both consoles read the same.
import { formatDateTime } from '@/utils/timeFormat'

/** Legacy `AiFunctionCall.getDisplayName`: a leading verb, turned progressive. */
const PROGRESSIVE_VERBS = {
  get: 'Getting',
  read: 'Reading',
  find: 'Finding',
  list: 'Listing',
  search: 'Searching',
  analyze: 'Analyzing',
  explain: 'Explaining',
  query: 'Querying',
  check: 'Checking',
  create: 'Creating',
  update: 'Updating',
  delete: 'Deleting',
  send: 'Sending',
  load: 'Loading',
}

/**
 * `currentFunction` from `/status`: `get-alarm-list` reads "Getting alarm list".
 *
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function functionDisplayName(name) {
  if (!name) return 'Processing'
  const readable = name.replace(/[-_]/g, ' ')
  const space = readable.indexOf(' ')
  const verb = PROGRESSIVE_VERBS[(space < 0 ? readable : readable.slice(0, space)).toLowerCase()]
  if (verb && space > 0) return verb + readable.slice(space)
  return readable.charAt(0).toUpperCase() + readable.slice(1)
}

/** Indexed by `confirmationType` (`ConfirmationType` in the server's nxai.h). */
const CONFIRMATION_LABELS = [
  { positive: 'Approve', negative: 'Reject' },
  { positive: 'Yes', negative: 'No' },
  { positive: 'Confirm', negative: 'Cancel' },
]

/**
 * @param {number} confirmationType
 * @returns {{ positive: string, negative: string }}
 */
export function confirmationLabels(confirmationType) {
  return CONFIRMATION_LABELS[confirmationType] ?? CONFIRMATION_LABELS[1]
}

/**
 * @param {string|number} expiresAt - ISO 8601; older servers send epoch seconds
 * @param {number} [now] - epoch milliseconds
 * @returns {number|null} null when there is no usable deadline
 */
export function secondsLeft(expiresAt, now = Date.now()) {
  if (!expiresAt) return null
  const ms = typeof expiresAt === 'number' ? expiresAt * 1000 : new Date(expiresAt).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.ceil((ms - now) / 1000))
}

/** `m:ss`, as the legacy countdown shows it. */
export function formatCountdown(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Legacy `formatTokenCount`: 950, 1.2k, 3.4M. */
export function formatTokenCount(tokens) {
  if (tokens < 1000) return String(tokens)
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}k`
  return `${(tokens / 1000000).toFixed(1)}M`
}

/**
 * `usage` is `contextUsage` on `/status`. Thresholds match the legacy client.
 *
 * @param {{ tokens: number, window: number|null }|null|undefined} usage
 * @returns {{ percent: number|null, label: string, tooltip: string,
 *   level: 'normal'|'major'|'critical' }|null} null before the first answer
 */
export function contextUsageInfo(usage) {
  if (!usage?.tokens) return null
  const tokens = formatTokenCount(usage.tokens)
  if (!usage.window) {
    return {
      percent: null,
      label: `${tokens} tokens`,
      tooltip: `Context window usage: ${tokens} tokens (the model's window size is unknown)`,
      level: 'normal',
    }
  }
  const percent = Math.min(100, Math.round((usage.tokens * 100) / usage.window))
  return {
    percent,
    label: `${percent}%`,
    tooltip: `Context window usage: ${tokens} of ${formatTokenCount(usage.window)} tokens`,
    level: percent >= 90 ? 'critical' : percent >= 75 ? 'major' : 'normal',
  }
}

/**
 * A conversation as Markdown, in the legacy export's layout.
 *
 * @param {Array<{ role: 'user'|'assistant', content: string, timestamp: Date }>} messages
 * @param {{ title?: string, exportedAt?: Date }} [options]
 * @returns {string}
 */
export function chatToMarkdown(messages, { title, exportedAt = new Date() } = {}) {
  const lines = [
    `# ${title || 'AI Assistant Conversation'}`,
    `Exported: ${formatDateTime(exportedAt)}`,
    '',
    '---',
    '',
  ]
  for (const message of messages) {
    const sender = message.role === 'user' ? 'User' : 'AI Assistant'
    lines.push(`**${sender} at ${formatDateTime(message.timestamp)}**`, '', message.content, '')
    lines.push('---', '')
  }
  return lines.join('\n')
}
