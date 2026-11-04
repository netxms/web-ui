<script setup>
import EntityListSection from '@/components/layout/EntityListSection.vue'
import EntityDetailState from '@/components/layout/EntityDetailState.vue'
import { useConfirmDelete } from '@/composables/useConfirmDelete'
import { formatDateTime } from '@/utils/timeFormat'
import { ref, computed, defineComponent, h } from 'vue'
import Tag from 'primevue/tag'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import ToggleSwitch from 'primevue/toggleswitch'
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

const confirmDelete = useConfirmDelete()

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

const { mutateAsync: deleteTask } = useDeleteScheduledTask()

function menuItems(task) {
  const isSystem = task.system === true
  return [
    { label: 'Edit', icon: 'pi pi-pencil', command: () => openDetail(task.id) },
    { separator: true },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: isSystem ? '' : 'p-menuitem-danger',
      disabled: isSystem,
      command: () => !isSystem && onDelete(task),
    },
  ]
}

function onDelete(task) {
  const label = task.comments || task.taskHandlerId
  confirmDelete({
    message: `Delete task "${label}"? This cannot be undone.`,
    run: () => deleteTask(task.id),
    successDetail: `Task "${label}" deleted.`,
    failureDetail: 'Failed to delete task.',
  })
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
  error: detailError,
  refetch: refetchDetail,
} = useScheduledTask(taskDetailId)
</script>

<template>
  <EntityListSection
    v-model:filter="filterState"
    :detail="isDetailView"
    title="Scheduled Tasks"
    icon="pi pi-clock"
    add-label="Add Task"
    filter-placeholder="Filter tasks..."
    count-noun="task"
    :columns="columns"
    :rows="filteredTasks"
    :loading="isLoading"
    :fetching="isFetching"
    :error="isError ? error : null"
    empty-text="No scheduled tasks found."
    :menu-items="menuItems"
    storage-key="scheduled-tasks"
    :target-for="(row) => detailTarget(row.id)"
    @refresh="refetch"
    @add="openNew"
    @row-click="(row) => openDetail(row.id)"
  >
    <template #detail>
      <ScheduledTaskDetailView
        v-if="isNewTask"
        :task="null"
        :handlers="handlers"
        @close="closeDetail"
      />
      <ScheduledTaskDetailView
        v-else-if="taskDetail"
        :task="taskDetail"
        :handlers="handlers"
        @close="closeDetail"
      />
      <EntityDetailState
        v-else
        :loading="isDetailLoading"
        :error="detailError"
        not-found-text="Scheduled task not found."
        @back="closeDetail"
        @retry="refetchDetail"
      />
    </template>

    <template #toolbar>
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
    </template>
  </EntityListSection>
</template>

<style scoped>
.filter-options-btn {
  width: 1.75rem;
  height: 1.75rem;
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
