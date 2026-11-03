import { computed, toValue } from 'vue'
import { useRouter } from 'vue-router'
import { getObject } from '@/api/objectsApi'
import { objectTarget } from '@/utils/routeTargets'
import { resolveHref, shouldOpenInNewTab } from '@/utils/navigation'

/**
 * Drill-down navigation for dashboard widgets (legacy drillDownObjectId).
 *
 * @param {import('vue').MaybeRefOrGetter<object>} config - widget config
 * @returns {{ hasDrillDown: import('vue').ComputedRef<boolean>, drillDown: (event?: MouseEvent) => Promise<void> }}
 */
export function useWidgetDrillDown(config) {
  const router = useRouter()

  const hasDrillDown = computed(() => !!toValue(config)?.drillDownObjectId)

  /**
   * @param {MouseEvent} [event]
   */
  async function drillDown(event) {
    const id = toValue(config)?.drillDownObjectId
    if (!id) return

    // Open the tab before the fetch: a popup blocker rejects a window.open() after an await.
    const newTab = shouldOpenInNewTab(event) ? window.open('', '_blank') : null

    try {
      const obj = await getObject(id)
      const target = objectTarget(obj)
      if (newTab) {
        newTab.opener = null
        newTab.location.href = resolveHref(target)
      } else {
        router.push(target)
      }
    } catch {
      newTab?.close()
    }
  }

  function onPointer(event) {
    if (event.type === 'auxclick' && event.button !== 1) return
    if (event.button === 1) event.preventDefault()
    drillDown(event)
  }

  const drillDownBindings = computed(() =>
    hasDrillDown.value
      ? {
          onClick: onPointer,
          onAuxclick: onPointer,
          onMousedown: (event) => {
            if (event.button === 1) event.preventDefault()
          },
        }
      : {},
  )

  return { hasDrillDown, drillDown, drillDownBindings }
}
