/**
 * Slide-first placement of network map link labels. Each label rides a track on its own line
 * (an end pill out to 40% of the link, a card within the middle half) at distance `s` along it
 * and offset `o` across. Overlaps are resolved by the cheapest exit: sliding costs its
 * distance, stepping off more, and more again once the box leaves its line. Moves are applied
 * damped (Jacobi); a label with no overlap drifts back home, one left off its line gets a leader.
 *
 * `state` keeps each label's offset from home between calls, so labels ease aside during a drag
 * instead of jumping. Boxes are centred; units are graph coordinates or container pixels.
 */

/** From scratch, after a single geometry change, and per drag frame or value refresh. */
export const LABEL_LAYOUT_ITERATIONS = { cold: 260, settle: 120, warm: 30 }

const MARGIN = 3

const END_REACH = 0.4

/** The middle half of the link. */
const CARD_FROM = 0.25
const CARD_TO = 0.75

const MAX_OFFSET = { end: 90, card: 130 }

// Cost per unit of movement; sliding along the track costs 1.
/** While the box still crosses its own line. */
const STEP_ON_LINE_COST = 1.25
const STEP_OFF_LINE_COST = 2.5
/** So labels do not flicker across the link. */
const SIDE_SWITCH_COST = 20
/**
 * For moving toward the other box: two labels on parallel tracks would otherwise pick the same
 * direction and slide together forever.
 */
const TOWARD_OTHER_COST = 2

const DAMPING = 0.5

/** A near-even area split is made uneven instead (see resolvePair). */
const EVEN_SPLIT = 0.02
const UNEVEN_SPLIT = 0.1

/** Pull home per iteration for a label with no overlap: along, and across. */
const HOME_PULL = 0.06
const OFFSET_DECAY = 0.1

/** The last iterations skip the pull home, so the result ends without overlaps. */
const CLEAN_FINISH = 8

/** How far past the margin a label looks for neighbours that a drift home could run into. */
const REACH = 4

/** A label that moved less than this in an iteration has stopped (see relax). */
const REST = 0.05

/**
 * Overlap into the margin that counts as resolved: damped pushes close a gap by halves and never
 * finish, so labels at rest would otherwise never sleep.
 */
const SETTLED = 0.5

const DETACHED = 1.5

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const round2 = (v) => Math.round(v * 100) / 100

// Result of the last overlapRange() call; module-level so the hot loop allocates nothing.
let rangeLo = 0
let rangeHi = 0

/** Leaves the range of t for which a, moved by t along (vx, vy), overlaps b in rangeLo/rangeHi. */
function overlapRange(a, b, vx, vy, margin) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const halfW = (a.w + b.w) / 2 + margin
  const halfH = (a.h + b.h) / 2 + margin
  let lo = Number.NEGATIVE_INFINITY
  let hi = Number.POSITIVE_INFINITY
  if (Math.abs(vx) > 1e-9) {
    const t1 = (-halfW - dx) / vx
    const t2 = (halfW - dx) / vx
    lo = Math.max(lo, Math.min(t1, t2))
    hi = Math.min(hi, Math.max(t1, t2))
  } else if (Math.abs(dx) >= halfW) {
    return false
  }
  if (Math.abs(vy) > 1e-9) {
    const t1 = (-halfH - dy) / vy
    const t2 = (halfH - dy) / vy
    lo = Math.max(lo, Math.min(t1, t2))
    hi = Math.min(hi, Math.max(t1, t2))
  } else if (Math.abs(dy) >= halfH) {
    return false
  }
  rangeLo = lo
  rangeHi = hi
  return lo < hi
}

// Grid broadphase: bounds grow by half the margin on each side, so a bounds overlap is exactly an
// overlap with `margin` clearance. A box changes cells only when its bounds cross a cell edge.

// Two 16-bit cell coordinates in one number; +-32768 cells covers any real map.
const cellKey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768)

/** The mean box size, within bounds. */
function cellSizeFor(boxes, margin) {
  if (!boxes.length) return 64
  let sum = 0
  for (const b of boxes) sum += Math.max(b.w, b.h) + margin
  return clamp(sum / boxes.length, 48, 200)
}

