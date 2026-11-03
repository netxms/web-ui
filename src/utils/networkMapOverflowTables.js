/**
 * Overflow tables: a node whose labels end up unreadable (overlapping, far off their link, or
 * across other links) hands them to a table beside it, one row per link.
 *
 * Pass 1 places and measures every label; nodes switch to a table at TABLE_ENTER bad labels and
 * back at TABLE_EXIT (hysteresis, so a node at the threshold does not flicker mid-drag), and the
 * tables are placed; pass 2 re-places the labels no table absorbed, with tables as obstacles.
 * Boxes are centred, as in networkMapLabelLayout.
 */

import { layoutLinkLabels } from './networkMapLabelLayout'
import { overflowTableContent } from './networkMapLinkLabels'

/** A label further than this from its link is bad. */
export const BAD_DETACHMENT = 24

/** A node switches to a table at this many bad labels, and back at this many. */
export const TABLE_ENTER = 3
export const TABLE_EXIT = 1

export const TABLE_MIN_DEGREE = 3

/** A label two or more other lines run through is ambiguous, so bad. */
const AMBIGUOUS_CROSSINGS = 2

const CROSSING_INSET = 1.5

/** Overlap (px) that still counts as clear. */
const OVERLAP_TOLERANCE = 0.5

// Table placement (see placeTable).
const TABLE_GAP = 26
const DIRECTIONS = 8
const OBSTACLE_MARGIN = 6
const OBSTACLE_WEIGHT = 3
const LABEL_MARGIN = 2
const LABEL_WEIGHT = 0.6
const CROSSING_PENALTY = 250
const OUT_OF_BOUNDS_PENALTY = 60
/** The previous direction wins unless another is clearly better. */
const KEEP_DIRECTION = 0.8
/** Breaks exact ties toward the first direction (east), so placement is deterministic. */
const DIRECTION_TIEBREAK = 0.01

const CELL = 96

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const round2 = (v) => Math.round(v * 100) / 100

// Uniform grid: boxes are filed under every cell their bounds touch, segments under every cell
// they pass through. A query visits each item once.

// Two 16-bit cell coordinates in one number, as in networkMapLabelLayout.
const cellKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768)

function createCells(count) {
  return { cells: new Map(), seen: new Int32Array(count).fill(-1), stamp: 0 }
}

function fileCell(grid, cx, cy, i) {
  const key = cellKey(cx, cy)
  const list = grid.cells.get(key)
  if (list) list.push(i)
  else grid.cells.set(key, [i])
}

function fileBounds(grid, left, top, right, bottom, i) {
  for (let cx = Math.floor(left / CELL); cx <= Math.floor(right / CELL); cx++) {
    for (let cy = Math.floor(top / CELL); cy <= Math.floor(bottom / CELL); cy++) {
      fileCell(grid, cx, cy, i)
    }
  }
}

/** Amanatides-Woo grid walk. */
function fileSegment(grid, { x1, y1, x2, y2 }, i) {
  let cx = Math.floor(x1 / CELL)
  let cy = Math.floor(y1 / CELL)
  const endX = Math.floor(x2 / CELL)
  const endY = Math.floor(y2 / CELL)
  const dx = x2 - x1
  const dy = y2 - y1
  const stepX = dx > 0 ? 1 : -1
  const stepY = dy > 0 ? 1 : -1
  let nextX = dx ? ((stepX > 0 ? cx + 1 : cx) * CELL - x1) / dx : Number.POSITIVE_INFINITY
  let nextY = dy ? ((stepY > 0 ? cy + 1 : cy) * CELL - y1) / dy : Number.POSITIVE_INFINITY
  const deltaX = dx ? CELL / Math.abs(dx) : Number.POSITIVE_INFINITY
  const deltaY = dy ? CELL / Math.abs(dy) : Number.POSITIVE_INFINITY
  fileCell(grid, cx, cy, i)
  // Step only toward the end cell, so rounding can never walk past it.
  while (cx !== endX || cy !== endY) {
    if (cx !== endX && (cy === endY || nextX < nextY)) {
      nextX += deltaX
      cx += stepX
    } else {
      nextY += deltaY
      cy += stepY
    }
    fileCell(grid, cx, cy, i)
  }
}

// Result of the last collectCells() call, shared so a query allocates nothing.
const found = []

