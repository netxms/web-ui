import { describe, it, expect } from 'vitest'
import {
  formatDurationCompact,
  secondsSince,
  formatAgeCompact,
  formatDateTime,
  formatDateTimeShort,
  formatDateMedium,
  formatDateTimeMedium,
  formatDateTimeWithSeconds,
  formatTimeShort,
  toApiTimestamp,
} from '../timeFormat'

describe('formatDurationCompact', () => {
  it('formats sub-minute values', () => {
    expect(formatDurationCompact(0)).toBe('<1m')
    expect(formatDurationCompact(30)).toBe('<1m')
    expect(formatDurationCompact(59)).toBe('<1m')
  })

  it('formats minutes and hours', () => {
    expect(formatDurationCompact(60)).toBe('1m')
    expect(formatDurationCompact(90)).toBe('1m')
    expect(formatDurationCompact(3600)).toBe('1h')
    expect(formatDurationCompact(3900)).toBe('1h 5m')
  })

  it('formats days with hours', () => {
    expect(formatDurationCompact(94230)).toBe('1d 2h')
    expect(formatDurationCompact(86400)).toBe('1d')
  })

  it('collapses long durations to days only', () => {
    expect(formatDurationCompact(609 * 86400 + 3600)).toBe('609d')
  })

  it('returns empty string for invalid input', () => {
    expect(formatDurationCompact(-5)).toBe('')
    expect(formatDurationCompact(NaN)).toBe('')
  })
})

describe('secondsSince', () => {
  const now = Date.parse('2026-07-30T12:00:00Z')

  it('measures elapsed seconds from an ISO timestamp', () => {
    expect(secondsSince('2026-07-30T11:59:00Z', now)).toBe(60)
    expect(secondsSince('2026-07-29T12:00:00Z', now)).toBe(86400)
  })

  it('clamps future timestamps to zero rather than going negative', () => {
    expect(secondsSince('2026-07-30T12:05:00Z', now)).toBe(0)
  })

  it('returns null for missing or unparseable input', () => {
    expect(secondsSince(null, now)).toBeNull()
    expect(secondsSince(undefined, now)).toBeNull()
    expect(secondsSince('', now)).toBeNull()
    expect(secondsSince('not a date', now)).toBeNull()
  })
})

describe('formatAgeCompact', () => {
  const now = Date.parse('2026-07-30T12:00:00Z')

  it('keeps second precision under a minute', () => {
    expect(formatAgeCompact('2026-07-30T11:59:20Z', now)).toBe('40s ago')
    expect(formatAgeCompact('2026-07-30T12:00:00Z', now)).toBe('0s ago')
  })

  it('switches to compact duration at a minute and above', () => {
    expect(formatAgeCompact('2026-07-30T11:58:00Z', now)).toBe('2m ago')
    expect(formatAgeCompact('2026-07-30T08:48:00Z', now)).toBe('3h 12m ago')
    expect(formatAgeCompact('2026-07-26T06:00:00Z', now)).toBe('4d 6h ago')
  })

  it('returns empty string for missing or unparseable input', () => {
    expect(formatAgeCompact(null, now)).toBe('')
    expect(formatAgeCompact('nonsense', now)).toBe('')
  })
})

describe('formatDateTime', () => {
  it('returns a locale string for a valid timestamp', () => {
    expect(formatDateTime('2026-07-30T12:00:00Z')).toBe(
      new Date('2026-07-30T12:00:00Z').toLocaleString(),
    )
  })

  it('returns null for missing or unparseable input', () => {
    expect(formatDateTime(null)).toBeNull()
    expect(formatDateTime('')).toBeNull()
    expect(formatDateTime('nonsense')).toBeNull()
  })

  // Several endpoints hand back epoch seconds (user lastLogin, interface peerLastUpdated).
  it('reads epoch seconds when told to', () => {
    const seconds = Math.floor(Date.UTC(2026, 6, 30, 12) / 1000)
    expect(formatDateTime(seconds, { unixSeconds: true })).toBe(
      new Date(seconds * 1000).toLocaleString(),
    )
  })

  it('treats a number as milliseconds by default', () => {
    const ms = Date.UTC(2026, 6, 30, 12)
    expect(formatDateTime(ms)).toBe(new Date(ms).toLocaleString())
  })

  it('accepts a Date instance', () => {
    const date = new Date('2026-07-30T12:00:00Z')
    expect(formatDateTime(date)).toBe(date.toLocaleString())
  })

  it('rejects an invalid Date instance', () => {
    expect(formatDateTime(new Date('nonsense'))).toBeNull()
  })
})

