// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ARRIVAL_HIGHLIGHT_MS, isArriving } from '@/utils/logArrival'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('isArriving', () => {
  // The seed is history; otherwise a widget re-seeding on scroll-in flashes every row.
  it('is false for a seed row', () => {
    expect(isArriving({ id: '1', arrivedAt: null })).toBe(false)
  })

  it('is true for a row that just arrived', () => {
    expect(isArriving({ id: '1', arrivedAt: Date.now() })).toBe(true)
  })

  // Aging out on read keeps the highlight meaning "this batch".
  it('is false once the highlight window has passed', () => {
    const row = { id: '1', arrivedAt: Date.now() }
    vi.advanceTimersByTime(ARRIVAL_HIGHLIGHT_MS)
    expect(isArriving(row)).toBe(false)
  })

  it('is false for a row with no stamp', () => {
    expect(isArriving({ id: '1' })).toBe(false)
    expect(isArriving(null)).toBe(false)
  })
})
