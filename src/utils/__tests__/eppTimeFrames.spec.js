import { describe, it, expect } from 'vitest'
import { decodeTimeFrame, encodeTimeFrame, frameLabel } from '@/utils/eppTimeFrames'

describe('time frame codec', () => {
  it('round-trips a restricted frame', () => {
    const frame = {
      startTime: 480,
      endTime: 1020,
      dayOfWeek: 62,
      dayOfMonth: '1-5, 8, 11-13, L',
      month: 0b100000000001,
    }
    expect(decodeTimeFrame(encodeTimeFrame(frame))).toEqual(frame)
  })

  // Day 31 and Sunday share bit 31; counting it twice once carried into bit 32 and wiped every
  // weekday, so the server never matched "any day" frames.
  it('sets the bit day 31 and Sunday share only once', () => {
    const { time, date } = encodeTimeFrame({
      startTime: 480,
      endTime: 1020,
      dayOfWeek: 0,
      dayOfMonth: '',
      month: 0,
    })
    expect(time).toBe(8001700)
    // Bits 0-37 (last day, days 1-31, Sun-Sat) and 39-50 (Jan-Dec); bit 38 is unused.
    expect(date).toBe(Math.pow(2, 51) - 1 - Math.pow(2, 38))
    expect(decodeTimeFrame({ time, date })).toMatchObject({ dayOfWeek: 127, month: 4095 })
  })

  it('reads the shared bit back as Sunday too, which is how the server matches it', () => {
    const encoded = encodeTimeFrame({
      startTime: 0,
      endTime: 1439,
      dayOfWeek: 62,
      dayOfMonth: '31',
      month: 0,
    })
    expect(decodeTimeFrame(encoded).dayOfWeek).toBe(63)
  })
})

describe('frameLabel', () => {
  it('says "Always" for a frame that restricts nothing', () => {
    const decoded = decodeTimeFrame(
      encodeTimeFrame({ startTime: 0, endTime: 1439, dayOfWeek: 0, dayOfMonth: '', month: 0 }),
    )
    expect(frameLabel(decoded)).toBe('Always')
  })

  it('names hours, days and months', () => {
    expect(
      frameLabel({ startTime: 480, endTime: 1020, dayOfWeek: 2, dayOfMonth: '1', month: 1 }),
    ).toBe('08:00–17:00, 1st of January, Mon only')
    expect(
      frameLabel({ startTime: 0, endTime: 1439, dayOfWeek: 30, dayOfMonth: '1-8, L', month: 0 }),
    ).toBe('1st–8th, last day of each month, Mon, Tue, Wed, Thu only')
  })
})
