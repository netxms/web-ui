// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  aiMessageErrorDetail,
  aiMessageStatus,
  aiMessageType,
  approvalPrompt,
  canDeleteAiMessage,
  compareAiMessages,
  formatAiMessageExpiry,
  isAiMessageExpired,
  isAiMessageExpiringSoon,
  isWaitingOnUser,
  needsDecision,
} from '@/utils/aiMessageDisplay'

const NOW = Date.parse('2026-11-03T12:00:00Z')
const LATER = '2026-11-04T12:00:00Z'
const PAST = '2026-11-03T11:00:00Z'

const message = (fields) => ({
  type: 'informational',
  status: 'read',
  creationTime: '2026-11-03T10:00:00Z',
  expirationTime: LATER,
  ...fields,
})

const approval = (fields) => message({ type: 'approvalRequest', status: 'pending', ...fields })

describe('needsDecision', () => {
  it('holds for a request that is pending or read', () => {
    expect(needsDecision(approval(), NOW)).toBe(true)
    expect(needsDecision(approval({ status: 'read' }), NOW)).toBe(true)
  })

  it('does not hold once decided, once expired, or for other messages', () => {
    expect(needsDecision(approval({ status: 'approved' }), NOW)).toBe(false)
    expect(needsDecision(approval({ status: 'rejected' }), NOW)).toBe(false)
    expect(needsDecision(approval({ expirationTime: PAST }), NOW)).toBe(false)
    expect(needsDecision(message({ type: 'alert', status: 'pending' }), NOW)).toBe(false)
    expect(needsDecision(null, NOW)).toBe(false)
  })
})

describe('aiMessageStatus', () => {
  const label = (fields) => aiMessageStatus(fields, NOW).label

  it('does not let a read request look finished', () => {
    expect(label(approval({ status: 'read' }))).toBe('Awaiting decision')
    expect(label(approval())).toBe('Awaiting decision')
  })

  it('names the outcome of a decided request', () => {
    expect(label(approval({ status: 'approved' }))).toBe('Approved')
    expect(label(approval({ status: 'rejected' }))).toBe('Rejected')
  })

  it('keeps the outcome past the deadline', () => {
    expect(label(approval({ status: 'approved', expirationTime: PAST }))).toBe('Approved')
  })

  it('tells unread from read for other messages', () => {
    expect(label(message({ status: 'pending' }))).toBe('Unread')
    expect(label(message({ status: 'read' }))).toBe('Read')
  })

  it('says expired once the deadline has passed', () => {
    expect(label(approval({ expirationTime: PAST }))).toBe('Expired')
    expect(label(message({ status: 'expired' }))).toBe('Expired')
    expect(isAiMessageExpired(message({ expirationTime: PAST }), NOW)).toBe(true)
  })
})

describe('isWaitingOnUser', () => {
  it('counts unread messages and undecided requests', () => {
    expect(isWaitingOnUser(message({ status: 'pending' }), NOW)).toBe(true)
    expect(isWaitingOnUser(approval({ status: 'read' }), NOW)).toBe(true)
  })

  it('does not count what is read, decided or expired', () => {
    expect(isWaitingOnUser(message(), NOW)).toBe(false)
    expect(isWaitingOnUser(approval({ status: 'approved' }), NOW)).toBe(false)
    expect(isWaitingOnUser(message({ status: 'pending', expirationTime: PAST }), NOW)).toBe(false)
  })
})

describe('compareAiMessages', () => {
  it('puts undecided requests first, then the newest', () => {
    const report = message({ id: 1, creationTime: '2026-11-03T11:30:00Z' })
    const older = approval({ id: 2, creationTime: '2026-11-03T08:00:00Z' })
    const newer = approval({ id: 3, status: 'read', creationTime: '2026-11-03T09:00:00Z' })
    const decided = approval({ id: 4, status: 'approved', creationTime: '2026-11-03T07:00:00Z' })

    const order = [report, older, decided, newer]
      .sort((a, b) => compareAiMessages(a, b, NOW))
      .map((item) => item.id)

    expect(order).toEqual([3, 2, 1, 4])
  })
})

describe('expiry', () => {
  it('reads as time left, and as nothing once it has passed', () => {
    expect(formatAiMessageExpiry(message(), NOW)).toBe('in 1d')
    expect(formatAiMessageExpiry(message({ expirationTime: PAST }), NOW)).toBe('')
    expect(formatAiMessageExpiry(message({ expirationTime: null }), NOW)).toBe('')
  })

  it('stands out in the last hour of a request only', () => {
    const soon = '2026-11-03T12:40:00Z'
    expect(isAiMessageExpiringSoon(approval({ expirationTime: soon }), NOW)).toBe(true)
    expect(isAiMessageExpiringSoon(approval(), NOW)).toBe(false)
    expect(isAiMessageExpiringSoon(message({ expirationTime: soon }), NOW)).toBe(false)
  })
})

describe('approvalPrompt', () => {
  it('is what the request would run, or nothing', () => {
    expect(approvalPrompt(approval({ spawnTaskData: { userPrompt: 'Restart' } }))).toBe('Restart')
    expect(approvalPrompt(approval())).toBe('')
    expect(approvalPrompt(null)).toBe('')
  })
})

describe('canDeleteAiMessage', () => {
  it('allows the initiator and "manage AI tasks", as the server does', () => {
    expect(canDeleteAiMessage({ isInitiator: true }, {})).toBe(true)
    expect(canDeleteAiMessage({ isInitiator: false }, { manageAiTasks: true })).toBe(true)
    expect(canDeleteAiMessage({ isInitiator: false }, { manageAiTasks: false })).toBe(false)
  })
})

describe('aiMessageType', () => {
  it('falls back for a type the console does not know', () => {
    expect(aiMessageType('approvalRequest').panelTitle).toBe('Approval request')
    expect(aiMessageType('unknown').label).toBe('unknown')
    expect(aiMessageType(undefined).label).toBe('Unknown')
  })
})

describe('aiMessageErrorDetail', () => {
  it('explains the status conflicts, and passes the rest through', () => {
    expect(aiMessageErrorDetail({ status: 404 })).toContain('expired or was deleted')
    expect(aiMessageErrorDetail({ status: 409 })).toContain('already approved or rejected')
    expect(aiMessageErrorDetail({ status: 500, message: 'Database failure' })).toBe(
      'Database failure',
    )
  })
})