function createGrid(boxes, margin) {
  const count = boxes.length
  const grid = {
    boxes,
    margin,
    cell: cellSizeFor(boxes, margin),
    cells: new Map(),
    left: new Float64Array(count),
    right: new Float64Array(count),
    top: new Float64Array(count),
    bottom: new Float64Array(count),
    cx0: new Int32Array(count),
    cx1: new Int32Array(count),
    cy0: new Int32Array(count),
    cy1: new Int32Array(count),
    // Per-query stamp, so a box filed under several cells is visited once.
    seen: new Int32Array(count).fill(-1),
    stamp: 0,
  }
  for (let i = 0; i < count; i++) {
    setBounds(grid, i)
    fileBox(grid, i)
  }
  return grid
}

function setBounds(grid, i) {
  const b = grid.boxes[i]
  const halfW = b.w / 2 + grid.margin / 2
  const halfH = b.h / 2 + grid.margin / 2
  grid.left[i] = b.x - halfW
  grid.right[i] = b.x + halfW
  grid.top[i] = b.y - halfH
  grid.bottom[i] = b.y + halfH
}

function fileBox(grid, i) {
  const { cell, cells } = grid
  const cx0 = Math.floor(grid.left[i] / cell)
  const cx1 = Math.floor(grid.right[i] / cell)
  const cy0 = Math.floor(grid.top[i] / cell)
  const cy1 = Math.floor(grid.bottom[i] / cell)
  grid.cx0[i] = cx0
  grid.cx1[i] = cx1
  grid.cy0[i] = cy0
  grid.cy1[i] = cy1
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      const key = cellKey(cx, cy)
      const list = cells.get(key)
      if (list) list.push(i)
      else cells.set(key, [i])
    }
  }
}

function unfileBox(grid, i) {
  for (let cx = grid.cx0[i]; cx <= grid.cx1[i]; cx++) {
    for (let cy = grid.cy0[i]; cy <= grid.cy1[i]; cy++) {
      const list = grid.cells.get(cellKey(cx, cy))
      const at = list.indexOf(i)
      list[at] = list[list.length - 1]
      list.pop()
    }
  }
}

function moveBox(grid, i) {
  setBounds(grid, i)
  const { cell } = grid
  if (
    Math.floor(grid.left[i] / cell) === grid.cx0[i] &&
    Math.floor(grid.right[i] / cell) === grid.cx1[i] &&
    Math.floor(grid.top[i] / cell) === grid.cy0[i] &&
    Math.floor(grid.bottom[i] / cell) === grid.cy1[i]
  ) {
    return
  }
  unfileBox(grid, i)
  fileBox(grid, i)
}

function queryBox(grid, i, visit) {
  const { left, right, top, bottom, seen } = grid
  const stamp = ++grid.stamp
  seen[i] = stamp
  for (let cx = grid.cx0[i]; cx <= grid.cx1[i]; cx++) {
    for (let cy = grid.cy0[i]; cy <= grid.cy1[i]; cy++) {
      const list = grid.cells.get(cellKey(cx, cy))
      for (let k = 0; k < list.length; k++) {
        const j = list[k]
        if (seen[j] === stamp) continue
        seen[j] = stamp
        if (left[j] < right[i] && left[i] < right[j] && top[j] < bottom[i] && top[i] < bottom[j]) {
          visit(j)
        }
      }
    }
  }
}

/**
 * Flat list [i0, j0, i1, j1, ...] with i < j.
 * @param {{ x: number, y: number, w: number, h: number }[]} boxes - centred
 * @param {number} margin
 * @returns {number[]}
 */
export function overlappingPairs(boxes, margin) {
  const grid = createGrid(boxes, margin)
  const pairs = []
  for (let i = 0; i < boxes.length; i++) {
    queryBox(grid, i, (j) => {
      if (j > i) pairs.push(i, j)
    })
  }
  return pairs
}

function place(r) {
  r.x = r.x1 + r.ux * r.s + r.nx * r.o
  r.y = r.y1 + r.uy * r.s + r.ny * r.o
}

