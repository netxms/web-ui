/**
 * Room floor plan geometry, after the server's Room and the legacy FloorPlanGeometry. Millimetres
 * in room space, Y pointing down; rotation is clockwise around the reference corner, and an item
 * at rotation 0 faces +Y.
 */

/** @typedef {[number, number]} Point */

/**
 * Corners in order: reference corner, along the width, far corner, along the depth. The front
 * edge runs from the last corner to the third. Rounded to whole millimetres, so right angles
 * give exact edges.
 *
 * @returns {Point[]}
 */
export function footprint(x, y, width, depth, rotation) {
  const a = (rotation * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return [
    [x, y],
    [x + width * cos, y + width * sin],
    [x + width * cos - depth * sin, y + width * sin + depth * cos],
    [x - depth * sin, y + depth * cos],
  ].map(([px, py]) => [Math.round(px) || 0, Math.round(py) || 0])
}

/** @param {Point[]} points */
export function bounds(points) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

/** @param {Array<Point | {x: number, y: number}>} points */
export function svgPoints(points) {
  return points.map((p) => (Array.isArray(p) ? `${p[0]},${p[1]}` : `${p.x},${p.y}`)).join(' ')
}

/**
 * Strip along the front edge, `size` deep.
 *
 * @param {Point[]} corners - from `footprint`
 * @param {number} depth - the footprint's depth
 * @param {number} size
 * @returns {Point[]}
 */
export function frontBand(corners, depth, size) {
  const [p0, , p2, p3] = corners
  if (depth <= 0) return [p3, p2, p2, p3]
  const ux = (p3[0] - p0[0]) / depth
  const uy = (p3[1] - p0[1]) / depth
  return [p3, p2, [p2[0] - ux * size, p2[1] - uy * size], [p3[0] - ux * size, p3[1] - uy * size]]
}

/**
 * Triangle in the middle of the front band, pointing out of the front edge.
 *
 * @param {Point[]} corners - from `footprint`
 * @param {number} depth - the footprint's depth
 * @param {number} size - the band's thickness, as given to `frontBand`
 * @returns {Point[] | null}
 */
export function frontArrow(corners, depth, size) {
  const [p0, p1, p2, p3] = corners
  const width = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
  if (depth <= 0 || width <= 0 || size <= 0) return null
  const out = [(p3[0] - p0[0]) / depth, (p3[1] - p0[1]) / depth]
  const along = [(p2[0] - p3[0]) / width, (p2[1] - p3[1]) / width]
  const mid = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2]
  const back = (share) => [mid[0] - out[0] * size * share, mid[1] - out[1] * size * share]
  const tip = back(0.15)
  const base = back(0.85)
  const half = Math.min(size * 0.75, width * 0.25)
  return [
    tip,
    [base[0] + along[0] * half, base[1] + along[1] * half],
    [base[0] - along[0] * half, base[1] - along[1] * half],
  ]
}

/**
 * A footprint's corners moved `distance` out of it, or into it when negative.
 *
 * @param {Point[]} corners - from `footprint`
 * @param {number} distance
 * @returns {Point[]}
 */
export function offsetRectangle(corners, distance) {
  const away = (p, q) => {
    const length = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1
    return [(p[0] - q[0]) / length, (p[1] - q[1]) / length]
  }
  return corners.map((p, i) => {
    const a = away(p, corners[(i + 3) % 4])
    const b = away(p, corners[(i + 1) % 4])
    return [p[0] + (a[0] + b[0]) * distance, p[1] + (a[1] + b[1]) * distance]
  })
}

const NULL_GUID = '00000000-0000-0000-0000-000000000000'

/** The room's backdrop image GUID, or null without one. */
export function backdropImageId(room) {
  const guid = room?.backgroundImage
  return guid && guid !== NULL_GUID ? guid : null
}

/**
 * Where the backdrop image lies in the room. `backgroundScale` is micrometres per image pixel; an
 * uncalibrated image (0) spans the outline's width, as in the legacy client.
 *
 * @param {object} room - floor plan document or its working copy
 * @param {{ width: number, height: number }} image - natural size in pixels
 * @returns {{ x: number, y: number, width: number, height: number, mmPerPixel: number } | null}
 */
