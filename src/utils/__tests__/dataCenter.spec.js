import { describe, it, expect } from 'vitest'
import { DEMO_DATA_CENTER } from '@/api/demoSeeds'
import {
  coolingTemperatures,
  coolingZoneRows,
  dataCenterChildren,
  facilityPower,
  feedLossRisks,
  feedSplit,
  feedTags,
  facilityContaining,
  feedsAffecting,
  findFacilities,
  firstTagLoads,
  freeUnits,
  namedItems,
  nodesOfClass,
  objectMetric,
  powerDomainRows,
  powerPaths,
  powerSplit,
  rackAlarmCounts,
  rackPowerTotal,
  racksAround,
  readMetric,
  roomsOfRacks,
  scenarioLoads,
  statusCounts,
  sumKilowatts,
  taggedItems,
  toKilowatts,
  upsLosses,
} from '../dataCenter'

const rack = (id) => ({ id, class: 'Rack', children: [] })
const pd = (id, children) => ({ id, class: 'PowerDomain', children })

// Two UPSes, each with one PDU, both PDUs feeding racks 1 and 2.
const facility = {
  id: 100,
  class: 'Facility',
  children: [
    pd(10, [pd(11, [pd(12, [rack(1), rack(2)])]), pd(21, [pd(22, [rack(1), rack(2)])])]),
    { id: 30, class: 'Room', children: [rack(1), rack(2), { id: 5, class: 'Node', children: [] }] },
    { id: 40, class: 'Container', children: [{ id: 41, class: 'Node', children: [] }] },
    {
      id: 50,
      class: 'Container',
      children: [{ id: 51, class: 'CoolingZone', children: [rack(1)] }],
    },
  ],
}

const configs = new Map([
  [10, { feedTag: '' }],
  [11, { feedTag: 'A' }],
  [12, { feedTag: 'A' }],
  [21, { feedTag: 'B' }],
  [22, { feedTag: 'B' }],
])
const loads = new Map([
  [10, 100],
  [11, 30],
  [12, 28],
  [21, 32],
  [22, 30],
])

describe('data center tree', () => {
  it('finds each facility once, wherever it sits', () => {
    const tree = [{ id: 2, class: 'Container', children: [facility, { ...facility }] }]
    expect(findFacilities(tree).map((f) => f.id)).toEqual([100])
  })

  it('finds the facility holding an object, deep down or the facility itself', () => {
    const tree = [{ id: 2, class: 'Container', children: [facility] }, rack(9)]
    expect(facilityContaining(tree, 51)?.id).toBe(100)
    expect(facilityContaining(tree, 100)?.id).toBe(100)
    expect(facilityContaining(tree, 9)).toBe(null)
    expect(facilityContaining(tree, undefined)).toBe(null)
  })

  it('keeps the data center classes and containers that lead to them', () => {
    const kept = dataCenterChildren(facility)
    expect(kept.map((n) => n.id)).toEqual([10, 30, 50])
    expect(kept[1].children).toEqual([])
    expect(kept[2].children.map((n) => n.id)).toEqual([51])
  })
})

