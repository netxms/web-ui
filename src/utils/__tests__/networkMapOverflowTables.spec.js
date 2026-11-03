import { describe, it, expect } from 'vitest'
import { LABEL_LAYOUT_ITERATIONS } from '@/utils/networkMapLabelLayout'
import {
  BAD_DETACHMENT,
  badLabels,
  createTableLayoutState,
  isAbsorbed,
  labelOwners,
  layoutLabelsWithTables,
  lineDegrees,
  lineSegments,
  linesThrough,
  routeBearing,
  segmentIndex,
  updateTableNodes,
} from '@/utils/networkMapOverflowTables'

const NODE_R = 26
const PLATE = { w: 60, h: 15, gap: 4 }

/** Icon-mode obstacles of a node: the circle's box first, then the name plate. */
function iconNode(x, y) {
  return [
    { x, y, w: NODE_R * 2, h: NODE_R * 2 },
    { x, y: y + NODE_R + PLATE.gap + PLATE.h / 2, w: PLATE.w, h: PLATE.h },
  ]
}

const track = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 })

function placed(id, x, y, { w = 40, h = 15, edgeId = id, leader = null } = {}) {
  return { id, edgeId, x, y, width: w, height: h, leader }
}

const asBox = (b) => ({ x: b.x, y: b.y, w: b.width ?? b.w, h: b.height ?? b.h })

function overlaps(a, b) {
  const p = asBox(a)
  const q = asBox(b)
  return Math.abs(p.x - q.x) * 2 < p.w + q.w - 1 && Math.abs(p.y - q.y) * 2 < p.h + q.h - 1
}

/** A hub with links fanning out east, too crowded for its labels to all be placed readably. */
function fanMap({ count = 8, spread = 60, hub = { x: 0, y: 0 }, length = 300 } = {}) {
  const boxes = []
  const segments = []
  const lines = []
  const nodeBoxes = new Map([['hub', iconNode(hub.x, hub.y)]])
  for (let i = 0; i < count; i++) {
    const angle = (((i / (count - 1) - 0.5) * spread) / 180) * Math.PI
    const peer = { x: hub.x + Math.cos(angle) * length, y: hub.y + Math.sin(angle) * length }
    const peerId = `p${i}`
    const edgeId = `l${i}`
    const common = {
      edgeId,
      sourceId: 'hub',
      targetId: peerId,
      track: track(hub.x, hub.y, peer.x, peer.y),
      leader: null,
    }
    boxes.push(
      { ...common, id: `${edgeId}:e1`, kind: 'end', end: 1, width: 50, height: 15 },
      { ...common, id: `${edgeId}:e2`, kind: 'end', end: 2, width: 50, height: 15 },
      { ...common, id: `${edgeId}:c`, kind: 'card', homeT: 0.5, width: 70, height: 30 },
    )
    segments.push(...lineSegments(edgeId, [hub, peer]))
    lines.push({ sourceId: 'hub', targetId: peerId })
    nodeBoxes.set(peerId, iconNode(peer.x, peer.y))
  }
  return { boxes, segments, nodeBoxes, degrees: lineDegrees(lines), hub }
}

const buildTable = (nodeId) => ({ id: `table:${nodeId}`, nodeId, width: 160, height: 100 })

function run(map, options = {}) {
  const state = options.state ?? createTableLayoutState()
  const result = layoutLabelsWithTables(map.boxes, {
    nodeBoxes: map.nodeBoxes,
    segments: map.segments,
    degrees: map.degrees,
    state,
    buildTable,
    pass: 'settle',
    ...options,
  })
  return { ...result, state }
}