export function backdropRect(room, image) {
  if (!(image?.width > 0) || !(image?.height > 0)) return null
  let mmPerPixel = room.backgroundScale > 0 ? room.backgroundScale / 1000 : 0
  if (!mmPerPixel) {
    const b = room.outline?.length ? bounds(room.outline.map((p) => [p.x, p.y])) : null
    const span = b ? b.maxX - b.minX : 0
    mmPerPixel = span > 0 ? span / image.width : 10
  }
  return {
    x: room.backgroundX ?? 0,
    y: room.backgroundY ?? 0,
    width: image.width * mmPerPixel,
    height: image.height * mmPerPixel,
    mmPerPixel,
  }
}

export const BACKDROP_CORNERS = ['nw', 'ne', 'se', 'sw']

/** A backdrop no narrower than this, in millimetres, when scaled by a corner. */
const MIN_BACKDROP_WIDTH = 100

/** Backdrop fields for a scale in millimetres per pixel: whole micrometres, at least one. */
const scaleField = (mmPerPixel) => Math.max(1, Math.round(mmPerPixel * 1000))

/**
 * Backdrop fields with a corner of its rectangle at `point`, the opposite corner kept and the
 * proportions too: the server stores one scale for both axes.
 *
 * @param {{ x: number, y: number, width: number, height: number, mmPerPixel: number }} rect -
 *   from `backdropRect`
 * @param {'nw'|'ne'|'se'|'sw'} corner
 * @param {{ x: number, y: number }} point
 */
export function scaleBackdrop(rect, corner, point) {
  const pixelsWide = rect.width / rect.mmPerPixel
  const pixelsHigh = rect.height / rect.mmPerPixel
  const east = corner.includes('e')
  const south = corner.includes('s')
  const anchorX = east ? rect.x : rect.x + rect.width
  const anchorY = south ? rect.y : rect.y + rect.height
  const byWidth = (east ? point.x - anchorX : anchorX - point.x) / pixelsWide
  const byHeight = (south ? point.y - anchorY : anchorY - point.y) / pixelsHigh
  const umPerPixel = scaleField(Math.max(byWidth, byHeight, MIN_BACKDROP_WIDTH / pixelsWide))
  const width = (pixelsWide * umPerPixel) / 1000
  const height = (pixelsHigh * umPerPixel) / 1000
  return {
    backgroundScale: umPerPixel,
    backgroundX: Math.round(east ? anchorX : anchorX - width),
    backgroundY: Math.round(south ? anchorY : anchorY - height),
  }
}

/**
 * Backdrop fields that put two points of the image `distance` millimetres apart, as legacy's
 * calibration does; the image scales around the first point, which stays where it is.
 *
 * @param {{ x: number, y: number, mmPerPixel: number }} rect - from `backdropRect`
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} distance - millimetres
 * @returns {object|null} null for two equal points or no distance
 */
export function calibrateBackdrop(rect, a, b, distance) {
  const measured = Math.hypot(b.x - a.x, b.y - a.y)
  if (!(measured > 0) || !(distance > 0)) return null
  const umPerPixel = scaleField((distance * rect.mmPerPixel) / measured)
  const ratio = umPerPixel / 1000 / rect.mmPerPixel
  return {
    backgroundScale: umPerPixel,
    backgroundX: Math.round(a.x - (a.x - rect.x) * ratio),
    backgroundY: Math.round(a.y - (a.y - rect.y) * ratio),
  }
}

/**
 * Backdrop fields that lay the image over the room: its width on the outline's, its top left
 * corner on the outline's.
 *
 * @param {Array<{x: number, y: number}>} outline
 * @param {{ width: number }} image - natural size in pixels
 * @returns {object|null}
 */
export function fitBackdrop(outline, image) {
  if (!outline?.length || !(image?.width > 0)) return null
  const b = bounds(outline.map((p) => [p.x, p.y]))
  if (!(b.maxX > b.minX)) return null
  return {
    backgroundScale: scaleField((b.maxX - b.minX) / image.width),
    backgroundX: Math.round(b.minX),
    backgroundY: Math.round(b.minY),
  }
}

/**
 * Compass side the front faces, for right-angle rotations only.
 *
 * @returns {'S'|'W'|'N'|'E'|null}
 */
export function facing(rotation) {
  const r = ((Math.round(rotation) % 360) + 360) % 360
  return { 0: 'S', 90: 'W', 180: 'N', 270: 'E' }[r] ?? null
}