describe('racks around a room', () => {
  const rack = (id, name) => ({ id, name, class: 'Rack', status: 0, children: [] })
  const tree = [
    {
      id: 1,
      name: 'DC-1',
      class: 'Facility',
      children: [
        { id: 10, name: 'Hall A', class: 'Room', children: [rack(100, 'A01')] },
        { id: 11, name: 'Hall B', class: 'Room', children: [rack(101, 'B01'), rack(102, 'B02')] },
        {
          id: 12,
          name: 'UPS-A',
          class: 'PowerDomain',
          children: [rack(100, 'A01'), rack(103, 'C01'), rack(101, 'B01')],
        },
      ],
    },
    {
      id: 2,
      name: 'Branch',
      class: 'Container',
      children: [
        { id: 20, name: 'Comms', class: 'Room', children: [rack(200, 'R1')] },
        rack(201, 'R2'),
      ],
    },
  ]

  it('finds the rooms each rack stands in, through any branch', () => {
    const rooms = roomsOfRacks(tree)
    expect(rooms.get(101)).toEqual([{ id: 11, name: 'Hall B' }])
    expect(rooms.get(103)).toBeUndefined()
  })

  it("lists the facility's racks outside the room, once each and by name", () => {
    expect(racksAround(tree, 10)).toEqual([
      { id: 101, name: 'B01', status: 0, rooms: [{ id: 11, name: 'Hall B' }] },
      { id: 102, name: 'B02', status: 0, rooms: [{ id: 11, name: 'Hall B' }] },
      { id: 103, name: 'C01', status: 0, rooms: [] },
    ])
  })

  it('looks beside a room that has no facility', () => {
    expect(racksAround(tree, 20).map((r) => r.name)).toEqual(['R2'])
    expect(racksAround(tree, 99)).toEqual([])
  })
})

describe('system tags', () => {
  it('selects DCIs by tag base and skips disabled ones', () => {
    const dcis = [
      { id: 1, systemTag: 'power.feed/A', unitName: 'kW' },
      { id: 2, systemTag: 'power.feed/B', unitName: 'kW', status: 'disabled' },
      { id: 3, systemTag: 'env.temp.inlet' },
      { id: 4, systemTag: '' },
    ]
    expect(taggedItems(9, dcis, ['power.feed']).map((i) => [i.dciId, i.qualifier])).toEqual([
      [1, 'A'],
    ])
  })

  it('adds power across feeds and takes the hottest temperature', () => {
    const items = [
      { objectId: 9, dciId: 1, qualifier: 'A', unitName: 'kW' },
      { objectId: 9, dciId: 2, qualifier: 'B', unitName: 'kW' },
    ]
    const rows = {
      1: { value: '3.5', unitName: 'kW' },
      2: { value: '2.5', hasActiveThreshold: true, threshold: { currentSeverity: 2 } },
    }
    const valueOf = (item) => rows[item.dciId]
    expect(readMetric(items, valueOf)).toMatchObject({ value: 6, unit: 'kW', severity: 2 })
    expect(readMetric(items, valueOf, 'max').value).toBe(3.5)
    expect(readMetric(items, () => ({ value: '' }))).toBeNull()
  })

  it('reads power in kilowatts', () => {
    expect([toKilowatts(2500, 'W'), toKilowatts(1.2, 'MW'), toKilowatts(4, 'kW')]).toEqual([
      2.5, 1200, 4,
    ])
  })
})

describe('power chain', () => {
  const rows = powerDomainRows(facility)

  it('lists domains in tree order with depth and the racks they feed', () => {
    expect(rows.map((r) => [r.node.id, r.depth, r.racks])).toEqual([
      [10, 0, 2],
      [11, 1, 2],
      [12, 2, 2],
      [21, 1, 2],
      [22, 2, 2],
    ])
    expect(feedTags(rows, configs)).toEqual(['A', 'B'])
  })

  it('moves a lost feed to the partner that feeds the same racks', () => {
    const lostA = scenarioLoads(rows, configs, loads, 'A')
    expect(lostA.get(11)).toMatchObject({ offline: true, load: null })
    expect(lostA.get(21)).toMatchObject({ offline: false, load: 62, partners: [11] })
    expect(lostA.get(22).load).toBe(58)
    expect(lostA.get(10).load).toBe(100)
  })

  it('keeps loads as they are with both feeds up', () => {
    const normal = scenarioLoads(rows, configs, loads, null)
    expect([...normal.values()].map((s) => s.load)).toEqual([100, 30, 28, 32, 30])
  })

  it('leaves the load unknown when a partner reports none', () => {
    const partial = new Map(loads)
    partial.delete(12)
    expect(scenarioLoads(rows, configs, partial, 'A').get(22).load).toBeNull()
  })

  it("offers a branch its own feed and its partners' feeds", () => {
    expect(feedsAffecting(rows, configs, [11, 12])).toEqual(['A', 'B'])
    expect(feedsAffecting(rows, configs, [10])).toEqual([])
    const unpartnered = new Map(configs).set(21, { feedTag: '' }).set(22, { feedTag: '' })
    expect(feedsAffecting(rows, unpartnered, [11, 12])).toEqual(['A'])
  })
})