describe('formatDateTimeShort', () => {
  it('formats month, day, hour and minute', () => {
    const value = '2026-07-30T12:00:00Z'
    expect(formatDateTimeShort(value)).toBe(
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value)),
    )
  })

  it("defaults the placeholder to '-'", () => {
    expect(formatDateTimeShort(null)).toBe('-')
    expect(formatDateTimeShort('')).toBe('-')
    expect(formatDateTimeShort('nonsense')).toBe('-')
  })

  it('honours a custom placeholder', () => {
    expect(formatDateTimeShort(null, { fallback: '--' })).toBe('--')
    expect(formatDateTimeShort(undefined, { fallback: 'Never' })).toBe('Never')
  })

  it('reads epoch seconds when told to', () => {
    const seconds = Math.floor(Date.UTC(2026, 6, 30, 12) / 1000)
    expect(formatDateTimeShort(seconds, { unixSeconds: true })).toBe(
      formatDateTimeShort(seconds * 1000),
    )
  })

  it('does not pin the locale', () => {
    const value = '2026-07-30T12:00:00Z'
    expect(formatDateTimeShort(value)).toBe(
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value)),
    )
  })
})

// Output follows the browser locale, so these check the fields present, not exact strings.

const ISO = '2026-08-13T14:30:45Z'

describe('formatDateMedium', () => {
  it('renders a date with no time', () => {
    const out = formatDateMedium(ISO)
    expect(out).toMatch(/2026/)
    expect(out).not.toMatch(/\d\d:\d\d/)
  })

  it('returns the fallback for a missing or unparseable value', () => {
    expect(formatDateMedium(null)).toBe('-')
    expect(formatDateMedium(undefined, { fallback: '' })).toBe('')
    expect(formatDateMedium('not a date', { fallback: 'not a date' })).toBe('not a date')
  })
})

describe('formatDateTimeMedium', () => {
  it('renders a date and a time without seconds by default', () => {
    const out = formatDateTimeMedium(ISO)
    expect(out).toMatch(/2026/)
    expect(out).toMatch(/\d{1,2}:\d{2}/)
    expect(out).not.toMatch(/:\d{2}:\d{2}/)
  })

  it("adds seconds at timeStyle 'medium'", () => {
    expect(formatDateTimeMedium(ISO, { timeStyle: 'medium' })).toMatch(/:\d{2}:\d{2}/)
  })

  it('honours the fallback', () => {
    expect(formatDateTimeMedium(null)).toBe('-')
    expect(formatDateTimeMedium(null, { fallback: '' })).toBe('')
  })

  it('accepts epoch seconds when told to', () => {
    const seconds = Date.parse(ISO) / 1000
    expect(formatDateTimeMedium(seconds, { unixSeconds: true })).toMatch(/2026/)
  })
})

describe('formatDateTimeWithSeconds', () => {
  it('includes seconds, and omits the year', () => {
    const out = formatDateTimeWithSeconds(ISO)
    expect(out).toMatch(/:\d{2}:\d{2}/)
    expect(out).not.toMatch(/2026/)
  })

  it('honours the fallback', () => {
    expect(formatDateTimeWithSeconds(null)).toBe('-')
  })

  it('accepts a Date as well as an ISO string', () => {
    expect(formatDateTimeWithSeconds(new Date(ISO))).toBe(formatDateTimeWithSeconds(ISO))
  })
})

describe('formatTimeShort', () => {
  it('gives a time and no date', () => {
    const out = formatTimeShort(ISO)
    expect(out).toMatch(/\d{1,2}:\d{2}:\d{2}/)
    expect(out).not.toMatch(/2026/)
  })

  it('honours the fallback', () => {
    expect(formatTimeShort(null)).toBe('-')
    expect(formatTimeShort(undefined, { fallback: '' })).toBe('')
  })

  it('accepts a Date, an ISO string and epoch seconds alike', () => {
    expect(formatTimeShort(new Date(ISO))).toBe(formatTimeShort(ISO))
    const seconds = Math.floor(new Date(ISO).getTime() / 1000)
    expect(formatTimeShort(seconds, { unixSeconds: true })).toBe(formatTimeShort(ISO))
  })
})

// Older servers parse filter timestamps as "%Y-%m-%dT%H:%M:%SZ": milliseconds make the whole
// log query fail with 400 "Invalid filter definition".
describe('toApiTimestamp', () => {
  it('emits ISO 8601 UTC to second precision, with no milliseconds', () => {
    expect(toApiTimestamp(new Date('2026-09-01T10:27:08.000Z'))).toBe('2026-09-01T10:27:08Z')
  })

  it('truncates rather than rounds a sub-second value', () => {
    expect(toApiTimestamp(new Date('2026-09-01T10:27:08.999Z'))).toBe('2026-09-01T10:27:08Z')
  })

  it('never emits the form the old parser rejects', () => {
    expect(toApiTimestamp(new Date('2026-09-01T10:27:08.123Z'))).not.toMatch(/\.\d/)
  })

  it('accepts the shapes the rest of the app holds timestamps in', () => {
    const expected = '2026-09-01T10:27:08Z'
    expect(toApiTimestamp('2026-09-01T10:27:08.000Z')).toBe(expected)
    expect(toApiTimestamp(Date.parse('2026-09-01T10:27:08.000Z'))).toBe(expected)
    expect(toApiTimestamp(new Date('2026-09-01T10:27:08Z'))).toBe(expected)
  })

  it('returns null for a missing or unparseable value', () => {
    expect(toApiTimestamp(null)).toBeNull()
    expect(toApiTimestamp(undefined)).toBeNull()
    expect(toApiTimestamp('')).toBeNull()
    expect(toApiTimestamp('not a date')).toBeNull()
  })
})