/** Distance along the track at which the label clears a node's boxes, from its start or end. */
function clearFromNode(r, nodeBoxes, fromStart) {
  const sign = fromStart ? 1 : -1
  let s = fromStart ? 0 : r.L
  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    for (const b of nodeBoxes) {
      const probe = { x: r.x1 + r.ux * s, y: r.y1 + r.uy * s, w: r.w, h: r.h }
      if (overlapRange(probe, b, r.ux * sign, r.uy * sign, MARGIN + 1)) {
        if (rangeLo < 0 && rangeHi > 0) {
          s += sign * rangeHi
          moved = true
        }
      }
    }
    if (!moved) break
  }
  return s
}

/** Unit vector u along the track, normal n across it. */
function makeRecord(box, nodeBoxes) {
  const { x1, y1, x2, y2 } = box.track
  const L = Math.hypot(x2 - x1, y2 - y1)
  const ux = L > 0.001 ? (x2 - x1) / L : 1
  const uy = L > 0.001 ? (y2 - y1) / L : 0
  const kind = box.kind === 'end' ? 'end' : 'card'
  const r = {
    box,
    key: box.id,
    kind,
    w: box.width,
    h: box.height,
    x1,
    y1,
    ux,
    uy,
    nx: -uy,
    ny: ux,
    L,
    // The box's extent across the track: how far it may step off and still cross its line.
    en: box.width * Math.abs(uy) + box.height * Math.abs(ux),
    mass: box.width * box.height,
    oMax: MAX_OFFSET[kind],
    s: 0,
    o: 0,
    x: 0,
    y: 0,
    ds: 0,
    dO: 0,
    hits: 0,
    blocked: false,
    driftS: 0,
    driftO: 0,
    dvx: 0,
    dvy: 0,
    // A fresh layout counts everyone as moving.
    step: Number.POSITIVE_INFINITY,
  }
  const near1 = clearFromNode(r, nodeBoxes.get(box.sourceId) ?? [], true)
  const near2 = clearFromNode(r, nodeBoxes.get(box.targetId) ?? [], false)
  if (kind === 'end' && box.end === 2) {
    r.s0 = r.sMax = near2
    r.sMin = Math.min(near2, L * (1 - END_REACH))
  } else if (kind === 'end') {
    r.s0 = r.sMin = near1
    r.sMax = Math.max(near1, L * END_REACH)
  } else {
    r.s0 = L * (box.homeT ?? 0.5)
    r.sMin = Math.min(r.s0, Math.max(near1, L * CARD_FROM))
    r.sMax = Math.max(r.s0, Math.min(near2, L * CARD_TO))
  }
  return r
}

/**
 * Accumulate the cheapest way for r to get off `other`. `share` is r's part of the move; `tie`
 * picks a side when the boxes are exactly level.
 */
function resolve(r, other, share, tie) {
  r.hits++
  let bestCost = Number.POSITIVE_INFINITY
  let bestDs = 0
  let bestDo = 0

  // Exit away from the other box (see TOWARD_OTHER_COST). Slides off the track are not allowed.
  if (overlapRange(r, other, r.ux, r.uy, MARGIN)) {
    const away = (r.x - other.x) * r.ux + (r.y - other.y) * r.uy
    const preferred = Math.abs(away) > 0.5 ? Math.sign(away) : tie
    for (let k = 0; k < 2; k++) {
      const t = k ? rangeHi : rangeLo
      if (!Number.isFinite(t)) continue
      const s = r.s + t
      if (s < r.sMin - 0.5 || s > r.sMax + 0.5) continue
      const cost = Math.abs(t) * (Math.sign(t) === preferred ? 1 : TOWARD_OTHER_COST)
      if (cost < bestCost) {
        bestCost = cost
        bestDs = t
      }
    }
  }

  const across = overlapRange(r, other, r.nx, r.ny, MARGIN)
  const acrossLo = rangeLo
  const acrossHi = rangeHi
  if (across) {
    const away = (r.x - other.x) * r.nx + (r.y - other.y) * r.ny
    const preferred = Math.abs(away) > 0.5 ? Math.sign(away) : tie
    for (let k = 0; k < 2; k++) {
      const t = k ? acrossHi : acrossLo
      if (!Number.isFinite(t)) continue
      const o = r.o + t
      if (Math.abs(o) > r.oMax + 0.5) continue
      const onLine = Math.abs(o) <= r.en / 2 - 2
      let cost = Math.abs(t) * (onLine ? STEP_ON_LINE_COST : STEP_OFF_LINE_COST)
      if (Math.sign(t) !== preferred) cost *= TOWARD_OTHER_COST
      if (Math.abs(r.o) > 1 && Math.sign(o) !== Math.sign(r.o)) cost += SIDE_SWITCH_COST
      if (cost < bestCost) {
        bestCost = cost
        bestDs = 0
        bestDo = t
      }
    }
  }

  if (bestCost === Number.POSITIVE_INFINITY) {
    // Boxed in on every side: take the shorter step across and let clamping decide.
    if (across) r.dO += (Math.abs(acrossLo) < Math.abs(acrossHi) ? acrossLo : acrossHi) * share
    return
  }
  r.ds += bestDs * share
  r.dO += bestDo * share
}

