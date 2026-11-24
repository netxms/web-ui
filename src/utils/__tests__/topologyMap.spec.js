import { describe, expect, it } from 'vitest'
import { adaptApiNetworkMap, MAP_LINK_COLOR_SOURCES } from '@/utils/networkMapAdapters'
import { MAP_FLAGS, resolveMapRenderOptions } from '@/utils/networkMapUtils'
import { layoutTopology, topologyInterfaceIds, topologyToMapDocument } from '@/utils/topologyMap'
import { LAYOUTS } from '@/utils/topologyUtils'

const topology = {
  objects: [
    { id: 10, class: 'Node', name: 'core-sw', status: 0 },
    { id: 20, class: 'Node', name: 'access-sw', status: 2 },
    { id: 30, class: 'Node', name: 'server', status: 0 },
  ],
  links: [
    // Two physical links between the same switches, on different ports.
    {
      object1: 10,
      object2: 20,
      interface1: 101,
      interface2: 201,
      type: 0,
      port1: 'gi0/1',
      port2: 'gi1/1',
      name: '',
    },
    {
      object1: 10,
      object2: 20,
      interface1: 102,
      interface2: 202,
      type: 0,
      port1: 'gi0/2',
      port2: 'gi1/2',
      name: '',
    },
    {
      object1: 20,
      object2: 30,
      interface1: 0,
      interface2: 0,
      type: 0,
      port1: 'gi1/3',
      port2: 'eth0',
      name: 'uplink',
    },
    // To an object the response left out (no read access).
    {
      object1: 30,
      object2: 99,
      interface1: 0,
      interface2: 0,
      type: 0,
      port1: '',
      port2: '',
      name: '',
    },
  ],
}

const objectsById = new Map([
  [10, { id: 10, class: 'Node', name: 'core-sw', status: 0 }],
  [20, { id: 20, class: 'Node', name: 'access-sw', status: 2 }],
  [30, { id: 30, class: 'Node', name: 'server', status: 0 }],
  [101, { id: 101, class: 'Interface', name: 'GigabitEthernet0/1', status: 4 }],
  [201, { id: 201, class: 'Interface', name: 'GigabitEthernet1/1', status: 0 }],
])

function adapted(positions = {}) {
  return adaptApiNetworkMap(topologyToMapDocument(topology, positions), objectsById)
}

describe('topologyToMapDocument', () => {
  it('turns every object into an element at its position, ids kept', () => {
    const map = adapted({ 10: { x: 0, y: 0 }, 20: { x: 220.4, y: -219.6 } })
    expect(map.elements.map((e) => [e.id, e.objectId, e.x, e.y, e.objectName])).toEqual([
      ['e-10', 10, 0, 0, 'core-sw'],
      ['e-20', 20, 220, -220, 'access-sw'],
      ['e-30', 30, 0, 0, 'server'],
    ])
  })

  it('keeps parallel links and puts the port names at the link ends', () => {
    const links = adapted().links
    expect(links.map((l) => [l.from, l.to, l.connectorLabel1, l.connectorLabel2, l.label])).toEqual(
      [
        ['e-10', 'e-20', 'gi0/1', 'gi1/1', null],
        ['e-10', 'e-20', 'gi0/2', 'gi1/2', null],
        ['e-20', 'e-30', 'gi1/3', 'eth0', 'uplink'],
      ],
    )
  })

  it('colors a link with interfaces by their status, any other link by the map default', () => {
    const [first, second, third] = adapted().links
    expect(first.colorSource).toBe(MAP_LINK_COLOR_SOURCES.INTERFACE_STATUS)
    expect(first.statusSources.interfaces.map((i) => i.status)).toEqual([4, 0])
    expect(second.colorSource).toBe(MAP_LINK_COLOR_SOURCES.INTERFACE_STATUS)
    expect(third.colorSource).toBe(MAP_LINK_COLOR_SOURCES.DEFAULT)
  })

  it('shows object status the way a new map does', () => {
    const options = resolveMapRenderOptions(adapted())
    expect(options.showStatusIcon).toBe(true)
    expect(options.showStatusFrame).toBe(true)
    expect(options.showStatusBackground).toBe(true)
  })

  it('carries the display settings the way a saved map does', () => {
    const doc = topologyToMapDocument(topology, {}, {
      flags: MAP_FLAGS.SHOW_LINK_DIRECTION,
      objectDisplayMode: 1,
    })
    const options = resolveMapRenderOptions(adaptApiNetworkMap(doc, objectsById))
    expect(options.displayMode).toBe(1)
    expect(options.showLinkDirection).toBe(true)
    expect(options.showStatusIcon).toBe(false)
  })

  it('handles an empty response', () => {
    expect(topologyToMapDocument({}, {})).toMatchObject({ elements: [], links: [] })
  })
})

describe('topologyInterfaceIds', () => {
  it('lists every link-end interface once', () => {
    expect(topologyInterfaceIds(topology).sort()).toEqual([101, 102, 201, 202])
  })
})

describe('layoutTopology', () => {
  it('centers the radial layout on the root object', async () => {
    const positions = await layoutTopology(LAYOUTS.RADIAL, topology, 20)
    expect(positions['20']).toEqual({ x: 0, y: 0 })
    expect(Object.keys(positions).sort()).toEqual(['10', '20', '30'])
  })

  it('places every object on the grid', async () => {
    const positions = await layoutTopology(LAYOUTS.GRID, topology, 10)
    expect(Object.keys(positions).sort()).toEqual(['10', '20', '30'])
  })

  it('lays out a 120-object map with the spring layout in under 5 seconds', async () => {
    const objects = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, name: `n${i + 1}` }))
    const links = objects.slice(1).map((obj, i) => ({ object1: Math.floor(i / 3) + 1, object2: obj.id }))
    const started = performance.now()
    const positions = await layoutTopology(LAYOUTS.SPRING, { objects, links }, 1)
    expect(Object.keys(positions)).toHaveLength(120)
    expect(performance.now() - started).toBeLessThan(5000)
  })

  it('runs the spring layout without a rendered canvas', async () => {
    const positions = await layoutTopology(LAYOUTS.SPRING, topology, 10)
    expect(Object.keys(positions).sort()).toEqual(['10', '20', '30'])
    for (const { x, y } of Object.values(positions)) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
    }
    const distinct = new Set(Object.values(positions).map(({ x, y }) => `${x},${y}`))
    expect(distinct.size).toBe(3)
  })
})
