<script setup>
// Legacy AiObservationMonitorElement. GET /v1/ai/observations returns rows newest first, so
// there is no client-side sort.
import { computed } from 'vue'
import AiObservationStateLabel from '@/components/ai/AiObservationStateLabel.vue'
import AlarmIconLabel from '@/components/alarms/AlarmIconLabel.vue'
import AppLink from '@/components/common/AppLink.vue'
import AppTable from '@/components/common/AppTable.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import RestrictedState from '@/components/common/RestrictedState.vue'
import { useEffectiveObjectId } from '@/composables/useDashboardContext'
import { useWidgetActive } from '@/composables/useWidgetActive'
import { useAiObservations } from '@/queries/useAiOperatorQueries'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import { observationMonitorParams } from '@/utils/aiOperatorDisplay'
import { objectTarget } from '@/utils/routeTargets'
import { formatAgeCompact, formatDateTime } from '@/utils/timeFormat'

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})

const objectId = useEffectiveObjectId(() => cfg.value.objectId)
const params = computed(() => observationMonitorParams(cfg.value, objectId.value))

const { data, isLoading, error, refetch } = useAiObservations(params, {
  // Always true outside a dashboard.
  enabled: useWidgetActive(),
  refetchInterval: computed(() => (cfg.value.refreshInterval || 60) * 1000),
})

/** Reading observations needs "view event log", not an AI right. */
const forbidden = computed(() => error.value?.status === 403)

const observations = computed(() => data.value ?? [])

// Same cap as the Observations tab, so a page cannot fan out into hundreds of fetches; the rest
// render as `[id]`.
const MAX_RESOLVED_OBJECTS = 200

const objectIds = computed(() =>
  [...new Set(observations.value.map((o) => o.objectId).filter((id) => id > 0))].slice(
    0,
    MAX_RESOLVED_OBJECTS,
  ),
)
const { objectsById } = useObjectsByIds(objectIds)

const rows = computed(() =>
  observations.value.map((observation) => {
    const object = observation.objectId > 0 ? objectsById.value.get(observation.objectId) : null
    return {
      ...observation,
      object,
      objectName: object?.name ?? (observation.objectId > 0 ? `[${observation.objectId}]` : ''),
    }
  }),
)

const columns = [
  { id: 'timestamp', field: 'timestamp', label: 'Time', width: 140 },
  { id: 'severity', field: 'severity', label: 'Severity', width: 100 },
  { id: 'title', field: 'title', label: 'Title', width: 260 },
  { id: 'object', field: 'objectName', label: 'Object', width: 160 },
  { id: 'state', field: 'state', label: 'State', width: 120 },
]

const emptyTitle = computed(() =>
  cfg.value.newOnly !== false ? 'No new observations' : 'No observations',
)
</script>

<template>
  <div class="ai-observation-monitor">
    <LoadingState v-if="isLoading" />
    <RestrictedState
      v-else-if="forbidden"
      right="viewEventLog"
      title="Observations unavailable"
      compact
    />
    <div v-else-if="error" class="aom-state">
      <QueryErrorState :error="error" message="Failed to load observations" @retry="refetch" />
    </div>
    <EmptyState v-else-if="rows.length === 0" icon="pi pi-sparkles" :title="emptyTitle" />
    <AppTable v-else :columns="columns" :rows="rows" compact resize-fit striped class="aom-table">
      <template #cell="{ col, row }">
        <span v-if="col.id === 'timestamp'" v-tooltip.top="formatAgeCompact(row.timestamp)">{{
          formatDateTime(row.timestamp) || '-'
        }}</span>
        <AlarmIconLabel
          v-else-if="col.id === 'severity'"
          type="severity"
          :value="row.severity"
          collapsible
        />
        <span v-else-if="col.id === 'title'" class="aom-title">{{ row.title || '-' }}</span>
        <AppLink v-else-if="col.id === 'object' && row.object" :to="objectTarget(row.object)">
          {{ row.objectName }}
        </AppLink>
        <!-- objectId 0 means the observation is about the server, not one object. -->
        <span v-else-if="col.id === 'object'" class="text-muted">{{ row.objectName }}</span>
        <AiObservationStateLabel v-else-if="col.id === 'state'" :state="row.state" />
      </template>
    </AppTable>
  </div>
</template>

<style scoped>
.ai-observation-monitor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.aom-table {
  flex: 1;
  min-height: 0;
}

.aom-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.aom-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-muted {
  color: var(--p-text-muted-color);
}
</style>