/**
 * The move is split by area, so the bigger label moves less. Equal labels split unevenly: on a
 * symmetric fan both would pick the same exit and stay mirror images forever.
 */
function resolvePair(a, b) {
  let share = b.mass / (a.mass + b.mass)
  if (Math.abs(share - 0.5) < EVEN_SPLIT) share = 0.5 + UNEVEN_SPLIT
  resolve(a, b, share, -1)
  resolve(b, a, 1 - share, 1)
}

function overlapsAt(x, y, a, b, margin) {
  return (
    Math.abs(x - b.x) * 2 < a.w + b.w + 2 * margin && Math.abs(y - b.y) * 2 < a.h + b.h + 2 * margin
  )
}

/**
 * Only awake labels look for contacts. A label that did not move sleeps until an awake label runs
 * into it or passes within reach while moving, so a warm frame costs what is moving.
 *
 * A label drifts home only if the drift keeps it clear of its neighbours; otherwise it would
 * drift in and be pushed out again on every warm start.
 */
function relax(records, obstacles, iterations) {
  const count = records.length
  // Labels first, obstacles after them.
  const items = records.concat(obstacles)
  const grid = createGrid(items, MARGIN + REACH)

  const awake = new Uint8Array(count).fill(1)
  const scanning = new Uint8Array(count)

  const contact = (i, j) => {
    const a = records[i]
    const b = items[j]
    if (overlapsAt(a.x, a.y, a, b, MARGIN - SETTLED)) {
      if (j >= count) {
        resolve(a, b, 1, 1)
      } else {
        awake[j] = 1
        // The lower index goes first, so an uneven split does not depend on scan order.
        if (i < j) resolvePair(a, b)
        else resolvePair(b, a)
      }
      return
    }
    if (overlapsAt(a.x + a.dvx, a.y + a.dvy, a, b, MARGIN)) a.blocked = true
    if (j < count) {
      if (!scanning[j]) {
        if (a.step > REST) awake[j] = 1
      } else if (overlapsAt(b.x + b.dvx, b.y + b.dvy, b, a, MARGIN)) {
        b.blocked = true
      }
    }
  }

  let scanner = -1
  const visitNeighbour = (j) => {
    if (j < count && scanning[j] && j < scanner) return
    contact(scanner, j)
  }

  for (let it = 0; it < iterations; it++) {
    const drift = it < iterations - CLEAN_FINISH
    for (let i = 0; i < count; i++) {
      const r = records[i]
      scanning[i] = awake[i]
      r.ds = 0
      r.dO = 0
      r.hits = 0
      r.blocked = false
      r.driftS = drift ? (r.s0 - r.s) * HOME_PULL : 0
      r.driftO = drift ? -r.o * OFFSET_DECAY : 0
      r.dvx = r.ux * r.driftS + r.nx * r.driftO
      r.dvy = r.uy * r.driftS + r.ny * r.driftO
    }

    for (scanner = 0; scanner < count; scanner++) {
      if (scanning[scanner]) queryBox(grid, scanner, visitNeighbour)
    }

    for (let i = 0; i < count; i++) {
      const r = records[i]
      if (!scanning[i] && !r.hits) continue
      const s = r.s
      const o = r.o
      r.s += r.ds * DAMPING
      r.o += r.dO * DAMPING
      // Only labels that looked around this iteration know whether their way home is clear.
      if (scanning[i] && !r.hits && !r.blocked) {
        r.s += r.driftS
        r.o += r.driftO
      }
      r.s = clamp(r.s, r.sMin, r.sMax)
      r.o = clamp(r.o, -r.oMax, r.oMax)
      place(r)
      r.step = Math.abs(r.s - s) + Math.abs(r.o - o)
      if (r.step > 0) moveBox(grid, i)
      if (scanning[i] && r.step < REST) awake[i] = 0
    }
  }
}

