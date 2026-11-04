<script setup>
/**
 * What background AI tasks left for this user: reports, alerts, and the approval requests the
 * tasks wait on. Approving starts a task with the approver's rights.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AiIconLabel from '@/components/ai/AiIconLabel.vue'
import AiMessagePanel from '@/components/ai/AiMessagePanel.vue'
import AppTable from '@/components/common/AppTable.vue'
import ColumnChooser from '@/components/common/ColumnChooser.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import SelectionActions from '@/components/common/SelectionActions.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useWorkingState } from '@/composables/useWorkingState'
import { useAiMessages, useDeleteAiMessage, useSetAiMessageStatus } from '@/queries/useAiQueries'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import { useAiMessageTableStore } from '@/stores/aiMessageTableStore'
import {
  aiMessageErrorDetail,
  aiMessageStatus,
  aiMessageType,
  approvalPrompt,
  canDeleteAiMessage,
  compareAiMessages,
  formatAiMessageExpiry,
  isAiMessageExpiringSoon,
  isAiMessageUnread,
  isWaitingOnUser,
  needsDecision,
} from '@/utils/aiMessageDisplay'
import { mapConcurrent } from '@/utils/concurrencyLimit'
import { formatAgeCompact, formatDateTime } from '@/utils/timeFormat'

/** Nothing undoes "read", so clicking through the list must not mark everything. */
const READ_AFTER_MS = 3000

/** Keeps ages and deadlines current between polls. */
const CLOCK_TICK_MS = 30 * 1000

/** A long list must not fan out into hundreds of object fetches; the rest render as `[id]`. */
const MAX_RESOLVED_OBJECTS = 200

const VIEW_OPTIONS = [
  { value: 'all', label: 'All messages' },
  { value: 'waiting', label: 'Waiting on you' },
]

const toast = useToast()
const confirm = useConfirm()
const { can } = usePermissions()

const { data, isLoading, isFetching, error, refetch } = useAiMessages()

defineExpose({ refetch })

const messages = computed(() => data.value ?? [])

const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), CLOCK_TICK_MS)
watch(data, () => (now.value = Date.now()))

const objectIds = computed(() =>
  [...new Set(messages.value.map((m) => m.relatedObjectId).filter((id) => id > 0))].slice(
    0,
    MAX_RESOLVED_OBJECTS,
  ),
)
const { objectsById } = useObjectsByIds(objectIds)

const allRows = computed(() =>
  messages.value
    .map((message) => {
      const id = message.relatedObjectId
      const object = id > 0 ? objectsById.value.get(id) : null
      const status = aiMessageStatus(message, now.value)
      const type = aiMessageType(message.type)
      return {
        ...message,
        object,
        objectName: object?.name ?? (id > 0 ? `[${id}]` : ''),
        statusDisplay: status,
        statusLabel: status.label,
        typeDisplay: type,
        typeLabel: type.label,
        createdAge: formatAgeCompact(message.creationTime, now.value),
        expiresIn: formatAiMessageExpiry(message, now.value),
        expiringSoon: isAiMessageExpiringSoon(message, now.value),
      }
    })
    .sort((a, b) => compareAiMessages(a, b, now.value)),
)

const viewFilter = ref('all')
const filterState = ref({ text: '', tokens: [] })
const selectedIds = ref(new Set())

// Coming back to the section finds the filters as they were left.
useWorkingState('ai-messages', { view: { viewFilter, filterState, selectedIds } })

const rows = computed(() => {
  const search = filterState.value.text.toLowerCase()
  return allRows.value.filter(
    (row) =>
      (viewFilter.value !== 'waiting' || isWaitingOnUser(row, now.value)) &&
      (!search ||
        [row.title, row.text, row.objectName].some((value) =>
          (value ?? '').toLowerCase().includes(search),
        )),
  )
})

const emptyMessage = computed(() =>
  messages.value.length
    ? 'No messages match the filter.'
    : 'No messages. Reports and approval requests from background AI tasks appear here until ' +
      'they expire.',
)

// `mandatory` columns cannot be hidden via the picker. No `sort-field` on the table: the rows
// arrive in the default order, with undecided requests on top.
const ALL_COLUMNS = [
  { id: 'id', field: 'id', label: 'ID', sortable: true, width: 70 },
  {
    id: 'status',
    field: 'statusLabel',
    label: 'Status',
    sortable: true,
    width: 160,
    mandatory: true,
  },
  { id: 'type', field: 'typeLabel', label: 'Type', sortable: true, width: 110 },
  { id: 'title', field: 'title', label: 'Title', sortable: true, width: 320, mandatory: true },
  { id: 'object', field: 'objectName', label: 'Related Object', sortable: true, width: 170 },
  { id: 'created', field: 'creationTime', label: 'Created', sortable: true, width: 110 },
  { id: 'expires', field: 'expirationTime', label: 'Expires', sortable: true, width: 110 },
]

