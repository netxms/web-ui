// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { PREVIEW_RANGE_SECONDS, lastCollectedAt, previewWindowEnd } from '@/utils/dciHistoryPreview'

const NOW = Date.parse('2026-10-16T12:00:00Z') / 1000

describe('lastCollectedAt', () => {
  it('reads an ISO timestamp as Unix seconds', () => {
    expect(lastCollectedAt('2026-09-29T10:19:12Z')).toBe(Date.parse('2026-09-29T10:19:12Z') / 1000)
  })

  // The server compares in milliseconds: flooring would cut off the anchoring value.
  it('rounds a fractional second up so the value itself stays in the window', () => {
    expect(lastCollectedAt('2026-09-29T10:19:12.400Z')).toBe(
      Date.parse('2026-09-29T10:19:13Z') / 1000,
    )
  })

  it('treats a missing, unparsable or epoch timestamp as never collected', () => {
    expect(lastCollectedAt(null)).toBeNull()
    expect(lastCollectedAt(undefined)).toBeNull()
    expect(lastCollectedAt('')).toBeNull()
    expect(lastCollectedAt('not a date')).toBeNull()
    expect(lastCollectedAt('1970-01-01T00:00:00Z')).toBeNull()
  })
})

describe('previewWindowEnd', () => {
  it('ends at now while the DCI collected within the window', () => {
    const recent = new Date((NOW - 60) * 1000).toISOString()
    expect(previewWindowEnd(recent, NOW)).toBeNull()
  })

  it('ends at the last value once nothing was collected for longer than the window', () => {
    const last = NOW - PREVIEW_RANGE_SECONDS - 3600
    expect(previewWindowEnd(new Date(last * 1000).toISOString(), NOW)).toBe(last)
  })

  it('ends at now for a DCI that never collected anything', () => {
    expect(previewWindowEnd(null, NOW)).toBeNull()
    expect(previewWindowEnd('1970-01-01T00:00:00Z', NOW)).toBeNull()
  })
})
