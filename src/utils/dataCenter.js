/**
 * Data center model helpers: the Facility tree, metrics found by DCI system tag, the power chain.
 * A rack (or node) may sit under a Room, a CoolingZone and several PowerDomains at once, so the
 * same object appears in several branches of a sub-tree.
 */

import { systemTagBase, systemTagQualifier } from './dciSystemTags'

export const DATA_CENTER_CLASSES = ['Facility', 'PowerDomain', 'CoolingZone', 'Room']

const TREE_CLASSES = new Set([...DATA_CENTER_CLASSES, 'Container'])

/**
 * Facilities anywhere in a sub-tree, each once.
 *
 * @param {object[]} nodes - sub-tree nodes
 * @returns {object[]}
 */
export function findFacilities(nodes) {
  const found = new Map()
  const walk = (list) => {
    for (const node of list ?? []) {
      if (node.class === 'Facility') {
        if (!found.has(node.id)) found.set(node.id, node)
        continue
      }
      walk(node.children)
    }
  }
  walk(nodes)
  return [...found.values()]
}

/**
 * The facility whose sub-tree holds `id`, the facility itself included; null when none does.
 *
 * @param {Array<object>} nodes - sub-tree nodes
 * @param {number} id
 */
export function facilityContaining(nodes, id) {
  if (id == null) return null
  return findFacilities(nodes).find((facility) => indexNodes([facility]).has(id)) ?? null
}

/**
 * Children reduced to the data center classes, keeping a container only when something of
 * those classes is below it. Racks and devices are left to the views.
 *
 * @param {object} node
 * @returns {object[]}
 */
export function dataCenterChildren(node) {
  const result = []
  for (const child of node.children ?? []) {
    if (!TREE_CLASSES.has(child.class)) continue
    const children = dataCenterChildren(child)
    if (child.class === 'Container' && children.length === 0) continue
    result.push({ ...child, children })
  }
  return result
}

/** @param {object[]} nodes @returns {Map<number, object>} first occurrence of every id */
export function indexNodes(nodes) {
  const index = new Map()
  const walk = (list) => {
    for (const node of list ?? []) {
      if (!index.has(node.id)) index.set(node.id, node)
      walk(node.children)
    }
  }
  walk(nodes)
  return index
}

/**
 * DCIs of one object whose system tag has one of the given bases.
 *
 * @param {number} objectId
 * @param {Array<{id: number, systemTag?: string, unitName?: string, status?: string}>} dcis
 * @param {string[]} bases
 * @returns {Array<{objectId: number, dciId: number, base: string, qualifier: string,
 *   unitName: string}>}
 */
export function taggedItems(objectId, dcis, bases) {
  const wanted = new Set(bases)
  return (dcis ?? [])
    .filter((dci) => dci.status !== 'disabled' && wanted.has(systemTagBase(dci.systemTag)))
    .map((dci) => ({
      objectId,
      dciId: dci.id,
      base: systemTagBase(dci.systemTag),
      qualifier: systemTagQualifier(dci.systemTag),
      unitName: dci.unitName ?? '',
    }))
}

/**
 * One metric from its tagged DCIs. Power across qualifiers (feed A + B) adds up; several
 * temperature sensors on one rack report their highest.
 *
 * @param {ReturnType<typeof taggedItems>} items - same object, same base
 * @param {(item: object) => object|null} valueOf - adapted DCIValue row
 * @param {'sum'|'max'} [combine]
 * @returns {{ value: number, unit: string, parts: Array<{qualifier: string, value: number}>,
 *   severity: number } | null} null when no DCI has a numeric value
 */
export function readMetric(items, valueOf, combine = 'sum') {
  const parts = []
  let severity = 0
  let unit = ''
  for (const item of items) {
    const row = valueOf(item)
    const value = Number(row?.value)
    if (row == null || row.value === '' || !Number.isFinite(value)) continue
    parts.push({ qualifier: item.qualifier, value })
    unit ||= row.unitName || item.unitName
    if (row.hasActiveThreshold) severity = Math.max(severity, row.threshold?.currentSeverity ?? 0)
  }
  if (!parts.length) return null
  const value =
    combine === 'max'
      ? Math.max(...parts.map((p) => p.value))
      : parts.reduce((sum, p) => sum + p.value, 0)
  return { value, unit, parts, severity }
}

