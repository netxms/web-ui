// The flat layouts and the toolbar's object count read the same list. A subtree reports an
// object once per parent it sits under.

/**
 * Parents before their children, each id once.
 *
 * @param {Array} tree - subtree nodes, each with optional `children`
 * @returns {Array}
 */
export function flattenUnique(tree) {
  const seen = new Set()
  const result = []
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      if (!seen.has(node.id)) {
        seen.add(node.id)
        result.push(node)
      }
      if (node.children?.length) visit(node.children)
    }
  }
  visit(tree)
  return result
}

/**
 * A sorted copy: `status` puts the highest status value first (then name).
 *
 * @param {Array} objects
 * @param {'status'|'name'} sortBy
 * @returns {Array}
 */
export function sortStatusMapObjects(objects, sortBy) {
  const byName = (a, b) => a.name.localeCompare(b.name)
  if (sortBy === 'status') {
    return [...objects].sort((a, b) => (b.status ?? 5) - (a.status ?? 5) || byName(a, b))
  }
  return [...objects].sort(byName)
}