/** Legacy column labels: A..Z, then AA, AB, ... */
export function columnLetters(index) {
  let label = ''
  let i = index
  do {
    label = String.fromCharCode(65 + (i % 26)) + label
    i = Math.floor(i / 26) - 1
  } while (i >= 0)
  return label
}

/**
 * Tile grid lines and labels. As in legacy, the first tile touching the outline is column A (or
 * 1) and row 1.
 *
 * @param {{ outline: Array<{x: number, y: number}>, gridTileSize: number, gridOriginX: number,
 *   gridOriginY: number, gridLabels: string }} room
 */
export function tileGrid(room) {
  const tile = room.gridTileSize
  if (!(tile > 0) || !room.outline?.length) return { xs: [], ys: [], columns: [], rows: [] }
  const b = bounds(room.outline.map((p) => [p.x, p.y]))
  const ox = room.gridOriginX ?? 0
  const oy = room.gridOriginY ?? 0
  const firstColumn = Math.floor((b.minX - ox) / tile)
  const lastColumn = Math.ceil((b.maxX - ox) / tile)
  const firstRow = Math.floor((b.minY - oy) / tile)
  const lastRow = Math.ceil((b.maxY - oy) / tile)

  const xs = []
  const ys = []
  for (let c = firstColumn; c <= lastColumn; c++) xs.push(ox + c * tile)
  for (let r = firstRow; r <= lastRow; r++) ys.push(oy + r * tile)

  const labelled = room.gridLabels && room.gridLabels !== 'NONE'
  const letters = room.gridLabels === 'LETTERS_NUMBERS'
  const columns = []
  const rows = []
  if (labelled) {
    for (let c = firstColumn; c < lastColumn; c++) {
      const i = c - firstColumn
      columns.push({ x: ox + (c + 0.5) * tile, label: letters ? columnLetters(i) : String(i + 1) })
    }
    for (let r = firstRow; r < lastRow; r++) {
      rows.push({ y: oy + (r + 0.5) * tile, label: String(r - firstRow + 1) })
    }
  }
  return { xs, ys, columns, rows }
}

/**
 * Tile label of a room point, e.g. "D7" or "4-7"; empty without a labelled grid.
 *
 * @param {object} room - as for `tileGrid`
 * @param {number} x
 * @param {number} y
 */
export function tileAt(room, x, y) {
  const tile = room.gridTileSize
  if (!(tile > 0) || !room.gridLabels || room.gridLabels === 'NONE') return ''
  const b = bounds(room.outline.map((p) => [p.x, p.y]))
  const ox = room.gridOriginX ?? 0
  const oy = room.gridOriginY ?? 0
  const column = Math.floor((x - ox) / tile) - Math.floor((b.minX - ox) / tile)
  const row = Math.floor((y - oy) / tile) - Math.floor((b.minY - oy) / tile) + 1
  return room.gridLabels === 'LETTERS_NUMBERS'
    ? `${columnLetters(column)}${row}`
    : `${column + 1}-${row}`
}

/** Widest gap read as an aisle between two rows. */
const MAX_AISLE = 3600

/**
 * Aisles implied by rack orientation: between two rows whose fronts face each other lies a
 * cold aisle, between two whose backs face each other a hot one. Only right-angle rotations
 * count; a row is the racks sharing a front line and facing.
 *
 * @param {Array<{ corners: Point[] , rotation: number }>} racks - placed racks
 * @returns {Array<{ kind: 'hot'|'cold', x: number, y: number, width: number, height: number }>}
 */
