/**
 * A path is the chain of object ids from the top of the tree, joined with '-': the same object
 * can appear in more than one branch.
 *
 * @param {Array<object>} nodes - tree as displayed (sorted + filtered)
 * @param {string} path - e.g. '12-104-975'
 * @returns {object|null}
 */
export function findNodeByPath(nodes, path) {
  let siblings = nodes
  let node = null

  for (const id of String(path).split('-').map(Number)) {
    node = siblings?.find((sibling) => sibling.id === id) ?? null
    if (!node) return null
    siblings = node.children
  }

  return node
}

/**
 * One entry per level from the top down to the target: the sibling array and the index into it.
 * @param {Array<object>} nodes
 * @param {number} targetId
 * @returns {Array<{ nodes: Array<object>, index: number }> | null}
 */
function locate(nodes, targetId) {
  const index = nodes.findIndex((node) => node.id === targetId)
  if (index !== -1) return [{ nodes, index }]

  for (const [i, node] of nodes.entries()) {
    if (!node.children?.length) continue
    const deeper = locate(node.children, targetId)
    if (deeper) return [{ nodes, index: i }, ...deeper]
  }
  return null
}

function nodeAt(level) {
  return level.nodes[level.index]
}

function firstSurvivor(nodes, deletedIds) {
  return nodes.find((node) => !deletedIds.has(node.id)) ?? null
}

/**
 * Selection moves sideways (next surviving sibling, else previous), and up to the parent only
 * when the level empties; parents being deleted too are skipped. `nodes` must be the tree as
 * displayed, so "next" is the row the user sees.
 *
 * @param {Array<object>} nodes - root row excluded
 * @param {number} targetId
 * @param {Set<number>} deletedIds - every id in this delete
 * @returns {{ node: object | null, path: Array<object> } | null}
 *   `null` when the target is not in this tree; `node: null` when nothing survives (fall back to
 *   the perspective root). `path` runs from the top down to the successor.
 */
export function findDeletionSuccessor(nodes, targetId, deletedIds) {
  const chain = locate(nodes, targetId)
  if (!chain) return null

  for (let depth = chain.length - 1; depth >= 0; depth--) {
    const { nodes: siblings, index } = chain[depth]
    const ancestors = chain.slice(0, depth).map(nodeAt)

    const survivor =
      firstSurvivor(siblings.slice(index + 1), deletedIds) ??
      firstSurvivor(siblings.slice(0, index).reverse(), deletedIds)
    if (survivor) return { node: survivor, path: [...ancestors, survivor] }

    const parent = ancestors.at(-1) ?? null
    if (parent && !deletedIds.has(parent.id)) return { node: parent, path: ancestors }
  }

  return { node: null, path: [] }
}
