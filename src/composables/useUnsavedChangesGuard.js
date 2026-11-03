import { useConfirm } from 'primevue/useconfirm'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

/**
 * A leave guard only fires when the matched route record changes; a list/detail section lives
 * on one record, so `includeRouteUpdates` also guards path changes within it.
 *
 * @param {import('vue').ComputedRef<boolean>} isDirty
 * @param {object} [options]
 * @param {boolean} [options.includeRouteUpdates=false]
 */
export function useUnsavedChangesGuard(isDirty, { includeRouteUpdates = false } = {}) {
  const confirm = useConfirm()

  function guard() {
    if (!isDirty.value) return true
    return new Promise((resolve) => {
      confirm.require({
        header: 'Unsaved Changes',
        message: 'You have unsaved changes. Discard and leave?',
        icon: 'pi pi-exclamation-triangle',
        rejectLabel: 'Stay',
        acceptLabel: 'Discard & Leave',
        acceptSeverity: 'danger',
        accept: () => resolve(true),
        reject: () => resolve(false),
        // Escape / close icon fire neither accept nor reject.
        onHide: () => resolve(false),
      })
    })
  }

  onBeforeRouteLeave(guard)
  if (includeRouteUpdates) {
    onBeforeRouteUpdate((to, from) => (to.path === from.path ? true : guard()))
  }
}