export function deriveAisles(racks) {
  const rows = new Map()
  for (const rack of racks) {
    const side = facing(rack.rotation)
    if (!side) continue
    const b = bounds(rack.corners)
    const vertical = side === 'N' || side === 'S'
    const front = { S: b.maxY, N: b.minY, E: b.maxX, W: b.minX }[side]
    const back = { S: b.minY, N: b.maxY, E: b.minX, W: b.maxX }[side]
    const key = `${side}:${Math.round(front)}`
    const from = vertical ? b.minX : b.minY
    const to = vertical ? b.maxX : b.maxY
    const row = rows.get(key)
    if (row) {
      row.from = Math.min(row.from, from)
      row.to = Math.max(row.to, to)
    } else {
      rows.set(key, { side, front, back, from, to })
    }
  }

  const aisles = []
  const list = [...rows.values()]
  const pairs = [
    // [first side, second side, kind, edge of first, edge of second, axis]
    ['S', 'N', 'cold', 'front', 'front', 'y'],
    ['N', 'S', 'hot', 'back', 'back', 'y'],
    ['E', 'W', 'cold', 'front', 'front', 'x'],
    ['W', 'E', 'hot', 'back', 'back', 'x'],
  ]
  for (const [sideA, sideB, kind, edgeA, edgeB, axis] of pairs) {
    for (const a of list.filter((r) => r.side === sideA)) {
      for (const b of list.filter((r) => r.side === sideB)) {
        const start = a[edgeA]
        const end = b[edgeB]
        const gap = end - start
        const from = Math.max(a.from, b.from)
        const to = Math.min(a.to, b.to)
        if (gap <= 0 || gap > MAX_AISLE || to <= from) continue
        aisles.push(
          axis === 'y'
            ? { kind, x: from, y: start, width: to - from, height: gap }
            : { kind, x: start, y: from, width: gap, height: to - from },
        )
      }
    }
  }
  return aisles
}

/** Degrees in 0..359. */
export function normalizeRotation(degrees) {
  return ((Math.round(degrees) % 360) + 360) % 360 || 0
}

/** Nearest grid line to `value`; unchanged without a grid. */
export function snap(value, origin, step) {
  if (!(step > 0)) return value
  return origin + Math.round((value - origin) / step) * step
}

/**
 * Legacy FloorPlanGeometry.snapDelta: the offset that puts whichever of two parallel edges is
 * nearer a grid line on it, so an item whose size is not a multiple of the tile aligns either way.
 */
export function snapDelta(min, max, origin, step) {
  if (!(step > 0)) return 0
  const deltaMin = origin + Math.round((min - origin) / step) * step - min
  const deltaMax = origin + Math.round((max - origin) / step) * step - max
  return Math.round(Math.abs(deltaMin) <= Math.abs(deltaMax) ? deltaMin : deltaMax)
}

/**
 * `snapDelta` on both axes of the points' bounding box.
 *
 * @param {Point[]} points
 * @param {{ tile: number, originX: number, originY: number } | null} grid
 */
export function snapOffset(points, grid) {
  if (!grid || !(grid.tile > 0) || !points.length) return { dx: 0, dy: 0 }
  const b = bounds(points)
  return {
    dx: snapDelta(b.minX, b.maxX, grid.originX, grid.tile),
    dy: snapDelta(b.minY, b.maxY, grid.originY, grid.tile),
  }
}

/** Square metres of a simple polygon in millimetres, as the server's CalculateRoomOutlineArea. */
export function polygonArea(points) {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]
    const [bx, by] = points[(i + 1) % points.length]
    sum += ax * by - bx * ay
  }
  return Math.abs(sum) / 2 / 1e6
}

/**
 * An outline that is an axis-aligned rectangle, as its top left corner and size; null for any
 * other shape.
 *
 * @param {Array<{x: number, y: number}>} outline
 * @returns {{ x: number, y: number, width: number, depth: number } | null}
 */
export function rectangleOf(outline) {
  if (outline?.length !== 4) return null
  if (new Set(outline.map((p) => `${p.x},${p.y}`)).size !== 4) return null
  const xs = [...new Set(outline.map((p) => p.x))].sort((a, b) => a - b)
  const ys = [...new Set(outline.map((p) => p.y))].sort((a, b) => a - b)
  if (xs.length !== 2 || ys.length !== 2) return null
  const axisAligned = outline.every((a, i) => {
    const b = outline[(i + 1) % 4]
    return a.x === b.x || a.y === b.y
  })
  if (!axisAligned) return null
  return { x: xs[0], y: ys[0], width: xs[1] - xs[0], depth: ys[1] - ys[0] }
}

/**
 * A rectangular outline with a new size, its top left corner and corner order kept; null when
 * the outline is not a rectangle or the size is not positive.
 */
export function resizeRectangle(outline, width, depth) {
  const rect = rectangleOf(outline)
  if (!rect || !(width > 0) || !(depth > 0)) return null
  return outline.map((p) => ({
    x: p.x === rect.x ? rect.x : rect.x + width,
    y: p.y === rect.y ? rect.y : rect.y + depth,
  }))
}

const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

