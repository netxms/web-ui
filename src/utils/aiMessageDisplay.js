import { formatDurationCompact } from '@/utils/timeFormat'

/** How long an approval request's deadline stands out before it passes, in seconds. */
const EXPIRY_WARNING_SECONDS = 3600

// `iconColor` alone where the color is too light for text on a white surface.
const TYPES = {
  informational: {
    label: 'Info',
    panelTitle: 'Message',
    icon: 'pi pi-info-circle',
    iconColor: 'var(--p-blue-500)',
  },
  alert: {
    label: 'Alert',
    panelTitle: 'Alert',
    icon: 'pi pi-exclamation-triangle',
    iconColor: 'var(--p-red-500)',
  },
  approvalRequest: {
    label: 'Approval',
    panelTitle: 'Approval request',
    icon: 'pi pi-question-circle',
    iconColor: 'var(--netxms-status-minor)',
  },
}

const STATUSES = {
  awaiting: {
    label: 'Awaiting decision',
    icon: 'pi pi-hourglass',
    color: 'var(--p-text-color)',
    iconColor: 'var(--netxms-status-minor)',
  },
  unread: { label: 'Unread', icon: 'pi pi-circle-fill', color: 'var(--p-text-color)' },
  read: { label: 'Read', icon: 'pi pi-check', color: 'var(--p-text-muted-color)' },
  approved: { label: 'Approved', icon: 'pi pi-check-circle', color: 'var(--p-green-600)' },
  rejected: { label: 'Rejected', icon: 'pi pi-times-circle', color: 'var(--p-text-muted-color)' },
  expired: { label: 'Expired', icon: 'pi pi-clock', color: 'var(--p-text-muted-color)' },
}

/**
 * @param {string} [type] - 'informational' | 'alert' | 'approvalRequest'
 * @returns {{ label: string, panelTitle: string, icon: string, iconColor: string }}
 */
export function aiMessageType(type) {
  return (
    TYPES[type] ?? {
      label: type || 'Unknown',
      panelTitle: 'Message',
      icon: 'pi pi-envelope',
      iconColor: 'var(--p-text-muted-color)',
    }
  )
}

function secondsUntilExpiry(message, now) {
  const ms = new Date(message?.expirationTime).getTime()
  return Number.isFinite(ms) ? (ms - now) / 1000 : null
}

/** The server stops listing a message once it expires; this covers the time until the next poll. */
export function isAiMessageExpired(message, now = Date.now()) {
  if (message?.status === 'expired') return true
  const seconds = secondsUntilExpiry(message, now)
  return seconds !== null && seconds <= 0
}

/** The server accepts a decision in `read` as well as `pending`. */
export function needsDecision(message, now = Date.now()) {
  return (
    message?.type === 'approvalRequest' &&
    (message.status === 'pending' || message.status === 'read') &&
    !isAiMessageExpired(message, now)
  )
}

export function isAiMessageUnread(message, now = Date.now()) {
  return message?.status === 'pending' && !isAiMessageExpired(message, now)
}

/** What the attention counts add up: an unread message, or a request still to be decided. */
export function isWaitingOnUser(message, now = Date.now()) {
  return isAiMessageUnread(message, now) || needsDecision(message, now)
}

/**
 * The server's `read` says nothing about a decision, so a read request must not look finished.
 *
 * @returns {{ label: string, icon: string, color: string, iconColor?: string }}
 */
export function aiMessageStatus(message, now = Date.now()) {
  if (needsDecision(message, now)) return STATUSES.awaiting
  if (message?.status === 'approved' || message?.status === 'rejected') {
    return STATUSES[message.status]
  }
  if (isAiMessageExpired(message, now)) return STATUSES.expired
  return message?.status === 'pending' ? STATUSES.unread : STATUSES.read
}

/** @returns {string} what an approval starts; empty when it starts nothing */
export function approvalPrompt(message) {
  const prompt = message?.spawnTaskData?.userPrompt
  return typeof prompt === 'string' ? prompt : ''
}

/** The server refuses everyone else. */
export function canDeleteAiMessage(message, can) {
  return Boolean(message?.isInitiator || can?.manageAiTasks)
}

/**
 * Requests still to be decided first, so a newer message cannot bury them, then newest first.
 *
 * @returns {number} `Array.prototype.sort` result
 */
export function compareAiMessages(a, b, now = Date.now()) {
  const decision = Number(needsDecision(b, now)) - Number(needsDecision(a, now))
  if (decision !== 0) return decision
  return new Date(b.creationTime).getTime() - new Date(a.creationTime).getTime()
}

/** @returns {string} 'in 22h 5m'; empty once there is no time left */
export function formatAiMessageExpiry(message, now = Date.now()) {
  const seconds = secondsUntilExpiry(message, now)
  return seconds === null || seconds <= 0 ? '' : `in ${formatDurationCompact(seconds)}`
}

export function isAiMessageExpiringSoon(message, now = Date.now()) {
  if (!needsDecision(message, now)) return false
  const seconds = secondsUntilExpiry(message, now)
  return seconds !== null && seconds <= EXPIRY_WARNING_SECONDS
}

/** @returns {string} what the status route's 404 and 409 mean here, else the server's own words */
export function aiMessageErrorDetail(error) {
  if (error?.status === 404) return 'This message has expired or was deleted.'
  if (error?.status === 409) return 'This request was already approved or rejected.'
  return error?.message
}
