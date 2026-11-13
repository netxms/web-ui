// Slippy-map (OSM/XYZ) tile math for a static geographic backdrop behind a graph map, as legacy
// ExtendedGraphViewer.drawTiles does. No framework dependencies, so it tests in plain node.

/** In both tile pixels and map coordinate units. */
export const TILE_SIZE = 256

// Web Mercator is undefined at the poles; slippy maps clamp latitude here.
const MAX_MERCATOR_LAT = 85.05112878

/**
 * @param {number} lon degrees
 * @param {number} zoom integer zoom
 * @returns {number} fractional tile column
 */
export function lon2tile(lon, zoom) {
  return ((lon + 180) / 360) * Math.pow(2, zoom)
}

/**
 * @param {number} lat degrees (clamped to the Web Mercator range)
 * @param {number} zoom integer zoom
 * @returns {number} fractional tile row
 */
export function lat2tile(lat, zoom) {
  const clamped = Math.min(MAX_MERCATOR_LAT, Math.max(-MAX_MERCATOR_LAT, lat))
  const rad = (clamped * Math.PI) / 180
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
}

/**
 * @param {number} x fractional tile column
 * @param {number} zoom integer zoom
 * @returns {number} degrees
 */
export function tile2lon(x, zoom) {
  return (x / Math.pow(2, zoom)) * 360 - 180
}

/**
 * @param {number} y fractional tile row
 * @param {number} zoom integer zoom
 * @returns {number} degrees
 */
export function tile2lat(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom)
  // sinh(n) without Math.sinh for older engines: (e^n - e^-n) / 2.
  return (180 / Math.PI) * Math.atan((Math.exp(n) - Math.exp(-n)) / 2)
}

/**
 * Graph coordinates are 1:1 with world pixels at the backdrop's zoom, so a drag moves the centre
 * by that many pixels the opposite way. Latitude clamps so a drag past the poles cannot give NaN.
 *
 * @param {number} lat center latitude, degrees
 * @param {number} lon center longitude, degrees
 * @param {number} zoom integer zoom
 * @param {number} dxPx drag delta X, in graph units
 * @param {number} dyPx drag delta Y, in graph units
 * @returns {{ lat: number, lon: number }}
 */
export function offsetLatLon(lat, lon, zoom, dxPx, dyPx) {
  const z = Math.max(0, Math.floor(zoom || 0))
  const cx = lon2tile(lon, z) - dxPx / TILE_SIZE
  const cy = lat2tile(lat, z) - dyPx / TILE_SIZE
  const rawLon = tile2lon(cx, z)
  return {
    lat: Math.min(MAX_MERCATOR_LAT, Math.max(-MAX_MERCATOR_LAT, tile2lat(cy, z))),
    lon: ((((rawLon + 180) % 360) + 360) % 360) - 180,
  }
}

/**
 * Tiles covering the page rectangle `[0,0, width,height]` centred on a point: the wrapped tile
 * x/y (for the URL), the tile's top-left offset in the rectangle (`px`, `py`, map units), and a
 * `key` unique within the page. Rows outside the valid range are dropped; columns wrap around the
 * antimeridian, so a page wider than the world shows the same x more than once.
 *
 * @param {number} centerLat degrees
 * @param {number} centerLon degrees
 * @param {number} zoom integer zoom
 * @param {number} width map units
 * @param {number} height map units
 * @returns {{ x: number, y: number, px: number, py: number, key: string }[]}
 */
export function tilesForRect(centerLat, centerLon, zoom, width, height) {
  const z = Math.max(0, Math.floor(zoom || 0))
  const n = Math.pow(2, z)
  if (!(width > 0) || !(height > 0)) return []

  const centerPxX = lon2tile(centerLon, z) * TILE_SIZE
  const centerPxY = lat2tile(centerLat, z) * TILE_SIZE
  const originX = centerPxX - width / 2
  const originY = centerPxY - height / 2

  const minTileX = Math.floor(originX / TILE_SIZE)
  const maxTileX = Math.floor((originX + width) / TILE_SIZE)
  const minTileY = Math.floor(originY / TILE_SIZE)
  const maxTileY = Math.floor((originY + height) / TILE_SIZE)

  const tiles = []
  for (let ty = minTileY; ty <= maxTileY; ty++) {
    if (ty < 0 || ty >= n) continue
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      tiles.push({
        x: ((tx % n) + n) % n,
        y: ty,
        px: tx * TILE_SIZE - originX,
        py: ty * TILE_SIZE - originY,
        key: `${z}/${tx}/${ty}`,
      })
    }
  }
  return tiles
}

const TILE_SUBDOMAINS = ['a', 'b', 'c']

/**
 * `{s}` is spread across subdomains by tile position.
 * @param {string} template e.g. 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
 * @param {number} x tile column
 * @param {number} y tile row
 * @param {number} zoom integer zoom
 * @returns {string}
 */
export function buildTileUrl(template, x, y, zoom) {
  const sub = TILE_SUBDOMAINS[Math.abs(x + y) % TILE_SUBDOMAINS.length]
  return String(template)
    .replace('{s}', sub)
    .replace('{z}', String(Math.max(0, Math.floor(zoom || 0))))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
}
