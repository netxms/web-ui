import { computed } from 'vue'
import { useAlarms } from '@/queries/useAlarmQueries'
import { SEVERITY_ORDER, severityRank } from '@/utils/alarmDisplay'

const OUTSTANDING = { state: 0 }

/**
 * Alarms nobody has acknowledged yet, and the worst severity among them. Never fetches: a disabled
 * observer still follows the list `useAlarmFeed` polls, where an active one would run a timer and
 * send requests of its own. So only for components inside DefaultLayout, which mounts that feed.
 */
export function useAlarmAttention() {
  const { data } = useAlarms(OUTSTANDING, { enabled: false })

  const count = computed(() => data.value?.length ?? 0)

  const worstSeverity = computed(() => {
    if (!count.value) return null
    const worst = data.value.reduce(
      (rank, alarm) => Math.max(rank, severityRank(alarm.severity)),
      0,
    )
    return SEVERITY_ORDER[worst]
  })

  return { count, worstSeverity }
}