function collectCells(grid, left, top, right, bottom) {
  const { cells, seen } = grid
  const stamp = ++grid.stamp
  found.length = 0
  for (let cx = Math.floor(left / CELL); cx <= Math.floor(right / CELL); cx++) {
    for (let cy = Math.floor(top / CELL); cy <= Math.floor(bottom / CELL); cy++) {
      const list = cells.get(cellKey(cx, cy))
      if (!list) continue
      for (let k = 0; k < list.length; k++) {
        const i = list[k]
        if (seen[i] === stamp) continue
        seen[i] = stamp
        found.push(i)
      }
    }
  }
  return found
}

/**
 * @param {string} edgeId
 * @param {{ x: number, y: number }[]} points - source end, bend points, target end
 * @returns {{ edgeId: string, x1: number, y1: number, x2: number, y2: number }[]}
 */
export function lineSegments(edgeId, points) {
  const segments = []
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]
    const b = points[k]
    segments.push({ edgeId, x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  }
  return segments
}

/**
 * First segment from the source, last from the target; null for a route of no length there.
 * @param {{ x: number, y: number }[]} points
 * @param {boolean} fromSource
 * @returns {{ x: number, y: number } | null}
 */
export function routeBearing(points, fromSource) {
  const n = points.length
  if (n < 2) return null
  const a = fromSource ? points[0] : points[n - 1]
  const b = fromSource ? points[1] : points[n - 2]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  return length < 0.001 ? null : { x: dx / length, y: dy / length }
}

/** @param {object[]} segments - from lineSegments() */
export function segmentIndex(segments) {
  const grid = createCells(segments.length)
  segments.forEach((segment, i) => fileSegment(grid, segment, i))
  return { segments, grid }
}

// Module-level so the hot loop allocates nothing.
let clipFrom = 0
let clipTo = 1

/** Liang-Barsky: one box edge; false once nothing is left inside. */
function clipEdge(p, q) {
  if (p === 0) return q >= 0
  const r = q / p
  if (p < 0) {
    if (r > clipTo) return false
    if (r > clipFrom) clipFrom = r
  } else {
    if (r < clipFrom) return false
    if (r < clipTo) clipTo = r
  }
  return true
}

function segmentHitsBounds(s, left, top, right, bottom) {
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  clipFrom = 0
  clipTo = 1
  return (
    clipEdge(-dx, s.x1 - left) &&
    clipEdge(dx, right - s.x1) &&
    clipEdge(-dy, s.y1 - top) &&
    clipEdge(dy, bottom - s.y1)
  )
}

/**
 * Lines other than `ownId` through a centred box shrunk by `inset`; stops counting at `limit`.
 * @param {{ segments: object[], grid: object }} index - from segmentIndex()
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {string | null} ownId
 * @param {number} inset
 * @param {number} [limit]
 * @returns {number}
 */
export function linesThrough(index, box, ownId, inset, limit = Number.POSITIVE_INFINITY) {
  const left = box.x - box.w / 2 + inset
  const right = box.x + box.w / 2 - inset
  const top = box.y - box.h / 2 + inset
  const bottom = box.y + box.h / 2 - inset
  if (left >= right || top >= bottom) return 0
  counted.length = 0
  const candidates = collectCells(index.grid, left, top, right, bottom)
  for (let k = 0; k < candidates.length && counted.length < limit; k++) {
    const segment = index.segments[candidates[k]]
    if (segment.edgeId === ownId || counted.includes(segment.edgeId)) continue
    if (segmentHitsBounds(segment, left, top, right, bottom)) counted.push(segment.edgeId)
  }
  return counted.length
}

// Shared like `found`.
const counted = []

/**
 * A merged group is one line.
 * @param {{ sourceId: string, targetId: string }[]} lines
 * @returns {Map<string, number>}
 */
export function lineDegrees(lines) {
  const degrees = new Map()
  for (const { sourceId, targetId } of lines) {
    degrees.set(sourceId, (degrees.get(sourceId) ?? 0) + 1)
    degrees.set(targetId, (degrees.get(targetId) ?? 0) + 1)
  }
  return degrees
}

const labelBounds = (box) => ({ x: box.x, y: box.y, w: box.width, h: box.height })

/** Placed labels first, in order, then node boxes. */
function boxIndex(boxes, nodeBoxes) {
  const items = boxes.map(labelBounds)
  for (const list of nodeBoxes.values()) items.push(...list)
  const grid = createCells(items.length)
  items.forEach((b, i) =>
    fileBounds(grid, b.x - b.w / 2, b.y - b.h / 2, b.x + b.w / 2, b.y + b.h / 2, i),
  )
  return { items, grid }
}