function onSegment(px, py, [ax, ay], [bx, by]) {
  if (Math.abs(cross(ax, ay, bx, by, px, py)) > 1e-6 * Math.hypot(bx - ax, by - ay)) return false
  return (
    px >= Math.min(ax, bx) &&
    px <= Math.max(ax, bx) &&
    py >= Math.min(ay, by) &&
    py <= Math.max(ay, by)
  )
}

/** On an edge of the polygon. */
export function onBoundary(polygon, x, y) {
  return polygon.some((p, i) => onSegment(x, y, p, polygon[(i + 1) % polygon.length]))
}

/** Inside the polygon or on its boundary (legacy's ray casting leaves the boundary to chance). */
export function containsPoint(polygon, x, y) {
  if (onBoundary(polygon, x, y)) return true
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Segments cross at a point inside both; touching or collinear segments do not. */
function segmentsCross(a, b, c, d) {
  const d1 = cross(c[0], c[1], d[0], d[1], a[0], a[1])
  const d2 = cross(c[0], c[1], d[0], d[1], b[0], b[1])
  const d3 = cross(a[0], a[1], b[0], b[1], c[0], c[1])
  const d4 = cross(a[0], a[1], b[0], b[1], d[0], d[1])
  return d1 * d2 < 0 && d3 * d4 < 0
}

/** Segments share any point. */
function segmentsTouch(a, b, c, d) {
  if (segmentsCross(a, b, c, d)) return true
  return (
    onSegment(a[0], a[1], c, d) ||
    onSegment(b[0], b[1], c, d) ||
    onSegment(c[0], c[1], a, b) ||
    onSegment(d[0], d[1], a, b)
  )
}

/**
 * Whether `inner` lies within `outer`, touching allowed. Corners alone are not enough in a
 * concave room: a rack across an L's inner corner has all four inside.
 *
 * @param {Point[]} inner - convex, such as a footprint
 * @param {Point[]} outer
 */
export function polygonWithin(inner, outer) {
  if (outer.length < 3) return true
  if (!inner.every(([x, y]) => containsPoint(outer, x, y))) return false
  const innerHasInside = (x, y) => containsPoint(inner, x, y) && !onBoundary(inner, x, y)
  if (outer.some(([x, y]) => innerHasInside(x, y))) return false
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i]
    const b = inner[(i + 1) % inner.length]
    for (let j = 0; j < outer.length; j++) {
      if (segmentsCross(a, b, outer[j], outer[(j + 1) % outer.length])) return false
    }
  }
  return true
}

function project(polygon, nx, ny) {
  let min = Infinity
  let max = -Infinity
  for (const [x, y] of polygon) {
    const d = x * nx + y * ny
    if (d < min) min = d
    if (d > max) max = d
  }
  return [min, max]
}

function hasSeparatingAxis(a, b) {
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length
    const nx = a[j][1] - a[i][1]
    const ny = a[i][0] - a[j][0]
    const pa = project(a, nx, ny)
    const pb = project(b, nx, ny)
    if (pa[1] <= pb[0] || pb[1] <= pa[0]) return true
  }
  return false
}

/** Legacy FloorPlanGeometry.overlaps: convex polygons, separating axes; touching is no overlap. */
export function polygonsOverlap(a, b) {
  return !hasSeparatingAxis(a, b) && !hasSeparatingAxis(b, a)
}

/** Two edges that are not neighbours meet: the server stores such an outline as it comes. */
export function selfIntersects(polygon) {
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      const a = polygon[i]
      const b = polygon[(i + 1) % n]
      const c = polygon[j]
      const d = polygon[(j + 1) % n]
      if (segmentsTouch(a, b, c, d)) return true
    }
  }
  return false
}

