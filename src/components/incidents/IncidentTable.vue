<script setup>
import { formatDateTimeShort } from '@/utils/timeFormat'
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import AppTable from '@/components/common/AppTable.vue'
import ColumnChooser from '@/components/common/ColumnChooser.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import CreateIncidentDialog from '@/components/incidents/CreateIncidentDialog.vue'
import IncidentActionDialogs from '@/components/incidents/IncidentActionDialogs.vue'
import { incidentTarget, objectTarget } from '@/utils/routeTargets'
import { useIncidentTableStore } from '@/stores/incidentTableStore'
import { incidentFilterDefs } from '@/filterDefs/incidentFilterDefs'
import {
  getIncidentState,
  normalizeIncidentState,
  canBlock,
  canStart,
  canResolve,
  canReopen,
  canClose,
  canAssign,
  canComment,
} from '@/utils/incidentDisplay'
import { useWorkingState } from '@/composables/useWorkingState'

const props = defineProps({
  incidents: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
  isFetching: { type: Boolean, default: false },
  isError: { type: Boolean, default: false },
  error: { type: [Object, Error], default: null },
})

const emit = defineEmits(['retry', 'refresh', 'open-details'])

const router = useRouter()

const filterState = ref({ text: '', tokens: [] })

useWorkingState('incidents', { view: { filterState } })

/**
 * @param {object} incident
 * @param {{ key: string, value: string|null }} token
 */
function matchToken(incident, token) {
  const val = (token.value ?? '').toLowerCase()
  switch (token.key) {
    case 'State':
      return getIncidentState(incident).label.toLowerCase() === val
    case 'Source':
      return (incident.sourceObjectName ?? '').toLowerCase().includes(val)
    case 'Assignee':
      return (incident.assignedUserName ?? '').toLowerCase().includes(val)
    case 'Unassigned':
      return !incident.assignedUserId
    case 'HasAlarms':
      return (incident.alarmCount ?? 0) > 0
    default:
      return true
  }
}

// Free text matches title, source name, assignee and bare id, as in the legacy client.
const filteredIncidents = computed(() => {
  const { text, tokens } = filterState.value

  let result = props.incidents

  if (text) {
    const search = text.toLowerCase()
    result = result.filter(
      (incident) =>
        String(incident.title ?? '')
          .toLowerCase()
          .includes(search) ||
        String(incident.sourceObjectName ?? '')
          .toLowerCase()
          .includes(search) ||
        String(incident.assignedUserName ?? '')
          .toLowerCase()
          .includes(search) ||
        String(incident.id).includes(search),
    )
  }

  if (tokens.length > 0) {
    result = result.filter((incident) => {
      let negateNext = false
      for (const token of tokens) {
        if (token.key === 'NOT') {
          negateNext = true
          continue
        }
        const matches = matchToken(incident, token)
        if (negateNext ? matches : !matches) return false
        negateNext = false
      }
      return true
    })
  }

  return result
})

const store = useIncidentTableStore()

// `mandatory` columns cannot be hidden.
const ALL_COLUMNS = [
  { id: 'id', field: 'id', label: 'ID', sortable: true, width: 80, mandatory: true },
  { id: 'state', field: 'state', label: 'State', sortable: true, width: 120, mandatory: true },
  { id: 'title', field: 'title', label: 'Title', sortable: true, width: 380, mandatory: true },
  { id: 'source', field: 'sourceObjectName', label: 'Source', sortable: true, width: 160 },
  { id: 'assignee', field: 'assignedUserName', label: 'Assignee', sortable: true, width: 140 },
  { id: 'created', field: 'creationTime', label: 'Created', sortable: true, width: 140 },
  {
    id: 'lastChangeTime',
    field: 'lastChangeTime',
    label: 'Last Change',
    sortable: true,
    width: 140,
  },
  { id: 'alarms', field: 'alarmCount', label: 'Alarms', sortable: true, width: 80 },
]

const ACTIONS_COLUMN = { id: 'actions', field: null, label: '', width: 40, reorderable: false }

const columns = computed(() => [...store.shownColumns(ALL_COLUMNS), ACTIONS_COLUMN])

function incidentRowClass(row) {
  return `incident-row-${normalizeIncidentState(row.state)}`
}

function rowTarget(row) {
  return incidentTarget(row.id)
}

function goToSource(incident) {
  if (incident.sourceObjectId) {
    router.push(
      objectTarget({ id: incident.sourceObjectId }, 'status', {
        perspective: 'infrastructure',
      }),
    )
  }
}

const actions = ref()
const contextMenu = ref()
const createVisible = ref(false)

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

function onActionsClick(event, rowData) {
  contextMenu.value.show(event, rowData)
}

function onCreated(incident) {
  if (incident?.id != null) emit('open-details', incident)
}

