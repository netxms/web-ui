import { get, post, put, del } from './client'

/**
 * Convert a GeoJSON closed ring [lng, lat][] → API border [{latitude, longitude}][]
 * @param {number[][][]} coordinates - GeoJSON polygon coordinates (first ring used)
 */
function toBorderArray(coordinates) {
  const ring = coordinates[0] // first ring, closed (first === last)
  const open = ring.slice(0, -1) // drop repeated closing point
  return open.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))
}

/**
 * Convert API border [{latitude, longitude}][] → GeoJSON Feature
 * @param {string} name
 * @param {{ latitude: number, longitude: number }[]} border
 */
function toGeoJsonFeature(name, border) {
  const coords = border.map(({ latitude, longitude }) => [longitude, latitude])
  coords.push(coords[0]) // close the ring
  return {
    type: 'Feature',
    properties: { name },
    geometry: { type: 'Polygon', coordinates: [coords] },
  }
}

/**
 * Compute bounding box from an open lat/lng array.
 * @param {{ latitude: number, longitude: number }[]} border
 */
function computeBounds(border) {
  if (!border.length) return null
  const lats = border.map((p) => p.latitude)
  const lngs = border.map((p) => p.longitude)
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  }
}

/**
 * Normalize a raw API GeoArea object into the shape the components expect.
 * @param {{ id: number, name: string, comments?: string, border?: {latitude: number, longitude: number}[] }} raw
 */
function normalizeArea(raw) {
  const border = raw.border ?? []
  return {
    id: raw.id,
    name: raw.name,
    comments: raw.comments ?? '',
    geoJson: toGeoJsonFeature(raw.name, border),
    bounds: computeBounds(border),
  }
}

export function getAreas() {
  return get('/v1/geo-areas').then((list) => list.map(normalizeArea))
}

export function getArea(id) {
  return get(`/v1/geo-areas/${id}`).then(normalizeArea)
}

export function createArea({ name, comments, geoJson }) {
  const body = {
    name,
    comments: comments ?? '',
    border: toBorderArray(geoJson.geometry.coordinates),
  }
  return post('/v1/geo-areas', body).then(normalizeArea)
}

export function updateArea(id, { name, comments, geoJson }) {
  const body = {
    name,
    comments: comments ?? '',
    border: toBorderArray(geoJson.geometry.coordinates),
  }
  return put(`/v1/geo-areas/${id}`, body).then(normalizeArea)
}

export function deleteArea(id, force = false) {
  return del(`/v1/geo-areas/${id}${force ? '?force=true' : ''}`)
}
