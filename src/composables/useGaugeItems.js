import { computed, toValue } from 'vue'
import { useDciCurrentItems } from '@/composables/useDciCurrentItems'
import { useEffectiveObjectId } from '@/composables/useDashboardContext'
import { useWidgetActive } from '@/composables/useWidgetActive'
import { useScriptedChartData } from '@/queries/useObjectQueries'
import { normalizeScriptResult } from '@/utils/scriptedChartData'

/**
 * DCI gauge (13) or scripted gauge (33). Both sources are always created; the unused one
 * idles (no dciList, or `enabled` false).
 *
 * @param {import('vue').Ref<object>} cfg
 * @param {import('vue').MaybeRefOrGetter<string>} widgetType
 * @param {object} theme - useChartTheme()
 */
export function useGaugeItems(cfg, widgetType, theme) {
  const isScripted = computed(() => toValue(widgetType) === 'scripted-gauge')
  const dci = useDciCurrentItems(cfg, theme)
  const active = useWidgetActive()
  const script = useScriptedChartData(
    computed(() => cfg.value.dashboardId ?? 0),
    useEffectiveObjectId(() => cfg.value.objectId),
    computed(() => cfg.value.elementIndex ?? null),
    {
      enabled: computed(() => isScripted.value && active.value && !!cfg.value.script),
      refetchInterval: computed(() => (cfg.value.refreshRate ?? 30) * 1000),
    },
  )

  const scriptItems = computed(() =>
    normalizeScriptResult(script.data.value?.result).map((item, i) => ({
      name: item.name,
      value: item.value,
      color: item.color ?? theme.seriesColor(i),
      unitName: '',
    })),
  )

  return {
    isScripted,
    items: computed(() => (isScripted.value ? scriptItems.value : dci.items.value)),
    isLoading: computed(() => (isScripted.value ? script.isLoading.value : dci.isLoading.value)),
    hasError: computed(() => (isScripted.value ? script.isError.value : dci.hasError.value)),
    firstError: computed(() => (isScripted.value ? script.error.value : dci.firstError.value)),
    isConfigured: computed(() =>
      isScripted.value
        ? !!cfg.value.script && cfg.value.elementIndex != null
        : dci.dciList.value.length > 0,
    ),
    retryFailed: () => (isScripted.value ? script.refetch() : dci.retryFailed()),
  }
}
