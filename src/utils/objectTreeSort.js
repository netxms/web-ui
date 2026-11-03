// The WebAPI returns sub-trees in server order; sidebars show them as the legacy client did:
// grouping objects first, then the rest, each sorted by name.

// Zone and Cluster hold children but read as objects, so they are not here.
export const GROUPING_CLASSES = new Set([
  'Container',
  'Collector',
  'Subnet',
  'TemplateGroup',
  'DashboardGroup',
  'NetworkMapGroup',
  'BusinessServiceGroup',
  'AssetGroup',
])

export function sortTreeLevel(nodes) {
  return [...nodes].sort((a, b) => {
    const aGroup = GROUPING_CLASSES.has(a.class)
    const bGroup = GROUPING_CLASSES.has(b.class)
    if (aGroup !== bGroup) return aGroup ? -1 : 1
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}

/** Nodes are copied only where children change, so unchanged sub-trees keep their identity. */
export function sortObjectTree(nodes) {
  return sortTreeLevel(nodes ?? []).map((node) =>
    node.children?.length ? { ...node, children: sortObjectTree(node.children) } : node,
  )
}

/**
 * A matching node with no matching descendants keeps its full child list.
 *
 * @param {Array<object>} nodes
 * @param {string} text
 * @returns {Array<object>}
 */
export function filterObjectTree(nodes, text) {
  const lower = (text ?? '').trim().toLowerCase()
  if (!lower) return sortObjectTree(nodes)

  const walk = (list) => {
    const kept = (list ?? []).reduce((acc, node) => {
      const match = (node.name ?? '').toLowerCase().includes(lower)
      const filteredChildren = node.children ? walk(node.children) : []
      if (match || filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: filteredChildren.length
            ? filteredChildren
            : node.children && sortObjectTree(node.children),
        })
      }
      return acc
    }, [])
    return sortTreeLevel(kept)
  }

  return walk(nodes)
}