/**
 * DCIs of one object whose name starts with one of the given prefixes, for metrics that have no
 * system tag but a fixed name from the agent (`ENTSOE.CarbonIntensity(DE_LU)`). The prefix is
 * the item's `base`.
 *
 * @param {number} objectId
 * @param {Array<{id: number, name?: string, unitName?: string, status?: string}>} dcis
 * @param {string[]} prefixes
 * @returns {ReturnType<typeof taggedItems>}
 */
export function namedItems(objectId, dcis, prefixes) {
  const items = []
  for (const dci of dcis ?? []) {
    if (dci.status === 'disabled') continue
    const prefix = prefixes.find((p) => (dci.name ?? '').startsWith(p))
    if (prefix) {
      items.push({
        objectId,
        dciId: dci.id,
        base: prefix,
        qualifier: '',
        unitName: dci.unitName ?? '',
      })
    }
  }
  return items
}

/**
 * One metric of one object, from items of many.
 *
 * @param {ReturnType<typeof taggedItems>} items
 * @param {number} objectId
 * @param {string} base
 * @param {(item: object) => object|null} valueOf
 * @param {'sum'|'max'} [combine]
 */
export function objectMetric(items, objectId, base, valueOf, combine = 'sum') {
  const own = items.filter((item) => item.objectId === objectId && item.base === base)
  return own.length ? readMetric(own, valueOf, combine) : null
}

/** First base in this order that a power domain has DCIs for is its load. */
export const POWER_LOAD_TAGS = ['power.out', 'power.in', 'power.feed', 'power.gen']

/** Unit factor to kilowatts; a unit it does not know is read as kW. */
export function toKilowatts(value, unit) {
  const u = (unit ?? '').trim()
  if (u === 'W') return value / 1000
  if (u === 'MW') return value * 1000
  return value
}

/**
 * Domains (or zones) of one class below a node in tree order, each once, with their depth and the
 * set of other objects (racks, devices) they serve directly or through lower ones of the class.
 *
 * @param {object} root - full sub-tree node of a Facility, or of an object of `objectClass`
 * @param {'PowerDomain'|'CoolingZone'} objectClass
 * @returns {Array<{ node: object, depth: number, consumers: Set<number>, racks: number }>}
 */
function containerRows(root, objectClass) {
  const rows = []
  const seen = new Set()
  const consumersOf = (node, into = new Map()) => {
    for (const child of node.children ?? []) {
      if (child.class === objectClass) consumersOf(child, into)
      else into.set(child.id, child.class)
    }
    return into
  }
  const row = (node, depth) => {
    const consumers = consumersOf(node)
    const racks = [...consumers.values()].filter((cls) => cls === 'Rack').length
    return { node, depth, consumers: new Set(consumers.keys()), racks }
  }
  const walk = (node, depth) => {
    for (const child of node.children ?? []) {
      if (child.class !== objectClass || seen.has(child.id)) continue
      seen.add(child.id)
      rows.push(row(child, depth))
      walk(child, depth + 1)
    }
  }
  if (root.class === objectClass) {
    seen.add(root.id)
    rows.push(row(root, 0))
    walk(root, 1)
  } else {
    walk(root, 0)
  }
  return rows
}

/** @param {object} root - full sub-tree node of a Facility or PowerDomain */
export const powerDomainRows = (root) => containerRows(root, 'PowerDomain')

/** @param {object} root - full sub-tree node of a Facility or CoolingZone */
export const coolingZoneRows = (root) => containerRows(root, 'CoolingZone')

