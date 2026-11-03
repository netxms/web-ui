import { describe, it, expect } from 'vitest'
import {
  AVAILABILITY_PERIOD,
  availabilityRange,
  isOpenEnded,
  periodLabel,
} from '@/utils/availabilityPeriod'

// Wednesday 2026-09-23, mid-afternoon local time: periods are calendar boundaries in the user's
// timezone.
const NOW = new Date(2026, 8, 23, 15, 30, 0)

/** Local-time 'YYYY-MM-DD HH:mm:ss', independent of the test machine's TZ. */
function local(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

function range(period, days = 1) {
  const { from, to } = availabilityRange(period, days, NOW)
  return [local(from), local(to)]
}

describe('isOpenEnded', () => {
  it('treats even period ids as running up to now', () => {
    expect(isOpenEnded(AVAILABILITY_PERIOD.TODAY)).toBe(true)
    expect(isOpenEnded(AVAILABILITY_PERIOD.THIS_WEEK)).toBe(true)
    expect(isOpenEnded(AVAILABILITY_PERIOD.THIS_MONTH)).toBe(true)
    expect(isOpenEnded(AVAILABILITY_PERIOD.THIS_YEAR)).toBe(true)
    expect(isOpenEnded(AVAILABILITY_PERIOD.CUSTOM)).toBe(true)
  })

  it('treats odd period ids as closed', () => {
    expect(isOpenEnded(AVAILABILITY_PERIOD.YESTERDAY)).toBe(false)
    expect(isOpenEnded(AVAILABILITY_PERIOD.LAST_WEEK)).toBe(false)
    expect(isOpenEnded(AVAILABILITY_PERIOD.LAST_MONTH)).toBe(false)
    expect(isOpenEnded(AVAILABILITY_PERIOD.LAST_YEAR)).toBe(false)
  })

  it('reads a missing period as Today', () => {
    expect(isOpenEnded(undefined)).toBe(true)
  })
})

describe('availabilityRange', () => {
  it('today runs from midnight to now', () => {
    expect(range(AVAILABILITY_PERIOD.TODAY)).toEqual(['2026-09-23 00:00:00', '2026-09-23 15:30:00'])
  })

  it('yesterday closes one second before today starts', () => {
    expect(range(AVAILABILITY_PERIOD.YESTERDAY)).toEqual([
      '2026-09-22 00:00:00',
      '2026-09-22 23:59:59',
    ])
  })

  it('this week starts on Monday', () => {
    expect(range(AVAILABILITY_PERIOD.THIS_WEEK)).toEqual([
      '2026-09-21 00:00:00',
      '2026-09-23 15:30:00',
    ])
  })

  it('last week is the seven days before this Monday', () => {
    expect(range(AVAILABILITY_PERIOD.LAST_WEEK)).toEqual([
      '2026-09-14 00:00:00',
      '2026-09-20 23:59:59',
    ])
  })

  it('counts Sunday as the last day of its week, not the first', () => {
    const sunday = new Date(2026, 8, 27, 12, 0, 0)
    const { from } = availabilityRange(AVAILABILITY_PERIOD.THIS_WEEK, 1, sunday)
    expect(local(from)).toBe('2026-09-21 00:00:00')
  })

  it('this month starts on the first', () => {
    expect(range(AVAILABILITY_PERIOD.THIS_MONTH)).toEqual([
      '2026-09-01 00:00:00',
      '2026-09-23 15:30:00',
    ])
  })

  it('last month spans the whole previous month', () => {
    expect(range(AVAILABILITY_PERIOD.LAST_MONTH)).toEqual([
      '2026-08-01 00:00:00',
      '2026-08-31 23:59:59',
    ])
  })

  it('handles last month from a day that the previous month does not have', () => {
    // Naive month arithmetic on the 31st lands in the month after last.
    const march31 = new Date(2026, 2, 31, 9, 0, 0)
    const { from, to } = availabilityRange(AVAILABILITY_PERIOD.LAST_MONTH, 1, march31)
    expect([local(from), local(to)]).toEqual(['2026-02-01 00:00:00', '2026-02-28 23:59:59'])
  })

  it('this year starts on 1 January', () => {
    expect(range(AVAILABILITY_PERIOD.THIS_YEAR)).toEqual([
      '2026-01-01 00:00:00',
      '2026-09-23 15:30:00',
    ])
  })

  it('last year ends one second before this year', () => {
    expect(range(AVAILABILITY_PERIOD.LAST_YEAR)).toEqual([
      '2025-01-01 00:00:00',
      '2025-12-31 23:59:59',
    ])
  })

  it('counts the custom period inclusive of today', () => {
    expect(range(AVAILABILITY_PERIOD.CUSTOM, 1)).toEqual([
      '2026-09-23 00:00:00',
      '2026-09-23 15:30:00',
    ])
    expect(range(AVAILABILITY_PERIOD.CUSTOM, 30)[0]).toBe('2026-08-25 00:00:00')
  })

  it('floors a nonsensical day count to one day rather than inverting the range', () => {
    expect(range(AVAILABILITY_PERIOD.CUSTOM, 0)[0]).toBe('2026-09-23 00:00:00')
    expect(range(AVAILABILITY_PERIOD.CUSTOM, -5)[0]).toBe('2026-09-23 00:00:00')
  })

  it('falls back to today for an unknown period id', () => {
    expect(range(99)).toEqual(['2026-09-23 00:00:00', '2026-09-23 15:30:00'])
  })

  it('never returns an inverted range', () => {
    for (const period of Object.values(AVAILABILITY_PERIOD)) {
      const { from, to } = availabilityRange(period, 7, NOW)
      expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime())
    }
  })
})

describe('periodLabel', () => {
  it('names the fixed periods', () => {
    expect(periodLabel(AVAILABILITY_PERIOD.LAST_MONTH)).toBe('Last month')
  })

  it('folds the day count into the custom period', () => {
    expect(periodLabel(AVAILABILITY_PERIOD.CUSTOM, 30)).toBe('Last 30 days')
    expect(periodLabel(AVAILABILITY_PERIOD.CUSTOM, 1)).toBe('Last day')
  })

  it('does not invent a name for an unknown id', () => {
    expect(periodLabel(42)).toBe('Unknown period')
  })
})
