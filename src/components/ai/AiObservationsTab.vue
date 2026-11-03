<script setup>
/**
 * What the AI operators produced, and where it is triaged. The `AIOperatorObservations` log
 * shows the same records, but the log API is read-only; triage needs
 * `PUT /v1/ai/observations/{id}/state`.
 */
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import { useToast } from 'primevue/usetoast'
import AiObservationPanel from '@/components/ai/AiObservationPanel.vue'
import AiObservationStateLabel from '@/components/ai/AiObservationStateLabel.vue'
import AlarmIconLabel from '@/components/alarms/AlarmIconLabel.vue'
import AppTable from '@/components/common/AppTable.vue'
import ColumnChooser from '@/components/common/ColumnChooser.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import RestrictedState from '@/components/common/RestrictedState.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import { usePermissions } from '@/composables/usePermissions'
import {
  useAiObservations,
  useAiOperators,
  useSetAiObservationState,
} from '@/queries/useAiOperatorQueries'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import { useAiObservationTableStore } from '@/stores/aiObservationTableStore'
import { observationState, OBSERVATION_STATES } from '@/utils/aiOperatorDisplay'
import { formatAgeCompact, formatDateTime } from '@/utils/timeFormat'
import { useWorkingState } from '@/composables/useWorkingState'

/** Server default is 100; enough to triage a backlog without an unbounded query. */
const LIMIT = 200

const toast = useToast()

/** Server-side, because state is what the operator triages by and the list can be long. */
const stateFilter = ref(null)

const params = computed(() => ({
  limit: LIMIT,
  ...(stateFilter.value ? { state: stateFilter.value } : {}),
}))

const { data, isLoading, isFetching, error, refetch } = useAiObservations(params)

defineExpose({ refetch })

/** Reading observations needs "view event log" (`H_AiObservations`), not an AI right. */
const forbidden = computed(() => error.value?.status === 403)

const observations = computed(() => data.value ?? [])

// Names come from the shared object cache; id 0 means server-level. The cap mirrors the log
// value resolver's, so a page cannot fan out into hundreds of fetches; the rest render as `[id]`.
const MAX_RESOLVED_OBJECTS = 200

const objectIds = computed(() =>
  [...new Set(observations.value.map((o) => o.objectId).filter((id) => id > 0))].slice(
    0,
    MAX_RESOLVED_OBJECTS,
  ),
)
const { objectsById } = useObjectsByIds(objectIds)

// Observations carry only `instanceId`, and reading the operators takes a right this tab does
// not need ("manage AI operators"), so without it the column stays on the id, as in legacy.
const { can } = usePermissions()
const { data: operators } = useAiOperators(() => can.value.manageAiOperators)
const operatorNames = computed(
  () => new Map((operators.value ?? []).map((operator) => [operator.id, operator.name])),
)

const STATE_OPTIONS = [{ value: null, label: 'All states' }, ...OBSERVATION_STATES]

const filterState = ref({ text: '', tokens: [] })

// Coming back to the section finds the filters as they were left.
useWorkingState('ai-observations', { view: { stateFilter, filterState } })

const rows = computed(() => {
  const search = filterState.value.text.toLowerCase()
  return observations.value
    .map((observation) => {
      const object = observation.objectId > 0 ? objectsById.value.get(observation.objectId) : null
      return {
        ...observation,
        object,
        objectName: object?.name ?? (observation.objectId > 0 ? `[${observation.objectId}]` : ''),
        operatorName:
          operatorNames.value.get(observation.instanceId) ?? String(observation.instanceId),
      }
    })
    .filter(
      (row) =>
        !search ||
        (row.title ?? '').toLowerCase().includes(search) ||
        (row.body ?? '').toLowerCase().includes(search) ||
        row.objectName.toLowerCase().includes(search) ||
        row.operatorName.toLowerCase().includes(search),
    )
})

const isTruncated = computed(() => observations.value.length >= LIMIT)

// `mandatory` columns cannot be hidden via the picker.
const ALL_COLUMNS = [
  {
    id: 'severity',
    field: 'severity',
    label: 'Severity',
    sortable: true,
    width: 110,
    mandatory: true,
  },
  { id: 'timestamp', field: 'timestamp', label: 'Time', sortable: true, width: 130 },
  { id: 'state', field: 'state', label: 'State', sortable: true, width: 130, mandatory: true },
  { id: 'instance', field: 'operatorName', label: 'Operator', sortable: true, width: 140 },
  { id: 'object', field: 'objectName', label: 'Object', sortable: true, width: 180 },
  {
    id: 'title',
    field: 'title',
    label: 'Observation',
    sortable: true,
    width: 280,
    mandatory: true,
  },
  { id: 'body', field: 'body', label: 'Detail', sortable: false, width: 360 },
]

const columnStore = useAiObservationTableStore()
const columns = computed(() => columnStore.shownColumns(ALL_COLUMNS))

const panelOpen = ref(false)
const selected = ref(null)

function openObservation(row) {
  if (panelOpen.value && row.id === selected.value?.id) {
    panelOpen.value = false
    return
  }
  selected.value = row
  panelOpen.value = true
}

