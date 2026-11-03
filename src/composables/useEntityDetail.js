import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * @param {Object} [options]
 * @param {string} [options.paramName='entityId']
 */
export function useEntityDetail(options = {}) {
  const { paramName = 'entityId' } = options

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
    router.push({
      name: route.name,
      params,
      query: route.query,
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
