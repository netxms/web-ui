<script setup>
import { computed } from 'vue'
import Skeleton from 'primevue/skeleton'
import AppTable from '@/components/common/AppTable.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import { useAlarmEvents } from '@/queries/useAlarmQueries'
import { severityLabels, normalizeSeverity } from '@/utils/alarmDisplay'
import { formatDateTimeMedium } from '@/utils/timeFormat'

const props = defineProps({
  alarmId: { type: Number, required: true },
})

const { data: events, isLoading, isError, error, refetch } = useAlarmEvents(() => props.alarmId)

/** A 403 means the user lacks "view event log" rights; shown inline, not as a failure. */
const isAccessDenied = computed(() => error.value?.status === 403)

const columns = [
  { id: 'severity', field: 'severity', label: 'Severity', width: 120 },
  { id: 'source', field: 'sourceName', label: 'Source', width: 180 },
  { id: 'name', field: 'name', label: 'Name', width: 200 },
  { id: 'message', field: 'message', label: 'Message', width: 400 },
  { id: 'timestamp', field: 'timestamp', label: 'Timestamp', width: 170 },
]

// Flat list, newest first, each root event followed by its correlated events (parentId is the
// correlating event, 0 for a root); the depth keeps the tree readable.
const rows = computed(() => {
  const depthById = new Map()
  return (events.value ?? []).map((e) => {
    const parentId = e.parentId
    let depth = 0
    if (parentId != null && Number(parentId) !== 0) {
      const parentDepth = depthById.get(String(parentId))
      depth = parentDepth == null ? 1 : parentDepth + 1
    }
    depthById.set(String(e.id), depth)
    const sevKey = normalizeSeverity(e.severity)
    return {
      ...e,
      depth,
      // Unrecognized severities show as Normal, the same fallback as the alarm table.
      sevKey: sevKey in severityLabels ? sevKey : 'normal',
      sevLabel: sevKey,
    }
  })
})

function formatDate(value) {
  return formatDateTimeMedium(value, { timeStyle: 'medium' })
}
</script>

<template>
  <div class="related-events">
    <div v-if="isLoading" class="events-loading">
      <Skeleton height="2rem" />
      <Skeleton height="2rem" />
      <Skeleton height="2rem" />
    </div>

    <div v-else-if="isAccessDenied" class="events-access-denied">
      <i class="pi pi-lock" />
      <span>Cannot list related events - "view event log" access is required.</span>
    </div>

    <QueryErrorState
      v-else-if="isError"
      :error="error"
      message="Failed to load related events"
      @retry="refetch"
    />

    <AppTable
      v-else
      :columns="columns"
      :rows="rows"
      :page-size="25"
      storage-key="alarm-related-events"
      :owner-id="alarmId"
      columnBorders
      resizeFit
    >
      <template #cell="{ col, row }">
        <span v-if="col.id === 'severity'" class="ev-severity">
          <StatusIcon :status="row.sevKey" />
          <span class="capitalize">{{ row.sevLabel }}</span>
        </span>
        <span v-else-if="col.id === 'name'" :style="{ paddingLeft: `${row.depth * 1.25}rem` }">
          <i v-if="row.depth > 0" class="pi pi-angle-right ev-child-icon" />{{ row.name }}
        </span>
        <span v-else-if="col.id === 'timestamp'">{{ formatDate(row.timestamp) }}</span>
        <span v-else>{{ row[col.field] ?? '-' }}</span>
      </template>
      <template #empty>No related events</template>
    </AppTable>
  </div>
</template>

<style scoped>
.related-events {
  min-height: 3rem;
}

.events-loading {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.events-access-denied {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.ev-severity {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.ev-child-icon {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  margin-right: 0.25rem;
}

.capitalize {
  text-transform: capitalize;
}
</style>
