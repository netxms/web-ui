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
 * A PASSWORD variable's `value` when a secret is set ("" when not). Sent back on PUT it keeps
 * the stored secret; any other value, "" included, replaces it.
 */
export const SECRET_PLACEHOLDER = '********'

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
 * modified, and so does a set secret with a non-empty default, since the server only reports
 * {@link SECRET_PLACEHOLDER}.
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
      return SECRET_PLACEHOLDER
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

/**
 * Choice options in numeric order when every value is an integer, as legacy sorts them; the
 * server answers in database order.
 *
 * @param {Array<{ value: string, description: string }>} possibleValues
 * @returns {Array<{ value: string, description: string }>}
 */
export function sortedPossibleValues(possibleValues) {
  const values = [...(possibleValues ?? [])]
  if (!values.every((v) => /^[+-]?\d+$/.test(v?.value ?? ''))) return values
  return values.sort((a, b) => Number.parseInt(a.value, 10) - Number.parseInt(b.value, 10))
}

export function currentValueForDisplay(variable) {
  return valueForDisplay(variable, variable?.value)
}

export function defaultValueForDisplay(variable) {
  return valueForDisplay(variable, variable?.defaultValue)
}
