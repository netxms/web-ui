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
