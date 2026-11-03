<script setup>
import { ref, computed, watch } from 'vue'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import PersistentStorageEntryDialog from '@/components/persistent-storage/PersistentStorageEntryDialog.vue'
import {
  usePersistentStorage,
  useSetPersistentStorageEntry,
  useDeletePersistentStorageEntry,
} from '@/queries/usePersistentStorageQueries'
import { isAddressableKey } from '@/utils/persistentStorage'
import { toCsv, downloadCsv } from '@/utils/csvExport'
import { useWorkingState } from '@/composables/useWorkingState'

/**
 * Unlike legacy, delete asks first, and entries whose key cannot be addressed on its own (see
 * `isAddressableKey`) are read-only instead of failing when edited.
 */

const confirm = useConfirm()
const toast = useToast()

const { data: entriesData, isLoading, isFetching, isError, error, refetch } = usePersistentStorage()

const entries = computed(() => entriesData.value ?? [])
const existingKeys = computed(() => entries.value.map((e) => e.key))

const plural = (count) => `${count} ${count === 1 ? 'entry' : 'entries'}`

const filterState = ref({ text: '', tokens: [] })

const filteredEntries = computed(() => {
  const search = filterState.value.text.toLowerCase()
  if (!search) return entries.value
  return entries.value.filter(
    (e) => e.key.toLowerCase().includes(search) || e.value.toLowerCase().includes(search),
  )
})

const selectedKeys = ref(new Set())

useWorkingState('persistent-storage', { view: { filterState }, object: { selectedKeys } })

const selectedEntries = computed(() =>
  filteredEntries.value.filter((e) => selectedKeys.value.has(e.key)),
)

// A bulk action must not reach rows the filter has hidden since they were selected.
watch(filteredEntries, (visibleEntries) => {
  if (selectedKeys.value.size === 0) return
  const visible = new Set(visibleEntries.map((e) => e.key))
  const next = new Set([...selectedKeys.value].filter((key) => visible.has(key)))
  if (next.size !== selectedKeys.value.size) selectedKeys.value = next
})

function clearSelection() {
  selectedKeys.value = new Set()
}

const { mutate: setEntry, isPending: isSaving } = useSetPersistentStorageEntry()
const { mutate: deleteEntry } = useDeletePersistentStorageEntry()

const dialogVisible = ref(false)
const editingEntry = ref(null)
const dialogError = ref(null)

function openCreate() {
  editingEntry.value = null
  dialogError.value = null
  dialogVisible.value = true
}

function openEdit(entry) {
  if (!isAddressableKey(entry.key)) return
  editingEntry.value = entry
  dialogError.value = null
  dialogVisible.value = true
}

function onDialogSave({ key, value }) {
  dialogError.value = null
  setEntry(
    { key, value },
    {
      onSuccess: () => {
        dialogVisible.value = false
        toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: `Entry "${key}" saved.`,
          life: 3000,
        })
      },
      onError: (err) => {
        dialogError.value = err.message ?? 'Failed to save entry.'
      },
    },
  )
}

function confirmDelete(targets) {
  const deletable = targets.filter((e) => isAddressableKey(e.key))
  if (deletable.length === 0) return
  const skipped = targets.length - deletable.length

  let message =
    deletable.length === 1
      ? `Delete entry "${deletable[0].key}"? This cannot be undone.`
      : `Delete ${plural(deletable.length)}? This cannot be undone.`
  if (skipped > 0) {
    message += ` ${plural(skipped)} with a read-only key will be left in place.`
  }

  confirm.require({
    message,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      for (const entry of deletable) {
        deleteEntry(entry.key, {
          onError: (err) => {
            toast.add({
              severity: 'error',
              summary: 'Delete Failed',
              detail: err.message ?? `Failed to delete "${entry.key}".`,
              life: 5000,
            })
          },
        })
      }
      clearSelection()
    },
  })
}

const CSV_COLUMNS = [
  { field: 'key', label: 'Key' },
  { field: 'value', label: 'Value' },
]

function exportCsv(rows, filename) {
  downloadCsv(filename, toCsv(rows, CSV_COLUMNS))
}

const contextMenu = ref()

/** Inside a multi-row selection acts on the selection, outside it on the row under the cursor. */
function contextTargets() {
  const row = contextMenu.value?.contextData
  if (!row) return []
  return selectedKeys.value.has(row.key) && selectedEntries.value.length > 1
    ? selectedEntries.value
    : [row]
}

