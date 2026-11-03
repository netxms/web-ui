<script setup>
import { formatDateTime } from '@/utils/timeFormat'
import { ref, computed, defineComponent, h } from 'vue'
import Tag from 'primevue/tag'
import AppTable from '@/components/common/AppTable.vue'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import ToggleSwitch from 'primevue/toggleswitch'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import ScheduledTaskDetailView from '@/components/scheduled-tasks/ScheduledTaskDetailView.vue'
import {
  describeSchedule,
  taskExecutionStatus,
} from '@/components/scheduled-tasks/scheduledTaskUtils'
import {
  useScheduledTaskHandlers,
  useScheduledTasks,
  useScheduledTask,
  useDeleteScheduledTask,
} from '@/queries/useScheduledTaskQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'
import { useObject } from '@/queries/useObjectQueries'

const ObjectNameCell = defineComponent({
  props: { objectId: { type: Number, default: 0 } },
  setup(props) {
    const id = computed(() => (props.objectId > 0 ? props.objectId : null))
    const { data } = useObject(id)
    return () => {
      if (!props.objectId) return h('span', { class: 'text-muted' }, '—')
      if (data.value) return h('span', data.value.name)
      return h('span', { class: 'text-muted' }, `#${props.objectId}`)
    }
  },
})

const confirm = useConfirm()
const toast = useToast()

const { entityId, isDetailView, detailTarget, openDetail, closeDetail } = useEntityDetail()

const isNewTask = computed(() => entityId.value === 'new')

function openNew() {
  openDetail('new')
}

const { data: handlersData } = useScheduledTaskHandlers()
const handlers = computed(() => handlersData.value ?? [])

const { data: tasksData, isLoading, isFetching, isError, error, refetch } = useScheduledTasks()

const showCompleted = ref(true)
const showDisabled = ref(true)
const showSystemTasks = ref(false)

const filterState = ref({ text: '', tokens: [] })

useWorkingState('scheduled-tasks', {
  view: { filterState, showCompleted, showDisabled, showSystemTasks },
})

const filteredTasks = computed(() => {
  let list = tasksData.value ?? []
  if (!showCompleted.value) list = list.filter((t) => !t.completed)
  if (!showDisabled.value) list = list.filter((t) => !t.disabled)
  if (!showSystemTasks.value) list = list.filter((t) => !t.system)
  if (filterState.value.text) {
    const q = filterState.value.text.toLowerCase()
    list = list.filter(
      (t) =>
        (t.comments ?? '').toLowerCase().includes(q) ||
        (t.taskHandlerId ?? '').toLowerCase().includes(q) ||
        (t.parameters ?? '').toLowerCase().includes(q),
    )
  }
  return list
})

const filterPopover = ref()

function toggleFilterPopover(event) {
  filterPopover.value.toggle(event)
}

function onRowClick(row) {
  openDetail(row.id)
}

const contextMenu = ref()

const { mutate: deleteTask } = useDeleteScheduledTask()

const contextMenuItems = computed(() => {
  const data = contextMenu.value?.contextData
  const isSystem = data?.system === true
  return [
    {
      label: 'Edit',
      icon: 'pi pi-pencil',
      command: () => openDetail(contextMenu.value.contextData.id),
    },
    { separator: true },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: isSystem ? '' : 'p-menuitem-danger',
      disabled: isSystem,
      command: () => !isSystem && confirmDelete(contextMenu.value.contextData),
    },
  ]
})

