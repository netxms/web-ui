import { computed } from 'vue'
import { useDciTableValue } from '@/queries/useObjectQueries'
import { useWidgetActive } from '@/composables/useWidgetActive'
import { tableDataToGrid, columnValues } from '@/utils/tableData'

/**
 * A table DCI as chart items, one per row, in the same item shape as `useDciCurrentItems`.
 * Mirrors the legacy `TableComparisonChartElement`, including its ordering rules.
 *
 * @param {import('vue').Ref<object>} cfg - widget config (nodeId, dciId, instanceColumn,
 *   dataColumn, ignoreZeroValues, sortOnDataColumn, sortDescending, refreshRate)
 * @param {object} theme - useChartTheme() instance
 */
export function useTableChartItems(cfg, theme) {
  const nodeId = computed(() => cfg.value.nodeId ?? null)
  const dciId = computed(() => cfg.value.dciId ?? null)
  const instanceColumn = computed(() => cfg.value.instanceColumn || '')
  const dataColumn = computed(() => cfg.value.dataColumn || '')

  const isConfigured = computed(
    () => !!nodeId.value && !!dciId.value && !!instanceColumn.value && !!dataColumn.value,
  )

  const active = useWidgetActive()

  const {
    data: tableValue,
    isLoading,
    isError,
    error,
    refetch,
  } = useDciTableValue(nodeId, dciId, {
    enabled: computed(() => active.value && isConfigured.value),
    refetchInterval: (cfg.value.refreshRate ?? 30) * 1000,
  })

  const unitName = computed(() => {
    const columns = tableDataToGrid(tableValue.value?.table).columns
    return (
      columns.find((c) => c.id?.toLowerCase() === dataColumn.value.toLowerCase())?.unitName ?? ''
    )
  })

  const items = computed(() => {
    if (!isConfigured.value) return []
    const pairs = columnValues(tableValue.value?.table, instanceColumn.value, dataColumn.value)

    // Sort first, so the series colours follow what is drawn.
    const ordered = cfg.value.sortOnDataColumn
      ? [...pairs].sort((a, b) =>
          cfg.value.sortDescending ? b.value - a.value : a.value - b.value,
        )
      : pairs

    return ordered
      .filter((p) => !(p.value === 0 && cfg.value.ignoreZeroValues))
      .map((p, i) => ({
        name: p.instance,
        value: p.value,
        color: theme.seriesColor(i),
        unitName: unitName.value,
      }))
  })

  return {
    items,
    isConfigured,
    isLoading,
    hasError: isError,
    firstError: error,
    retryFailed: refetch,
  }
}
