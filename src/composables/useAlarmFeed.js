import { ref, watch } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useAlarms } from '@/queries/useAlarmQueries'
import { useAlarmNotifications } from '@/composables/useAlarmNotifications'
import { normalizeSeverity, severityRank } from '@/utils/alarmDisplay'

// Toasts for alarms that appear between polls. Mounted once, from DefaultLayout.

/** Toast group; `AlarmToast` is the only outlet that renders it. */
export const ALARM_TOAST_GROUP = 'alarms'

/** Per poll, before the rest collapse into one summary: a link flap raises dozens at once. */
export const MAX_ALARM_TOASTS = 4

const TOAST_LIFE_MS = 6000
const SUMMARY_LIFE_MS = 8000

const MAX_DETAIL_LENGTH = 110

export function useAlarmFeed() {
  const toast = useToast()
  const { data } = useAlarms()
  const { shouldNotify } = useAlarmNotifications()
  const prevIds = ref(new Set())

  watch(data, (alarms) => {
    if (!alarms) return

    const currentIds = new Set(alarms.map((a) => a.id))

    if (prevIds.value.size > 0) {
      const newAlarms = alarms.filter((a) => !prevIds.value.has(a.id))
      // `prevIds` is updated even with notifications off, or switching them back on would
      // report every alarm since as new.
      notify(toast, newAlarms.filter(shouldNotify))
    }

    prevIds.value = currentIds
  })
}

/**
 * @param {{add: Function}} toast
 * @param {Array<object>} alarms - already filtered against the user's threshold
 */
function notify(toast, alarms) {
  if (alarms.length === 0) return

  // Loudest first, so the ones that survive the cap are the ones worth seeing.
  const ordered = [...alarms].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
  const shown = ordered.slice(0, MAX_ALARM_TOASTS)

  for (const alarm of shown) {
    toast.add({
      group: ALARM_TOAST_GROUP,
      // 'minor' and 'normal' are not PrimeVue severities; the card colours by `alarmSeverity`.
      severity: 'error',
      summary: alarm.sourceName ?? alarm.source ?? 'Unknown',
      detail: (alarm.message ?? '').slice(0, MAX_DETAIL_LENGTH),
      life: TOAST_LIFE_MS,
      alarmId: alarm.id,
      alarmSeverity: normalizeSeverity(alarm.severity),
    })
  }

  const overflow = ordered.length - shown.length
  if (overflow > 0) {
    toast.add({
      group: ALARM_TOAST_GROUP,
      severity: 'warn',
      summary: `+${overflow} more new alarm${overflow > 1 ? 's' : ''}`,
      life: SUMMARY_LIFE_MS,
      // No id: opens the alarm list.
      alarmSeverity: normalizeSeverity(ordered[shown.length].severity),
      isSummary: true,
    })
  }
}
