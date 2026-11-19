/**
 * Objects a map draws, for the search field's list. The geographical canvas draws only objects
 * with a geolocation.
 *
 * @param {{ elements?: object[] } | null} mapData - map data as the canvas gets it
 * @param {{ geo?: boolean }} [options]
 * @returns {Array<{ id: string, objectId: number | null, name: string, objectClass: string,
 *   objectStatus: number, objectCategory: number }>} sorted by name; `ObjectIcon` takes an entry
 */
export function mapObjectEntries(mapData, { geo = false } = {}) {
  const entries = []
  for (const element of mapData?.elements ?? []) {
    if (element.type !== 'object') continue
    if (geo && !element.geolocation) continue
    const objectId = element.objectId ?? null
    entries.push({
      id: element.id,
      objectId,
      name: element.objectName || `[${objectId}]`,
      objectClass: element.objectClass ?? 'Node',
      objectStatus: element.objectStatus ?? 5,
      objectCategory: element.objectCategory ?? 0,
    })
  }
  return entries.sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) ||
      String(a.id).localeCompare(String(b.id)),
  )
}

/**
 * The one rule for "this object matches the map search", shared by the canvas dimming and the
 * list so the two never disagree.
 *
 * @param {string | null | undefined} name
 * @param {string} term - non-blank
 * @returns {boolean}
 */
export function matchesMapSearch(name, term) {
  return (name ?? '').toLowerCase().includes(term.toLowerCase())
}

/**
 * @template {{ name: string }} T
 * @param {T[]} entries
 * @param {string | null | undefined} term
 * @returns {T[]} all entries for a blank term
 */
export function filterMapObjects(entries, term) {
  const trimmed = term?.trim()
  if (!trimmed) return entries
  return entries.filter((entry) => matchesMapSearch(entry.name, trimmed))
}
