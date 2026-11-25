// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  BUSINESS_SERVICE_POLLABLE_CLASSES,
  INFRASTRUCTURE_POLLABLE_CLASSES,
  pollTypesForClass,
} from '@/utils/pollTypes'

const ids = (objectClass) => pollTypesForClass(objectClass).map((poll) => poll.id)

describe('pollTypesForClass', () => {
  it('offers the legacy business service polls', () => {
    expect(ids('BusinessService')).toEqual(['status', 'configuration'])
    expect(ids('BusinessServiceProto')).toEqual(['instance-discovery'])
    expect(ids('BusinessServiceRoot')).toEqual([])
  })

  it('offers instance discovery and binding on every data collection container', () => {
    for (const objectClass of ['Collector', 'Facility', 'Room', 'CoolingZone', 'PowerDomain']) {
      expect(ids(objectClass)).toEqual(['instance-discovery', 'autobind'])
    }
  })
})

describe('pollable classes', () => {
  it('puts every pollable class in exactly one perspective, with at least one poll', () => {
    const both = [...INFRASTRUCTURE_POLLABLE_CLASSES, ...BUSINESS_SERVICE_POLLABLE_CLASSES]
    expect(new Set(both).size).toBe(both.length)
    for (const objectClass of both) expect(ids(objectClass).length).toBeGreaterThan(0)
    expect(BUSINESS_SERVICE_POLLABLE_CLASSES).toEqual(['BusinessService', 'BusinessServiceProto'])
  })

  it('opens data center container polls in Infrastructure', () => {
    for (const objectClass of ['Facility', 'Room', 'CoolingZone', 'PowerDomain']) {
      expect(INFRASTRUCTURE_POLLABLE_CLASSES).toContain(objectClass)
    }
  })
})
