import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useObjectTreeStore = defineStore('objectTree', () => {
  const expandedIds = ref(new Set())

  function expand(path) {
    expandedIds.value.add(path)
  }

  function collapse(path) {
    expandedIds.value.delete(path)
  }

  function toggle(path) {
    if (expandedIds.value.has(path)) {
      expandedIds.value.delete(path)
    } else {
      expandedIds.value.add(path)
    }
  }

  return { expandedIds, expand, collapse, toggle }
})
