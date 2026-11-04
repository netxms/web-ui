import { computed, ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useAlarmBulkAction } from '@/queries/useAlarmQueries'
import { useServerInfo } from '@/queries/useServerQueries'
import { alarmActionAvailability, alarmsAllowing, normalizeState } from '@/utils/alarmDisplay'
import { notify } from '@/utils/notify'

export const ALARM_ACTIONS = {
  acknowledge: {
    label: 'Acknowledge',
    doing: 'Acknowledging',
    done: 'Acknowledged',
    icon: 'pi pi-check',
  },
  resolve: {
    label: 'Resolve',
    doing: 'Resolving',
    done: 'Resolved',
    icon: 'pi pi-check-circle',
  },
  terminate: {
    label: 'Terminate',
    doing: 'Terminating',
    done: 'Terminated',
    icon: 'pi pi-trash',
    danger: true,
  },
}

function failureReason(error) {
  if (error?.status === 403) return 'You lack the access rights this needs on the source object.'
  if (error?.status === 404) return 'The alarm no longer exists.'
  return error?.message ?? 'Unknown error'
}

function report(action, total, failed) {
  const { label, done } = ALARM_ACTIONS[action]
  const verb = label.toLowerCase()
  if (failed.length) {
    notify({
      severity: 'error',
      summary:
        total === 1
          ? `Could not ${verb} the alarm`
          : `Could not ${verb} ${failed.length} of ${total} alarms`,
      detail: failureReason(failed[0].error),
      life: 6000,
    })
  } else if (total > 1) {
    notify({ severity: 'success', summary: `${done} ${total} alarms` })
  }
}

/**
 * Acknowledge, resolve and terminate on any number of alarms, each applied only to the alarms it
 * fits. The rules follow the server's settings; one alarm at a time reports only failures.
 *
 * @param {object} [options]
 * @param {(ids: number[]) => void} [options.onSucceeded] - the alarms that changed
 */
export function useAlarmActions({ onSucceeded } = {}) {
  const confirm = useConfirm()
  const { data: serverInfo } = useServerInfo()
  const { mutateAsync } = useAlarmBulkAction()

  const strictFlow = computed(() => serverInfo.value?.options?.strictAlarmStatusFlow === true)
  const timedAckEnabled = computed(() => serverInfo.value?.options?.timedAlarmAckEnabled === true)

  /** @type {import('vue').Ref<{ action: string, done: number, total: number }|null>} */
  const running = ref(null)
  const isRunning = computed(() => running.value != null)

  /** Null for one alarm: it is over too soon to read. */
  const progressText = computed(() => {
    if (!running.value || running.value.total < 2) return null
    const { action, done, total } = running.value
    return `${ALARM_ACTIONS[action].doing} ${done} of ${total}...`
  })

  function allowing(action, alarms) {
    return alarmsAllowing(action, alarms, { strictFlow: strictFlow.value })
  }

  /** What one alarm's own buttons offer. */
  function availabilityOf(alarm) {
    return alarmActionAvailability(normalizeState(alarm.state), { strictFlow: strictFlow.value })
  }

  async function execute(action, alarms) {
    if (isRunning.value) return
    running.value = { action, done: 0, total: alarms.length }
    try {
      const { succeeded, failed } = await mutateAsync({
        action,
        ids: alarms.map((alarm) => alarm.id),
        onProgress: (done) => {
          running.value = { action, done, total: alarms.length }
        },
      })
      report(action, alarms.length, failed)
      if (succeeded.length) onSucceeded?.(succeeded)
    } finally {
      running.value = null
    }
  }

  /**
   * @param {'acknowledge'|'resolve'|'terminate'} action
   * @param {object[]} alarms
   */
  function run(action, alarms) {
    const targets = allowing(action, alarms)
    if (!targets.length) return undefined

    // Terminating takes alarms off the list for good. One at a time stays a single click.
    if (action === 'terminate' && targets.length > 1) {
      confirm.require({
        header: 'Confirm Terminate',
        message: `Terminate ${targets.length} alarms? This cannot be undone.`,
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Terminate',
        rejectLabel: 'Cancel',
        acceptClass: 'p-button-danger',
        accept: () => execute(action, targets),
      })
      return undefined
    }
    return execute(action, targets)
  }

  return { allowing, availabilityOf, run, isRunning, progressText, timedAckEnabled }
}
