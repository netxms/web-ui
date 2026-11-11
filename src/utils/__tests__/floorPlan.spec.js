import { describe, it, expect } from 'vitest'
import {
  bounds,
  columnLetters,
  containsPoint,
  deriveAisles,
  facing,
  footprint,
  frontBand,
  itemsCentre,
  nearestEdge,
  normalizeRotation,
  placementWarnings,
  polygonArea,
  polygonWithin,
  polygonsOverlap,
  rectangleOf,
  resizeRectangle,
  rotateItems,
  rowPlacements,
  selfIntersects,
  snap,
  snapDelta,
  snapOffset,
  tileAt,
  tileGrid,
} from '../floorPlan'

const room = {
  outline: [
    { x: 0, y: 0 },
    { x: 3000, y: 0 },
    { x: 3000, y: 1800 },
    { x: 0, y: 1800 },
  ],
  gridTileSize: 600,
  gridOriginX: 0,
  gridOriginY: 0,
  gridLabels: 'LETTERS_NUMBERS',
}

describe('footprint', () => {
  it('turns clockwise around the reference corner, Y pointing down', () => {
    expect(footprint(0, 0, 600, 1200, 0)).toEqual([
      [0, 0],
      [600, 0],
      [600, 1200],
      [0, 1200],
    ])
    expect(footprint(1000, 0, 600, 1200, 90)).toEqual([
      [1000, 0],
      [1000, 600],
      [-200, 600],
      [-200, 0],
    ])
  })

  it('puts the front band on the far edge', () => {
    // A rack at 180° faces north: its front is the smallest Y.
    const corners = footprint(600, 1200, 600, 1200, 180)
    expect(bounds(corners)).toEqual({ minX: 0, minY: 0, maxX: 600, maxY: 1200 })
    const band = bounds(frontBand(corners, 1200, 180))
    expect(band).toEqual({ minX: 0, minY: 0, maxX: 600, maxY: 180 })
  })

  it('names the side a right-angle rotation faces', () => {
    expect([0, 90, 180, 270, -90, 45].map(facing)).toEqual(['S', 'W', 'N', 'E', 'E', null])
  })
})

