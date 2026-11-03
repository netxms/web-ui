<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import {
  useAiOperators,
  useUpdateAiOperator,
  useDeleteAiOperator,
  useResetAiOperator,
} from '@/queries/useAiOperatorQueries'
import { useUsers } from '@/queries/useUserQueries'
import { usePermissions } from '@/composables/usePermissions'
import { useServerComponents } from '@/composables/useServerComponents'
import { useWorkingState } from '@/composables/useWorkingState'
import { SERVER_COMPONENTS } from '@/config/serverComponents'
import { aiOperatorState, formatTokenBudget } from '@/utils/aiOperatorDisplay'
import { formatDurationCompact, formatAgeCompact, formatDateTime } from '@/utils/timeFormat'

defineProps({
  /** `(id) => RouteLocationRaw` for the operator detail view, for open-in-new-tab support. */
  detailTarget: { type: Function, required: true },
})

const emit = defineEmits(['open', 'new'])

const confirm = useConfirm()
const toast = useToast()
const { can } = usePermissions()

/**
 * Operators need an initialized AI assistant: the server loads them (`InitAIOperators()`) only
 * after a successful `InitAIAssistant()`. Without it the list is empty and the id counter is 0,
 * so creating one would overwrite an existing row; hence a gate, not a notice.
 */
const { has, isLoading: isServerInfoLoading } = useServerComponents()
const aiInitialized = computed(() => has(SERVER_COMPONENTS.AI_ASSISTANT))

const { data, isLoading, isFetching, isError, error, refetch } = useAiOperators(
  () => can.value.manageAiOperators,
)

defineExpose({ refetch })

const operators = computed(() => data.value ?? [])

// Owner names are not in the operator payload, only ownerUserId.
const { data: usersData } = useUsers()
const userNameById = computed(() => {
  const map = new Map()
  for (const user of usersData.value ?? []) map.set(user.id, user.name)
  return map
})

function ownerName(operator) {
  return userNameById.value.get(operator.ownerUserId) ?? `[${operator.ownerUserId}]`
}

const filterState = ref({ text: '', tokens: [] })

// Coming back to the section finds the filter as it was left.
useWorkingState('ai-operators', { view: { filterState } })
const filteredOperators = computed(() => {
  if (!filterState.value.text) return operators.value
  const search = filterState.value.text.toLowerCase()
  return operators.value.filter(
    (o) =>
      (o.name ?? '').toLowerCase().includes(search) ||
      (o.description ?? '').toLowerCase().includes(search) ||
      (o.scopeFilter ?? '').toLowerCase().includes(search),
  )
})

// Column order follows the legacy AiOperatorManager view.
const columns = [
  { id: 'id', field: 'id', label: 'ID', sortable: true, width: 60 },
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 180 },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 240 },
  { id: 'state', field: 'enabled', label: 'State', sortable: true, width: 110 },
  { id: 'owner', field: 'ownerUserId', label: 'Owner', sortable: true, width: 120 },
  { id: 'modelSlot', field: 'modelSlot', label: 'Model slot', sortable: true, width: 110 },
  { id: 'minInterval', field: 'minInterval', label: 'Min interval', sortable: true, width: 100 },
  { id: 'maxInterval', field: 'maxInterval', label: 'Max interval', sortable: true, width: 100 },
  {
    id: 'dailyTokenBudget',
    field: 'dailyTokenBudget',
    label: 'Token budget',
    sortable: true,
    width: 110,
  },
  {
    id: 'tokensUsedToday',
    field: 'tokensUsedToday',
    label: 'Used today',
    sortable: true,
    width: 110,
  },
  { id: 'iteration', field: 'iteration', label: 'Iteration', sortable: true, width: 90 },
  {
    id: 'lastExecutionTime',
    field: 'lastExecutionTime',
    label: 'Last execution',
    sortable: true,
    width: 130,
  },
  {
    id: 'nextExecutionTime',
    field: 'nextExecutionTime',
    label: 'Next execution',
    sortable: true,
    width: 130,
  },
  {
    id: 'currentFocus',
    field: 'currentFocus',
    label: 'Current focus',
    sortable: false,
    width: 240,
  },
  {
    id: 'lastExplanation',
    field: 'lastExplanation',
    label: 'Explanation',
    sortable: false,
    width: 300,
  },
]

