import { computed } from 'vue'
import { useServerInfo } from '@/queries/useServerQueries'

/**
 * Optional server subsystems, from `server-info.components`.
 *
 * Unlike permission gates, an unresolved answer counts as unavailable: offering a control the
 * server cannot honour is worse than showing it late (render a skeleton while `isLoading`).
 * A response without the field comes from a server too old to have any of these components.
 *
 * @example
 * const { has } = useServerComponents()
 * const aiAvailable = computed(() => has(SERVER_COMPONENTS.AI_ASSISTANT))
 */
export function useServerComponents() {
  const { data, isLoading } = useServerInfo()

  /** @type {import('vue').ComputedRef<string[]>} */
  const components = computed(() => {
    const list = data.value?.components
    return Array.isArray(list) ? list.filter((c) => typeof c === 'string') : []
  })

  /**
   * @param {string} id - a value from SERVER_COMPONENTS
   * @returns {boolean}
   */
  function has(id) {
    return components.value.includes(id)
  }

  return { components, isLoading, has }
}