/** Items and a valueOf over `{ [objectId]: { [base or base/qualifier]: value } }`. */
function metricsOf(table, unitName = 'kW') {
  const items = []
  const values = new Map()
  let dciId = 1
  for (const [objectId, metrics] of Object.entries(table)) {
    for (const [tag, value] of Object.entries(metrics)) {
      const [base, qualifier = ''] = tag.split('/')
      items.push({ objectId: Number(objectId), dciId, base, qualifier, unitName })
      values.set(dciId++, value == null ? { value: '' } : { value: String(value), unitName })
    }
  }
  return { items, valueOf: (item) => values.get(item.dciId) }
}

describe('metrics by name', () => {
  it('selects agent metrics by name prefix and gives the prefix as base', () => {
    const dcis = [
      { id: 1, name: 'ENTSOE.CarbonIntensity(DE_LU)', unitName: 'g/kWh' },
      { id: 2, name: 'ENTSOE.RenewableShare(DE_LU)', status: 'disabled' },
      { id: 3, name: 'Facility.Power' },
    ]
    expect(namedItems(7, dcis, ['ENTSOE.CarbonIntensity(', 'ENTSOE.RenewableShare('])).toEqual([
      { objectId: 7, dciId: 1, base: 'ENTSOE.CarbonIntensity(', qualifier: '', unitName: 'g/kWh' },
    ])
  })

  it("reads one object's metric out of many", () => {
    const { items, valueOf } = metricsOf({ 1: { 'heat.export': 38 }, 2: { 'heat.export': 5 } })
    expect(objectMetric(items, 2, 'heat.export', valueOf).value).toBe(5)
    expect(objectMetric(items, 3, 'heat.export', valueOf)).toBeNull()
  })
})

describe('facility figures', () => {
  const grid = pd(60, [])
  const generator = pd(61, [])
  const site = { id: 100, class: 'Facility', children: [grid, generator, pd(62, [])] }
  const rows = powerDomainRows(site)
  const types = new Map([
    [60, { domainType: 'GRID_ENTRY' }],
    [61, { domainType: 'GENERATOR' }],
    [62, { domainType: 'UPS' }],
  ])

  it('adds grid entries and generators, and nothing below them', () => {
    const { items, valueOf } = metricsOf({
      60: { 'power.feed': 140 },
      61: { 'power.gen': 10 },
      62: { 'power.out': 99 },
    })
    expect(facilityPower(rows, types, items, valueOf)).toEqual({ value: 150, unmeasured: [] })
  })

  it('names a source without a DCI and gives up on one without a value', () => {
    const { items, valueOf } = metricsOf({ 60: { 'power.feed': 140 } })
    const result = facilityPower(rows, types, items, valueOf)
    expect(result.value).toBe(140)
    expect(result.unmeasured.map((n) => n.id)).toEqual([61])

    const silent = metricsOf({ 60: { 'power.feed': null }, 61: { 'power.gen': 0 } })
    expect(facilityPower(rows, types, silent.items, silent.valueOf).value).toBeNull()
  })

  it('sums rack feeds and counts the racks that report', () => {
    const { items, valueOf } = metricsOf({
      1: { 'power.feed/A': 3, 'power.feed/B': 2.8 },
      2: { 'power.feed/A': null },
      3: { 'env.temp.inlet': 22 },
    })
    expect(rackPowerTotal([1, 2, 3], items, valueOf)).toEqual({
      value: 5.8,
      reporting: 1,
      total: 2,
    })
    expect(rackPowerTotal([3], items, valueOf)).toEqual({ value: null, reporting: 0, total: 0 })
  })

  it('lists every rack of a facility once', () => {
    expect(nodesOfClass(facility, 'Rack').map((n) => n.id)).toEqual([1, 2])
  })
})

