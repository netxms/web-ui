// Alarm state codes: 0 outstanding, 1 acknowledged, 2 resolved, 3 terminated.
const RESOLVED = 2

/**
 * Sources whose status the server recalculated between two alarm lists. Status follows the
 * unresolved alarms: one appearing, changing severity or source, being resolved, or being
 * terminated unresolved recalculates it; acknowledging does not.
 *
 * @param {Array<{id: number, source: number, severity: number, state: number}>} previous
 * @param {Array<{id: number, source: number, severity: number, state: number}>} current
 * @returns {Set<number>}
 */
export function statusAffectingSources(previous, current) {
  const before = new Map(previous.map((alarm) => [alarm.id, alarm]))
  const sources = new Set()
  const add = (alarm) => {
    if (alarm.state !== RESOLVED && alarm.source) sources.add(alarm.source)
  }

  for (const alarm of current) {
    const old = before.get(alarm.id)
    before.delete(alarm.id)
    if (!old) {
      add(alarm)
    } else if (old.source !== alarm.source) {
      add(old)
      add(alarm)
    } else if ((old.state === RESOLVED) !== (alarm.state === RESOLVED)) {
      if (alarm.source) sources.add(alarm.source)
    } else if (old.severity !== alarm.severity) {
      add(alarm)
    }
  }
  for (const gone of before.values()) add(gone)
  return sources
}

/**
 * Adds to `into` every object on a path from the root to one of `ids` in a cached
 * `GET /v1/objects/{rootId}/sub-tree` answer. That answer lists the root's children, not the
 * root, and an object with several parents appears under each of them.
 *
 * @param {Array<object>} nodes
 * @param {number} rootId
 * @param {Set<number>} ids
 * @param {Set<number>} [into]
 * @returns {Set<number>} `into`
 */
export function collectAncestorIds(nodes, rootId, ids, into = new Set()) {
  const path = [Number(rootId)]
  const visit = (list) => {
    for (const node of list) {
      if (ids.has(node.id)) for (const id of path) into.add(id)
      if (Array.isArray(node.children) && node.children.length > 0) {
        path.push(node.id)
        visit(node.children)
        path.pop()
      }
    }
  }
  if (Array.isArray(nodes)) visit(nodes)
  return into
}

/**
 * Ids of the objects in cached object data: one document, a list, or a tree nested through
 * `children`.
 *
 * @param {unknown} data
 * @param {Set<number>} [into]
 * @returns {Set<number>} `into`
 */
export function collectObjectIds(data, into = new Set()) {
  if (Array.isArray(data)) {
    for (const item of data) collectObjectIds(item, into)
  } else if (data && typeof data === 'object') {
    if (data.id != null) into.add(Number(data.id))
    if (Array.isArray(data.children)) collectObjectIds(data.children, into)
  }
  return into
}

/**
 * `data` with the `status` of each object named in `statusById` replaced, through arrays and
 * `children`. Unchanged parts keep their identity, and nothing changed returns `data` itself.
 *
 * @template T
 * @param {T} data - one document, a list, or a tree nested through `children`
 * @param {Map<number, number>} statusById
 * @returns {T}
 */
export function patchStatuses(data, statusById) {
  if (Array.isArray(data)) {
    let changed = false
    const next = data.map((item) => {
      const patched = patchStatuses(item, statusById)
      if (patched !== item) changed = true
      return patched
    })
    return changed ? next : data
  }
  if (!data || typeof data !== 'object') return data

  const children = Array.isArray(data.children)
    ? patchStatuses(data.children, statusById)
    : data.children
  const id = Number(data.id)
  const status = 'status' in data && statusById.has(id) ? statusById.get(id) : data.status
  if (children === data.children && status === data.status) return data

  const next = { ...data }
  if (status !== data.status) next.status = status
  if (children !== data.children) next.children = children
  return next
}
