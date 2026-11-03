import { describe, it, expect } from 'vitest'
import { freshEntries, CHANGELOG_MAX_AGE_DAYS, CHANGELOG_MAX_ENTRIES } from '@/config/whatsNew'

const NOW = new Date('2026-09-11T00:00:00Z').getTime()

function daysAgo(days) {
  return new Date(NOW - days * 86400000).toISOString().slice(0, 10)
}

describe('freshEntries', () => {
  it('keeps entries inside the cutoff', () => {
    const entries = [{ id: 1, title: 'Recent', date: daysAgo(10) }]
    expect(freshEntries(entries, NOW)).toHaveLength(1)
  })

  it('drops entries past the cutoff', () => {
    const entries = [{ id: 1, title: 'Ancient', date: daysAgo(CHANGELOG_MAX_AGE_DAYS + 1) }]
    expect(freshEntries(entries, NOW)).toHaveLength(0)
  })

  it('returns entries newest first', () => {
    const entries = [
      { id: 1, title: 'Older', date: daysAgo(30) },
      { id: 2, title: 'Newer', date: daysAgo(5) },
    ]
    expect(freshEntries(entries, NOW).map((e) => e.id)).toEqual([2, 1])
  })

  // A malformed date must not take the whole section down with it.
  it('drops entries with an unparseable or missing date', () => {
    const entries = [
      { id: 1, title: 'Bad', date: 'not-a-date' },
      { id: 2, title: 'None' },
    ]
    expect(freshEntries(entries, NOW)).toHaveLength(0)
  })

  it('drops entries marked hidden', () => {
    const entries = [
      { id: 1, title: 'Shown', date: daysAgo(5) },
      { id: 2, title: 'Held back', date: daysAgo(5), hidden: true },
      { id: 3, title: 'Explicitly shown', date: daysAgo(5), hidden: false },
    ]
    expect(freshEntries(entries, NOW).map((e) => e.id)).toEqual([1, 3])
  })

  it('tolerates a non-array input', () => {
    expect(freshEntries(null, NOW)).toEqual([])
    expect(freshEntries(undefined, NOW)).toEqual([])
  })

  it('caps the list length', () => {
    const entries = Array.from({ length: CHANGELOG_MAX_ENTRIES + 3 }, (_, i) => ({
      id: i,
      title: `Entry ${i}`,
      date: daysAgo(i + 1),
    }))
    expect(freshEntries(entries, NOW)).toHaveLength(CHANGELOG_MAX_ENTRIES)
  })
})