const columnStore = useAiMessageTableStore()
const columns = computed(() => columnStore.shownColumns(ALL_COLUMNS))

const panelOpen = ref(false)
const selectedId = ref(null)

const liveSelected = computed(
  () => allRows.value.find((row) => row.id === selectedId.value) ?? null,
)

// Rows are rebuilt on every refetch, so the panel follows its message by id. One that left the
// list (expired, or deleted by someone else) stays on show until closed, marked unavailable.
const lastSeen = ref(null)
watch(liveSelected, (row) => {
  if (row) lastSeen.value = row
})
const selected = computed(() => liveSelected.value ?? lastSeen.value)

function openMessage(row) {
  if (panelOpen.value && row.id === selectedId.value) {
    panelOpen.value = false
    return
  }
  selectedId.value = row.id
  lastSeen.value = row
  panelOpen.value = true
}

function rowClass(row) {
  return [
    panelOpen.value && row.id === selectedId.value ? 'row--selected' : null,
    isAiMessageUnread(row, now.value) ? 'row--unread' : null,
  ]
}

const { mutate: markOpenedAsRead } = useSetAiMessageStatus()
const { mutateAsync: setStatus, isPending: isSettingStatus } = useSetAiMessageStatus()
const { mutateAsync: removeMessage, isPending: isDeleting } = useDeleteAiMessage()

const isActing = computed(() => isSettingStatus.value || isDeleting.value)

const openMessageId = computed(() => (panelOpen.value ? selectedId.value : null))

let readTimer = null

watch(openMessageId, (id) => {
  clearTimeout(readTimer)
  if (id === null) return
  readTimer = setTimeout(() => {
    if (liveSelected.value?.status === 'pending') {
      markOpenedAsRead({ messageId: id, status: 'read' })
    }
  }, READ_AFTER_MS)
})

onBeforeUnmount(() => {
  clearTimeout(readTimer)
  clearInterval(clock)
})

/**
 * Settled per message: one failure must not stop the rest.
 *
 * @returns {Promise<boolean>} whether every message went through
 */
async function forEachMessage(list, action, failureSummary) {
  const outcomes = await mapConcurrent(list, async (message) => {
    try {
      await action(message)
      return null
    } catch (err) {
      return err
    }
  })
  const failures = outcomes.filter(Boolean)
  if (failures.length) {
    toast.add({
      severity: 'error',
      summary: failureSummary,
      detail: aiMessageErrorDetail(failures[0]),
      life: 5000,
    })
  }
  return failures.length === 0
}

async function decide(message, status) {
  const done = await forEachMessage(
    [message],
    () => setStatus({ messageId: message.id, status }),
    status === 'approved' ? 'Could not approve' : 'Could not reject',
  )
  if (!done) return
  toast.add({
    severity: 'success',
    summary: status === 'approved' ? 'Approved' : 'Rejected',
    detail:
      status === 'approved' && approvalPrompt(message)
        ? 'An AI task will now run in the background.'
        : undefined,
    life: 3000,
  })
}

function markAsRead(list) {
  return forEachMessage(
    list,
    (message) => setStatus({ messageId: message.id, status: 'read' }),
    'Could not mark as read',
  )
}

