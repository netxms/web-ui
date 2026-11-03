/**
 * World Map object query: one `POST /v1/objects/query` instead of a request per object
 * (sub-tree summaries carry no geolocation).
 *
 * - `global`, not a bare assignment: the server reads requested fields from the script's
 *   globals, and a bare `lat = ...` is a discarded local, so every object would match with
 *   blank coordinates.
 * - The explicit `return`: once a statement precedes it, a bare trailing expression is a
 *   syntax error, and a trailing `;` returns NULL and matches nothing.
 * - `type != 0`, not `isValid`: `isValid()` is true for the default unset location too.
 */
export const WORLD_MAP_QUERY = `global lat = $object->geolocation->latitude;
global lon = $object->geolocation->longitude;
return $object->geolocation->type != 0;`

const WORLD_MAP_FIELDS = ['lat', 'lon']

/** Same ceiling as the object finder. */
export const WORLD_MAP_LIMIT = 5000

/** @returns {object} request body for objectsApi.queryObjects */
export function worldMapRequest() {
  return {
    query: WORLD_MAP_QUERY,
    fields: WORLD_MAP_FIELDS,
    limit: WORLD_MAP_LIMIT,
  }
}

/**
 * An unresolved query field comes back as '', and `Number('')` is 0 - a pin in the Gulf of
 * Guinea instead of a dropped object.
 *
 * @returns {number|null}
 */
function toCoordinate(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  if (text === '') return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

/**
 * Query fields arrive as strings; an object whose position does not parse is dropped.
 *
 * @param {Array<{object: object, fields: Record<string, string>}>} results
 */
export function toMapElements(results) {
  const elements = []
  for (const result of results ?? []) {
    const object = result?.object
    if (!object) continue
    const lat = toCoordinate(result.fields?.lat)
    const lon = toCoordinate(result.fields?.lon)
    if (lat === null || lon === null) continue
    elements.push({
      id: String(object.id),
      type: 'object',
      objectId: object.id,
      objectName: object.name,
      objectClass: object.class,
      objectStatus: object.status ?? 0,
      geolocation: { lat, lng: lon },
    })
  }
  return elements
}
