import { computed, ref } from 'vue'
import { useElementSize } from '@/composables/useElementSize'
import { resolveLegendLayout, isSidePlacement } from '@/utils/chartLegendLayout'

/**
 * Legend wiring for the comparison-chart widgets. Measures the outer widget box, never the plot:
 * the plot shrinks when the legend appears, which would toggle the legend every frame.
 *
 * @param {import('vue').Ref<object>} cfg - widget config (showLegend, extendedLegend,
 *   legendPosition, showPercentInLegend)
 * @param {import('vue').Ref<Array>} items - ({ name, value, color? })
 * @param {object} theme - useChartTheme() instance
 */
export function useChartLegend(cfg, items, theme) {
  const rootRef = ref(null)
  const { width, height } = useElementSize(rootRef)

  const layout = computed(() =>
    resolveLegendLayout({
      width: width.value,
      height: height.value,
      showLegend: cfg.value.showLegend !== false,
      extendedLegend: cfg.value.extendedLegend === true,
      seriesCount: items.value.length,
      position: cfg.value.legendPosition,
    }),
  )

  const legendItems = computed(() =>
    items.value.map((item, i) => ({ ...item, color: item.color ?? theme.seriesColor(i) })),
  )

  return {
    rootRef,
    legendItems,
    showLegend: computed(() => layout.value.mode !== 'none'),
    legendExtended: computed(() => layout.value.mode === 'extended'),
    legendPlace: computed(() => layout.value.place),
    legendOnSide: computed(
      () => layout.value.mode !== 'none' && isSidePlacement(layout.value.place),
    ),
    showPercentInLegend: computed(() => cfg.value.showPercentInLegend !== false),
  }
}
