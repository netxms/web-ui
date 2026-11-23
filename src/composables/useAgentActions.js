import { ref, toValue } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useAgentCommand } from '@/queries/useNodeInventoryQueries'
import { notify } from '@/utils/notify'

/**
 * Agent actions on rows of a node's table (terminate a process, start a service, log off a
 * session): one command per target, in turn, as legacy runs them over its selection. The table
 * is read again afterwards whatever the outcome.
 *
 * @param {import('vue').MaybeRefOrGetter<number>} objectId - node id
 * @param {() => void} refetch
 */
export function useAgentActions(objectId, refetch) {
  const confirm = useConfirm()
  const { mutateAsync } = useAgentCommand()
  const running = ref(false)

  function confirmed(options) {
    return new Promise((resolve) => {
      confirm.require({
        icon: 'pi pi-exclamation-triangle',
        rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
        ...options,
        accept: () => resolve(true),
        reject: () => resolve(false),
        onHide: () => resolve(false),
      })
    })
  }

  /**
   * @param {object} action
   * @param {string[]} action.commands - from `agentCommandLine`
   * @param {string} action.success - toast summary when every command succeeded
   * @param {string} action.failure - toast summary when any failed
   * @param {object} [action.confirm] - ConfirmDialog options; asked first when given
   */
  async function run({ commands, success, failure, confirm: confirmOptions }) {
    if (!commands.length) return
    if (confirmOptions && !(await confirmed(confirmOptions))) return
    running.value = true
    const errors = []
    try {
      for (const command of commands) {
        try {
          await mutateAsync({ objectId: toValue(objectId), command })
        } catch (error) {
          errors.push(error)
        }
      }
    } finally {
      running.value = false
      refetch()
    }
    if (!errors.length) {
      notify({ summary: success })
      return
    }
    // A 403 on a write is already toasted by api/client.js.
    const error = errors.find((e) => e?.status !== 403)
    if (!error) return
    const reason = error.data?.agentErrorText || error.message
    notify({
      severity: 'error',
      summary: failure,
      detail:
        commands.length > 1 ? `${errors.length} of ${commands.length} failed: ${reason}` : reason,
      life: 5000,
    })
  }

  return { run, running }
}