describe('segments', () => {
  it('splits a route into tagged segments', () => {
    expect(
      lineSegments('l', [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
      ]),
    ).toEqual([
      { edgeId: 'l', x1: 0, y1: 0, x2: 10, y2: 0 },
      { edgeId: 'l', x1: 10, y1: 0, x2: 10, y2: 5 },
    ])
  })

  it('gives the bearing at which a route leaves either end', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 80, y: 50 },
    ]
    expect(routeBearing(route, true)).toEqual({ x: 0, y: 1 })
    expect(routeBearing(route, false)).toEqual({ x: -1, y: 0 })
    expect(
      routeBearing(
        [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
        true,
      ),
    ).toBeNull()
  })

  /** Independent test: an endpoint inside, or the segment crossing an edge. */
  function crossesBox(s, b) {
    const left = b.x - b.w / 2
    const right = b.x + b.w / 2
    const top = b.y - b.h / 2
    const bottom = b.y + b.h / 2
    const inside = (x, y) => x > left && x < right && y > top && y < bottom
    if (inside(s.x1, s.y1) || inside(s.x2, s.y2)) return true
    const cross = (ax, ay, bx, by, cx, cy, dx, dy) => {
      const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
      if (!d) return false
      const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d
      const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d
      return t >= 0 && t <= 1 && u >= 0 && u <= 1
    }
    const edges = [
      [left, top, right, top],
      [right, top, right, bottom],
      [right, bottom, left, bottom],
      [left, bottom, left, top],
    ]
    return edges.some((e) => cross(s.x1, s.y1, s.x2, s.y2, ...e))
  }

  it('finds the same lines through a box as checking every segment', () => {
    let seed = 7
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const segments = []
    for (let i = 0; i < 150; i++) {
      // Some lines have several segments, like a route with bend points.
      const edgeId = `l${i % 90}`
      segments.push({
        edgeId,
        x1: random() * 2000 - 1000,
        y1: random() * 1400 - 700,
        x2: random() * 2000 - 1000,
        y2: random() * 1400 - 700,
      })
    }
    const index = segmentIndex(segments)
    for (let k = 0; k < 300; k++) {
      const box = { x: random() * 2000 - 1000, y: random() * 1400 - 700, w: 20 + random() * 120 }
      box.h = 10 + random() * 60
      const expected = new Set(segments.filter((s) => crossesBox(s, box)).map((s) => s.edgeId))
      expect(linesThrough(index, box, null, 0)).toBe(expected.size)
    }
  })
})

describe('badLabels', () => {
  const index = (segments = []) => segmentIndex(segments)

  it('marks overlapping labels, both of them', () => {
    const boxes = [placed('a', 0, 0), placed('b', 30, 5), placed('c', 200, 0)]
    expect(badLabels(boxes, { index: index() })).toEqual(new Set(['a', 'b']))
  })

  it('lets labels touch by up to half a pixel', () => {
    const boxes = [placed('a', 0, 0), placed('b', 39.7, 0)]
    expect(badLabels(boxes, { index: index() }).size).toBe(0)
  })

  it('marks a label on a node', () => {
    const nodeBoxes = new Map([['n', iconNode(0, 0)]])
    const boxes = [placed('a', 40, 0), placed('b', 200, 0)]
    expect(badLabels(boxes, { nodeBoxes, index: index() })).toEqual(new Set(['a']))
  })

  it(`marks a label more than ${BAD_DETACHMENT}px off its link`, () => {
    const far = { x1: 0, y1: 0, x2: 0, y2: BAD_DETACHMENT + 1 }
    const near = { x1: 0, y1: 0, x2: 0, y2: BAD_DETACHMENT - 4 }
    const boxes = [placed('a', 0, 0, { leader: far }), placed('b', 300, 0, { leader: near })]
    expect(badLabels(boxes, { index: index() })).toEqual(new Set(['a']))
  })

  it('marks a label two other lines run through, not one', () => {
    const boxes = [placed('a', 0, 0, { edgeId: 'own' }), placed('b', 300, 0, { edgeId: 'own2' })]
    const segments = [
      ...lineSegments('x', [
        { x: -5, y: -50 },
        { x: -5, y: 50 },
      ]),
      ...lineSegments('y', [
        { x: 5, y: -50 },
        { x: 5, y: 50 },
      ]),
      ...lineSegments('z', [
        { x: 300, y: -50 },
        { x: 300, y: 50 },
      ]),
    ]
    expect(badLabels(boxes, { index: index(segments) })).toEqual(new Set(['a']))
  })

  it('skips labels that count only against nodes too small for a table', () => {
    const leafPill = {
      ...placed('a', 0, 0),
      kind: 'end',
      end: 1,
      sourceId: 'leaf',
      targetId: 'hub',
    }
    const hubPill = {
      ...placed('b', 30, 5),
      kind: 'end',
      end: 2,
      sourceId: 'leaf',
      targetId: 'hub',
    }
    const degrees = new Map([
      ['leaf', 1],
      ['hub', 3],
    ])
    expect(badLabels([leafPill, hubPill], { index: index(), degrees })).toEqual(new Set(['b']))
  })

  it("does not count the label's own line, however many segments it has", () => {
    const boxes = [placed('a', 0, 0, { edgeId: 'own' })]
    const segments = lineSegments('own', [
      { x: -50, y: 0 },
      { x: 0, y: 2 },
      { x: 50, y: 0 },
    ])
    expect(badLabels(boxes, { index: index(segments) }).size).toBe(0)
  })
})