const { mutate: updateOperator } = useUpdateAiOperator()
const { mutate: deleteOperator } = useDeleteAiOperator()
const { mutate: resetOperator } = useResetAiOperator()

function toastError(summary, fallback) {
  return (err) => {
    toast.add({ severity: 'error', summary, detail: err.message ?? fallback, life: 5000 })
  }
}

/** Enable/disable is a one-field PATCH, applied immediately without a Save cycle. */
function setEnabled(operator, enabled) {
  updateOperator(
    { operatorId: operator.id, data: { enabled } },
    {
      onSuccess: () => {
        toast.add({
          severity: 'success',
          summary: enabled ? 'Enabled' : 'Disabled',
          detail: `AI operator "${operator.name}" ${enabled ? 'enabled' : 'disabled'}.`,
          life: 3000,
        })
      },
      onError: toastError('Failed', 'Could not change AI operator state.'),
    },
  )
}

function confirmDelete(operator) {
  confirm.require({
    message: `Delete AI operator "${operator.name}"? The instance and all its observations will be deleted.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteOperator(operator.id, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `AI operator "${operator.name}" deleted.`,
            life: 3000,
          })
        },
        onError: toastError('Delete Failed', 'Failed to delete AI operator.'),
      })
    },
  })
}

function confirmReset(operator) {
  confirm.require({
    message: `Accumulated state (memento, current focus, watch list, and iteration counter) of "${operator.name}" will be cleared. Are you sure?`,
    header: 'Confirm Reset',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Reset',
    accept: () => {
      resetOperator(operator.id, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Reset',
            detail: `Accumulated state of "${operator.name}" cleared.`,
            life: 3000,
          })
        },
        onError: toastError('Reset Failed', 'Failed to reset AI operator state.'),
      })
    },
  })
}

const contextMenu = ref()

const contextMenuItems = computed(() => {
  const operator = contextMenu.value?.contextData
  return [
    { label: 'Edit', icon: 'pi pi-pencil', command: () => emit('open', operator.id) },
    { separator: true },
    {
      label: 'Enable',
      icon: 'pi pi-play',
      disabled: operator?.enabled,
      command: () => setEnabled(operator, true),
    },
    {
      label: 'Disable',
      icon: 'pi pi-pause',
      disabled: !operator?.enabled,
      command: () => setEnabled(operator, false),
    },
    {
      label: 'Reset accumulated state',
      icon: 'pi pi-replay',
      command: () => confirmReset(operator),
    },
    { separator: true },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      command: () => confirmDelete(operator),
    },
  ]
})

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}
</script>

<template>
  <div class="ai-tab">
    <!-- The list, and every mutation on it, needs the "manage AI operators" system right. -->
    <EmptyState
      v-if="!can.manageAiOperators"
      icon="pi pi-lock"
      title="Insufficient access rights"
      message='Managing AI operators requires the "Manage AI operators" system right. Ask an administrator to grant it in Users &amp; Groups.'
    />

    <!-- Until server-info resolves, show the list's skeleton rather than flash "not
         initialized" at a server that is. -->
    <div v-else-if="isServerInfoLoading" class="table-loading">
      <Skeleton v-for="i in 5" :key="i" height="2rem" class="mb-2" />
    </div>

    <EmptyState
      v-else-if="!aiInitialized"
      icon="pi pi-exclamation-triangle"
      title="AI assistant is not initialized"
      message="Operators are neither loaded nor executed until the server has an AI provider configured. Configure one in the server configuration file and restart the server."
    />

    <template v-else>
      <RefetchIndicator :is-fetching="isFetching && !isLoading" />

      <div class="tab-toolbar">
        <SmartFilterInput
          v-model="filterState"
          placeholder="Filter AI operators..."
          class="filter-input"
        />
        <div class="tab-toolbar-actions">
          <span v-if="!isLoading" class="item-count">{{
            $plural(filteredOperators.length, 'operator')
          }}</span>
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
            label="New Operator"
            icon="pi pi-plus"
            size="small"
            severity="primary"
            @click="emit('new')"
          />
        </div>
      </div>

      <div v-if="isLoading" class="table-loading">
        <Skeleton v-for="i in 5" :key="i" height="2rem" class="mb-2" />
      </div>

      <AppTable
        v-else
        :columns="columns"
        :rows="filteredOperators"
        :error="isError ? error : null"
        striped
        column-borders
        auto-width
        sort-field="id"
        :sort-order="1"
        :page-size="50"
        storage-key="ai-operators"
        class="items-table operators-table"
        :target-for="(row) => detailTarget(row.id)"
        @row-click="(row) => emit('open', row.id)"
        @row-contextmenu="onRowContextMenu"
        @retry="refetch"
      >
        <template #cell="{ col, row }">
          <span v-if="col.id === 'id'">{{ row.id }}</span>
          <span v-else-if="col.id === 'name'" class="item-name">{{ row.name }}</span>
          <span v-else-if="col.id === 'description'" :class="{ 'text-muted': !row.description }">{{
            row.description || '—'
          }}</span>
          <span
            v-else-if="col.id === 'state'"
            class="status-badge"
            :class="aiOperatorState(row).class"
          >
            <i :class="aiOperatorState(row).icon" />
            {{ aiOperatorState(row).label }}
            <i
              v-if="row.consecutiveFailures > 0"
              v-tooltip.top="`${row.consecutiveFailures} consecutive failure(s)`"
              class="pi pi-exclamation-triangle failure-marker"
            />
          </span>
          <span v-else-if="col.id === 'owner'">{{ ownerName(row) }}</span>
          <span v-else-if="col.id === 'modelSlot'" :class="{ 'text-muted': !row.modelSlot }">{{
            row.modelSlot || 'Default'
          }}</span>
          <span v-else-if="col.id === 'minInterval'">{{
            formatDurationCompact(row.minInterval)
          }}</span>
          <span v-else-if="col.id === 'maxInterval'">{{
            formatDurationCompact(row.maxInterval)
          }}</span>
          <span v-else-if="col.id === 'dailyTokenBudget'">{{
            formatTokenBudget(row.dailyTokenBudget)
          }}</span>
          <span v-else-if="col.id === 'tokensUsedToday'">{{
            (row.tokensUsedToday ?? 0).toLocaleString()
          }}</span>
          <span v-else-if="col.id === 'iteration'">{{ row.iteration ?? 0 }}</span>
          <span
            v-else-if="col.id === 'lastExecutionTime'"
            v-tooltip.top="formatDateTime(row.lastExecutionTime)"
            :class="{ 'text-muted': !row.lastExecutionTime }"
            >{{ formatAgeCompact(row.lastExecutionTime) || 'Never' }}</span
          >
          <span
            v-else-if="col.id === 'nextExecutionTime'"
            v-tooltip.top="formatDateTime(row.nextExecutionTime)"
            :class="{ 'text-muted': !row.nextExecutionTime }"
            >{{ formatDateTime(row.nextExecutionTime) || '—' }}</span
          >
          <span v-else-if="col.id === 'currentFocus'" class="ellipsis-cell">{{
            row.currentFocus || ''
          }}</span>
          <span v-else-if="col.id === 'lastExplanation'" class="ellipsis-cell">{{
            row.lastExplanation || ''
          }}</span>
        </template>
        <template #empty>
          <div class="table-empty">
            No AI operators configured. An operator is a perpetual adaptive monitoring loop that
            watches a scope of objects and records observations.
          </div>
        </template>
      </AppTable>

      <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
    </template>
  </div>
</template>

<style src="@/assets/styles/ai-section.css" />

<style scoped>
.filter-input {
  width: 300px;
}

.item-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-right: 0.5rem;
}

.operators-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.failure-marker {
  color: var(--p-orange-600);
  margin-left: 0.125rem;
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
