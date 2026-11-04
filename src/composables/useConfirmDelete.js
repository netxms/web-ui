import { onScopeDispose } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'

/**
 * Asks before deleting one item, runs the delete and reports the outcome in a toast.
 *
 * @returns {(options: {
 *   message: string,
 *   run: () => Promise<unknown>,
 *   successDetail: string,
 *   failureDetail: string,
 *   errorDetail?: (err: any) => string | null | undefined,
 * }) => Promise<boolean>} Resolves `true` only once the item is deleted and the caller is still
 *   mounted: by then the route may belong to another view, which a follow-up navigation would
 *   wrongly leave.
 */
export function useConfirmDelete() {
  const confirm = useConfirm()
  const toast = useToast()
  let active = true
  onScopeDispose(() => {
    active = false
  })

  return function confirmDelete({ message, run, successDetail, failureDetail, errorDetail }) {
    return new Promise((resolve) => {
      confirm.require({
        message,
        header: 'Confirm Delete',
        icon: 'pi pi-exclamation-triangle',
        rejectLabel: 'Cancel',
        acceptLabel: 'Delete',
        acceptClass: 'p-button-danger',
        accept: async () => {
          try {
            await run()
          } catch (err) {
            toast.add({
              severity: 'error',
              summary: 'Delete Failed',
              detail: errorDetail?.(err) || err?.message || failureDetail,
              life: 5000,
            })
            resolve(false)
            return
          }
          toast.add({ severity: 'success', summary: 'Deleted', detail: successDetail, life: 3000 })
          resolve(active)
        },
        reject: () => resolve(false),
        onHide: () => resolve(false),
      })
    })
  }
}