/**
 * Labels overlapping another label or a node box, further than BAD_DETACHMENT from their link,
 * or crossed by AMBIGUOUS_CROSSINGS other lines (labels can be clear of each other yet each sit
 * across a fan). With `degrees`, only labels counting against a node that can have a table are
 * measured.
 *
 * @param {object[]} boxes - placed by layoutLinkLabels()
 * @param {object} options
 * @param {Map<string, { x: number, y: number, w: number, h: number }[]>} [options.nodeBoxes]
 * @param {{ segments: object[], grid: object }} options.index - from segmentIndex()
 * @param {Map<string, number>} [options.degrees] - from lineDegrees()
 * @returns {Set<string>} ids
 */
export function badLabels(boxes, { nodeBoxes = new Map(), index, degrees = null }) {
  return findBadLabels(boxes, boxIndex(boxes, nodeBoxes), index, degrees)
}

function findBadLabels(boxes, labels, index, degrees) {
  const { items, grid } = labels
  const bad = new Set()
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]
    if (
      degrees &&
      !labelOwners(box, degrees).some((id) => (degrees.get(id) ?? 0) >= TABLE_MIN_DEGREE)
    ) {
      continue
    }
    const { leader } = box
    if (leader && Math.hypot(leader.x2 - leader.x1, leader.y2 - leader.y1) > BAD_DETACHMENT) {
      bad.add(box.id)
      continue
    }
    const a = items[i]
    const near = collectCells(grid, a.x - a.w / 2, a.y - a.h / 2, a.x + a.w / 2, a.y + a.h / 2)
    let overlapping = false
    for (let k = 0; k < near.length && !overlapping; k++) {
      const j = near[k]
      const b = items[j]
      overlapping =
        j !== i &&
        (a.w + b.w) / 2 - Math.abs(a.x - b.x) > OVERLAP_TOLERANCE &&
        (a.h + b.h) / 2 - Math.abs(a.y - b.y) > OVERLAP_TOLERANCE
    }
    if (
      overlapping ||
      linesThrough(index, a, box.edgeId, CROSSING_INSET, AMBIGUOUS_CROSSINGS) >= AMBIGUOUS_CROSSINGS
    ) {
      bad.add(box.id)
    }
  }
  return bad
}

/**
 * An end pill counts against its own node; a card against the busier end, whose fan crowds it
 * (both ends on a tie).
 * @param {{ kind: string, end?: number, sourceId: string, targetId: string }} box
 * @param {Map<string, number>} degrees - from lineDegrees()
 * @returns {string[]}
 */
export function labelOwners(box, degrees) {
  if (box.kind === 'end') return [box.end === 2 ? box.targetId : box.sourceId]
  if (box.sourceId === box.targetId) return [box.sourceId]
  const a = degrees.get(box.sourceId) ?? 0
  const b = degrees.get(box.targetId) ?? 0
  if (a > b) return [box.sourceId]
  if (b > a) return [box.targetId]
  return [box.sourceId, box.targetId]
}

/**
 * In place. Below TABLE_MIN_DEGREE drawn lines a node is always off.
 * @param {Set<string>} active
 * @param {object} measure
 * @param {object[]} measure.boxes - every label, placed (pass 1)
 * @param {Set<string>} measure.bad - from badLabels()
 * @param {Map<string, number>} measure.degrees - from lineDegrees()
 * @returns {Set<string>} active
 */
export function updateTableNodes(active, { boxes, bad, degrees }) {
  const strain = new Map()
  for (const box of boxes) {
    if (!bad.has(box.id)) continue
    for (const id of labelOwners(box, degrees)) strain.set(id, (strain.get(id) ?? 0) + 1)
  }
  // Deleting the entry being visited is safe while iterating a Set.
  for (const id of active) {
    if ((degrees.get(id) ?? 0) < TABLE_MIN_DEGREE || (strain.get(id) ?? 0) <= TABLE_EXIT) {
      active.delete(id)
    }
  }
  for (const [id, count] of strain) {
    if (count >= TABLE_ENTER && (degrees.get(id) ?? 0) >= TABLE_MIN_DEGREE) active.add(id)
  }
  return active
}

/**
 * A table takes its node's end pills and the cards of every line it is on.
 * @param {{ kind: string, end?: number, sourceId: string, targetId: string }} box
 * @param {Set<string>} active
 * @returns {boolean}
 */
export function isAbsorbed(box, active) {
  if (box.kind === 'end') return active.has(box.end === 2 ? box.targetId : box.sourceId)
  return active.has(box.sourceId) || active.has(box.targetId)
}

