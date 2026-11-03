import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useDashboardStore = defineStore('dashboard', () => {
  const selectedDashboardId = ref(null)

  const isEditMode = ref(false)

  /**
   * Unsaved widget layout items; null means display server data directly.
   * @type {import('vue').Ref<Array|null>}
   */
  const dirtyLayout = ref(null)

  function selectDashboard(id) {
    selectedDashboardId.value = id
    isEditMode.value = false
    dirtyLayout.value = null
  }

  function enterEditMode(currentWidgets) {
    isEditMode.value = true
    dirtyLayout.value = currentWidgets.map((w) => ({ ...w }))
  }

  function discardChanges() {
    isEditMode.value = false
    dirtyLayout.value = null
  }

  function updateLayout(widgets) {
    dirtyLayout.value = widgets
  }

  function commitSave() {
    isEditMode.value = false
    dirtyLayout.value = null
  }

  return {
    selectedDashboardId,
    isEditMode,
    dirtyLayout,
    selectDashboard,
    enterEditMode,
    discardChanges,
    updateLayout,
    commitSave,
  }
})
