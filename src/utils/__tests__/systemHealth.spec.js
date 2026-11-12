// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { countAlarmSeverities, countAlarmStates, summarizeNodes } from '../systemHealth'

describe('countAlarmSeverities', () => {
  it('counts integer and string severities', () => {
    const alarms = [{ severity: 4 }, { severity: 'CRITICAL' }, { severity: 3 }, { severity: 0 }]
    expect(countAlarmSeverities(alarms)).toEqual({
      critical: 2,
      major: 1,
      minor: 0,
      warning: 0,
      normal: 1,
    })
  })

  it('handles a missing list', () => {
    expect(countAlarmSeverities(undefined).critical).toBe(0)
  })
})

describe('countAlarmStates', () => {
  it('counts active states and ignores terminated', () => {
    const alarms = [{ state: 0 }, { state: 0 }, { state: 1 }, { state: 'Resolved' }, { state: 3 }]
    expect(countAlarmStates(alarms)).toEqual({ outstanding: 2, acknowledged: 1, resolved: 1 })
  })
})

describe('summarizeNodes', () => {
  it('tallies statuses and maintenance', () => {
    const nodes = [
      { status: 0 },
      { status: 0, isInMaintenanceMode: true },
      { status: 4 },
      { status: 6 },
      { status: 99 },
      {},
    ]
    const summary = summarizeNodes(nodes)
    expect(summary.total).toBe(6)
    expect(summary.maintenance).toBe(1)
    expect(summary.byStatus).toEqual({ 0: 2, 1: 0, 2: 0, 3: 0, 4: 1, 5: 2, 6: 1, 7: 0 })
  })

  it('returns zeros for no nodes', () => {
    expect(summarizeNodes(null)).toEqual({
      total: 0,
      maintenance: 0,
      byStatus: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
    })
  })
})
