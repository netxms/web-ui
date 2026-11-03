import { computed, inject, provide, toValue } from 'vue'
import { resolveContextObjectId } from '@/utils/dashboardContext'

const DASHBOARD_CONTEXT_KEY = Symbol('dashboard-context')

/** What a widget sees outside any dashboard, or in a dashboard shown on its own. */
const NO_CONTEXT = Object.freeze({
  dashboardId: computed(() => null),
  contextObjectId: computed(() => null),
})

/**
 * @returns {{ dashboardId: import('vue').ComputedRef<number|null>,
 *   contextObjectId: import('vue').ComputedRef<number|null> }}
 */
export function useDashboardContext() {
  return inject(DASHBOARD_CONTEXT_KEY, NO_CONTEXT)
}

/**
 * @param {object} source
 * @param {import('vue').MaybeRefOrGetter<number|null>} source.dashboardId
 * @param {import('vue').MaybeRefOrGetter<number|null>} source.contextObjectId
 */
export function provideDashboardContext({ dashboardId, contextObjectId }) {
  const context = {
    dashboardId: computed(() => toValue(dashboardId) ?? null),
    contextObjectId: computed(() => Number(toValue(contextObjectId)) || null),
  }
  provide(DASHBOARD_CONTEXT_KEY, context)
  return context
}

/**
 * Resolves the context sentinel against the nearest dashboard.
 *
 * @param {import('vue').MaybeRefOrGetter<unknown>} objectId
 * @returns {import('vue').ComputedRef<number>}
 */
export function useEffectiveObjectId(objectId) {
  const { contextObjectId } = useDashboardContext()
  return computed(() => resolveContextObjectId(toValue(objectId), contextObjectId.value))
}
