import { watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useCreateObject } from '@/queries/useObjectQueries'

/**
 * Shared plumbing for object-creation dialogs: form reset on open and the toasts.
 *
 * @param {object} options
 * @param {() => boolean} options.visible
 * @param {() => void} options.resetForm
 * @param {(event: 'update:visible', value: boolean) => void} options.emit
 * @param {(err: Error, toast: ReturnType<typeof useToast>) => void} [options.onError]
 *   replaces the default error toast
 */
export function useCreateObjectDialog({ visible, resetForm, emit, onError }) {
  const toast = useToast()
  const { mutateAsync: createObjectAsync, isPending } = useCreateObject()

  watch(visible, (isVisible) => {
    if (isVisible) resetForm()
  })

  function onClose() {
    emit('update:visible', false)
  }

  async function submitCreate({
    payload,
    successMessage,
    errorMessage = 'Failed to create object',
  }) {
    try {
      const created = await createObjectAsync(payload)
      toast.add({ severity: 'success', summary: successMessage, life: 2500 })
      return created
    } catch (err) {
      if (onError) {
        onError(err, toast)
      } else {
        toast.add({ severity: 'error', summary: errorMessage, detail: err.message, life: 4000 })
      }
      return null
    }
  }

  return { isPending, onClose, submitCreate }
}
