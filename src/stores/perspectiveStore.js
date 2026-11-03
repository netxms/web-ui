import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from '@/stores/authStore'

export const usePerspectiveStore = defineStore('perspective', () => {
  const authStore = useAuthStore()
  const lastPathByRoot = ref({})

  function savePath(root, path) {
    lastPathByRoot.value[root] = path
  }

  function getLastPath(root) {
    return lastPathByRoot.value[root] ?? null
  }

  // The store outlives a sign-out, and remembered paths name objects the previous account could
  // read.
  watch(
    () => authStore.sessionGuid,
    () => {
      lastPathByRoot.value = {}
    },
  )

  return { lastPathByRoot, savePath, getLastPath }
})
