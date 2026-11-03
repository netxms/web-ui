import { getCodedOptions, getColumnLabel, getPrimaryTimeColumn } from '@/utils/logColumnTypes'
import { isOmnibarColumn } from '@/utils/logQueryModel'

/**
 * Derived from the log schema; only columns `isOmnibarColumn` accepts. Keys are raw column names.
 *
 * @param {import('@/api/logsApi').LogColumn[]} columns
 * @returns {Array<import('@/components/common/SmartFilterInput.vue').FilterDef>}
 */
export function buildLogFilterDefs(columns) {
  const timeColumn = getPrimaryTimeColumn(columns)
  return (columns ?? [])
    .filter((column) => isOmnibarColumn(column, timeColumn?.name))
    .map((column) => {
      const options = getCodedOptions(column.type)
      const label = getColumnLabel(column)
      return options
        ? {
            key: column.name,
            label,
            description: `Filter by ${label.toLowerCase()}`,
            type: 'enum',
            options: options.map((o) => o.label),
          }
        : {
            key: column.name,
            label,
            description: `Text contained in ${label.toLowerCase()}`,
            type: 'text',
          }
    })
}