describe('feed loss risks', () => {
  it('reports the domains a lost feed puts over their rating', () => {
    const rows = powerDomainRows(facility)
    const rated = new Map(
      [...configs].map(([id, c]) => [id, { ...c, ratedPower: id === 10 ? 200000 : 50000 }]),
    )
    const risks = feedLossRisks(rows, rows, rated, loads, ['A', 'B'])
    expect(risks.map((r) => [r.lostFeed, r.id, r.load])).toEqual([
      ['A', 21, 62],
      ['A', 22, 58],
      ['B', 11, 62],
      ['B', 12, 58],
    ])
    expect(risks[0].ratio).toBeCloseTo(1.24)
  })

  it('takes loads from the first tag a domain has', () => {
    const { items, valueOf } = metricsOf({
      11: { 'power.in': 31, 'power.out': 30 },
      12: { 'power.feed': 2500 },
      13: { 'power.out': null, 'power.in': 9 },
    })
    const result = firstTagLoads([11, 12, 13], items, valueOf)
    expect([...result]).toEqual([
      [11, 30],
      [12, 2500],
    ])
  })
})

describe('cooling', () => {
  const zone = (id, children) => ({ id, class: 'CoolingZone', children })
  const site = {
    id: 100,
    class: 'Facility',
    children: [zone(20, [zone(21, [rack(1)]), zone(22, [])])],
  }

  it('lists zones in tree order with depth and racks', () => {
    expect(coolingZoneRows(site).map((r) => [r.node.id, r.depth, r.racks])).toEqual([
      [20, 0, 1],
      [21, 1, 1],
      [22, 1, 0],
    ])
    expect(coolingZoneRows(site.children[0].children[0]).map((r) => r.node.id)).toEqual([21])
  })

  it('prefers coolant temperatures and falls back to the air', () => {
    const { items, valueOf } = metricsOf(
      {
        20: { 'cooling.temp.supply': 12.1, 'cooling.temp.return': 18.4, 'env.temp.supply': 17 },
        21: { 'env.temp.supply': 18.5, 'env.temp.return': 33 },
        22: { 'cooling.load': 4 },
      },
      '°C',
    )
    expect(coolingTemperatures(items, 20, valueOf)).toEqual({
      medium: 'water',
      supply: 12.1,
      return: 18.4,
      deltaT: expect.closeTo(6.3),
    })
    expect(coolingTemperatures(items, 21, valueOf)).toMatchObject({ medium: 'air', deltaT: 14.5 })
    expect(coolingTemperatures(items, 22, valueOf)).toBeNull()
  })
})

describe('rack overlays', () => {
  it('counts free units as RackView does', () => {
    const layout = { height: 42, elements: [{ heightU: 1 }, { heightU: 1 }, { heightU: 10 }] }
    expect(freeUnits(layout)).toBe(30)
    expect(freeUnits(null)).toBeNull()
  })

  it('splits rack power between exactly two named feeds', () => {
    const power = (parts) => ({ parts: parts.map(([qualifier, value]) => ({ qualifier, value })) })
    expect(
      feedSplit(
        power([
          ['B', 2],
          ['A', 6],
        ]),
      ),
    ).toEqual({ feeds: ['A', 'B'], share: 0.75 })
    expect(
      feedSplit(
        power([
          ['A', 2],
          ['A', 2],
          ['B', 4],
        ]),
      ).share,
    ).toBe(0.5)
    expect(feedSplit(power([['A', 2]]))).toBeNull()
    expect(
      feedSplit(
        power([
          ['A', 2],
          ['', 2],
        ]),
      ),
    ).toBeNull()
    expect(
      feedSplit(
        power([
          ['A', 0],
          ['B', 0],
        ]),
      ),
    ).toBeNull()
    expect(feedSplit(null)).toBeNull()
  })

  it('counts active alarms of a rack and of what is in it', () => {
    const members = new Map([
      [1, new Set([501, 502])],
      [2, new Set()],
    ])
    const alarms = [
      { source: 1, state: 0 },
      { source: 501, state: 1 },
      { source: 502, state: 2 },
      { source: 999, state: 0 },
    ]
    expect([...rackAlarmCounts(alarms, members)]).toEqual([
      [1, 2],
      [2, 0],
    ])
  })
})

