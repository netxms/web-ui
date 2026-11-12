// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  lon2tile,
  lat2tile,
  tile2lon,
  tile2lat,
  offsetLatLon,
  tilesForRect,
  buildTileUrl,
  TILE_SIZE,
} from '@/utils/osmTiles'

describe('lon2tile', () => {
  it('maps the prime meridian to the middle of the world at any zoom', () => {
    expect(lon2tile(0, 0)).toBe(0.5)
    expect(lon2tile(0, 2)).toBe(2)
  })

  it('maps the world edges to 0 and 2^zoom', () => {
    expect(lon2tile(-180, 1)).toBe(0)
    expect(lon2tile(180, 1)).toBe(2)
  })
})

describe('lat2tile', () => {
  it('maps the equator to the middle of the world', () => {
    expect(lat2tile(0, 0)).toBeCloseTo(0.5, 10)
    expect(lat2tile(0, 3)).toBeCloseTo(4, 10)
  })

  it('clamps latitudes beyond the Web Mercator range instead of returning NaN', () => {
    const atLimit = lat2tile(85.05112878, 1)
    expect(Number.isFinite(atLimit)).toBe(true)
    // Beyond the limit clamps to the same value as the limit.
    expect(lat2tile(89, 1)).toBeCloseTo(atLimit, 10)
    expect(lat2tile(90, 1)).toBeCloseTo(atLimit, 10)
  })
})

describe('tile2lon / tile2lat', () => {
  it('inverts lon2tile / lat2tile within the Mercator range', () => {
    for (const lon of [-179, -90, 0, 45.5, 179]) {
      expect(tile2lon(lon2tile(lon, 5), 5)).toBeCloseTo(lon, 6)
    }
    for (const lat of [-80, -33.3, 0, 51.5, 84]) {
      expect(tile2lat(lat2tile(lat, 5), 5)).toBeCloseTo(lat, 6)
    }
  })

  it('maps the world edges back to their coordinates', () => {
    expect(tile2lon(0, 1)).toBe(-180)
    expect(tile2lon(2, 1)).toBe(180)
    expect(tile2lat(0, 0)).toBeCloseTo(85.05112878, 6)
  })
})

describe('offsetLatLon', () => {
  it('returns the same center for a zero drag', () => {
    const { lat, lon } = offsetLatLon(43, 42, 14, 0, 0)
    expect(lat).toBeCloseTo(43, 6)
    expect(lon).toBeCloseTo(42, 6)
  })

  it('dragging the map right (+dx) reveals area to the west (lower longitude)', () => {
    const { lon } = offsetLatLon(0, 0, 4, 256, 0)
    // One tile (256px) west at zoom 4 = 360 / 2^4 = 22.5 degrees.
    expect(lon).toBeCloseTo(-22.5, 6)
  })

  it('dragging the map down (+dy) reveals area to the north (higher latitude)', () => {
    const before = 0
    const { lat } = offsetLatLon(before, 0, 4, 0, 256)
    expect(lat).toBeGreaterThan(before)
  })

  it('wraps longitude across the antimeridian instead of running off the scale', () => {
    const { lon } = offsetLatLon(0, 170, 2, -256, 0)
    // +256px east at zoom 2 = 90 degrees; 170 + 90 = 260 -> wraps to -100.
    expect(lon).toBeCloseTo(-100, 6)
  })

  it('clamps latitude to the Web Mercator range near the poles', () => {
    const { lat } = offsetLatLon(84, 0, 3, 0, -100000)
    expect(lat).toBeLessThanOrEqual(85.05112878)
    expect(Number.isFinite(lat)).toBe(true)
  })
})

describe('tilesForRect', () => {
  it('returns nothing for a non-positive page', () => {
    expect(tilesForRect(0, 0, 3, 0, 500)).toEqual([])
    expect(tilesForRect(0, 0, 3, 500, 0)).toEqual([])
  })

  it('covers a small centered rectangle with a single tile offset to keep 0,0 inside', () => {
    // zoom 0: whole world is one 256x256 tile; center (0,0) sits at world px (128,128).
    // A 100x100 page centered there spans world px [78,178]; one tile (0,0) at px -78.
    const tiles = tilesForRect(0, 0, 0, 100, 100)
    expect(tiles).toHaveLength(1)
    expect(tiles[0]).toMatchObject({ x: 0, y: 0 })
    expect(tiles[0].px).toBeCloseTo(-78, 6)
    expect(tiles[0].py).toBeCloseTo(-78, 6)
  })

  it('wraps column indices around the antimeridian but keeps positions continuous', () => {
    // zoom 1 (n=2), center at the antimeridian: lon 180 -> world px x = 512 (== 2 tiles).
    // A 300px-wide page spans x world px [362, 662] -> tiles tx 1 and 2; tx 2 wraps to 0.
    const tiles = tilesForRect(0, 180, 1, 300, 100)
    const xs = tiles.map((t) => t.x)
    // tx 2 wraps to column 0; tx 1 stays 1.
    expect(new Set(xs)).toEqual(new Set([1, 0]))
    // The wrapped tile keeps a position 256 units to the right of the previous one.
    const wrapped = tiles.find((t) => t.x === 0)
    const prev = tiles.find((t) => t.x === 1)
    expect(wrapped.px - prev.px).toBeCloseTo(TILE_SIZE, 6)
  })

  it('floors fractional zoom to an integer level', () => {
    expect(tilesForRect(0, 0, 2.9, 100, 100)).toEqual(tilesForRect(0, 0, 2, 100, 100))
  })
})

describe('buildTileUrl', () => {
  it('fills z/x/y and spreads the subdomain placeholder', () => {
    const tpl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    expect(buildTileUrl(tpl, 1, 2, 3)).toBe('https://a.tile.openstreetmap.org/3/1/2.png')
    expect(buildTileUrl(tpl, 2, 2, 3)).toBe('https://b.tile.openstreetmap.org/3/2/2.png')
  })

  it('works with a template that has no subdomain placeholder', () => {
    const tpl = 'https://tiles.example.com/{z}/{x}/{y}.png'
    expect(buildTileUrl(tpl, 5, 6, 7)).toBe('https://tiles.example.com/7/5/6.png')
  })
})