function overlapArea(a, b, margin) {
  const ox = (a.w + b.w) / 2 + margin - Math.abs(a.x - b.x)
  const oy = (a.h + b.h) / 2 + margin - Math.abs(a.y - b.y)
  return ox > 0 && oy > 0 ? ox * oy : 0
}

/** From the node's centre to the nearest point of the table's border; null while inside it. */
function tableLeader(table, node) {
  const left = table.x - table.width / 2
  const right = table.x + table.width / 2
  const top = table.y - table.height / 2
  const bottom = table.y + table.height / 2
  if (node.x > left && node.x < right && node.y > top && node.y < bottom) return null
  return {
    x1: round2(node.x),
    y1: round2(node.y),
    x2: round2(clamp(node.x, left, right)),
    y2: round2(clamp(node.y, top, bottom)),
  }
}

const tableObstacle = (table) => ({ x: table.x, y: table.y, w: table.width, h: table.height })

/**
 * At its dragged offset if it has one, else at the cheapest of DIRECTIONS spots around the node
 * (east first, clockwise): a spot costs what it covers, every line through it and every pixel
 * outside `bounds`. Sets `x` / `y`, `leader` and `dir`.
 *
 * @param {object} table - from overflowTableContent()
 * @param {object} options
 * @param {{ x: number, y: number, w: number, h: number }} options.node
 * @param {{ x: number, y: number } | null} [options.offset] - table centre minus node centre
 * @param {object} options.context - `grid` / `items` (labels first `labelCount`, then node boxes;
 *   see boxIndex), `absorbed` (per label, 1 when a table took it), `tables` placed before,
 *   `index` (drawn segments)
 * @param {{ left: number, top: number, right: number, bottom: number } | null} [options.bounds]
 * @param {number | undefined} [options.direction] - the direction chosen last time
 */
function placeTable(table, { node, offset, context, bounds, direction }) {
  table.dir = direction ?? null
  if (offset) {
    table.x = round2(node.x + offset.x)
    table.y = round2(node.y + offset.y)
    table.leader = tableLeader(table, node)
    return
  }
  const w = table.width
  const h = table.height
  let best = null
  for (let k = 0; k < DIRECTIONS; k++) {
    const angle = (k * 2 * Math.PI) / DIRECTIONS
    // Rounded so the four axis directions are exact.
    const ux = Math.round(Math.cos(angle) * 1e9) / 1e9
    const uy = Math.round(Math.sin(angle) * 1e9) / 1e9
    const reach =
      (node.w * Math.abs(ux) + node.h * Math.abs(uy)) / 2 +
      TABLE_GAP +
      (w * Math.abs(ux) + h * Math.abs(uy)) / 2
    const spot = { x: node.x + ux * reach, y: node.y + uy * reach, w, h }
    // No tiebreak for the previous direction, so the table does not jump between two free spots.
    let cost = direction === k ? 0 : k * DIRECTION_TIEBREAK
    const { items, labelCount, absorbed } = context
    const near = collectCells(
      context.grid,
      spot.x - w / 2 - OBSTACLE_MARGIN,
      spot.y - h / 2 - OBSTACLE_MARGIN,
      spot.x + w / 2 + OBSTACLE_MARGIN,
      spot.y + h / 2 + OBSTACLE_MARGIN,
    )
    for (const i of near) {
      if (i >= labelCount) cost += overlapArea(spot, items[i], OBSTACLE_MARGIN) * OBSTACLE_WEIGHT
      else if (!absorbed[i]) cost += overlapArea(spot, items[i], LABEL_MARGIN) * LABEL_WEIGHT
    }
    for (const placed of context.tables) {
      cost += overlapArea(spot, placed, OBSTACLE_MARGIN) * OBSTACLE_WEIGHT
    }
    cost += linesThrough(context.index, spot, null, CROSSING_INSET) * CROSSING_PENALTY
    if (bounds) {
      const outside =
        Math.max(0, bounds.left - (spot.x - w / 2)) +
        Math.max(0, spot.x + w / 2 - bounds.right) +
        Math.max(0, bounds.top - (spot.y - h / 2)) +
        Math.max(0, spot.y + h / 2 - bounds.bottom)
      cost += outside * OUT_OF_BOUNDS_PENALTY
    }
    if (direction === k) cost *= KEEP_DIRECTION
    if (!best || cost < best.cost) best = { k, cost, spot }
  }
  table.dir = best.k
  table.x = round2(best.spot.x)
  table.y = round2(best.spot.y)
  table.leader = tableLeader(table, node)
}