describe('power paths', () => {
  it('walks up from the rack through the domains above it, once per path', () => {
    const tree = [{ id: 2, class: 'ServiceRoot', children: [facility, facility] }]
    expect(powerPaths(tree, 1).map((path) => path.map((d) => d.id))).toEqual([
      [12, 11, 10],
      [22, 21, 10],
    ])
    expect(powerPaths(tree, 5)).toEqual([])
  })
})

describe('demo data center', () => {
  const objects = Object.values(DEMO_DATA_CENTER.objects)
  const site = objects.find((o) => o.class === 'Facility')
  const items = []
  for (const object of objects) {
    for (const dci of DEMO_DATA_CENTER.dcis[object.id] ?? []) {
      items.push(...taggedItems(object.id, [dci], [dci.systemTag.split('/')[0]].filter(Boolean)))
    }
  }
  const valueOf = (item) =>
    DEMO_DATA_CENTER.values[item.objectId]?.find((row) => row.id === item.dciId) ?? null
  const byName = (name) => objects.find((o) => o.name === name)
  const sum = (ids, base) =>
    ids.reduce((total, id) => total + (objectMetric(items, id, base, valueOf)?.value ?? 0), 0)
  const racksOf = (name) =>
    byName(name).children.filter((id) => DEMO_DATA_CENTER.objects[id].class === 'Rack')

  it('adds up to PUE 1.39 under the tag rules', () => {
    const tree = (id) => ({
      ...DEMO_DATA_CENTER.objects[id],
      children: DEMO_DATA_CENTER.objects[id].children
        .filter((child) => DEMO_DATA_CENTER.objects[child])
        .map(tree),
    })
    const facilityNode = tree(site.id)
    const rows = powerDomainRows(facilityNode)
    const domainConfigs = new Map(rows.map((r) => [r.node.id, r.node.powerDomain]))
    const power = facilityPower(rows, domainConfigs, items, valueOf).value
    const it = rackPowerTotal(
      nodesOfClass(facilityNode, 'Rack').map((r) => r.id),
      items,
      valueOf,
    ).value
    expect(power).toBeCloseTo(149.6)
    expect(it).toBeCloseTo(107.8)
    expect((power / it).toFixed(2)).toBe('1.39')
  })

  it('keeps every PDU equal to the rack feeds it carries', () => {
    for (const [pdu, feed] of [
      ['PDU-A1', 'A'],
      ['PDU-B1', 'B'],
      ['PDU-A2', 'A'],
      ['PDU-B2', 'B'],
    ]) {
      const feeds = racksOf(pdu).reduce(
        (total, id) =>
          total +
          items
            .filter((i) => i.objectId === id && i.base === 'power.feed' && i.qualifier === feed)
            .reduce((s, i) => s + Number(valueOf(i).value), 0),
        0,
      )
      expect(feeds).toBeCloseTo(sum([byName(pdu).id], 'power.out'))
    }
  })

  it('has one alarm per active threshold, at its severity', () => {
    const active = Object.values(DEMO_DATA_CENTER.values)
      .flat()
      .filter((row) => row.hasActiveThreshold)
      .map((row) => [row.ownerId, row.threshold.currentSeverity])
    const SEVERITY = ['normal', 'warning', 'minor', 'major', 'critical']
    expect(
      DEMO_DATA_CENTER.alarms.map((alarm) => [alarm.source, SEVERITY[alarm.severity]]).sort(),
    ).toEqual(active.sort())
  })

  it('mounts no more in a rack than it holds', () => {
    for (const [rackId, devices] of Object.entries(DEMO_DATA_CENTER.devices)) {
      const rack = DEMO_DATA_CENTER.objects[rackId]
      const used = new Set()
      for (const element of [...rack.passiveElements, ...devices]) {
        const top = element.rackPosition ?? element.position
        const height = element.rackHeight ?? element.height
        for (let unit = top - height + 1; unit <= top; unit++) {
          expect([rack.name, unit, used.has(unit)]).toEqual([rack.name, unit, false])
          expect(unit).toBeGreaterThanOrEqual(1)
          used.add(unit)
        }
      }
      expect(used.size).toBeLessThanOrEqual(rack.height)
    }
  })
})

