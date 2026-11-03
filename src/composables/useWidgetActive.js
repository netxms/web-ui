import { inject, provide, ref } from 'vue'

const WIDGET_ACTIVE_KEY = Symbol('widget-active')

const ALWAYS_ACTIVE = ref(true)

/**
 * Publish whether the widget under this subtree is visible enough to poll for.
 *
 * @param {import('vue').Ref<boolean>} active
 */
export function provideWidgetActive(active) {
  provide(WIDGET_ACTIVE_KEY, active)
}

/**
 * For a widget to AND into its query's `enabled`. Always active outside a dashboard.
 *
 * @returns {import('vue').Ref<boolean>}
 */
export function useWidgetActive() {
  return inject(WIDGET_ACTIVE_KEY, ALWAYS_ACTIVE)
}
