import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * @param {Object} [options]
 * @param {string} [options.paramName='entityId']
 * @param {string[]} [options.detailQueryKeys] - query keys that belong to the detail view and
 *   are dropped when it closes
 */
export function useEntityDetail(options = {}) {
  const { paramName = 'entityId', detailQueryKeys = [] } = options

  const route = useRoute()
  const router = useRouter()

  const entityId = computed(() => route.params[paramName] || null)
  const isDetailView = computed(() => entityId.value !== null)

  function detailTarget(id) {
    return {
      name: route.name,
      params: { ...route.params, [paramName]: id },
      query: route.query,
    }
  }

  function openDetail(id) {
    router.push(detailTarget(id))
  }

  function closeDetail() {
    const params = { ...route.params }
    delete params[paramName]
    const query = { ...route.query }
    for (const key of detailQueryKeys) delete query[key]
    router.push({
      name: route.name,
      params,
      query,
    })
  }

  return {
    entityId,
    isDetailView,
    detailTarget,
    openDetail,
    closeDetail,
  }
}
