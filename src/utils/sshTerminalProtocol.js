/**
 * The rules of the SSH terminal session (`POST /v1/objects/{id}/ssh-terminal`, then a WebSocket):
 * what each way of ending means, what can be retried, and how input is framed. Pure.
 */
import { hasObjectRight } from '@/auth/objectAccessRights'

// Omitted, the server falls back to the device driver's hint, which defaults to vt100.
export const TERMINAL_TYPE = 'xterm-256color'

// What a dead program leaves on: alternate screen, mouse reporting, bracketed paste, hidden cursor.
// A soft reset (DECSTR) covers the rest; a full one would also wipe the scrollback. Leaving the
// alternate screen restores the saved cursor even from the main screen, so the position is saved
// first: each screen has its own saved position, so this is a no-op on the main one.
export const TERMINAL_RESET =
  '\x1b[?1048h\x1b[?1049l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?2004l\x1b[!p\x1b[?25h'

// The browser may fragment a large message, and the server drops continuation frames.
export const SEND_CHUNK_BYTES = 4096

// The agent drops the tail of a write the SSH window cannot take, without reporting it.
export const MAX_PASTE_BYTES = 64 * 1024

// Browsers cannot send WebSocket pings, and nginx cuts a silent upgraded connection after
// proxy_read_timeout. Any frame re-arms that timer; the server ignores this one.
export const HEARTBEAT_INTERVAL_MS = 30_000
export const HEARTBEAT_FRAME = '{"type":"ping"}'

// Devices lock accounts, and a bad password cannot be told from a dead host.
export const MAX_FAILED_LOGINS = 3
export const MAX_RECONNECT_ATTEMPTS = 10

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 15000, 30000]

export const CONNECTION_MEMORY_LIMIT = 100

export const LIVE_PHASES = new Set(['connecting', 'connected', 'reconnecting'])

/**
 * @typedef {object} SshMessage
 * @property {'info'|'error'} severity
 * @property {string} title
 * @property {string} [detail]
 */

const CLOSE_NOTIFICATIONS = {
  normal: { kind: 'ended', severity: 'info', title: 'Session ended', autoReconnect: false },
  error: {
    kind: 'error',
    severity: 'error',
    title: 'The SSH connection closed with an error',
    detail: 'The node or the SSH proxy agent ended the session.',
    autoReconnect: false,
  },
  overflow: {
    kind: 'overflow',
    severity: 'error',
    title: 'Output was too fast for this connection',
    detail: 'The server closes a session when more than 1 MB of output is waiting for delivery.',
    autoReconnect: false,
  },
  agent_disconnect: {
    kind: 'lost',
    severity: 'error',
    title: 'Lost the connection to the SSH proxy agent',
    autoReconnect: true,
  },
}

/**
 * @param {{ reason?: string|null, code?: number }} close - the `close` notification, if one came,
 *   and the WebSocket close code
 * @returns {SshMessage & { kind: string, autoReconnect: boolean }}
 */
export function classifyClose({ reason, code }) {
  if (reason && CLOSE_NOTIFICATIONS[reason]) return CLOSE_NOTIFICATIONS[reason]
  if (code === 1008) {
    return {
      kind: 'expired',
      severity: 'error',
      title: 'The session expired before it could start',
      detail: 'The server rejected its one-time token.',
      autoReconnect: false,
    }
  }
  return {
    kind: 'lost',
    severity: 'error',
    title: 'Lost the connection to the server',
    autoReconnect: true,
  }
}

/**
 * The agent answers one code for a refused connection, an unreachable host and a bad password.
 *
 * @param {{ status?: number, data?: { reason?: string }, message?: string }} err
 * @returns {SshMessage & { retryable: boolean, mayHaveReachedDevice: boolean }}
 */
export function describeConnectError(err) {
  const reason = err?.data?.reason ?? ''
  const failure = (title, detail, retryable, mayHaveReachedDevice = false) => ({
    severity: 'error',
    title,
    detail,
    retryable,
    mayHaveReachedDevice,
  })

  switch (err?.status) {
    case undefined:
    case 0:
      return failure('Cannot reach the server', 'Check your network connection.', true)
    case 400:
      return failure('The server rejected the request', reason, false)
    case 403:
      return failure(
        'You do not have permission to open an SSH terminal on this node',
        'It takes the "Initiate TCP proxy sessions" system right and Control access on the node.',
        false,
      )
    case 404:
      return failure('This node no longer exists', reason, false)
    case 503:
      return failure(
        'No SSH proxy is available for this node',
        'Set an SSH proxy on the node or its zone, or check that the proxy node is up.',
        true,
      )
    case 504:
      return failure(
        'The SSH proxy agent did not answer in time',
        'The node may be unreachable from the proxy.',
        true,
        true,
      )
    case 502:
      if (reason === 'Cannot connect to SSH proxy agent') {
        return failure(
          'Cannot reach the SSH proxy agent',
          'Check that the NetXMS agent on the proxy node is running.',
          true,
        )
      }
      if (/unknown command/i.test(reason)) {
        return failure(
          'The SSH proxy agent has no SSH support',
          'Load the ssh subagent on the proxy node (SubAgent = ssh.nsm).',
          false,
        )
      }
      return failure(
        'Could not connect or log in',
        `Check the login, password or key, and that the node accepts SSH from the proxy. Agent said: ${reason || 'no details'}.`,
        true,
        true,
      )
    default:
      return failure('Could not open the terminal', reason || err?.message || '', false)
  }
}