/** From the nearest point of the track to the nearest point of the box; null while on its line. */
function leaderOf(r) {
  const along = clamp((r.x - r.x1) * r.ux + (r.y - r.y1) * r.uy, r.sMin, r.sMax)
  const ax = r.x1 + r.ux * along
  const ay = r.y1 + r.uy * along
  const gapX = Math.max(0, Math.abs(ax - r.x) - r.w / 2)
  const gapY = Math.max(0, Math.abs(ay - r.y) - r.h / 2)
  if (Math.hypot(gapX, gapY) <= DETACHED) return null
  return {
    x1: round2(ax),
    y1: round2(ay),
    x2: round2(clamp(ax, r.x - r.w / 2, r.x + r.w / 2)),
    y2: round2(clamp(ay, r.y - r.h / 2, r.y + r.h / 2)),
  }
}

/**
 * Sets each box's centre (`x`, `y`) and `leader` (null or `{ x1, y1, x2, y2 }`), in place.
 * Runs cold iterations when no box was placed before, at least settle when some box is new.
 *
 * @param {object[]} boxes - from linkLabelBoxes() / groupLabelBoxes(): `id`,
 *   `width`, `height`, `kind` ('end' | 'card'), `end` (1 | 2), `homeT`, `track`
 *   (`{ x1, y1, x2, y2 }`), `sourceId`, `targetId`
 * @param {object} [options]
 * @param {Map<string, { x: number, y: number, w: number, h: number }[]>} [options.nodeBoxes] -
 *   per node id (icon, name plate); a label's own nodes also bound its track
 * @param {{ x: number, y: number, w: number, h: number }[]} [options.obstacles] - not a node's
 * @param {Map<string, { ds: number, o: number }>} [options.state] - warm-start state, read and
 *   written
 * @param {'warm' | 'settle' | 'cold'} [options.pass]
 * @returns {{ iterations: number }}
 */
export function layoutLinkLabels(
  boxes,
  { nodeBoxes = new Map(), obstacles = [], state = new Map(), pass = 'warm' } = {},
) {
  const allObstacles = [...obstacles]
  for (const list of nodeBoxes.values()) allObstacles.push(...list)

  const records = boxes.map((box) => makeRecord(box, nodeBoxes))
  let known = 0
  for (const r of records) {
    const saved = state.get(r.key)
    if (saved) known++
    r.s = saved ? clamp(r.s0 + saved.ds, r.sMin, r.sMax) : r.s0
    r.o = saved ? clamp(saved.o, -r.oMax, r.oMax) : 0
    place(r)
  }

  const passIterations = LABEL_LAYOUT_ITERATIONS[pass] ?? LABEL_LAYOUT_ITERATIONS.warm
  let iterations = passIterations
  if (!records.length) iterations = 0
  else if (!known) iterations = LABEL_LAYOUT_ITERATIONS.cold
  else if (known < records.length)
    iterations = Math.max(passIterations, LABEL_LAYOUT_ITERATIONS.settle)

  relax(records, allObstacles, iterations)

  for (const r of records) {
    r.box.x = round2(r.x)
    r.box.y = round2(r.y)
    r.box.leader = leaderOf(r)
    state.set(r.key, { ds: r.s - r.s0, o: r.o })
  }
  return { iterations }
}