describe('which nodes get a table', () => {
  const degrees = new Map([
    ['hub', 4],
    ['peer', 1],
    ['mid', 4],
    ['pair', 2],
  ])
  const pill = (id, node, end = 1) => ({
    id,
    kind: 'end',
    end,
    sourceId: end === 1 ? node : 'peer',
    targetId: end === 1 ? 'peer' : node,
  })
  const card = (id, a, b) => ({ id, kind: 'card', sourceId: a, targetId: b })

  it('counts an end pill against its own node', () => {
    expect(labelOwners(pill('a', 'hub', 1), degrees)).toEqual(['hub'])
    expect(labelOwners(pill('b', 'hub', 2), degrees)).toEqual(['hub'])
  })

  it('counts a card against the busier end, or both on a tie', () => {
    expect(labelOwners(card('c', 'peer', 'hub'), degrees)).toEqual(['hub'])
    expect(labelOwners(card('c', 'hub', 'mid'), degrees)).toEqual(['hub', 'mid'])
  })

  const hubPills = [1, 2, 3, 4].map((k) => pill(`p${k}`, 'hub', k % 2 ? 1 : 2))
  const measure = (badCount) => ({
    boxes: hubPills,
    bad: new Set(hubPills.slice(0, badCount).map((b) => b.id)),
    degrees,
  })

  it('switches a node on at 3 bad labels', () => {
    expect(updateTableNodes(new Set(), measure(2))).toEqual(new Set())
    expect(updateTableNodes(new Set(), measure(3))).toEqual(new Set(['hub']))
  })

  it('keeps it on at 2 and switches it off at 1 (hysteresis)', () => {
    const active = new Set(['hub'])
    expect(updateTableNodes(active, measure(2))).toEqual(new Set(['hub']))
    expect(updateTableNodes(active, measure(1))).toEqual(new Set())
  })

  it('never gives a node with fewer than 3 lines a table', () => {
    const pairPills = [1, 2, 3].map((k) => pill(`q${k}`, 'pair'))
    const bad = new Set(pairPills.map((b) => b.id))
    expect(updateTableNodes(new Set(), { boxes: pairPills, bad, degrees })).toEqual(new Set())
    // Nor keeps one it had before the links were removed.
    expect(updateTableNodes(new Set(['pair']), { boxes: pairPills, bad, degrees })).toEqual(
      new Set(),
    )
  })

  it("absorbs the node's end pills and every card on its lines, not the peers' pills", () => {
    const active = new Set(['hub'])
    expect(isAbsorbed(pill('a', 'hub', 1), active)).toBe(true)
    expect(isAbsorbed(pill('b', 'hub', 2), active)).toBe(true)
    // The peer's end of a hub link.
    expect(isAbsorbed({ kind: 'end', end: 2, sourceId: 'hub', targetId: 'peer' }, active)).toBe(
      false,
    )
    expect(isAbsorbed(card('c', 'peer', 'hub'), active)).toBe(true)
    expect(isAbsorbed(card('d', 'peer', 'mid'), active)).toBe(false)
  })

  it('counts drawn lines per node', () => {
    const lines = [
      { sourceId: 'a', targetId: 'b' },
      { sourceId: 'a', targetId: 'c' },
    ]
    expect(lineDegrees(lines)).toEqual(
      new Map([
        ['a', 2],
        ['b', 1],
        ['c', 1],
      ]),
    )
  })
})

