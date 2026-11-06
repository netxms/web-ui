import { ref, computed, watch } from 'vue'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'

/**
 * Draft state, dirty tracking, save/cancel and the route leave guard.
 *
 * @param {import('vue').Ref<Object>} objectRef
 * @param {Object} [options]
 * @param {Function} [options.onSave] - async, receives the draft
 * @param {Function} [options.onCancel]
 */
export function usePropertyEditor(objectRef, options = {}) {
  const draft = ref({})
  const savedSnapshot = ref('')
  const isSaving = ref(false)
  const saveError = ref(null)

  function resetDraft() {
    const data = objectRef.value
    if (data) {
      draft.value = JSON.parse(JSON.stringify(data))
      savedSnapshot.value = JSON.stringify(data)
    } else {
      draft.value = {}
      savedSnapshot.value = '{}'
    }
    saveError.value = null
  }

  const isDirty = computed(() => {
    return JSON.stringify(draft.value) !== savedSnapshot.value
  })

  watch(
    objectRef,
    (newObj, oldObj) => {
      if (!newObj) return
      const idChanged = newObj.id !== oldObj?.id
      if (idChanged || !isDirty.value) resetDraft()
    },
    { immediate: true },
  )

  /** @returns {Promise<boolean>} false when the save failed or was cancelled */
  async function save() {
    if (!isDirty.value) return true
    isSaving.value = true
    saveError.value = null
    try {
      if (options.onSave) {
        await options.onSave(draft.value)
      }
      savedSnapshot.value = JSON.stringify(draft.value)
      return true
    } catch (err) {
      // A user-cancelled save (e.g. declining a confirmation) leaves the draft dirty, no error.
      if (!err?.cancelled) saveError.value = err.message
      return false
    } finally {
      isSaving.value = false
    }
  }

  function cancel() {
    resetDraft()
    if (options.onCancel) {
      options.onCancel()
    }
  }

  useUnsavedChangesGuard(isDirty)

  return {
    draft,
    isDirty,
    isSaving,
    saveError,
    save,
    cancel,
    resetDraft,
  }
}
