/**
 * An empty order is the catalog's. A column the saved order does not know is placed after the
 * column that precedes it in the catalog.
 *
 * @template {{ id: string }} T
 * @param {T[]} catalog - every column, in default order
 * @param {string[]} order - saved column ids, in the user's order
 * @returns {T[]} the catalog in the user's order
 */
export function orderColumns(catalog, order) {
  if (!order?.length) return catalog
  const byId = new Map(catalog.map((col) => [col.id, col]))
  const result = [...new Set(order)].filter((id) => byId.has(id)).map((id) => byId.get(id))
  catalog.forEach((col, i) => {
    if (result.includes(col)) return
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const k = result.indexOf(catalog[j])
      if (k !== -1) {
        at = k + 1
        break
      }
    }
    result.splice(at, 0, col)
  })
  return result
}

/**
 * @param {{ id: string }[]} catalog
 * @param {string[]} order
 * @returns {boolean} whether `order` puts the columns in their default order
 */
export function isDefaultOrder(catalog, order) {
  return orderColumns(catalog, order).every((col, i) => col === catalog[i])
}

/**
 * @param {string[]} ids
 * @param {string} id
 * @param {string} targetId
 * @param {boolean} after
 * @returns {string[]} a new list, or `ids` itself when either id is missing
 */
export function moveColumnId(ids, id, targetId, after) {
  if (id === targetId || !ids.includes(id) || !ids.includes(targetId)) return ids
  const rest = ids.filter((x) => x !== id)
  const at = rest.indexOf(targetId) + (after ? 1 : 0)
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}