// Rows are rebuilt on every refetch, so the panel follows its record by id. A record that has
// left the list (the state filter dropped it after a triage) stays on show, so that the
// change can still be undone from the panel.
watch(rows, (list) => {
  const current = selected.value && list.find((row) => row.id === selected.value.id)
  if (current) selected.value = current
})

function rowClass(row) {
  return panelOpen.value && row.id === selected.value?.id ? 'row--selected' : null
}

const { mutate: setState, isPending } = useSetAiObservationState()

function triage(observation, state) {
  if (!observation || observation.state === state) return
  setState(
    { observationId: observation.id, state },
    {
      onSuccess: () => {
        if (selected.value?.id === observation.id) selected.value = { ...selected.value, state }
        toast.add({
          severity: 'success',
          summary: observationState(state).label,
          life: 2500,
        })
      },
      onError: (err) => {
        toast.add({
          severity: 'error',
          summary: 'Could not change state',
          // 403 here means no "update alarms" right on the observation's source object.
          detail: err?.message,
          life: 5000,
        })
      },
    },
  )
}

const contextMenu = ref()

const contextMenuItems = computed(() => {
  const observation = contextMenu.value?.contextData
  return OBSERVATION_STATES.map((state) => ({
    label: state.action,
    icon: state.icon,
    disabled: observation?.state === state.value || isPending.value,
    command: () => triage(observation, state.value),
  }))
})

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}
</script>

<template>
  <div class="ai-tab">
    <RestrictedState v-if="forbidden" right="viewEventLog" title="Observations unavailable" />

    <template v-else>
      <RefetchIndicator :is-fetching="isFetching && !isLoading" />

      <div class="tab-toolbar">
        <div class="tab-toolbar-filters">
          <SmartFilterInput
            v-model="filterState"
            placeholder="Filter observations..."
            class="filter-input"
          />
          <!-- The placeholder is what "All states" shows as: Select treats null as no selection. -->
          <Select
            v-model="stateFilter"
            :options="STATE_OPTIONS"
            option-label="label"
            option-value="value"
            placeholder="All states"
            size="small"
            class="state-filter"
          />
        </div>
        <div class="tab-toolbar-actions">
          <span v-if="!isLoading" class="item-count">
            {{ $plural(rows.length, 'observation') }}
            <template v-if="isTruncated"> (newest {{ LIMIT }})</template>
          </span>
          <Button
            v-tooltip.bottom="'Refresh'"
            icon="pi pi-refresh"
            size="small"
            severity="secondary"
            text
            rounded
            aria-label="Refresh"
            @click="refetch"
          />
          <ColumnChooser
            v-model="columnStore.visibleColumnIds"
            v-model:order="columnStore.columnOrder"
            :columns="ALL_COLUMNS"
          />
        </div>
      </div>

      <div v-if="isLoading" class="table-loading">
        <Skeleton v-for="i in 5" :key="i" height="2rem" class="mb-2" />
      </div>

      <AppTable
        v-else
        :columns="columns"
        :rows="rows"
        :error="error"
        striped
        column-borders
        auto-width
        sort-field="timestamp"
        :sort-order="-1"
        :page-size="50"
        :row-class="rowClass"
        storage-key="ai-observations"
        class="items-table"
        reorderable
        @row-click="openObservation"
        @row-contextmenu="onRowContextMenu"
        @column-move="columnStore.moveColumn(ALL_COLUMNS, $event)"
        @retry="refetch"
      >
        <template #cell="{ col, row }">
          <AlarmIconLabel
            v-if="col.id === 'severity'"
            type="severity"
            :value="row.severity"
            collapsible
          />
          <span v-else-if="col.id === 'timestamp'" v-tooltip.top="formatDateTime(row.timestamp)">{{
            formatAgeCompact(row.timestamp) || '—'
          }}</span>
          <AiObservationStateLabel v-else-if="col.id === 'state'" :state="row.state" />
          <span v-else-if="col.id === 'instance'">{{ row.operatorName }}</span>
          <!-- Plain text: a click anywhere on the row opens the panel, which links to the object.
               objectId 0 means the observation is about the server, not one object. -->
          <span v-else-if="col.id === 'object'" :class="{ 'text-muted': !row.object }">{{
            row.objectName || 'Server'
          }}</span>
          <span v-else-if="col.id === 'title'" class="item-name">{{ row.title || '—' }}</span>
          <span v-else-if="col.id === 'body'" class="ellipsis-cell">{{ row.body || '' }}</span>
        </template>
        <template #empty>
          <div class="table-empty">
            No observations recorded. An enabled AI operator writes one whenever it notices
            something worth reporting in the scope it watches.
          </div>
        </template>
      </AppTable>

      <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />

      <AiObservationPanel
        v-model:visible="panelOpen"
        :observation="selected"
        :pending="isPending"
        @set-state="triage(selected, $event)"
      />
    </template>
  </div>
</template>

<style src="@/assets/styles/ai-section.css" />

<style scoped>
.tab-toolbar-filters {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-input {
  width: 300px;
}

.state-filter {
  width: 170px;
}

.item-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-right: 0.5rem;
}

.ellipsis-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}
</style>