/** A point turned clockwise (Y down) by `degrees` around `centre`. */
export function rotatePoint([x, y], [cx, cy], degrees) {
  const a = (degrees * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
}

/** @typedef {{ x: number, y: number, rotation: number, width: number, depth: number }} Placed */

/** @param {Placed} item */
export const itemFootprint = (item) =>
  footprint(item.x, item.y, item.width, item.depth, item.rotation)

/** Centre of the bounding box of the items' footprints. */
export function itemsCentre(items) {
  const b = bounds(items.flatMap(itemFootprint))
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
}

/**
 * Items turned together around `centre`: reference corners turn with it, rotations add up.
 *
 * @param {Placed[]} items
 * @returns {Array<{ x: number, y: number, rotation: number }>}
 */
export function rotateItems(items, degrees, centre) {
  return items.map((item) => {
    const [x, y] = rotatePoint([item.x, item.y], centre, degrees)
    return {
      x: Math.round(x) || 0,
      y: Math.round(y) || 0,
      rotation: normalizeRotation(item.rotation + degrees),
    }
  })
}

/**
 * Resize handles, named by compass with the width axis pointing east and the depth axis south:
 * `nw` is the reference corner. Clockwise, each 45 degrees on from the one before.
 */
export const RESIZE_HANDLES = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']

/** Smallest side a handle drag leaves, in millimetres. */
export const MIN_RESIZE_SIDE = 50

const RIGHT_ANGLE_AXES = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] }

/** Unit vectors of an item's width and depth axes in room space; exact at right angles. */
function itemAxes(rotation) {
  const right = RIGHT_ANGLE_AXES[normalizeRotation(rotation)]
  if (right) return { u: right, v: [-right[1], right[0]], right: true }
  const a = (rotation * Math.PI) / 180
  const u = [Math.cos(a), Math.sin(a)]
  return { u, v: [-u[1], u[0]], right: false }
}

/**
 * Where a resize handle sits: a corner or the middle of a side, drawn `spread` further out.
 *
 * @param {Placed} item
 * @param {string} handle - one of RESIZE_HANDLES
 * @param {{ along: number, across: number }} [spread] - beyond the width and depth sides, in mm
 * @returns {Point}
 */
export function resizeHandlePoint(item, handle, spread = { along: 0, across: 0 }) {
  const { u, v } = itemAxes(item.rotation)
  const side = (low, high) => (handle.includes(low) ? -1 : handle.includes(high) ? 1 : 0)
  const su = side('w', 'e')
  const sv = side('n', 's')
  const along = ((su + 1) / 2) * item.width + su * spread.along
  const across = ((sv + 1) / 2) * item.depth + sv * spread.across
  return [item.x + u[0] * along + v[0] * across, item.y + u[1] * along + v[1] * across]
}

/**
 * How far out to draw the handles of an item smaller than `minSide` (mm) either way, so that
 * the frame they make is `minSide` across, centred on the item, and no two of them overlap.
 *
 * @param {{ width: number, depth: number }} item
 * @param {number} minSide
 * @returns {{ along: number, across: number }}
 */
export function resizeHandleSpread(item, minSide) {
  return {
    along: Math.max(0, (minSide - item.width) / 2),
    across: Math.max(0, (minSide - item.depth) / 2),
  }
}

/**
 * An item's place and size with `handle` dragged to `point`. Sides change along the item's own
 * axes and the opposite edge or corner stays put, so a handle on a reference side moves `x` and
 * `y`. No side goes below `min`, which wins over the grid. With a grid, at a right angle, the
 * dragged edges land on grid lines; otherwise on whole millimetres.
 *
 * @param {Placed} item
 * @param {string} handle - one of RESIZE_HANDLES
 * @param {Point} point
 * @param {{ grid?: { tile: number, originX: number, originY: number } | null,
 *   min?: number }} [options]
 * @returns {{ x: number, y: number, width: number, depth: number }}
 */
export function resizeItem(item, handle, point, { grid = null, min = MIN_RESIZE_SIDE } = {}) {
  const { u, v, right } = itemAxes(item.rotation)
  const dx = point[0] - item.x
  const dy = point[1] - item.y
  const snapped = right && grid?.tile > 0

  /** The dragged edge's distance from the reference corner along `axis`. */
  function edgeAlong(axis) {
    const distance = dx * axis[0] + dy * axis[1]
    if (!snapped) return distance
    // At a right angle the axis is a room axis, and the edge has one coordinate on it.
    return axis[0]
      ? (snap(item.x + axis[0] * distance, grid.originX, grid.tile) - item.x) * axis[0]
      : (snap(item.y + axis[1] * distance, grid.originY, grid.tile) - item.y) * axis[1]
  }

  /** New length of a side, and how far its reference edge moved along the axis. */
  function side(length, axis, near, far) {
    if (far) return { length: Math.max(min, Math.round(edgeAlong(axis))), shift: 0 }
    if (!near) return { length, shift: 0 }
    const next = Math.max(min, Math.round(length - edgeAlong(axis)))
    return { length: next, shift: length - next }
  }

  const width = side(item.width, u, handle.includes('w'), handle.includes('e'))
  const depth = side(item.depth, v, handle.includes('n'), handle.includes('s'))
  return {
    x: Math.round(item.x + u[0] * width.shift + v[0] * depth.shift) || 0,
    y: Math.round(item.y + u[1] * width.shift + v[1] * depth.shift) || 0,
    width: width.length,
    depth: depth.length,
  }
}

