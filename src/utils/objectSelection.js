/**
 * Picker predicates, as in the legacy ObjectSelectionFilterFactory. `ObjectPickerDialog` keeps
 * the ancestors of any matching node, so the display filter admits the selectable classes plus
 * the containers drilled through.
 */

export const DEFAULT_NAVIGABLE_CLASSES = [
  'Network',
  'Zone',
  'Subnet',
  'ServiceRoot',
  'Container',
  'Collector',
  'Cluster',
  'Rack',
  'Chassis',
]

/**
 * @param {string[]} classNames
 * @param {object} [options]
 * @param {string[]} [options.navigableClasses]
 * @returns {{ selectable: (node: object) => boolean, displayFilter: (node: object) => boolean }}
 */
export function createClassSelectionFilter(classNames, options = {}) {
  const selectableSet = new Set(classNames ?? [])
  const navigableSet = new Set([
    ...selectableSet,
    ...(options.navigableClasses ?? DEFAULT_NAVIGABLE_CLASSES),
  ])

  return {
    selectable: (node) => selectableSet.has(node?.class),
    displayFilter: (node) => navigableSet.has(node?.class),
  }
}

/** Picker tabs lead with the curated Infrastructure tree, then the flat Network one. */
const LEADING_ROOT_CLASSES = ['ServiceRoot', 'Network']

/**
 * Root objects in picker tab order: Infrastructure, Network, then the rest as given.
 *
 * @param {Array<{ class: string }>} roots
 * @returns {Array<{ class: string }>}
 */
export function orderPickerRoots(roots) {
  const rank = (root) => {
    const index = LEADING_ROOT_CLASSES.indexOf(root.class)
    return index === -1 ? LEADING_ROOT_CLASSES.length : index
  }
  return [...roots].sort((a, b) => rank(a) - rank(b))
}
