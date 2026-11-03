import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useSelectionStore = defineStore('selection', () => {
  // Sidebar tree: drives the action bar and object header.
  const primaryObject = ref(null)
  const primaryObjects = ref([])

  // Main content (table, map, ...): drives context menus only, not the action bar.
  const viewObject = ref(null)
  const viewObjects = ref([])
  const viewSource = ref(null)

  // A tree range selection does not change what is open, so it is not carried here; context
  // menus acting on a range pass `selection` explicitly.
  const primaryContext = computed(() => {
    if (!primaryObject.value) return null
    return {
      object: primaryObject.value,
      viewContext: 'objectTree',
    }
  })

  const viewContext = computed(() => {
    if (!viewObject.value) return null
    return {
      object: viewObject.value,
      viewContext: viewSource.value,
      selection: viewObjects.value.length > 1 ? viewObjects.value : undefined,
    }
  })

  function selectPrimary(object) {
    primaryObject.value = object
    primaryObjects.value = object ? [object] : []
    clearViewSelection()
  }

  function selectPrimaryMultiple(objects) {
    primaryObject.value = objects[0] || null
    primaryObjects.value = objects
    clearViewSelection()
  }

  /**
   * Shift+Arrow marks rows without navigating, so unlike `selectPrimaryMultiple` this keeps
   * the open object primary.
   *
   * @param {Array<object>} objects - rows now selected, in display order
   */
  function setPrimarySelection(objects) {
    primaryObjects.value = objects
    clearViewSelection()
  }

  function selectView(object, source) {
    viewObject.value = object
    viewObjects.value = object ? [object] : []
    viewSource.value = source
  }

  function selectViewMultiple(objects, source) {
    viewObject.value = objects[0] || null
    viewObjects.value = objects
    viewSource.value = source
  }

  function clearViewSelection() {
    viewObject.value = null
    viewObjects.value = []
    viewSource.value = null
  }

  function clearSelection() {
    primaryObject.value = null
    primaryObjects.value = []
    viewObject.value = null
    viewObjects.value = []
    viewSource.value = null
  }

  /** Named like the other session-scoped stores (`resetSessionState`). */
  function reset() {
    clearSelection()
  }

  return {
    primaryObject,
    primaryObjects,
    primaryContext,
    viewObject,
    viewObjects,
    viewSource,
    viewContext,
    selectPrimary,
    selectPrimaryMultiple,
    setPrimarySelection,
    selectView,
    selectViewMultiple,
    clearViewSelection,
    clearSelection,
    reset,
  }
})
