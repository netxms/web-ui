// The server's `TableData` document, a serialized NetXMS `Table`.

/**
 * An empty cell stays empty, so a bare unit is never rendered.
 *
 * @param {string} value
 * @param {string} [unitName]
 * @returns {string}
 */
function formatCell(value, unitName) {
  if (value === '' || value == null) return ''
  return unitName ? `${value} ${unitName}` : String(value)
}

/**
 * Cells are keyed positionally (`c0`, `c1`, ...): device-named columns (an SNMP column can be
 * `id`) could clobber AppTable's row key. Column identity stays the column name.
 *
 * @param {object | null | undefined} tableData
 * @returns {{ columns: object[], rows: object[] }}
 */
export function tableDataToGrid(tableData) {
  const cols = tableData?.columns ?? []

  const columns = cols.map((col, i) => ({
    id: col.name,
    field: `c${i}`,
    label: col.displayName || col.name,
    sortable: true,
    unitName: col.unitName || '',
    instanceColumn: col.instanceColumn === true,
  }))

  const rows = (tableData?.data ?? []).map((row, i) => {
    // Extended-format tables name each row's object; a table DCI's rows have only their position.
    const flat = { id: row.objectId ?? i, objectId: row.objectId ?? null }
    let status = null
    cols.forEach((col, ci) => {
      const cell = row.values?.[ci]
      flat[`c${ci}`] = formatCell(cell?.value ?? '', col.unitName)
      // The server omits default cell status.
      if (cell?.status != null) (status ??= {})[`c${ci}`] = cell.status
    })
    if (status) flat._status = status
    return flat
  })

  return { columns, rows }
}

/**
 * Case-insensitive, matching `Table::getColumnIndex`.
 *
 * @param {object | null | undefined} tableData
 * @param {string | null | undefined} name
 * @returns {number}
 */
export function findColumnIndex(tableData, name) {
  if (!name) return -1
  const cols = tableData?.columns ?? []
  return cols.findIndex((c) => (c.name ?? '').toLowerCase() === name.toLowerCase())
}

/**
 * As legacy TableComparisonChartElement.updateChart: rows with no instance are skipped, and a
 * non-numeric value counts as zero.
 *
 * @param {object | null | undefined} tableData
 * @param {string} instanceColumn
 * @param {string} dataColumn
 * @returns {{ instance: string, value: number }[]}
 */
export function columnValues(tableData, instanceColumn, dataColumn) {
  const instanceIndex = findColumnIndex(tableData, instanceColumn)
  const dataIndex = findColumnIndex(tableData, dataColumn)
  if (instanceIndex < 0 || dataIndex < 0) return []

  const out = []
  for (const row of tableData?.data ?? []) {
    const instance = row.values?.[instanceIndex]?.value
    if (!instance) continue
    const value = Number.parseFloat(row.values?.[dataIndex]?.value)
    out.push({ instance, value: Number.isNaN(value) ? 0 : value })
  }
  return out
}