/** @param {number} attempt - zero-based */
export function reconnectDelayMs(attempt) {
  return RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)]
}

/**
 * @param {Uint8Array} bytes
 * @param {number} [size]
 * @returns {Uint8Array[]}
 */
export function chunkBytes(bytes, size = SEND_CHUNK_BYTES) {
  const chunks = []
  for (let offset = 0; offset < bytes.length; offset += size) {
    chunks.push(bytes.subarray(offset, offset + size))
  }
  return chunks
}

/**
 * xterm delivers mouse reports as a string of byte values, which are not UTF-8 text.
 *
 * @param {string} text
 * @returns {Uint8Array}
 */
export function binaryStringToBytes(text) {
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff)
}

/**
 * @param {string} text
 * @param {{ bracketed: boolean }} options - the remote side asked for bracketed paste, so a line
 *   break in it runs nothing until the user presses Enter
 * @returns {{ action: 'paste'|'confirm'|'reject', lines: number, bytes: number }}
 */
export function classifyPaste(text, { bracketed }) {
  const bytes = new TextEncoder().encode(text).length
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.length > 0).length
  if (bytes > MAX_PASTE_BYTES) return { action: 'reject', lines, bytes }
  const runsOnPaste = /[\r\n]/.test(text) && !bracketed
  return { action: runsOnPaste ? 'confirm' : 'paste', lines, bytes }
}

/**
 * The few keys the console keeps. Everything else belongs to the remote shell, which is why these
 * all need both Ctrl and Shift.
 *
 * @param {KeyboardEvent} event
 * @returns {'copy'|'paste'|'find'|'leave'|null}
 */
export function terminalShortcut(event) {
  if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return null
  switch (event.key.toLowerCase()) {
    case 'c':
      return 'copy'
    case 'v':
      return 'paste'
    case 'f':
      return 'find'
    case 'f6':
      return 'leave'
    default:
      return null
  }
}

/**
 * @param {string|null|undefined} viewId
 * @returns {number|null} the tab's index, null when this is not a valid terminal view id
 */
export function parseSshViewId(viewId) {
  const match = /^ssh:([1-9]\d*)$/.exec(viewId ?? '')
  return match ? Number(match[1]) : null
}

/**
 * The server sends `{ family, address }`, or null when the object has no valid address.
 *
 * @param {{ ipAddress?: { address?: string }|string|null }} object
 * @returns {boolean}
 */
export function hasUsablePrimaryIp(object) {
  const ip = object?.ipAddress
  const address = typeof ip === 'string' ? ip : ip?.address
  return !!address && address !== '0.0.0.0' && address !== '::'
}

/**
 * The server withholds `sshLogin` from a user without Modify or Read credentials.
 *
 * @param {object} object - adapted node document
 * @returns {'known'|'none'|'hidden'}
 */
export function storedCredentialsState(object) {
  if (object?.sshLogin) return 'known'
  const canRead = hasObjectRight(object, 'MODIFY') || hasObjectRight(object, 'READ_CREDENTIALS')
  return canRead ? 'none' : 'hidden'
}

/**
 * The per-node memory kept in user preferences, most recently used last. An array because object
 * keys that look like numbers do not keep insertion order. Built field by field so a password can
 * never reach a value that syncs to the server.
 *
 * @param {Array<object>} list
 * @param {number} objectId
 * @param {{ mode: 'stored'|'custom', login?: string, keyId?: number }} entry
 * @param {number} [limit]
 * @returns {Array<object>}
 */
export function rememberConnection(list, objectId, entry, limit = CONNECTION_MEMORY_LIMIT) {
  const others = Array.isArray(list) ? list.filter((item) => item?.objectId !== objectId) : []
  const remembered = {
    objectId,
    mode: entry.mode,
    login: entry.login ?? '',
    keyId: entry.keyId ?? 0,
  }
  return [...others, remembered].slice(-limit)
}

/**
 * @param {*} list - as read from preferences
 * @param {number} objectId
 * @returns {object|null}
 */
export function findConnection(list, objectId) {
  if (!Array.isArray(list)) return null
  return list.find((item) => item?.objectId === objectId) ?? null
}
