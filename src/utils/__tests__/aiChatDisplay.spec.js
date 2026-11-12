// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  chatToMarkdown,
  confirmationLabels,
  contextUsageInfo,
  formatCountdown,
  formatTokenCount,
  functionDisplayName,
  secondsLeft,
} from '@/utils/aiChatDisplay'

describe('functionDisplayName', () => {
  it('turns a known leading verb progressive, as legacy AiFunctionCall does', () => {
    expect(functionDisplayName('get-alarm-list')).toBe('Getting alarm list')
    expect(functionDisplayName('search_objects')).toBe('Searching objects')
    expect(functionDisplayName('query-dci-history')).toBe('Querying dci history')
  })

  it('capitalizes anything else and names an unknown run', () => {
    expect(functionDisplayName('delegate-to-skill')).toBe('Delegate to skill')
    expect(functionDisplayName('get')).toBe('Get')
    expect(functionDisplayName(null)).toBe('Processing')
  })
})

describe('confirmationLabels', () => {
  it('follows the server ConfirmationType order', () => {
    expect(confirmationLabels(0)).toEqual({ positive: 'Approve', negative: 'Reject' })
    expect(confirmationLabels(1)).toEqual({ positive: 'Yes', negative: 'No' })
    expect(confirmationLabels(2)).toEqual({ positive: 'Confirm', negative: 'Cancel' })
    expect(confirmationLabels(9)).toEqual({ positive: 'Yes', negative: 'No' })
  })
})

describe('question countdown', () => {
  it('counts down to an epoch-seconds deadline and stops at zero', () => {
    expect(secondsLeft(1000, 940_500)).toBe(60)
    expect(secondsLeft(1000, 1_005_000)).toBe(0)
    expect(secondsLeft(0, 1)).toBeNull()
    expect(formatCountdown(65)).toBe('1:05')
    expect(formatCountdown(0)).toBe('0:00')
  })

  it('counts down to an ISO 8601 deadline and stops at zero', () => {
    const deadline = '2026-11-03T10:01:00Z'
    expect(secondsLeft(deadline, Date.parse('2026-11-03T10:00:00.500Z'))).toBe(60)
    expect(secondsLeft(deadline, Date.parse('2026-11-03T10:01:05Z'))).toBe(0)
  })

  it('has no deadline for a value it cannot read', () => {
    expect(secondsLeft('not a date', 1)).toBeNull()
    expect(secondsLeft(null, 1)).toBeNull()
  })
})

describe('context usage', () => {
  it('formats token counts like legacy', () => {
    expect(formatTokenCount(950)).toBe('950')
    expect(formatTokenCount(1234)).toBe('1.2k')
    expect(formatTokenCount(3_400_000)).toBe('3.4M')
  })

  it('reports a percentage with the legacy warning levels', () => {
    expect(contextUsageInfo({ tokens: 50_000, window: 200_000 })).toMatchObject({
      percent: 25,
      label: '25%',
      level: 'normal',
    })
    expect(contextUsageInfo({ tokens: 150_000, window: 200_000 }).level).toBe('major')
    expect(contextUsageInfo({ tokens: 190_000, window: 200_000 }).level).toBe('critical')
  })

  it('falls back to a token count when the window is unknown, and to nothing before a call', () => {
    expect(contextUsageInfo({ tokens: 1500, window: null })).toMatchObject({
      percent: null,
      label: '1.5k tokens',
    })
    expect(contextUsageInfo(null)).toBeNull()
  })
})

describe('chatToMarkdown', () => {
  it('lays the conversation out as the legacy export does', () => {
    const at = new Date(2026, 9, 29, 10, 0)
    const text = chatToMarkdown(
      [
        { role: 'user', content: 'Is core-sw-1 up?', timestamp: at },
        { role: 'assistant', content: 'Yes.', timestamp: at },
      ],
      { title: 'Chat', exportedAt: at },
    )

    expect(text.split('\n')[0]).toBe('# Chat')
    expect(text).toMatch(/\*\*User at .+\*\*\n\nIs core-sw-1 up\?/)
    expect(text).toMatch(/\*\*AI Assistant at .+\*\*\n\nYes\./)
  })
})
