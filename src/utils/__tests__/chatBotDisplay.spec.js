// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { chatBotStatus, normalizeMappings } from '../chatBotDisplay'

describe('chatBotStatus', () => {
  it('reports an uninitialized driver', () => {
    expect(chatBotStatus({ driverInitialized: false, healthCheckStatus: true }).label).toBe(
      'Not Initialized',
    )
    expect(chatBotStatus({}).label).toBe('Not Initialized')
    expect(chatBotStatus(null).label).toBe('Not Initialized')
  })

  it('reports a failed health check on an initialized driver', () => {
    const status = chatBotStatus({ driverInitialized: true, healthCheckStatus: false })
    expect(status.label).toBe('Unhealthy')
    expect(status.class).toBe('status-warn')
  })

  it('reports a healthy bot', () => {
    const status = chatBotStatus({ driverInitialized: true, healthCheckStatus: true })
    expect(status.label).toBe('Healthy')
    expect(status.class).toBe('status-ok')
  })
})

describe('normalizeMappings', () => {
  it('returns an empty array for missing input', () => {
    expect(normalizeMappings(undefined)).toEqual([])
    expect(normalizeMappings([])).toEqual([])
  })

  it('trims peer IDs and drops blank ones', () => {
    expect(
      normalizeMappings([
        { peerId: '  123456  ', userId: 5 },
        { peerId: '   ', userId: 6 },
        { peerId: '', userId: 7 },
        { userId: 8 },
      ]),
    ).toEqual([{ peerId: '123456', userId: 5 }])
  })

  it('collapses duplicate peer IDs keeping the last one', () => {
    expect(
      normalizeMappings([
        { peerId: '42', userId: 1 },
        { peerId: '42', userId: 2 },
      ]),
    ).toEqual([{ peerId: '42', userId: 2 }])
  })

  it('coerces missing or non-numeric user IDs to 0 (system administrator)', () => {
    expect(normalizeMappings([{ peerId: '42' }])).toEqual([{ peerId: '42', userId: 0 }])
    expect(normalizeMappings([{ peerId: '42', userId: 'x' }])).toEqual([
      { peerId: '42', userId: 0 },
    ])
  })
})
