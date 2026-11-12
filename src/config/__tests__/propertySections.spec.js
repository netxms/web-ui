// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getSectionsForClass } from '../propertySections'

function ids(objectClass) {
  return getSectionsForClass(objectClass).map((s) => s.id)
}

function placementSection(objectClass) {
  return getSectionsForClass(objectClass).find((s) => s.id === 'rack-chassis')
}

describe('rack-chassis section visibility', () => {
  it('is offered on a Node', () => {
    expect(ids('Node')).toContain('rack-chassis')
  })

  it('is offered on a Chassis, which can itself be racked', () => {
    expect(ids('Chassis')).toContain('rack-chassis')
  })

  it.each(['MobileDevice', 'Sensor', 'Cluster', 'AccessPoint', 'Container'])(
    'is not offered on %s, which the placement endpoint rejects with 400',
    (objectClass) => {
      expect(ids(objectClass)).not.toContain('rack-chassis')
    },
  )

  it('resolves the real section component, not the placeholder', () => {
    const section = placementSection('Node')
    expect(typeof section.component).toBe('function')
    expect(String(section.component)).toContain('RackChassisSection')
  })

  it('offers the same section object to Node and Chassis', () => {
    expect(placementSection('Chassis')).toEqual(placementSection('Node'))
  })
})

// Dev builds only; Vitest runs with import.meta.env.DEV set.
describe('data center sections', () => {
  it.each([
    ['Facility', 'facility'],
    ['PowerDomain', 'power-domain'],
    ['CoolingZone', 'cooling-zone'],
    ['Room', 'room'],
  ])('gives %s its class section and auto bind, as legacy', (objectClass, sectionId) => {
    expect(ids(objectClass)).toEqual(expect.arrayContaining([sectionId, 'auto-bind']))
  })

  it('gives a rack its cabinet section', () => {
    expect(ids('Rack')).toContain('rack')
  })

  it('puts the class section right after the Basic group', () => {
    const sections = getSectionsForClass('Room')
    const firstOther = sections.findIndex((s) => s.group !== 'Basic')
    expect(sections[firstOther].id).toBe('room')
  })
})
