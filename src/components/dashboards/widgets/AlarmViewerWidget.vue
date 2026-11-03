<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AlarmTable from '@/components/alarms/AlarmTable.vue'
import { useAlarms } from '@/queries/useAlarmQueries'
import { alarmTarget } from '@/utils/routeTargets'
import { useEffectiveObjectId } from '@/composables/useDashboardContext'

const props = defineProps({
  widget: { type: Object, required: true },
})

const router = useRouter()

function openDetails(row) {
  router.push(alarmTarget(row.id))
}

// The context sentinel resolves to the object the dashboard is shown for, or 0 (all alarms).
const rootObjectId = useEffectiveObjectId(() => props.widget.config?.objectId)

// The server scopes by `rootObject`; any other parameter is ignored and lists every alarm.
const queryParams = computed(() => (rootObjectId.value ? { rootObject: rootObjectId.value } : {}))

const { data: alarmsData, isLoading, isFetching, isError, error, refetch } = useAlarms(queryParams)

const alarms = computed(() => {
  let list = alarmsData.value ?? []
  const cfg = props.widget.config ?? {}
  if (cfg.severities?.length) {
    list = list.filter((a) => cfg.severities.includes(a.severity))
  }
  if (cfg.alarmStates?.length) {
    list = list.filter((a) => cfg.alarmStates.includes(a.state))
  }
  return list
})
</script>

<template>
  <AlarmTable
    :alarms="alarms"
    :is-loading="isLoading"
    :is-fetching="isFetching"
    :is-error="isError"
    :error="error"
    :storage-key="`widget:${widget.id}`"
    @retry="refetch"
    @refresh="refetch"
    @open-details="openDetails"
  />
</template>