function sameSet(a, b) {
  if (a.size !== b.size || a.size === 0) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

/**
 * kW of each object from the first of `tags` it has DCIs for; an object whose first tagged DCI
 * has no value is absent, as is one without any.
 *
 * @param {number[]} ids
 * @param {ReturnType<typeof taggedItems>} items
 * @param {(item: object) => object|null} valueOf
 * @param {string[]} [tags]
 * @returns {Map<number, number>}
 */
export function firstTagLoads(ids, items, valueOf, tags = POWER_LOAD_TAGS) {
  const loads = new Map()
  for (const id of ids) {
    const own = items.filter((item) => item.objectId === id)
    for (const base of tags) {
      const tagged = own.filter((item) => item.base === base)
      if (!tagged.length) continue
      const metric = readMetric(tagged, valueOf)
      if (metric) loads.set(id, toKilowatts(metric.value, metric.unit))
      break
    }
  }
  return loads
}

/**
 * Load of every domain with one feed lost. A domain on the lost feed carries nothing; one on
 * another feed also takes the load of its partners: domains on another feed at the same depth
 * that feed exactly the same racks and devices (a UPS and its only PDU feed the same racks, but
 * are not each other's partners). Domains without a feed tag keep their load.
 *
 * @param {ReturnType<typeof powerDomainRows>} rows
 * @param {Map<number, {feedTag?: string}>} configs - power domain group by id
 * @param {Map<number, number>} loads - kW by id; absent when unknown
 * @param {string|null} lostFeed
 * @returns {Map<number, { load: number|null, offline: boolean, partners: number[] }>}
 */
export function scenarioLoads(rows, configs, loads, lostFeed) {
  const result = new Map()
  for (const row of rows) {
    const id = row.node.id
    const feed = configs.get(id)?.feedTag ?? ''
    const own = loads.has(id) ? loads.get(id) : null
    const partners = rows
      .filter((other) => {
        const otherFeed = configs.get(other.node.id)?.feedTag ?? ''
        return (
          other.depth === row.depth &&
          feed &&
          otherFeed &&
          otherFeed !== feed &&
          sameSet(row.consumers, other.consumers)
        )
      })
      .map((other) => other.node.id)

    if (!lostFeed || !feed) {
      result.set(id, { load: own, offline: false, partners })
    } else if (feed === lostFeed) {
      result.set(id, { load: null, offline: true, partners })
    } else {
      const taken = partners
        .filter((p) => (configs.get(p)?.feedTag ?? '') === lostFeed)
        .reduce((sum, p) => (sum === null || !loads.has(p) ? null : sum + loads.get(p)), own)
      result.set(id, { load: taken, offline: false, partners })
    }
  }
  return result
}

/** Feed tags in use, in the order they first appear. */
export function feedTags(rows, configs) {
  const tags = []
  for (const row of rows) {
    const tag = configs.get(row.node.id)?.feedTag
    if (tag && !tags.includes(tag)) tags.push(tag)
  }
  return tags
}

/**
 * Feeds whose loss changes one of the given domains: each one's own feed and its partners'.
 * Partners can sit outside the shown branch (UPS-A's partner UPS-B is not below UPS-A), so
 * `rows` covers the whole facility.
 *
 * @param {ReturnType<typeof powerDomainRows>} rows - every domain of the facility
 * @param {Map<number, {feedTag?: string}>} configs
 * @param {number[]} ids - the domains on screen
 */
export function feedsAffecting(rows, configs, ids) {
  const feedOf = (id) => configs.get(id)?.feedTag ?? ''
  const baseline = scenarioLoads(rows, configs, new Map(), null)
  const wanted = new Set()
  for (const id of ids) {
    for (const domain of [id, ...(baseline.get(id)?.partners ?? [])]) {
      if (feedOf(domain)) wanted.add(feedOf(domain))
    }
  }
  return feedTags(rows, configs).filter((tag) => wanted.has(tag))
}

/**
 * Domains on screen that would exceed their rating with one feed lost, for every given feed.
 *
 * @param {ReturnType<typeof powerDomainRows>} scopeRows - every domain of the facility
 * @param {ReturnType<typeof powerDomainRows>} rows - the domains to check
 * @param {Map<number, {feedTag?: string, ratedPower?: number}>} configs
 * @param {Map<number, number>} loads - kW by id
 * @param {string[]} feeds
 * @returns {Array<{ id: number, node: object, lostFeed: string, load: number, rated: number,
 *   ratio: number }>}
 */
export function feedLossRisks(scopeRows, rows, configs, loads, feeds) {
  return feeds.flatMap((lostFeed) => {
    const scenario = scenarioLoads(scopeRows, configs, loads, lostFeed)
    return rows.flatMap((row) => {
      const id = row.node.id
      const rated = configs.get(id)?.ratedPower > 0 ? configs.get(id).ratedPower / 1000 : null
      const load = scenario.get(id)?.load ?? null
      if (!rated || load == null || load <= rated) return []
      return [{ id, node: row.node, lostFeed, load, rated, ratio: load / rated }]
    })
  })
}

/**
 * Rack id to the rooms it stands in, anywhere in the sub-tree.
 *
 * @param {object[]} nodes - sub-tree nodes
 * @returns {Map<number, Array<{id: number, name: string}>>}
 */
export function roomsOfRacks(nodes) {
  const rooms = new Map()
  const walk = (list, room) => {
    for (const node of list ?? []) {
      if (node.class === 'Rack') {
        if (!room) continue
        const known = rooms.get(node.id) ?? []
        if (!known.some((r) => r.id === room.id)) rooms.set(node.id, [...known, room])
        continue
      }
      walk(node.children, node.class === 'Room' ? { id: node.id, name: node.name } : room)
    }
  }
  walk(nodes, null)
  return rooms
}

/** The children of the node holding `id`, the top level for a top-level id; null when absent. */
function siblingsOf(nodes, id) {
  const visit = (list) => {
    if ((list ?? []).some((node) => node.id === id)) return list
    for (const node of list ?? []) {
      const found = visit(node.children)
      if (found) return found
    }
    return null
  }
  return visit(nodes)
}

/**
 * Racks a room can take in: every rack under its facility, or beside it when it has none, that
 * is not in the room already, each with the rooms it stands in now. In name order.
 *
 * @param {object[]} nodes - Infrastructure sub-tree
 * @param {number} roomId
 * @returns {Array<{id: number, name: string, status: number, rooms: Array<{id: number,
 *   name: string}>}>}
 */
export function racksAround(nodes, roomId) {
  const facility = facilityContaining(nodes, roomId)
  const scope = facility ? [facility] : siblingsOf(nodes, roomId)
  if (!scope) return []
  const rooms = roomsOfRacks(nodes)
  const racks = [...indexNodes(scope).values()]
    .filter((node) => node.class === 'Rack')
    .map((node) => ({
      id: node.id,
      name: node.name,
      status: node.status,
      rooms: rooms.get(node.id) ?? [],
    }))
    .filter((rack) => !rack.rooms.some((room) => room.id === roomId))
  return racks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
}

/** Every object of a class below a node, each once, in tree order. */
export function nodesOfClass(root, objectClass) {
  return [...indexNodes(root.children).values()].filter((node) => node.class === objectClass)
}

const FACILITY_SOURCES = { GRID_ENTRY: 'power.feed', GENERATOR: 'power.gen' }

/**
 * Power the facility draws: `power.feed` of its grid entries plus `power.gen` of its generators.
 * A domain without such a DCI is listed as unmeasured; one whose DCI has no value makes the
 * total unknown.
 *
 * @param {ReturnType<typeof powerDomainRows>} rows - every domain of the facility
 * @param {Map<number, {domainType?: string}>} configs
 * @param {ReturnType<typeof taggedItems>} items
 * @param {(item: object) => object|null} valueOf
 * @returns {{ value: number|null, unmeasured: object[] }} kW
 */
export function facilityPower(rows, configs, items, valueOf) {
  let value = 0
  let known = false
  let missing = false
  const unmeasured = []
  for (const row of rows) {
    const base = FACILITY_SOURCES[configs.get(row.node.id)?.domainType]
    if (!base) continue
    const own = items.filter((item) => item.objectId === row.node.id && item.base === base)
    if (!own.length) {
      unmeasured.push(row.node)
      continue
    }
    const metric = readMetric(own, valueOf)
    if (!metric) missing = true
    else {
      value += toKilowatts(metric.value, metric.unit)
      known = true
    }
  }
  return { value: known && !missing ? value : null, unmeasured }
}

/**
 * IT load: `power.feed` summed over racks, all feeds. Racks without such DCIs do not count;
 * `reporting` of `total` racks with them have a value.
 *
 * @param {number[]} rackIds
 * @param {ReturnType<typeof taggedItems>} items
 * @param {(item: object) => object|null} valueOf
 * @returns {{ value: number|null, reporting: number, total: number }} kW
 */
export function rackPowerTotal(rackIds, items, valueOf) {
  let value = 0
  let reporting = 0
  let total = 0
  for (const id of rackIds) {
    const own = items.filter((item) => item.objectId === id && item.base === 'power.feed')
    if (!own.length) continue
    total++
    const metric = readMetric(own, valueOf)
    if (metric) {
      value += toKilowatts(metric.value, metric.unit)
      reporting++
    }
  }
  return { value: reporting ? value : null, reporting, total }
}

/** Coolant temperatures first, air temperatures when a zone has no coolant ones. */
const COOLING_TEMPERATURES = [
  { medium: 'water', supply: 'cooling.temp.supply', return: 'cooling.temp.return' },
  { medium: 'air', supply: 'env.temp.supply', return: 'env.temp.return' },
]

export const COOLING_TAGS = [
  'cooling.load',
  'cooling.power',
  ...COOLING_TEMPERATURES.flatMap((t) => [t.supply, t.return]),
]

/**
 * Supply and return temperature of a cooling zone, from the first medium it has DCIs for;
 * several sensors report their highest.
 *
 * @param {ReturnType<typeof taggedItems>} items
 * @param {number} objectId
 * @param {(item: object) => object|null} valueOf
 * @returns {{ medium: 'water'|'air', supply: number|null, return: number|null,
 *   deltaT: number|null } | null} null without temperature DCIs
 */
export function coolingTemperatures(items, objectId, valueOf) {
  const own = items.filter((item) => item.objectId === objectId)
  for (const t of COOLING_TEMPERATURES) {
    if (!own.some((item) => item.base === t.supply || item.base === t.return)) continue
    const supply = objectMetric(own, objectId, t.supply, valueOf, 'max')?.value ?? null
    const ret = objectMetric(own, objectId, t.return, valueOf, 'max')?.value ?? null
    return {
      medium: t.medium,
      supply,
      return: ret,
      deltaT: supply != null && ret != null ? ret - supply : null,
    }
  }
  return null
}

/**
 * Free units of a rack as RackView counts them: its height less the heights of everything in
 * its layout.
 *
 * @param {{ height: number, elements: Array<{heightU: number}> } | null | undefined} layout
 *   adapted rack-layout
 * @returns {number|null}
 */
export function freeUnits(layout) {
  if (!layout) return null
  return layout.height - layout.elements.reduce((sum, el) => sum + el.heightU, 0)
}

/**
 * Split of a rack's power across exactly two named feeds, the first in sort order.
 *
 * @param {ReturnType<typeof readMetric>} power - `power.feed` metric, all qualifiers
 * @returns {{ feeds: [string, string], share: number } | null} share of the first, 0..1
 */
export function feedSplit(power) {
  const byFeed = new Map()
  for (const part of power?.parts ?? []) {
    byFeed.set(part.qualifier, (byFeed.get(part.qualifier) ?? 0) + part.value)
  }
  const feeds = [...byFeed.keys()].sort()
  if (feeds.length !== 2 || feeds.some((name) => !name)) return null
  const total = byFeed.get(feeds[0]) + byFeed.get(feeds[1])
  if (!(total > 0)) return null
  return { feeds, share: byFeed.get(feeds[0]) / total }
}

/** Outstanding and acknowledged; resolved alarms no longer count. */
const ACTIVE_ALARM_STATES = new Set([0, 1])

/**
 * Active alarms per rack, of the rack itself and of the objects in it.
 *
 * @param {Array<{source: number, state: number}>} alarms - GET /v1/alarms entries
 * @param {Map<number, Set<number>>} members - rack id to the ids of the objects in it
 * @returns {Map<number, number>}
 */
export function rackAlarmCounts(alarms, members) {
  const rackOf = new Map()
  for (const [rackId, ids] of members) {
    rackOf.set(rackId, rackId)
    for (const id of ids) if (!rackOf.has(id)) rackOf.set(id, rackId)
  }
  const counts = new Map([...members.keys()].map((id) => [id, 0]))
  for (const alarm of alarms ?? []) {
    if (!ACTIVE_ALARM_STATES.has(alarm.state)) continue
    const rackId = rackOf.get(alarm.source)
    if (rackId != null) counts.set(rackId, counts.get(rackId) + 1)
  }
  return counts
}

/**
 * Power paths of an object: for every power domain it sits under, that domain and the domains
 * above it, nearest first, each path once.
 *
 * @param {object[]} nodes - sub-tree nodes holding the object's facility
 * @param {number} objectId
 * @returns {object[][]}
 */
export function powerPaths(nodes, objectId) {
  const paths = new Map()
  const walk = (list, ancestors) => {
    for (const node of list ?? []) {
      if (node.id === objectId) {
        const path = []
        for (let i = ancestors.length - 1; i >= 0 && ancestors[i].class === 'PowerDomain'; i--) {
          path.push(ancestors[i])
        }
        const key = path.map((domain) => domain.id).join('/')
        if (path.length && !paths.has(key)) paths.set(key, path)
        continue
      }
      walk(node.children, [...ancestors, node])
    }
  }
  walk(nodes, [])
  return [...paths.values()]
}

/**
 * kW of one tag summed over objects. `count` is how many of them have such DCIs; the value is
 * null when none of those reports.
 *
 * @param {number[]} ids
 * @param {string} base
 * @param {ReturnType<typeof taggedItems>} items
 * @param {(item: object) => object|null} valueOf
 * @returns {{ value: number|null, count: number }}
 */
export function sumKilowatts(ids, base, items, valueOf) {
  let value = 0
  let known = 0
  let count = 0
  for (const id of ids) {
    if (!items.some((item) => item.objectId === id && item.base === base)) continue
    count++
    const metric = objectMetric(items, id, base, valueOf)
    if (metric) {
      value += toKilowatts(metric.value, metric.unit)
      known++
    }
  }
  return { value: known ? value : null, count }
}

/**
 * Conversion losses of a facility's UPSes: `power.in` less `power.out` of each UPS that reports
 * both.
 *
 * @param {ReturnType<typeof powerDomainRows>} rows
 * @param {Map<number, {domainType?: string}>} configs
 * @param {ReturnType<typeof taggedItems>} items
 * @param {(item: object) => object|null} valueOf
 * @returns {number|null} kW
 */
export function upsLosses(rows, configs, items, valueOf) {
  let value = 0
  let count = 0
  for (const row of rows) {
    if (configs.get(row.node.id)?.domainType !== 'UPS') continue
    const input = objectMetric(items, row.node.id, 'power.in', valueOf)
    const output = objectMetric(items, row.node.id, 'power.out', valueOf)
    if (!input || !output) continue
    value += toKilowatts(input.value, input.unit) - toKilowatts(output.value, output.unit)
    count++
  }
  return count ? value : null
}

/** Below this a remainder is rounding, not a consumer (kW). */
const SPLIT_TOLERANCE = 0.05

/**
 * Facility power split into its measured parts and the rest. Parts without a value are left
 * out, so the rest takes them in. When the parts add up to more than the total, there is no
 * rest and the shares are of the parts' sum.
 *
 * @param {number|null} total - kW
 * @param {Array<{ id: string, value: number|null }>} parts - kW
 * @returns {{ parts: Array<{ id: string, value: number, share: number }>, measured: number,
 *   exceeds: boolean } | null} null without a total
 */
export function powerSplit(total, parts) {
  if (!(total > 0)) return null
  const known = parts.filter((part) => part.value != null && part.value > 0)
  const measured = known.reduce((sum, part) => sum + part.value, 0)
  const exceeds = measured - total > SPLIT_TOLERANCE
  const rest = total - measured
  const all = !exceeds && rest > SPLIT_TOLERANCE ? [...known, { id: 'other', value: rest }] : known
  const scale = exceeds ? measured : total
  return {
    parts: all.map((part) => ({ ...part, share: part.value / scale })),
    measured,
    exceeds,
  }
}

/** Status codes worst first, then the ones outside the severity scale (unknown, unmanaged...). */
const STATUS_ORDER = [4, 3, 2, 1, 0]

/**
 * How many objects have each status, worst first; statuses nobody has are left out.
 *
 * @param {Array<{status: number}>} nodes
 * @returns {Array<{ status: number, count: number }>}
 */
export function statusCounts(nodes) {
  const counts = new Map()
  for (const node of nodes) counts.set(node.status, (counts.get(node.status) ?? 0) + 1)
  const order = (status) => {
    const i = STATUS_ORDER.indexOf(status)
    return i < 0 ? STATUS_ORDER.length + status : i
  }
  return [...counts.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([status, count]) => ({ status, count }))
}
