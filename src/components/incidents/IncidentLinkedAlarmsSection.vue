<script setup>
import { formatDateTimeShort } from '@/utils/timeFormat'
import { computed } from 'vue'
import AlarmIconLabel from '@/components/alarms/AlarmIconLabel.vue'
import Skeleton from 'primevue/skeleton'
import AppTable from '@/components/common/AppTable.vue'
import { useAlarms } from '@/queries/useAlarmQueries'
import { alarmTarget } from '@/utils/routeTargets'

// The payload carries alarm ids only; rows are resolved against the cached alarm list rather
// than one request per id. Terminated alarms leave the list, which is what closing an incident
// does, so "no longer available" is expected for a closed incident.
const props = defineProps({
  alarmIds: { type: Array, default: () => [] },
  /** So the table's page and scroll are this incident's own. */
  incidentId: { type: Number, default: null },
})

const { data: alarmsData, isLoading } = useAlarms()

const alarmsById = computed(() => {
  const map = new Map()
  for (const alarm of alarmsData.value ?? []) map.set(alarm.id, alarm)
  return map
})

const rows = computed(() =>
  props.alarmIds.map((id) => {
    const alarm = alarmsById.value.get(id)
    return alarm ? { ...alarm, available: true } : { id, available: false }
  }),
)

const columns = [
  { id: 'severity', field: 'severity', label: 'Sev', width: 50 },
  { id: 'state', field: 'state', label: 'State', width: 140 },
  { id: 'source', field: 'sourceName', label: 'Source', width: 150 },
  { id: 'message', field: 'message', label: 'Message', width: 380 },
  { id: 'created', field: 'creationTime', label: 'Created', width: 140 },
]

function rowTarget(row) {
  return row.available ? alarmTarget(row.id) : null
}
</script>

<template>
  <div class="linked-alarms">
    <Skeleton v-if="isLoading" height="6rem" />

    <p v-else-if="rows.length === 0" class="linked-empty">No alarms linked to this incident</p>

    <AppTable
      v-else
      :columns="columns"
      :rows="rows"
      :target-for="rowTarget"
      :page-size="25"
      storage-key="incident-linked-alarms"
      :owner-id="incidentId"
      size="small"
      striped
      fit-columns
    >
      <template #empty>No alarms linked to this incident</template>

      <template #cell="{ col, row }">
        <template v-if="!row.available">
          <span v-if="col.id === 'severity'" class="text-muted">--</span>
          <span v-else-if="col.id === 'message'" class="text-muted">
            Alarm [{{ row.id }}] is no longer available
          </span>
          <span v-else class="text-muted">--</span>
        </template>
        <AlarmIconLabel
          v-else-if="col.id === 'severity' || col.id === 'state'"
          :type="col.id"
          :value="row[col.id]"
          :sticky="row.isSticky"
          collapsible
        />
        <template v-else-if="col.id === 'message'">
          <span class="alarm-message">{{ row.message }}</span>
        </template>
        <template v-else-if="col.id === 'created'">
          {{ formatDateTimeShort(row.creationTime) }}
        </template>
        <template v-else>{{ row[col.field] ?? '--' }}</template>
      </template>
    </AppTable>
  </div>
</template>

<style scoped>
.linked-alarms {
  min-width: 0;
}

.linked-empty {
  margin: 0;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.alarm-message {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-muted {
  color: var(--p-text-muted-color);
}
</style>
