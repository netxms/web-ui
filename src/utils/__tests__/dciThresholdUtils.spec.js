// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { liveThresholdInfo } from '@/utils/dciThresholdUtils'

const activeThreshold = {
  function: 'last',
  condition: 'notLike',
  value: 'Yes',
  currentSeverity: 2,
  activationEvent: 'CISCO_CONFIG_NOT_SAVED',
  lastEventMessage: 'Unsaved configuration changes',
}

describe('liveThresholdInfo', () => {
  it('is empty for a DCI with no active threshold', () => {
    expect(liveThresholdInfo({ hasActiveThreshold: false, thresholdDisableEndTime: 0 })).toBeNull()
  })

  it('describes the active threshold with its event, message and severity', () => {
    const info = liveThresholdInfo({ hasActiveThreshold: true, threshold: activeThreshold })
    expect(info).toEqual({
      kind: 'active',
      text: 'Last NOT LIKE Yes',
      severity: 2,
      event: 'CISCO_CONFIG_NOT_SAVED',
      message: 'Unsaved configuration changes',
    })
  })

  it("uses a table DCI's preformatted condition", () => {
    const info = liveThresholdInfo({
      isTable: true,
      hasActiveThreshold: true,
      threshold: { condition: 'Usage > 90', currentSeverity: 4 },
    })
    expect(info).toMatchObject({ kind: 'active', text: 'Usage > 90', severity: 4 })
  })

  // Legacy checks suspension before the active threshold, so a suspended DCI says so even
  // if a threshold was reached before processing stopped.
  it('reports suspended threshold processing ahead of an active threshold', () => {
    const permanent = liveThresholdInfo({
      thresholdDisableEndTime: -1,
      hasActiveThreshold: true,
      threshold: activeThreshold,
    })
    expect(permanent).toEqual({ kind: 'disabled', text: 'Disabled permanently' })

    const until = liveThresholdInfo({ thresholdDisableEndTime: 1_800_000_000 })
    expect(until.kind).toBe('disabled')
    expect(until.text).toMatch(/^Disabled until /)
  })
})