function confirmDelete(list) {
  const what = list.length === 1 ? `"${list[0].title}"` : `${list.length} messages`
  confirm.require({
    message: `Delete ${what} for everyone who received it? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: async () => {
      await forEachMessage(
        list,
        (message) => removeMessage({ messageId: message.id }),
        'Could not delete',
      )
      if (!liveSelected.value) panelOpen.value = false
    },
  })
}

const selectedRows = computed(() => rows.value.filter((row) => selectedIds.value.has(row.id)))

// A bulk action must not reach rows the filter has hidden, or messages that have gone away.
watch(rows, (list) => {
  if (selectedIds.value.size === 0) return
  const visible = new Set(list.map((row) => row.id))
  const next = new Set([...selectedIds.value].filter((id) => visible.has(id)))
  if (next.size !== selectedIds.value.size) selectedIds.value = next
})

const unreadOf = (list) => list.filter((row) => isAiMessageUnread(row, now.value))
const deletableOf = (list) => list.filter((row) => canDeleteAiMessage(row, can.value))

/** Labels name the count, because only part of a selection may qualify. */
const selectionActions = computed(() => {
  const unread = unreadOf(selectedRows.value)
  const deletable = deletableOf(selectedRows.value)
  return [
    ...(unread.length
      ? [
          {
            label: `Mark as read (${unread.length})`,
            icon: 'pi pi-envelope',
            command: () => markAsRead(unread),
          },
        ]
      : []),
    ...(deletable.length
      ? [
          {
            label: `Delete (${deletable.length})`,
            icon: 'pi pi-trash',
            severity: 'danger',
            command: () => confirmDelete(deletable),
          },
        ]
      : []),
  ]
})

/** Inside a multi-row selection acts on the selection, outside it on the row under the cursor. */
function contextTargets(row) {
  return selectedIds.value.has(row.id) && selectedRows.value.length > 1 ? selectedRows.value : [row]
}

/** Decisions stay one at a time: each one can start a task. */
function menuItemsFor(row) {
  if (!row) return []
  const targets = contextTargets(row)
  const single = targets.length === 1
  const unread = unreadOf(targets)
  const deletable = deletableOf(targets)
  return [
    ...(single && needsDecision(row, now.value)
      ? [
          {
            label: 'Approve',
            icon: 'pi pi-check',
            disabled: isActing.value,
            command: () => decide(row, 'approved'),
          },
          {
            label: 'Reject',
            icon: 'pi pi-times',
            disabled: isActing.value,
            command: () => decide(row, 'rejected'),
          },
        ]
      : []),
    ...(unread.length
      ? [
          {
            label: single ? 'Mark as read' : `Mark as read (${unread.length})`,
            icon: 'pi pi-envelope',
            command: () => markAsRead(unread),
          },
        ]
      : []),
    ...(deletable.length
      ? [
          {
            label: single ? 'Delete' : `Delete (${deletable.length})`,
            icon: 'pi pi-trash',
            command: () => confirmDelete(deletable),
          },
        ]
      : []),
  ]
}

const contextMenu = ref()
const contextMenuItems = computed(() => menuItemsFor(contextMenu.value?.contextData))

function onRowContextMenu({ event, row }) {
  if (menuItemsFor(row).length) contextMenu.value.show(event, row)
}
</script>

<template>
  <div class="ai-tab">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="tab-toolbar">
      <div class="tab-toolbar-filters">
        <SmartFilterInput
          v-model="filterState"
          placeholder="Filter messages..."
          class="filter-input"
        />
        <Select
          v-model="viewFilter"
          :options="VIEW_OPTIONS"
          option-label="label"
          option-value="value"
          aria-label="Show"
          size="small"
          class="view-filter"
        />
      </div>
      <SelectionActions
        :count="selectedRows.length"
        :actions="selectionActions"
        @clear="selectedIds = new Set()"
      />
      <div class="tab-toolbar-actions">
        <span v-if="!isLoading" class="item-count">{{ $plural(rows.length, 'message') }}</span>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          @click="refetch()"
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
      selectable
      :selected-ids="selectedIds"
      :page-size="50"
      :row-class="rowClass"
      storage-key="ai-messages"
      class="items-table"
      reorderable
      @row-click="openMessage"
      @row-contextmenu="onRowContextMenu"
      @selection-change="selectedIds = $event"
      @column-move="columnStore.moveColumn(ALL_COLUMNS, $event)"
      @retry="refetch()"
    >
      <template #cell="{ col, row }">
        <AiIconLabel v-if="col.id === 'status'" :display="row.statusDisplay" />
        <AiIconLabel v-else-if="col.id === 'type'" :display="row.typeDisplay" />
        <span v-else-if="col.id === 'title'" class="item-name">{{ row.title }}</span>
        <!-- Plain text: a click anywhere on the row opens the panel, which links to the object. -->
        <span v-else-if="col.id === 'object'">{{ row.objectName }}</span>
        <span v-else-if="col.id === 'created'" v-tooltip.top="formatDateTime(row.creationTime)">{{
          row.createdAge
        }}</span>
        <span
          v-else-if="col.id === 'expires'"
          v-tooltip.top="formatDateTime(row.expirationTime)"
          :class="{ 'expiry-soon': row.expiringSoon }"
          >{{ row.expiresIn }}</span
        >
        <span v-else-if="col.id === 'id'">{{ row.id }}</span>
      </template>
      <template #empty>
        <div class="table-empty">{{ emptyMessage }}</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />

    <AiMessagePanel
      v-model:visible="panelOpen"
      :message="selected"
      :now="now"
      :pending="isActing"
      :unavailable="selected != null && !liveSelected"
      :can-delete="canDeleteAiMessage(selected, can)"
      @decide="decide(selected, $event)"
      @delete="confirmDelete([selected])"
    />
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

.view-filter {
  width: 170px;
}

.item-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-right: 0.5rem;
  white-space: nowrap;
}

.expiry-soon {
  font-weight: 600;
  color: var(--netxms-status-major);
}

.items-table :deep(.row--unread td),
.items-table :deep(.row--unread .item-name) {
  font-weight: 600;
}
</style>
