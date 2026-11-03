import { computed } from 'vue'
import { useDashboardContext } from '@/composables/useDashboardContext'
import { useWidgetActive } from '@/composables/useWidgetActive'
import { useDciCurrentValues } from '@/queries/useObjectQueries'
import { isTemplateDci, resolveTemplateDcis } from '@/utils/templateDci'

/**
 * A chart's DCI list with its template entries expanded for the dashboard's context object.
 *
 * @param {import('vue').Ref<object>} cfg - widget config (dciList)
 */
export function useRuntimeDciList(cfg) {
  const configured = computed(() => cfg.value.dciList ?? [])
  const hasTemplates = computed(() => configured.value.some(isTemplateDci))
  const { contextObjectId } = useDashboardContext()
  const active = useWidgetActive()

  const { data, isLoading, error } = useDciCurrentValues(contextObjectId, {
    enabled: computed(() => active.value && hasTemplates.value && !!contextObjectId.value),
  })

  const resolution = computed(() => {
    if (!hasTemplates.value) return { list: configured.value, error: null }
    const contextDcis = contextObjectId.value ? (data.value?.values ?? null) : null
    try {
      return {
        list: resolveTemplateDcis(configured.value, contextDcis, contextObjectId.value),
        error: null,
      }
    } catch (e) {
      // Legacy reports the pattern error for the whole chart; the concrete entries still render.
      return {
        list: configured.value.filter((d) => !isTemplateDci(d)),
        error: new SyntaxError(`Error in DCI matching regular expression: ${e.message}`),
      }
    }
  })

  return {
    dciList: computed(() => resolution.value.list),
    isResolving: computed(() => hasTemplates.value && !!contextObjectId.value && isLoading.value),
    resolveError: computed(
      () => resolution.value.error ?? (hasTemplates.value ? error.value : null) ?? null,
    ),
  }
}
