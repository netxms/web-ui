import { computed } from 'vue'
import { isDemoDashboardId } from '@/api/demoDashboardStorage'
import { useDciValues } from '@/queries/useObjectQueries'
import { useDciValueMapping } from '@/queries/useMappingTableQueries'
import { useDashboardContext } from '@/composables/useDashboardContext'
import { useWidgetActive } from '@/composables/useWidgetActive'
import { useRuntimeDciList } from '@/composables/useRuntimeDciList'
import { formatDciValue } from '@/utils/dciFormat'
import { dciValueItem } from '@/utils/dciValues'

/**
 * Current value of each DCI in a widget's dciList, as chart items. Reads with the dashboard as
 * delegate, as the legacy client does.
 *
 * @param {import('vue').Ref<object>} cfg - widget config (dciList, refreshRate)
 * @param {object} theme - useChartTheme() instance
 */
export function useDciCurrentItems(cfg, theme) {
  const { dciList, isResolving, resolveError } = useRuntimeDciList(cfg)
  const { dashboardId } = useDashboardContext()
  // Always true outside a dashboard.
  const active = useWidgetActive()

  const items = computed(() => dciList.value.map(dciValueItem))
  const values = useDciValues(items, {
    // A demo dashboard is not on the server.
    delegate: computed(() => (isDemoDashboardId(dashboardId.value) ? 0 : dashboardId.value)),
    enabled: active,
    refetchInterval: computed(() => (cfg.value.refreshRate ?? 30) * 1000),
    priority: 'background',
  })

  const isLoading = computed(() => isResolving.value || values.isLoading.value)
  const hasError = computed(() => !!resolveError.value || values.isError.value)
  const firstError = computed(() => resolveError.value ?? values.error.value ?? null)

  function retryFailed() {
    if (values.isError.value) values.refetch()
  }

  const matches = computed(() => items.value.map((item) => values.valueOf(item)))

  const { mappedValue } = useDciValueMapping(() => matches.value.filter(Boolean))

  function displayValueOf(match, displayFormat) {
    if (!match || match.noValue || match.value === '' || match.value == null) return null
    return mappedValue(match) ?? formatDciValue(match, displayFormat)
  }

  const chartItems = computed(() =>
    dciList.value.map((dci, i) => {
      const match = matches.value[i]
      return {
        name: dci.name || match?.description || `DCI ${dci.dciId}`,
        value: match ? Number(match.value) || 0 : 0,
        color: dci.color ?? theme.seriesColor(i),
        unitName: match?.unitName ?? '',
        mappedValue: mappedValue(match),
        displayValue: displayValueOf(match, dci.displayFormat),
      }
    }),
  )

  return { items: chartItems, dciList, isLoading, hasError, firstError, retryFailed }
}
