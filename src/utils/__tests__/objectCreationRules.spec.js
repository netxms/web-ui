// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { CONTAINER_PARENT_CLASSES, canBindChild } from '@/utils/objectCreationRules'

describe('canBindChild', () => {
  it('lets a room take devices and racks only', () => {
    expect(canBindChild('Rack', 'Room')).toBe(true)
    expect(canBindChild('Node', 'Room')).toBe(true)
    expect(canBindChild('Cluster', 'Room')).toBe(false)
    expect(canBindChild('Container', 'Room')).toBe(false)
  })

  it('lets a facility take rooms, domains and zones but not another facility', () => {
    expect(canBindChild('Room', 'Facility')).toBe(true)
    expect(canBindChild('PowerDomain', 'Facility')).toBe(true)
    expect(canBindChild('CoolingZone', 'Facility')).toBe(true)
    expect(canBindChild('Facility', 'Facility')).toBe(false)
  })

  it('lets a container take a subnet, which no data center class takes', () => {
    expect(canBindChild('Subnet', 'Container')).toBe(true)
    expect(canBindChild('Subnet', 'Facility')).toBe(false)
  })

  it('refuses parents outside the container classes', () => {
    expect(canBindChild('Node', 'Node')).toBe(false)
    expect(canBindChild('Node', 'Template')).toBe(false)
  })

  it('offers the seven container-like parents', () => {
    expect([...CONTAINER_PARENT_CLASSES].sort()).toEqual([
      'Collector',
      'Container',
      'CoolingZone',
      'Facility',
      'PowerDomain',
      'Room',
      'ServiceRoot',
    ])
  })
})