describe('tile grid', () => {
  it('labels columns with letters past Z as legacy does', () => {
    expect([0, 25, 26, 27, 701].map(columnLetters)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ'])
  })

  it('starts labels at the first tile touching the outline', () => {
    const grid = tileGrid({ ...room, gridOriginX: 300 })
    expect(grid.columns[0]).toEqual({ x: 0, label: 'A' })
    expect(grid.columns.map((c) => c.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    expect(grid.rows.map((r) => r.label)).toEqual(['1', '2', '3'])
  })

  it('draws lines but no labels when labels are off', () => {
    const grid = tileGrid({ ...room, gridLabels: 'NONE' })
    expect(grid.xs).toHaveLength(6)
    expect(grid.columns).toEqual([])
  })

  it('has no grid without a tile size', () => {
    expect(tileGrid({ ...room, gridTileSize: 0 }).xs).toEqual([])
  })

  it('names the tile under a point in either label scheme', () => {
    expect(tileAt(room, 1900, 700)).toBe('D2')
    expect(tileAt({ ...room, gridLabels: 'NUMBERS_NUMBERS' }, 1900, 700)).toBe('4-2')
    expect(tileAt({ ...room, gridLabels: 'NONE' }, 1900, 700)).toBe('')
  })
})

describe('deriveAisles', () => {
  const row = (count, x, y, rotation) =>
    Array.from({ length: count }, (_, i) => ({
      corners: footprint(x + (rotation === 180 ? 600 : 0) + i * 600, y, 600, 1200, rotation),
      rotation,
    }))

  it('finds a hot aisle between rows whose backs face each other', () => {
    // North-facing row over y 0-1200, south-facing row over y 2400-3600.
    const racks = [...row(3, 0, 1200, 180), ...row(3, 0, 2400, 0)]
    expect(deriveAisles(racks)).toEqual([{ kind: 'hot', x: 0, y: 1200, width: 1800, height: 1200 }])
  })

  it('finds a cold aisle between rows whose fronts face each other', () => {
    const racks = [...row(2, 0, 0, 0), ...row(2, 0, 3600, 180)]
    expect(deriveAisles(racks)).toEqual([
      { kind: 'cold', x: 0, y: 1200, width: 1200, height: 1200 },
    ])
  })

  it('ignores rows too far apart or not overlapping', () => {
    expect(deriveAisles([...row(2, 0, 1200, 180), ...row(2, 0, 6000, 0)])).toEqual([])
    expect(deriveAisles([...row(2, 0, 1200, 180), ...row(2, 3000, 2400, 0)])).toEqual([])
  })
})

// Hall A's L: 10.8 m wide at the top, 14.4 m below y 3000.
const hallA = [
  [0, 0],
  [10800, 0],
  [10800, 3000],
  [14400, 3000],
  [14400, 10800],
  [0, 10800],
]

describe('snapping', () => {
  it('rounds to the nearest grid line, or leaves the value without a grid', () => {
    expect(snap(1290, 0, 600)).toBe(1200)
    expect(snap(1310, 0, 600)).toBe(1200)
    expect(snap(1510, 300, 600)).toBe(1500)
    expect(snap(1290, 0, 0)).toBe(1290)
  })

  it('aligns whichever edge is nearer a grid line, as legacy snapDelta', () => {
    // A 1000 mm item from 1150: its left edge is 50 off, its right edge 50 past 2100.
    expect(snapDelta(1150, 2150, 0, 600)).toBe(50)
    // From 1250 the left edge is 50 past 1200, the right edge (2250) 150 short of 2400.
    expect(snapDelta(1250, 2250, 0, 600)).toBe(-50)
    // From 1650 the right edge (2350) is 50 short of 2400, the left 150 short of 1800.
    expect(snapDelta(1650, 2350, 0, 600)).toBe(50)
    expect(snapDelta(1250, 2250, 0, 0)).toBe(0)
  })

  it('snaps a rotated footprint by its bounding box on both axes', () => {
    // 600 x 1000 turned 90: the box runs x 0-1000 around a corner at 1030, y 20-620.
    const corners = footprint(1030, 20, 600, 1000, 90)
    expect(snapOffset(corners, { tile: 600, originX: 0, originY: 0 })).toEqual({ dx: -30, dy: -20 })
    expect(snapOffset(corners, null)).toEqual({ dx: 0, dy: 0 })
    expect(snapOffset(corners, { tile: 0, originX: 0, originY: 0 })).toEqual({ dx: 0, dy: 0 })
  })
})

describe('containment', () => {
  it('counts the boundary as inside', () => {
    expect(containsPoint(hallA, 3600, 10800)).toBe(true)
    expect(containsPoint(hallA, 0, 5000)).toBe(true)
    expect(containsPoint(hallA, 12000, 1000)).toBe(false)
    expect(containsPoint(hallA, 12000, 5000)).toBe(true)
  })

  it('keeps a unit against the wall inside the room', () => {
    // CRAH-1 of the demo: 2400 x 900 at the south wall, turned 180.
    expect(polygonWithin(footprint(3600, 10800, 2400, 900, 180), hallA)).toBe(true)
  })

  it('finds a rack that crosses the inner corner of the L', () => {
    const across = footprint(10500, 2700, 600, 600, 0)
    expect(across.every(([x, y]) => containsPoint(hallA, x, y))).toBe(false)
    // All four corners inside, yet the wall's corner pokes into it.
    const notch = [
      [0, 0],
      [6000, 0],
      [6000, 3000],
      [3000, 3000],
      [3000, 3600],
      [6000, 3600],
      [6000, 6000],
      [0, 6000],
    ]
    const bridge = footprint(2400, 2400, 1200, 1800, 0)
    expect(bridge.every(([x, y]) => containsPoint(notch, x, y))).toBe(true)
    expect(polygonWithin(bridge, notch)).toBe(false)
    expect(polygonWithin(footprint(4000, 2400, 600, 1200, 0), notch)).toBe(false)
    expect(polygonWithin(footprint(600, 600, 600, 1200, 0), notch)).toBe(true)
  })

  it('finds a rack outside the outline altogether', () => {
    expect(polygonWithin(footprint(12000, 600, 600, 1200, 0), hallA)).toBe(false)
    expect(polygonWithin(footprint(-300, 600, 600, 1200, 0), hallA)).toBe(false)
  })
})

describe('overlap', () => {
  it('lets neighbours touch but not overlap, as legacy', () => {
    const a = footprint(0, 0, 600, 1200, 0)
    expect(polygonsOverlap(a, footprint(600, 0, 600, 1200, 0))).toBe(false)
    expect(polygonsOverlap(a, footprint(599, 0, 600, 1200, 0))).toBe(true)
    expect(polygonsOverlap(a, footprint(0, 1200, 600, 1200, 0))).toBe(false)
  })

  it('checks turned footprints by their real shape', () => {
    const a = footprint(0, 0, 600, 1200, 0)
    // Turned 45 degrees around (1100, 0): its nearest corner stays right of x 600.
    expect(polygonsOverlap(a, footprint(1100, 0, 600, 600, 45))).toBe(false)
    expect(polygonsOverlap(a, footprint(700, 0, 600, 600, 45))).toBe(true)
  })

  it('reports items outside the outline and every overlapping pair', () => {
    const items = [
      { key: 'r:1', corners: footprint(600, 600, 600, 1200, 0) },
      { key: 'r:2', corners: footprint(900, 600, 600, 1200, 0) },
      { key: 'e:7', corners: footprint(12000, 600, 600, 600, 0) },
      { key: 'r:3', corners: footprint(1500, 600, 600, 1200, 0) },
    ]
    expect(placementWarnings(hallA, items)).toEqual([
      { kind: 'overlap', keys: ['r:1', 'r:2'] },
      { kind: 'outside', keys: ['e:7'] },
    ])
  })
})

describe('outline', () => {
  it('computes the area as the server does', () => {
    expect(polygonArea(hallA)).toBeCloseTo(144.72, 2)
    expect(polygonArea([...hallA].reverse())).toBeCloseTo(144.72, 2)
  })

  it('notices an outline that crosses itself', () => {
    expect(selfIntersects(hallA)).toBe(false)
    const bowTie = [
      [0, 0],
      [3000, 3000],
      [3000, 0],
      [0, 3000],
    ]
    expect(selfIntersects(bowTie)).toBe(true)
    // A corner pulled onto a wall that is not its own.
    const touching = [
      [0, 0],
      [3000, 0],
      [3000, 3000],
      [1500, 0],
      [0, 3000],
    ]
    expect(selfIntersects(touching)).toBe(true)
    expect(
      selfIntersects([
        [0, 0],
        [10, 0],
        [0, 10],
      ]),
    ).toBe(false)
  })
})

describe('rectangular outline', () => {
  it('recognises an axis-aligned rectangle in either direction, and nothing else', () => {
    expect(rectangleOf(room.outline)).toEqual({ x: 0, y: 0, width: 3000, depth: 1800 })
    expect(rectangleOf([...room.outline].reverse())).toEqual({
      x: 0,
      y: 0,
      width: 3000,
      depth: 1800,
    })
    const crossed = [room.outline[0], room.outline[2], room.outline[1], room.outline[3]]
    expect(rectangleOf(crossed)).toBe(null)
    expect(rectangleOf(room.outline.slice(0, 3))).toBe(null)
    expect(rectangleOf(hallA.map(([x, y]) => ({ x, y })))).toBe(null)
  })

  it('resizes from the top left corner and keeps the corner order', () => {
    const moved = room.outline.map((p) => ({ x: p.x + 600, y: p.y + 1200 }))
    expect(resizeRectangle(moved, 4800, 2400)).toEqual([
      { x: 600, y: 1200 },
      { x: 5400, y: 1200 },
      { x: 5400, y: 3600 },
      { x: 600, y: 3600 },
    ])
    expect(resizeRectangle(room.outline, 0, 2400)).toBe(null)
    expect(resizeRectangle(hallA.map(([x, y]) => ({ x, y })), 100, 100)).toBe(null)
  })
})

describe('nearestEdge', () => {
  it('finds the wall within reach of a point, numbered by its first corner', () => {
    expect(nearestEdge(hallA, 5000, 10790, 50)).toBe(4)
    expect(nearestEdge(hallA, 10830, 1500, 50)).toBe(1)
    expect(nearestEdge(hallA, 5000, 5000, 50)).toBe(-1)
    // Near the corner, but nearer the top wall than the next one.
    expect(nearestEdge(hallA, 10770, 10, 50)).toBe(0)
  })
})

describe('rotation', () => {
  it('normalizes to 0-359', () => {
    expect([0, 90, 360, 450, -90, -450].map(normalizeRotation)).toEqual([0, 90, 0, 90, 270, 270])
  })

  it('turns one rack around its own centre', () => {
    const rack = { x: 0, y: 0, width: 600, depth: 1200, rotation: 0 }
    const centre = itemsCentre([rack])
    expect(centre).toEqual([300, 600])
    const [turned] = rotateItems([rack], 90, centre)
    expect(turned).toEqual({ x: 900, y: 300, rotation: 90 })
    expect(bounds(footprint(turned.x, turned.y, 600, 1200, 90))).toEqual({
      minX: -300,
      minY: 300,
      maxX: 900,
      maxY: 900,
    })
    expect(itemsCentre([{ ...rack, ...turned }])).toEqual(centre)
  })

  it('turns a row as a row around the common centre', () => {
    const row = [0, 600, 1200].map((x) => ({ x, y: 0, width: 600, depth: 1200, rotation: 0 }))
    const centre = itemsCentre(row)
    const turned = rotateItems(row, 90, centre).map((p, i) => ({ ...row[i], ...p }))
    // Was 1800 wide and 1200 deep; now 1200 wide and 1800 tall around the same centre.
    expect(
      bounds(turned.flatMap((r) => footprint(r.x, r.y, r.width, r.depth, r.rotation))),
    ).toEqual({ minX: 300, minY: -300, maxX: 1500, maxY: 1500 })
    expect(turned.map((r) => r.rotation)).toEqual([90, 90, 90])
  })
})

describe('rowPlacements', () => {
  const racks = [
    { width: 600, depth: 1200 },
    { width: 600, depth: 1000 },
    { width: 800, depth: 1200 },
  ]

  it('lines racks up facing south with their fronts on one line', () => {
    const row = rowPlacements(racks, 'S', 0, [1000, 600])
    expect(row.map((p) => p.rotation)).toEqual([0, 0, 0])
    expect(row.map((p) => p.x)).toEqual([0, 600, 1200])
    const fronts = row.map((p, i) => p.y + racks[i].depth)
    expect(new Set(fronts).size).toBe(1)
    expect(row[1].y).toBe(200)
  })

  it('numbers along +X facing north, as row A of the demo', () => {
    const row = rowPlacements(racks.slice(0, 2), 'N', 0, [600, 600])
    expect(row.map((p) => p.rotation)).toEqual([180, 180])
    const boxes = row.map((p, i) =>
      bounds(footprint(p.x, p.y, racks[i].width, racks[i].depth, 180)),
    )
    expect(boxes[0].maxX).toBe(boxes[1].minX)
    // Fronts face north: the smallest Y lines up.
    expect(boxes[0].minY).toBe(boxes[1].minY)
  })

  it('runs along +Y facing east or west, with the gap between racks', () => {
    for (const side of ['E', 'W']) {
      const row = rowPlacements(racks.slice(0, 2), side, 100, [0, 0])
      const boxes = row.map((p, i) =>
        bounds(footprint(p.x, p.y, racks[i].width, racks[i].depth, p.rotation)),
      )
      expect(boxes[1].minY - boxes[0].maxY).toBe(100)
    }
    expect(rowPlacements([], 'S', 0, [0, 0])).toEqual([])
  })
})