/**
 * In node id order; each placed table is an obstacle to the next.
 * @returns {object[]}
 */
function placeTables(active, { nodeBoxes, context, buildTable, offsets, bounds, directions }) {
  for (const nodeId of [...active].sort()) {
    const node = nodeBoxes.get(nodeId)?.[0]
    if (!node) continue
    const table = buildTable(nodeId)
    if (!table) continue
    placeTable(table, {
      node,
      offset: offsets?.[nodeId] ?? null,
      context,
      bounds,
      direction: directions.get(nodeId),
    })
    if (table.dir !== null) directions.set(nodeId, table.dir)
    context.tables.push(tableObstacle(table))
    context.placed.push(table)
  }
  return context.placed
}

/**
 * One per canvas instance.
 * @returns {{ p1: Map, p2: Map, tables: Set<string>, directions: Map<string, number> }}
 */
export function createTableLayoutState() {
  return { p1: new Map(), p2: new Map(), tables: new Set(), directions: new Map() }
}

/**
 * Pass 1 places every label from its own warm state, to be measured. With no tables, that is the
 * result, and pass 2's state follows pass 1's so a table switching on later starts warm.
 * Otherwise pass 2 places the unabsorbed labels with the tables as obstacles; labels it has not
 * seen start where pass 1 put them. Labels get `x`, `y`, `leader`; tables `x`, `y`, `leader`,
 * `dir`.
 *
 * @param {object[]} boxes - unplaced label boxes (linkLabelBoxes / groupLabelBoxes)
 * @param {object} options
 * @param {Map<string, { x: number, y: number, w: number, h: number }[]>} options.nodeBoxes -
 *   each node's first box is the node itself (it places the table)
 * @param {object[]} options.segments - every drawn line's lineSegments()
 * @param {Map<string, number>} options.degrees - from lineDegrees()
 * @param {ReturnType<typeof createTableLayoutState>} options.state
 * @param {boolean} [options.enabled]
 * @param {(nodeId: string) => object | null} [options.buildTable] - unplaced table content
 * @param {Object<string, { x: number, y: number }>} [options.offsets] - dragged tables, by
 *   node id: table centre minus node centre
 * @param {{ left: number, top: number, right: number, bottom: number } | null} [options.bounds]
 * @param {'warm' | 'settle'} [options.pass]
 * @returns {{ labels: object[], tables: object[], iterations: number[] }}
 */
export function layoutLabelsWithTables(
  boxes,
  {
    nodeBoxes,
    segments,
    degrees,
    state,
    enabled = true,
    buildTable = () => null,
    offsets = {},
    bounds = null,
    pass = 'warm',
  },
) {
  const first = layoutLinkLabels(boxes, { nodeBoxes, state: state.p1, pass })
  if (!enabled || !boxes.length) {
    state.tables.clear()
    return { labels: boxes, tables: [], iterations: [first.iterations] }
  }

  const index = segmentIndex(segments)
  const labelIndex = boxIndex(boxes, nodeBoxes)
  const bad = findBadLabels(boxes, labelIndex, index, degrees)
  updateTableNodes(state.tables, { boxes, bad, degrees })
  if (!state.tables.size) {
    for (const box of boxes) state.p2.set(box.id, state.p1.get(box.id))
    return { labels: boxes, tables: [], iterations: [first.iterations] }
  }

  const labels = []
  const absorbed = []
  const taken = new Uint8Array(boxes.length)
  boxes.forEach((box, i) => {
    if (isAbsorbed(box, state.tables)) {
      taken[i] = 1
      absorbed.push(box)
    } else {
      labels.push(box)
    }
  })
  const tables = placeTables(state.tables, {
    nodeBoxes,
    context: {
      ...labelIndex,
      labelCount: boxes.length,
      absorbed: taken,
      tables: [],
      placed: [],
      index,
    },
    buildTable,
    offsets,
    bounds,
    directions: state.directions,
  })

  const obstacles = tables.map(tableObstacle)
  const { moving, resting } = splitSecondPass(
    labels,
    [...obstacles, ...absorbed.map(labelBounds)],
    state,
  )
  for (const box of resting) {
    state.p2.set(box.id, state.p1.get(box.id))
    obstacles.push(labelBounds(box))
  }
  for (const box of moving) {
    if (!state.p2.has(box.id)) state.p2.set(box.id, state.p1.get(box.id))
  }
  const second = layoutLinkLabels(moving, { nodeBoxes, obstacles, state: state.p2, pass })
  return { labels, tables, iterations: [first.iterations, second.iterations] }
}