describe('facility power split', () => {
  it('sums one tag over objects and counts those that have it', () => {
    const { items, valueOf } = metricsOf({
      20: { 'cooling.power': 24 },
      21: { 'cooling.power': 7.8 },
      22: { 'cooling.load': 6.5 },
    })
    const result = sumKilowatts([20, 21, 22], 'cooling.power', items, valueOf)
    expect(result.value).toBeCloseTo(31.8)
    expect(result.count).toBe(2)
    const silent = metricsOf({ 20: { 'cooling.power': null } })
    expect(sumKilowatts([20], 'cooling.power', silent.items, silent.valueOf)).toEqual({
      value: null,
      count: 1,
    })
  })

  it('takes UPS losses as input less output of each UPS that reports both', () => {
    const site = { id: 100, class: 'Facility', children: [pd(60, [pd(61, []), pd(62, [])])] }
    const rows = powerDomainRows(site)
    const types = new Map([
      [60, { domainType: 'GRID_ENTRY' }],
      [61, { domainType: 'UPS' }],
      [62, { domainType: 'UPS' }],
    ])
    const { items, valueOf } = metricsOf({
      60: { 'power.in': 200, 'power.out': 150 },
      61: { 'power.in': 58.5, 'power.out': 55.9 },
      62: { 'power.in': 54.3 },
    })
    expect(upsLosses(rows, types, items, valueOf)).toBeCloseTo(2.6)
    expect(upsLosses(rows, new Map(), items, valueOf)).toBeNull()
  })

  it('leaves the rest of the total to Other and skips unknown parts', () => {
    const split = powerSplit(149.6, [
      { id: 'it', value: 107.8 },
      { id: 'cooling', value: null },
      { id: 'losses', value: 5 },
    ])
    expect(split.exceeds).toBe(false)
    expect(split.parts.map((p) => [p.id, Number(p.value.toFixed(1))])).toEqual([
      ['it', 107.8],
      ['losses', 5],
      ['other', 36.8],
    ])
    expect(split.parts.reduce((sum, p) => sum + p.share, 0)).toBeCloseTo(1)
  })

  it('has no Other when the parts make up the total, and says when they exceed it', () => {
    expect(powerSplit(10, [{ id: 'it', value: 9.98 }]).parts.map((p) => p.id)).toEqual(['it'])
    const over = powerSplit(10, [
      { id: 'it', value: 9 },
      { id: 'cooling', value: 3 },
    ])
    expect(over.exceeds).toBe(true)
    expect(over.parts.map((p) => p.share)).toEqual([0.75, 0.25])
    expect(powerSplit(null, [{ id: 'it', value: 9 }])).toBeNull()
  })
})

describe('status counts', () => {
  it('counts each status, worst first, then the ones off the severity scale', () => {
    const nodes = [0, 3, 0, 2, 6, 3, 5].map((status) => ({ status }))
    expect(statusCounts(nodes)).toEqual([
      { status: 3, count: 2 },
      { status: 2, count: 1 },
      { status: 0, count: 2 },
      { status: 5, count: 1 },
      { status: 6, count: 1 },
    ])
    expect(statusCounts([])).toEqual([])
  })
})