const contextMenuItems = computed(() => {
  const data = contextMenu.value?.contextData
  return [
    {
      label: 'Details',
      icon: 'pi pi-search-plus',
      command: () => emit('open-details', data),
    },
    {
      label: 'Go to Object',
      icon: 'pi pi-external-link',
      disabled: !data?.sourceObjectId,
      command: () => goToSource(data),
    },
    { separator: true },
    {
      label: 'Create incident...',
      icon: 'pi pi-plus',
      command: () => {
        createVisible.value = true
      },
    },
    { separator: true },
    {
      label: 'In progress',
      icon: 'pi pi-play',
      disabled: !canStart(data),
      command: () => actions.value.start(data),
    },
    {
      label: 'Block...',
      icon: 'pi pi-ban',
      disabled: !canBlock(data),
      command: () => actions.value.block(data),
    },
    {
      label: 'Resolve',
      icon: 'pi pi-check-circle',
      disabled: !canResolve(data),
      command: () => actions.value.resolve(data),
    },
    {
      label: 'Reopen',
      icon: 'pi pi-replay',
      disabled: !canReopen(data),
      command: () => actions.value.reopen(data),
    },
    {
      label: 'Close',
      icon: 'pi pi-lock',
      class: 'p-menuitem-danger',
      disabled: !canClose(data),
      command: () => actions.value.close(data),
    },
    { separator: true },
    {
      label: 'Assign...',
      icon: 'pi pi-user',
      disabled: !canAssign(data),
      command: () => actions.value.assign(data),
    },
    {
      label: 'Add comment...',
      icon: 'pi pi-comment',
      disabled: !canComment(data),
      command: () => actions.value.comment(data),
    },
  ]
})
</script>

<template>
  <div class="incident-table-container">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="section-toolbar">
      <SmartFilterInput
        v-model="filterState"
        :filter-defs="incidentFilterDefs"
        placeholder="Filter incidents..."
        class="filter-input"
      />
      <Button
        label="Create incident"
        icon="pi pi-plus"
        size="small"
        @click="createVisible = true"
      />
      <div class="toolbar-actions">
        <span v-show="!isLoading" class="item-count">{{
          $plural(filteredIncidents.length, 'incident')
        }}</span>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          @click="emit('refresh')"
        />
        <ColumnChooser
          v-model="store.visibleColumnIds"
          v-model:order="store.columnOrder"
          :columns="ALL_COLUMNS"
        />
      </div>
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 8" :key="i" height="2rem" class="mb-2" />
    </div>

    <QueryErrorState
      v-else-if="isError"
      :error="error"
      class="section-error"
      @retry="emit('retry')"
    />

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredIncidents"
      sort-field="id"
      :sort-order="-1"
      :row-class="incidentRowClass"
      :target-for="rowTarget"
      :page-size="20"
      :page-size-options="[10, 20, 50, 100, 500]"
      storage-key="incidents"
      reorderable
      striped
      size="small"
      resize-fit
      class="incidents-table"
      @row-click="emit('open-details', $event)"
      @row-contextmenu="onRowContextMenu"
      @column-move="store.moveColumn(ALL_COLUMNS, $event)"
    >
      <template #empty>No incidents found.</template>

      <template #cell="{ col, row }">
        <template v-if="col.id === 'state'">
          <Tag
            :value="getIncidentState(row).label"
            :severity="getIncidentState(row).severity"
            outlined
          />
        </template>
        <template v-else-if="col.id === 'title'">
          <span class="incident-title">{{ row.title }}</span>
        </template>
        <template v-else-if="col.id === 'source'">
          <span class="incident-source">{{
            row.sourceObjectName ?? `[${row.sourceObjectId}]`
          }}</span>
        </template>
        <template v-else-if="col.id === 'assignee'">
          <span v-if="row.assignedUserName">{{ row.assignedUserName }}</span>
          <span v-else class="text-muted">Unassigned</span>
        </template>
        <template v-else-if="col.id === 'created'">
          {{ formatDateTimeShort(row.creationTime) }}
        </template>
        <template v-else-if="col.id === 'lastChangeTime'">
          {{ formatDateTimeShort(row.lastChangeTime) }}
        </template>
        <template v-else-if="col.id === 'alarms'">
          <span v-if="(row.alarmCount ?? 0) > 0" class="count-badge">{{ row.alarmCount }}</span>
          <span v-else class="text-muted">--</span>
        </template>
        <template v-else-if="col.id === 'actions'">
          <Button
            icon="pi pi-ellipsis-v"
            text
            rounded
            severity="secondary"
            size="small"
            class="row-action-btn"
            aria-label="Actions"
            @click.stop="onActionsClick($event, row)"
          />
        </template>
        <template v-else>{{ row[col.field] ?? '--' }}</template>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
    <IncidentActionDialogs ref="actions" />
    <CreateIncidentDialog v-model:visible="createVisible" @created="onCreated" />
  </div>
</template>

<style scoped>
.incident-table-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.section-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.filter-input {
  width: 360px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.item-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.section-loading {
  padding: 1rem;
}

.section-error {
  padding: 1rem;
  justify-content: center;
}

.incidents-table {
  flex: 1;
  min-height: 0;
}

.incidents-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

/* Applied via rowClass */
:deep(.incident-row-open) {
  border-left: 3px solid var(--p-yellow-500);
}

:deep(.incident-row-inProgress) {
  border-left: 3px solid var(--p-blue-500);
}

:deep(.incident-row-blocked) {
  border-left: 3px solid var(--p-red-500);
}

:deep(.incident-row-resolved) {
  border-left: 3px solid var(--p-green-500);
}

/* Closed incidents recede so open work reads first. */
:deep(.incident-row-closed) {
  border-left: 3px solid transparent;
  opacity: 0.6;
}

.incident-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.incident-source {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-muted {
  color: var(--p-text-muted-color);
}
</style>
