// `valueForDisplay` ports the legacy ServerVariable.getValueForDisplay(), so the table reads as
// in the legacy console.

/** In the order the type filter lists them. */
export const SERVER_CONFIG_DATA_TYPES = [
  'STRING',
  'BOOLEAN',
  'INTEGER',
  'CHOICE',
  'COLOR',
  'PASSWORD',
]

/** For a variable whose name has no dot-prefixed namespace. */
export const UNGROUPED_NAMESPACE = 'General'

/** `config.var_name` column size. */
export const MAX_VARIABLE_NAME_LENGTH = 63

/** MAX_CONFIG_VALUE_LENGTH on the server. */
export const MAX_VARIABLE_VALUE_LENGTH = 2000

/**
 * Everything before the first dot.
 *
 * @param {string} name
 * @returns {string}
 */
export function namespaceOf(name) {
  const text = String(name ?? '')
  const dot = text.indexOf('.')
  return dot > 0 ? text.slice(0, dot) : UNGROUPED_NAMESPACE
}

/**
 * Sorted by name, with {@link UNGROUPED_NAMESPACE} last: it is a catch-all, not a namespace.
 *
 * @param {Array<{ name: string }>} variables
 * @returns {Array<{ name: string, count: number }>}
 */
export function namespacesOf(variables) {
  const counts = new Map()
  for (const variable of variables ?? []) {
    const ns = namespaceOf(variable?.name)
    counts.set(ns, (counts.get(ns) ?? 0) + 1)
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (a.name === UNGROUPED_NAMESPACE) return 1
      if (b.name === UNGROUPED_NAMESPACE) return -1
      return a.name.localeCompare(b.name)
    })
}

/**
 * Matches `ServerVariable.isDefault()`; a variable created here has no default and reads as
 * modified.
 *
 * @param {{ value: string, defaultValue: string }} variable
 * @returns {boolean}
 */
export function isDefaultValue(variable) {
  return (variable?.value ?? '') === (variable?.defaultValue ?? '')
}

/**
 * @param {object} variable - supplies dataType, units and possibleValues
 * @param {string} value - `value` or `defaultValue`
 * @returns {string}
 */
export function valueForDisplay(variable, value) {
  if (value == null || value === '') return ''

  switch (variable?.dataType) {
    case 'PASSWORD':
      return '********'
    case 'BOOLEAN':
      return Number.parseInt(value, 10) ? 'true' : 'false'
    case 'CHOICE': {
      const match = (variable.possibleValues ?? []).find((v) => v.value === value)
      return match?.description || value
    }
    case 'INTEGER':
      return variable.units ? `${value} ${variable.units}` : value
    default:
      return value
  }
}

export function currentValueForDisplay(variable) {
  return valueForDisplay(variable, variable?.value)
}

export function defaultValueForDisplay(variable) {
  return valueForDisplay(variable, variable?.defaultValue)
}
