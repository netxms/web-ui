/**
 * Network map layers (netxms 7.1): an element is on at most one named layer, kept in its raw
 * `layer` ('' for none). A layer exists while some element uses it. Which layers are hidden is
 * the viewer's choice and never saved on the map.
 */

/**
 * @param {{ raw?: { layer?: string } }} element - adapted map element
 * @returns {string} '' when on no layer
 */
export function elementLayer(element) {
  const layer = element?.raw?.layer
  return typeof layer === 'string' ? layer : ''
}

/**
 * @param {{ elements?: object[] } | null} map - adapted map
 * @returns {string[]} sorted, without ''
 */
export function mapLayers(map) {
  const names = new Set()
  for (const el of map?.elements ?? []) {
    const layer = elementLayer(el)
    if (layer) names.add(layer)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

/**
 * @param {{ elements?: object[] } | null} map - adapted map
 * @returns {{ counts: Map<string, number>, unlayered: number }}
 */
export function layerCounts(map) {
  const counts = new Map()
  let unlayered = 0
  for (const el of map?.elements ?? []) {
    const layer = elementLayer(el)
    if (layer) counts.set(layer, (counts.get(layer) ?? 0) + 1)
    else unlayered++
  }
  return { counts, unlayered }
}

/**
 * A server that stores layers sends the key on every element, '' included; an older one drops
 * it on save. An empty map cannot tell.
 *
 * @param {{ elements?: object[] } | null} map - adapted map as loaded from the server
 */
export function mapSupportsLayers(map) {
  return (map?.elements ?? []).some((el) => el.raw && typeof el.raw.layer === 'string')
}

/**
 * Drops elements on hidden layers and every link touching one. Returns `map` itself when
 * nothing is hidden, so a computed passing it on does not rebuild the canvas.
 *
 * @template {{ elements: object[], links: object[] }} M
 * @param {M | null} map - adapted map
 * @param {Set<string>} hidden - hidden layer names
 * @returns {M | null}
 */
export function withoutHiddenLayers(map, hidden) {
  if (!map || !hidden?.size) return map
  const hiddenIds = new Set()
  for (const el of map.elements) {
    if (hidden.has(elementLayer(el))) hiddenIds.add(el.id)
  }
  if (!hiddenIds.size) return map
  return {
    ...map,
    elements: map.elements.filter((el) => !hiddenIds.has(el.id)),
    links: map.links.filter((l) => !hiddenIds.has(l.from) && !hiddenIds.has(l.to)),
  }
}

/**
 * Legacy checks a layer when every selected element is on it.
 *
 * @param {object[]} elements - adapted map elements
 * @returns {string | null} the shared layer ('' for none), or null when they differ
 */
export function sharedLayer(elements) {
  if (!elements.length) return null
  const first = elementLayer(elements[0])
  return elements.every((el) => elementLayer(el) === first) ? first : null
}