describe('layoutLabelsWithTables', () => {
  it('gives a crowded hub a table that takes its pills and cards', () => {
    const map = fanMap()
    const { labels, tables, state } = run(map)
    expect(state.tables).toEqual(new Set(['hub']))
    expect(tables.map((t) => t.nodeId)).toEqual(['hub'])
    expect(labels.map((b) => b.id).sort()).toEqual(
      map.boxes
        .filter((b) => b.id.endsWith(':e2'))
        .map((b) => b.id)
        .sort(),
    )
  })

  it('places the table off every line, node and remaining label', () => {
    const map = fanMap()
    const { labels, tables } = run(map)
    const [table] = tables
    const box = { x: table.x, y: table.y, w: table.width, h: table.height }
    expect(linesThrough(segmentIndex(map.segments), box, null, 1.5)).toBe(0)
    for (const list of map.nodeBoxes.values()) {
      for (const node of list) expect(overlaps(box, node)).toBe(false)
    }
    for (const label of labels) expect(overlaps(label, box)).toBe(false)
  })

  it('draws a leader from the node centre to the table border', () => {
    const [table] = run(fanMap()).tables
    expect(table.leader).toMatchObject({ x1: 0, y1: 0 })
    const { x2, y2 } = table.leader
    const onBorder =
      Math.abs(Math.abs(x2 - table.x) - table.width / 2) < 0.01 ||
      Math.abs(Math.abs(y2 - table.y) - table.height / 2) < 0.01
    expect(onBorder).toBe(true)
  })

  it('switched off, places every label in one pass and forgets the tables', () => {
    const map = fanMap()
    const state = createTableLayoutState()
    run(map, { state })
    const { labels, tables } = run(map, { state, enabled: false })
    expect(labels).toHaveLength(map.boxes.length)
    expect(tables).toEqual([])
    expect(state.tables.size).toBe(0)
  })

  it('needs no table on a sparse map, and keeps pass 2 in step with pass 1', () => {
    const map = fanMap({ count: 3, spread: 240, length: 400 })
    const { labels, tables, state } = run(map)
    expect(tables).toEqual([])
    expect(labels).toHaveLength(map.boxes.length)
    for (const box of map.boxes) expect(state.p2.get(box.id)).toBe(state.p1.get(box.id))
  })

  it('starts pass 2 warm from pass 1 when a table switches on', () => {
    const map = fanMap()
    const state = createTableLayoutState()
    // Only pass 1 has seen these labels: the tables were off until now.
    run(map, { state, enabled: false })
    expect(state.p2.size).toBe(0)
    const { iterations } = run(map, { state, pass: 'warm' })
    // Cold would be 260 iterations from home.
    expect(iterations).toEqual([LABEL_LAYOUT_ITERATIONS.warm, LABEL_LAYOUT_ITERATIONS.warm])
  })

  it('is at rest after a settle: a warm start moves nothing', () => {
    const map = fanMap()
    const state = createTableLayoutState()
    const first = run(map, { state })
    const spots = new Map(first.labels.map((b) => [b.id, [b.x, b.y]]))
    const table = [first.tables[0].x, first.tables[0].y]
    const again = run(map, { state, pass: 'warm' })
    for (const box of again.labels) {
      expect(box.x).toBeCloseTo(spots.get(box.id)[0], 1)
      expect(box.y).toBeCloseTo(spots.get(box.id)[1], 1)
    }
    expect([again.tables[0].x, again.tables[0].y]).toEqual(table)
  })

  it('puts a dragged table at its offset, which moves with the node', () => {
    const offsets = { hub: { x: -40, y: -200 } }
    const [table] = run(fanMap(), { offsets }).tables
    expect([table.x, table.y]).toEqual([-40, -200])
    const [moved] = run(fanMap({ hub: { x: 100, y: 50 } }), { offsets }).tables
    expect([moved.x, moved.y]).toEqual([60, -150])
    expect(moved.leader).toEqual({ x1: 100, y1: 50, x2: 100, y2: -100 })
  })

  it('keeps the previous direction while it is free, and leaves it once it is not', () => {
    const map = fanMap()
    const west = createTableLayoutState()
    west.directions.set('hub', 4)
    expect(run(map, { state: west }).tables[0].dir).toBe(4)
    // East is where the links run.
    const east = createTableLayoutState()
    east.directions.set('hub', 0)
    expect(run(map, { state: east }).tables[0].dir).not.toBe(0)
  })

  it('keeps tables inside the bounds when it can', () => {
    const map = fanMap()
    // Unbounded, the table goes south, the first free spot.
    expect(run(map).tables[0].dir).toBe(2)
    const bounds = { left: -400, top: -400, right: 400, bottom: 40 }
    const [table] = run(map, { bounds }).tables
    expect(table.y + table.height / 2).toBeLessThanOrEqual(bounds.bottom)
  })
})
