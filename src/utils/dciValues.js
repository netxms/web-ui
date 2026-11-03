/** DCO_TYPE_TABLE in include/nxcldefs.h. */
const DCO_TYPE_TABLE = 2

/**
 * The cell part is JSON so that a column or instance holding ':' (a "C:" disk instance)
 * cannot collide.
 *
 * @param {{ objectId: number, dciId: number, column?: string, instance?: string }} item
 * @returns {string}
 */
export function dciValueKey(item) {
  const base = `${item.objectId}:${item.dciId}`
  return item.column && item.instance
    ? `${base}:${JSON.stringify([item.column, item.instance])}`
    : base
}

/**
 * A table source without both column and instance gets the table's value summary.
 *
 * @param {object} source - MapDataSource or ChartDciConfig
 *   (`{ nodeId, dciId, type, column, instance }`)
 * @returns {{ objectId: number, dciId: number, column?: string, instance?: string } | null}
 *   null when the source names no object or DCI
 */
export function dciValueItem(source) {
  const objectId = Number(source?.nodeId)
  const dciId = Number(source?.dciId)
  if (!(objectId > 0) || !(dciId > 0)) return null
  return source.type === DCO_TYPE_TABLE && source.column && source.instance
    ? { objectId, dciId, column: source.column, instance: source.instance }
    : { objectId, dciId }
}

/**
 * @param {object} source
 * @returns {string | null}
 */
export function dciSourceKey(source) {
  const item = dciValueItem(source)
  return item ? dciValueKey(item) : null
}