const contextMenuItems = computed(() => {
  const row = contextMenu.value?.contextData
  const multiple = selectedKeys.value.has(row?.key) && selectedEntries.value.length > 1
  const targets = contextTargets()
  const suffix = multiple ? ` (${targets.length})` : ''

  return [
    {
      label: 'Edit...',
      icon: 'pi pi-pencil',
      disabled: multiple || !row || !isAddressableKey(row.key),
      command: () => openEdit(row),
    },
    {
      label: `Delete${suffix}`,
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      disabled: !targets.some((e) => isAddressableKey(e.key)),
      command: () => confirmDelete(contextTargets()),
    },
    { separator: true },
    {
      label: `Export selected to CSV${suffix}`,
      icon: 'pi pi-file-export',
      command: () => exportCsv(contextTargets(), 'persistent-storage-selected'),
    },
    {
      label: 'Export all to CSV',
      icon: 'pi pi-file-export',
      command: () => exportCsv(filteredEntries.value, 'persistent-storage'),
    },
  ]
})

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

function onActionsClick(event, row) {
  contextMenu.value.show(event, row)
}

const columns = [
  { id: 'key', field: 'key', label: 'Key', sortable: true, width: 280 },
  { id: 'value', field: 'value', label: 'Value', sortable: true, width: 520 },
  { id: 'actions', field: null, label: '', width: 48 },
]

function rowClass(row) {
  return isAddressableKey(row.key) ? null : 'entry-readonly'
}

const selectionDeletable = computed(() =>
  selectedEntries.value.some((e) => isAddressableKey(e.key)),
)
</script>

<template>
  <div class="persistent-storage-section">
    <SectionHeader title="Persistent Storage" icon="pi pi-database">
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
          v-tooltip.bottom="'Export to CSV'"
          icon="pi pi-file-export"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Export to CSV"
          :disabled="isLoading || filteredEntries.length === 0"
          @click="exportCsv(filteredEntries, 'persistent-storage')"
        />
        <Button
          label="Create Entry"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openCreate"
        />
      </template>
    </SectionHeader>

    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="section-toolbar">
      <SmartFilterInput
        v-model="filterState"
        placeholder="Filter by key or value..."
        class="filter-input"
      />
      <span v-if="!isLoading" class="item-count">{{ plural(filteredEntries.length) }}</span>
    </div>

    <div v-if="selectedEntries.length" class="selection-bar">
      <span class="selection-count">{{ plural(selectedEntries.length) }} selected</span>
      <Button
        label="Delete"
        icon="pi pi-trash"
        size="small"
        severity="danger"
        outlined
        :disabled="!selectionDeletable"
        @click="confirmDelete(selectedEntries)"
      />
      <Button
        label="Export"
        icon="pi pi-file-export"
        size="small"
        severity="secondary"
        outlined
        @click="exportCsv(selectedEntries, 'persistent-storage-selected')"
      />
      <Button label="Clear" size="small" text severity="secondary" @click="clearSelection" />
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 12" :key="i" height="2rem" class="mb-2" />
    </div>

    <QueryErrorState v-else-if="isError" :error="error" class="section-error" @retry="refetch" />

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredEntries"
      :row-class="rowClass"
      striped
      column-borders
      resize-fit
      selectable
      :selected-ids="selectedKeys"
      sort-field="key"
      :sort-order="1"
      :page-size="50"
      storage-key="persistent-storage"
      class="entries-table"
      @selection-change="selectedKeys = $event"
      @row-click="openEdit"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <span v-if="col.id === 'key'" class="entry-key">
          <i
            v-if="!isAddressableKey(row.key)"
            v-tooltip.top="
              'Read-only: this key cannot be used in a request URL, so only scripts can change it'
            "
            class="pi pi-lock readonly-icon"
            aria-label="Read-only"
          />
          {{ row.key }}
        </span>
        <span
          v-else-if="col.id === 'value'"
          class="entry-value"
          :class="{ 'text-muted': !row.value }"
        >
          {{ row.value || '-' }}
        </span>
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
        <div v-if="entries.length === 0" class="empty-message">
          No persistent storage entries. Scripts create them with
          <code>WritePersistentStorage()</code>, event processing rules with their Persistent
          Storage action.
        </div>
        <div v-else class="empty-message">No entries match the current filter.</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />

    <PersistentStorageEntryDialog
      v-model:visible="dialogVisible"
      :entry="editingEntry"
      :saving="isSaving"
      :error="dialogError"
      :existing-keys="existingKeys"
      @save="onDialogSave"
    />
  </div>
</template>

<style scoped>
.persistent-storage-section {
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
  width: 340px;
}

.item-count {
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
}

.selection-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-right: 0.25rem;
}

.section-loading {
  padding: 1rem;
}

.section-error {
  justify-content: center;
  padding: 4rem 2rem;
}

.entries-table {
  flex: 1;
  min-height: 0;
}

.entries-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.entries-table :deep(.app-table tbody tr.entry-readonly) {
  cursor: default;
}

.entry-key {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.readonly-icon {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.entry-value {
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.text-muted {
  color: var(--p-text-muted-color);
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}
</style>
