import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { dispatchCreateObject, buildCreateMenuItems } from '@/utils/createMenuItems'

const SERVICE_ROOT = { id: 2, class: 'ServiceRoot' }
const NODE = { id: 10, class: 'Node' }

let events

function listen(...names) {
  for (const name of names) {
    const handler = (e) => events.push({ name, detail: e.detail })
    document.addEventListener(name, handler)
    cleanups.push(() => document.removeEventListener(name, handler))
  }
}

let cleanups = []

beforeEach(() => {
  events = []
  cleanups = []
})

afterEach(() => {
  for (const off of cleanups) off()
})

describe('dispatchCreateObject', () => {
  it('fires the dedicated dialog event for a class that has one', () => {
    listen('node:create')

    expect(dispatchCreateObject(SERVICE_ROOT, 'Node')).toBe(true)
    expect(events).toEqual([
      { name: 'node:create', detail: { parent: SERVICE_ROOT, objectClass: 'Node' } },
    ])
  })

  it('fires the generic event for a class without a dedicated dialog', () => {
    listen('object:create')

    expect(dispatchCreateObject(SERVICE_ROOT, 'Container')).toBe(true)
    expect(events).toEqual([
      { name: 'object:create', detail: { parent: SERVICE_ROOT, objectClass: 'Container' } },
    ])
  })

  it('refuses a class that is not creatable under the parent', () => {
    listen('node:create', 'object:create')

    expect(dispatchCreateObject(NODE, 'Node')).toBe(false)
    expect(events).toEqual([])
  })

  it('refuses an unknown class', () => {
    listen('node:create', 'object:create')

    expect(dispatchCreateObject(SERVICE_ROOT, 'NotAClass')).toBe(false)
    expect(events).toEqual([])
  })

  it('refuses a null parent', () => {
    expect(dispatchCreateObject(null, 'Node')).toBe(false)
  })
})

describe('buildCreateMenuItems', () => {
  it('returns nothing without a target', () => {
    expect(buildCreateMenuItems(null)).toEqual([])
  })

  it('offers Node under the infrastructure root', () => {
    const labels = buildCreateMenuItems(SERVICE_ROOT).map((i) => i.label)
    expect(labels).toContain('Node')
  })

  // Menu commands and deep links travel one path.
  it('menu commands dispatch the same events as a deep link', () => {
    listen('node:create')

    const node = buildCreateMenuItems(SERVICE_ROOT).find((i) => i.label === 'Node')
    node.command()

    expect(events).toEqual([
      { name: 'node:create', detail: { parent: SERVICE_ROOT, objectClass: 'Node' } },
    ])
  })
})

// Dev builds only; Vitest runs with import.meta.env.DEV set.
describe('data center classes', () => {
  const FACILITY = { id: 30, class: 'Facility' }
  const ROOM = { id: 31, class: 'Room' }

  it('opens one dialog for the four classes, told the class', () => {
    listen('dataCenterObject:create')

    expect(dispatchCreateObject(SERVICE_ROOT, 'Facility')).toBe(true)
    expect(dispatchCreateObject(FACILITY, 'PowerDomain')).toBe(true)
    expect(events.map((e) => e.detail.objectClass)).toEqual(['Facility', 'PowerDomain'])
  })

  it('offers what legacy offers under a facility and a room', () => {
    const labels = (target) => buildCreateMenuItems(target).map((item) => item.label)
    expect(labels(FACILITY)).toEqual(
      expect.arrayContaining(['Room', 'Power Domain', 'Cooling Zone', 'Rack', 'Container']),
    )
    expect(labels(FACILITY)).not.toContain('Facility')
    expect(labels(ROOM).sort()).toEqual(['Chassis', 'Node', 'Rack', 'Sensor'])
  })
})