const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize']

/** CSS cursor along a handle's drag direction on an item turned by `rotation`. */
export function resizeCursor(handle, rotation) {
  const steps = RESIZE_HANDLES.indexOf(handle) + Math.round(rotation / 45)
  return RESIZE_CURSORS[((steps % 4) + 4) % 4]
}

/**
 * `text` in at most `max` characters, an ellipsis in the middle and the larger half kept from
 * the end: names in a row tend to share a prefix and differ at the end (Rack-A01, Rack-A02).
 */
export function shortenMiddle(text, max) {
  if (text.length <= max) return text
  const keep = Math.max(0, max - 1)
  const tail = Math.ceil(keep / 2)
  return text.slice(0, keep - tail) + '\u2026' + text.slice(text.length - tail)
}

const FACING_ROTATION = { S: 0, W: 90, N: 180, E: 270 }

/**
 * Racks side by side, fronts on one line facing `side`, the row's centre on `centre`; the order
 * runs along +X (or +Y for a row facing east or west), as the demo rows are numbered. Deeper
 * racks reach further back.
 *
 * @param {Array<{ width: number, depth: number }>} racks
 * @param {'S'|'W'|'N'|'E'} side
 * @param {number} gap - millimetres between neighbours
 * @param {Point} centre
 * @returns {Array<{ x: number, y: number, rotation: number }>} in the order of `racks`
 */
export function rowPlacements(racks, side, gap, centre) {
  if (!racks.length) return []
  // At 180 and 270 degrees the local +X runs backwards.
  const reversed = side === 'N' || side === 'E'
  const ordered = reversed ? [...racks].reverse() : racks
  const maxDepth = Math.max(...ordered.map((r) => r.depth))
  let offset = 0
  const local = ordered.map((rack) => {
    const item = { ...rack, x: offset, y: maxDepth - rack.depth, rotation: 0 }
    offset += rack.width + gap
    return item
  })
  const [cx, cy] = itemsCentre(local)
  const turned = rotateItems(local, FACING_ROTATION[side] ?? 0, [cx, cy]).map((p) => ({
    ...p,
    x: Math.round(p.x + centre[0] - cx),
    y: Math.round(p.y + centre[1] - cy),
  }))
  return reversed ? turned.reverse() : turned
}

/**
 * Legacy placement warnings: anything outside the outline, any two items that overlap.
 *
 * @param {Point[]} outline
 * @param {Array<{ key: string, corners: Point[] }>} items
 * @returns {Array<{ kind: 'outside'|'overlap', keys: string[] }>}
 */
export function placementWarnings(outline, items) {
  const warnings = []
  for (let i = 0; i < items.length; i++) {
    if (!polygonWithin(items[i].corners, outline)) {
      warnings.push({ kind: 'outside', keys: [items[i].key] })
    }
    for (let j = i + 1; j < items.length; j++) {
      if (polygonsOverlap(items[i].corners, items[j].corners)) {
        warnings.push({ kind: 'overlap', keys: [items[i].key, items[j].key] })
      }
    }
  }
  return warnings
}

/**
 * Index of the polygon edge nearest a point, as the edge's first corner, when it lies within
 * `maxDistance`; otherwise -1 (legacy getOutlineEdgeAt).
 *
 * @param {Point[]} polygon
 */
export function nearestEdge(polygon, x, y, maxDistance) {
  let best = -1
  let bestDistance = maxDistance
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i]
    const [bx, by] = polygon[(i + 1) % polygon.length]
    const dx = bx - ax
    const dy = by - ay
    const length2 = dx * dx + dy * dy
    const t = length2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2)) : 0
    const distance = Math.hypot(ax + t * dx - x, ay + t * dy - y)
    if (distance <= bestDistance) {
      best = i
      bestDistance = distance
    }
  }
  return best
}
