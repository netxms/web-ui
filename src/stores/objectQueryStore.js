import { ref, watch } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { userPrefs } from '@/utils/appStorage'

/**
 * The legacy client stores these on the server, shared across users; the WebAPI has no
 * equivalent, so they follow the account (`userPrefs`) and the UI calls them private.
 *
 * @typedef {object} SavedQuery
 * @property {string} id
 * @property {string} name
 * @property {string} script
 */
const SAVED_FIELD = 'objectQuery.saved'
const ADVANCED_FIELD = 'objectQuery.advanced'

function loadSaved() {
  const stored = userPrefs.get(SAVED_FIELD)
  return Array.isArray(stored) ? stored.filter((q) => q?.name && q?.script) : []
}

export const useObjectQueryStore = defineStore('objectQuery', () => {
  /** @type {import('vue').Ref<SavedQuery[]>} */
  const saved = ref(loadSaved())
  const advanced = ref(userPrefs.get(ADVANCED_FIELD) === true)

  watch(saved, (value) => userPrefs.set(SAVED_FIELD, value), { deep: true, flush: 'post' })
  watch(advanced, (value) => userPrefs.set(ADVANCED_FIELD, value), { flush: 'post' })

  watch(userPrefs.revision, () => {
    saved.value = loadSaved()
    advanced.value = userPrefs.get(ADVANCED_FIELD) === true
  })

  /**
   * Replaces a query with the same name, like the legacy dialog.
   *
   * @param {string} name
   * @param {string} script
   * @returns {SavedQuery}
   */
  function save(name, script) {
    const trimmed = name.trim()
    const existing = saved.value.find((query) => query.name === trimmed)
    if (existing) {
      existing.script = script
      return existing
    }
    const query = { id: `q${Date.now()}`, name: trimmed, script }
    saved.value = [...saved.value, query]
    return query
  }

  function remove(id) {
    saved.value = saved.value.filter((query) => query.id !== id)
  }

  function rename(id, name) {
    const query = saved.value.find((q) => q.id === id)
    if (query) query.name = name.trim()
  }

  function setAdvanced(value) {
    advanced.value = value
  }

  return { saved, advanced, save, remove, rename, setAdvanced }
})

// Without this, a hot reload leaves the existing store on its old shape.
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useObjectQueryStore, import.meta.hot))
}