/** Near enough (px) to a table or an absorbed label for pass 2 to move a label. */
const SECOND_PASS_REACH = 16

/** Along plus across. */
const SAME_SPOT = 0.5

/**
 * A label near a table or an absorbed label may move, and so may one pass 2 left away from pass
 * 1's spot, until they agree again (so it eases back rather than jumps). The rest keep pass 1's
 * result as obstacles, so pass 2 costs what the tables touch.
 *
 * @param {object[]} labels - unabsorbed, placed by pass 1
 * @param {{ x: number, y: number, w: number, h: number }[]} zone - tables, and the absorbed
 *   labels where pass 1 put them
 * @param {ReturnType<typeof createTableLayoutState>} state
 * @returns {{ moving: object[], resting: object[] }}
 */
function splitSecondPass(labels, zone, state) {
  const grid = createCells(zone.length)
  zone.forEach((box, i) =>
    fileBounds(
      grid,
      box.x - box.w / 2 - SECOND_PASS_REACH,
      box.y - box.h / 2 - SECOND_PASS_REACH,
      box.x + box.w / 2 + SECOND_PASS_REACH,
      box.y + box.h / 2 + SECOND_PASS_REACH,
      i,
    ),
  )
  const moving = []
  const resting = []
  for (const box of labels) {
    const before = state.p2.get(box.id)
    const now = state.p1.get(box.id)
    let moves = !!before && Math.abs(before.ds - now.ds) + Math.abs(before.o - now.o) > SAME_SPOT
    if (!moves) {
      const halfW = box.width / 2
      const halfH = box.height / 2
      for (const i of collectCells(
        grid,
        box.x - halfW,
        box.y - halfH,
        box.x + halfW,
        box.y + halfH,
      )) {
        const z = zone[i]
        if (
          Math.abs(box.x - z.x) < halfW + z.w / 2 + SECOND_PASS_REACH &&
          Math.abs(box.y - z.y) < halfH + z.h / 2 + SECOND_PASS_REACH
        ) {
          moves = true
        }
      }
    }
    if (moves) moving.push(box)
    else resting.push(box)
  }
  return { moving, resting }
}

/**
 * Null for a node the canvas does not know.
 *
 * @param {string} nodeId
 * @param {object[]} lines - every drawn line: `edgeId`, `drawn` (buildDrawnLinks),
 *   `sourceId`, `targetId`, `points` (the route as drawn), `color`
 * @param {object} options
 * @param {(nodeId: string) => { name: string, statusColor: string } | undefined} options.nodeInfo
 * @param {Map<string, object>} options.dciValues
 * @param {Function} options.measureText
 * @returns {object | null}
 */
export function nodeOverflowTable(nodeId, lines, { nodeInfo, dciValues, measureText }) {
  const node = nodeInfo(nodeId)
  if (!node) return null
  const table = overflowTableContent({
    nodeId,
    title: node.name,
    lines: lines
      .filter((line) => line.sourceId === nodeId || line.targetId === nodeId)
      .map((line) => {
        const fromSource = line.sourceId === nodeId
        return {
          edgeId: line.edgeId,
          drawn: line.drawn,
          color: line.color,
          peerName: nodeInfo(fromSource ? line.targetId : line.sourceId)?.name ?? '',
          bearing: routeBearing(line.points, fromSource),
        }
      }),
    dciValues,
    measureText,
  })
  table.statusColor = node.statusColor
  return table
}

/**
 * Extent of every node's own box (its first), grown by `padding`; null without nodes.
 * @param {Map<string, { x: number, y: number, w: number, h: number }[]>} nodeBoxes
 * @param {number} padding
 * @returns {{ left: number, top: number, right: number, bottom: number } | null}
 */
export function nodeExtent(nodeBoxes, padding) {
  let extent = null
  for (const [node] of nodeBoxes.values()) {
    if (!node) continue
    const left = node.x - node.w / 2 - padding
    const right = node.x + node.w / 2 + padding
    const top = node.y - node.h / 2 - padding
    const bottom = node.y + node.h / 2 + padding
    if (!extent) extent = { left, top, right, bottom }
    else {
      extent.left = Math.min(extent.left, left)
      extent.right = Math.max(extent.right, right)
      extent.top = Math.min(extent.top, top)
      extent.bottom = Math.max(extent.bottom, bottom)
    }
  }
  return extent
}
