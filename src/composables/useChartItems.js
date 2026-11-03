import { computed, toValue } from 'vue'
import { useDciCurrentItems } from '@/composables/useDciCurrentItems'
import { useTableChartItems } from '@/composables/useTableChartItems'

export const TABLE_CHART_TYPES = new Set(['table-bar-chart', 'table-tube-chart', 'table-pie-chart'])

/**
 * Chart items for a comparison widget: a list of DCIs, or the rows of one table DCI. Both
 * sources are created; the unused one is gated on its own config and never issues a request.
 *
 * @param {import('vue').Ref<object>} cfg - widget config
 * @param {import('vue').MaybeRefOrGetter<string>} widgetType
 * @param {object} theme - useChartTheme() instance
 */
export function useChartItems(cfg, widgetType, theme) {
  const isTableChart = computed(() => TABLE_CHART_TYPES.has(toValue(widgetType)))

  const table = useTableChartItems(cfg, theme)
  const dci = useDciCurrentItems(cfg, theme)

  const source = computed(() => (isTableChart.value ? table : dci))

  return {
    isTableChart,
    items: computed(() => source.value.items.value),
    isLoading: computed(() => source.value.isLoading.value),
    hasError: computed(() => source.value.hasError.value),
    firstError: computed(() => source.value.firstError.value),
    isConfigured: computed(() =>
      isTableChart.value ? table.isConfigured.value : dci.dciList.value.length > 0,
    ),
    retryFailed: () => source.value.retryFailed(),
  }
}