function confirmDelete(task) {
  const label = task.comments || task.taskHandlerId
  confirm.require({
    message: `Delete task "${label}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteTask(task.id, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `Task "${label}" deleted.`,
            life: 3000,
          })
        },
        onError: (err) => {
          toast.add({
            severity: 'error',
            summary: 'Delete Failed',
            detail: err.message ?? 'Failed to delete task.',
            life: 5000,
          })
        },
      })
    },
  })
}

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

function onActionsClick(event, rowData) {
  contextMenu.value.show(event, rowData)
}

const BASE_COLUMNS = [
  { id: 'taskHandlerId', field: 'taskHandlerId', label: 'Handler', sortable: true, width: 180 },
  { id: 'objectId', field: 'objectId', label: 'Object', sortable: false, width: 130 },
  { id: 'parameters', field: 'parameters', label: 'Parameters', sortable: true, width: 150 },
  { id: 'schedule', field: 'schedule', label: 'Schedule', sortable: false, width: 220 },
  {
    id: 'lastExecutionTime',
    field: 'lastExecutionTime',
    label: 'Last Run',
    sortable: true,
    width: 150,
  },
  { id: 'execStatus', field: 'execStatus', label: 'Exec. Status', sortable: false, width: 120 },
  { id: 'disabled', field: 'disabled', label: 'Admin. Status', sortable: true, width: 110 },
]
const SYSTEM_COLUMN = { id: 'system', field: 'system', label: 'System', sortable: false, width: 80 }
const ACTIONS_COLUMN = { id: 'actions', field: 'actions', label: '', width: 48 }

const columns = computed(() => {
  const cols = [...BASE_COLUMNS]
  if (showSystemTasks.value) cols.push(SYSTEM_COLUMN)
  cols.push(ACTIONS_COLUMN)
  return cols
})

const taskDetailId = computed(() =>
  isDetailView.value && !isNewTask.value ? entityId.value : null,
)
const {
  data: taskDetail,
  isLoading: isDetailLoading,
  isError: isDetailError,
  error: detailError,
  refetch: refetchDetail,
} = useScheduledTask(taskDetailId)
</script>

<template>
  <div v-if="isDetailView" class="tasks-detail">
    <ScheduledTaskDetailView
      v-if="isNewTask"
      :task="null"
      :handlers="handlers"
      @close="closeDetail"
    />

    <template v-else>
      <ScheduledTaskDetailView
        v-if="taskDetail"
        :task="taskDetail"
        :handlers="handlers"
        @close="closeDetail"
        @saved="() => {}"
      />

      <template v-else-if="isDetailLoading">
        <EntityDetailHeader title="Loading…" @back="closeDetail" />
        <div class="detail-loading">
          <Skeleton height="1.5rem" width="40%" class="mb-3" />
          <Skeleton height="1rem" width="60%" class="mb-2" />
          <Skeleton height="1rem" width="55%" class="mb-2" />
          <Skeleton height="1rem" width="45%" class="mb-2" />
        </div>
      </template>

      <template v-else-if="isDetailError">
        <EntityDetailHeader title="Error" @back="closeDetail" />
        <div class="detail-content">
          <QueryErrorState :error="detailError" @retry="refetchDetail" />
        </div>
      </template>

      <template v-else>
        <EntityDetailHeader title="Not Found" @back="closeDetail" />
        <div class="detail-content">
          <p class="empty-message">Scheduled task not found.</p>
        </div>
      </template>
    </template>
  </div>

  <!-- Kept mounted to preserve paginator state -->
  <div v-show="!isDetailView" class="tasks-section">
    <SectionHeader title="Scheduled Tasks" icon="pi pi-clock">
      <template #actions>
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
        <Button
          label="Add Task"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openNew"
        />
      </template>
    </SectionHeader>

    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="section-toolbar">
      <SmartFilterInput v-model="filterState" placeholder="Filter tasks..." class="filter-input" />
      <span v-if="!isLoading" class="item-count">{{ $plural(filteredTasks.length, 'task') }}</span>
      <Button
        icon="pi pi-ellipsis-h"
        text
        rounded
        severity="secondary"
        size="small"
        class="filter-options-btn"
        aria-label="Filter options"
        @click="toggleFilterPopover"
      />
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 8" :key="i" height="2rem" class="mb-2" />
    </div>

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredTasks"
      :error="isError ? error : null"
      :page-size="50"
      storage-key="scheduled-tasks"
      striped
      column-borders
      resize-fit
      class="tasks-table"
      :target-for="(row) => detailTarget(row.id)"
      @row-click="onRowClick"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <code v-if="col.id === 'taskHandlerId'" class="handler-chip">{{ row.taskHandlerId }}</code>
        <ObjectNameCell v-else-if="col.id === 'objectId'" :object-id="row.objectId" />
        <span
          v-else-if="col.id === 'parameters'"
          class="params-cell"
          :class="{ 'text-muted': !row.parameters }"
          >{{ row.parameters || '—' }}</span
        >
        <span v-else-if="col.id === 'schedule'">{{ describeSchedule(row) }}</span>
        <span
          v-else-if="col.id === 'lastExecutionTime'"
          :class="{ 'text-muted': !row.lastExecutionTime }"
          >{{ formatDateTime(row.lastExecutionTime) ?? '—' }}</span
        >
        <Tag
          v-else-if="col.id === 'execStatus'"
          :value="taskExecutionStatus(row).label"
          :severity="taskExecutionStatus(row).severity"
          outlined
        />
        <template v-else-if="col.id === 'disabled'">
          <Tag v-if="row.disabled" value="Disabled" severity="secondary" outlined />
          <Tag v-else value="Enabled" severity="success" outlined />
        </template>
        <template v-else-if="col.id === 'system'">
          <Tag v-if="row.system" value="System" severity="warn" outlined />
          <span v-else class="text-muted">—</span>
        </template>
        <Button
          v-else-if="col.id === 'actions'"
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
      <template #empty>
        <div class="empty-message">No scheduled tasks found.</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>

  <Popover ref="filterPopover" class="filter-popover">
    <div class="filter-options">
      <div class="filter-option">
        <ToggleSwitch v-model="showCompleted" input-id="filter-completed" />
        <label for="filter-completed">Show completed tasks</label>
      </div>
      <div class="filter-option">
        <ToggleSwitch v-model="showDisabled" input-id="filter-disabled" />
        <label for="filter-disabled">Show disabled tasks</label>
      </div>
      <div class="filter-option">
        <ToggleSwitch v-model="showSystemTasks" input-id="filter-system" />
        <label for="filter-system">Show system tasks</label>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.tasks-section,
.tasks-detail {
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
  width: 280px;
}

.item-count {
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.filter-options-btn {
  width: 1.75rem;
  height: 1.75rem;
}

.section-loading,
.detail-loading {
  padding: 1rem;
}

.tasks-table {
  flex: 1;
  min-height: 0;
}

.tasks-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

.handler-chip {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  background: var(--p-surface-100);
  padding: 0.1rem 0.35rem;
  border-radius: 0.25rem;
}

.params-cell {
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
  display: block;
}

.text-muted {
  color: var(--p-text-muted-color);
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.filter-popover :deep(.p-popover-content) {
  padding: 0.75rem;
}

.filter-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 200px;
}

.filter-option {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.filter-option label {
  font-size: 0.875rem;
  cursor: pointer;
  user-select: none;
}
</style>
