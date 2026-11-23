<script setup>
/**
 * Shell for the device tables of a node: those collected by polls (ARP cache, routing table,
 * FDB, radio interfaces, wireless stations) and those read from its agent (processes,
 * services, user sessions, inventories).
 *
 * @slot cell {col: TableColumn, row: Object, filtering: boolean} - Forwarded to AppTable;
 *   `filtering` while the filter box holds text.
 * @slot toolbar - After the filter box.
 * @slot toolbar-end - Right-aligned, before the CSV export button.
 * @event retry - Retry button in the error state, or the toolbar refresh, was clicked.
 */
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import SelectionActions from '@/components/common/SelectionActions.vue'
import { useWorkingState } from '@/composables/useWorkingState'
import { downloadCsv, safeFilename, toCsv } from '@/utils/csvExport'

const props = defineProps({
  /** @type {import('@/components/common/AppTable.vue').TableColumn[]} */
  columns: { type: Array, required: true },
  /** Unfiltered; the filter box is applied here. */
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  isFetching: { type: Boolean, default: false },
  error: { type: [Object, Error], default: null },
  sortField: { type: String, default: null },
  sortOrder: { type: Number, default: 1 },
  filterFields: { type: Array, required: true },
  /**
   * Replaces the substring match over `filterFields` (a tree keeps the ancestors of a match).
   * @type {import('vue').PropType<((rows: object[], text: string) => object[]) | null>}
   */
  filter: { type: Function, default: null },
  filterPlaceholder: { type: String, default: 'Filter...' },
  noun: { type: String, default: 'entry' },
  nounPlural: { type: String, default: 'entries' },
  /** False when the server reported a null timestamp (never collected, not an error). */
  collected: { type: Boolean, default: true },
  notCollectedMessage: { type: String, default: null },
  emptyMessage: { type: String, required: true },
  /** Joined by tabs for "Copy row". */
  copyFields: { type: Array, required: true },
  /** Adds a "Copy MAC address" action. */
  macField: { type: String, default: null },
  /**
   * More copy actions after "Copy row": `{ name: 'Serial number', field: 'serial' }` is
   * "Copy serial number".
   * @type {import('vue').PropType<Array<{ name: string, field: string }>>}
   */
  copyItems: { type: Array, default: () => [] },
  /** Checkbox row selection; `selectionActions` and `menuItems` act on it. */
  selectable: { type: Boolean, default: false },
  /**
   * Buttons shown while rows are selected, in SelectionActions' format.
   * @type {import('vue').PropType<((rows: object[]) => object[]) | null>}
   */
  selectionActions: { type: Function, default: null },
  /**
   * Context menu items ahead of the copy and export items. `targets` is the selection when the
   * clicked row is part of a multi-row selection, otherwise the clicked row alone.
   * @type {import('vue').PropType<((targets: object[], row: object) => object[]) | null>}
   */
  menuItems: { type: Function, default: null },
  // A switch FDB runs to thousands of entries and AppTable renders every row it is given.
  pageSize: { type: Number, default: 50 },
  storageKey: { type: String, default: null },
  /** CSV file name without extension; `storageKey` when omitted. */
  exportName: { type: String, default: null },
})

const emit = defineEmits(['retry'])

const toast = useToast()

const filterText = ref('')

if (props.storageKey) useWorkingState(props.storageKey, { view: { filterText } })

const filtering = computed(() => filterText.value.trim() !== '')

const filteredRows = computed(() => {
  const search = filterText.value.trim().toLowerCase()
  if (props.filter) return props.filter(props.rows, search)
  if (!search) return props.rows
  return props.rows.filter((row) =>
    props.filterFields.some((field) =>
      String(row[field] ?? '')
        .toLowerCase()
        .includes(search),
    ),
  )
})

const selectedIds = ref(new Set())

const selectedRows = computed(() => props.rows.filter((row) => selectedIds.value.has(row.id)))

// A refresh can drop selected rows (an ended process); the selection must not keep them.
watch(
  () => props.rows,
  (rows) => {
    if (!selectedIds.value.size) return
    const present = new Set(rows.map((row) => row.id))
    const kept = [...selectedIds.value].filter((id) => present.has(id))
    if (kept.length !== selectedIds.value.size) selectedIds.value = new Set(kept)
  },
)

function clearSelection() {
  selectedIds.value = new Set()
}

const toolbarActions = computed(() =>
  props.selectionActions && selectedRows.value.length
    ? props.selectionActions(selectedRows.value)
    : [],
)

/** Inside a multi-row selection acts on the selection, outside it on the row under the cursor. */
function menuTargets(row) {
  return selectedIds.value.has(row.id) && selectedRows.value.length > 1 ? selectedRows.value : [row]
}

const contextMenu = ref(null)

function copy(text, what) {
  if (!text) return
  navigator.clipboard.writeText(String(text)).then(() => {
    toast.add({ severity: 'success', summary: `${what} copied`, life: 2000 })
  })
}

const contextMenuItems = computed(() => {
  const row = contextMenu.value?.contextData
  const items = []
  if (props.menuItems && row) {
    const own = props.menuItems(menuTargets(row), row)
    if (own.length) items.push(...own, { separator: true })
  }
  items.push({
    label: 'Copy row',
    icon: 'pi pi-copy',
    command: () => copy(props.copyFields.map((f) => row?.[f] ?? '').join('\t'), 'Row'),
  })
  if (props.macField) {
    items.push({
      label: 'Copy MAC address',
      icon: 'pi pi-copy',
      disabled: !row?.[props.macField],
      command: () => copy(row?.[props.macField], 'MAC address'),
    })
  }
  for (const { name, field } of props.copyItems) {
    items.push({
      label: `Copy ${name.toLowerCase()}`,
      icon: 'pi pi-copy',
      disabled: row?.[field] == null || row?.[field] === '',
      command: () => copy(row?.[field], name),
    })
  }
  items.push(
    { separator: true },
    { label: 'Export to CSV', icon: 'pi pi-file-export', command: exportCsv },
  )
  return items
})

const tableRef = ref(null)

/** Every filtered row in the table's sort order, as legacy's ExportToCsvAction. */
function exportCsv() {
  const rows = tableRef.value?.sortedRows ?? filteredRows.value
  const columns = props.columns.filter((col) => col.field)
  downloadCsv(safeFilename(props.exportName ?? props.storageKey), toCsv(rows, columns))
}

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

defineExpose({ clearSelection })
</script>

<template>
  <div class="node-table-view">
    <RefetchIndicator :is-fetching="isFetching && !loading" />

    <div class="node-table-toolbar">
      <IconField class="node-table-filter">
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filterText"
          data-filter-input
          :placeholder="filterPlaceholder"
          class="filter-input"
        />
      </IconField>
      <slot name="toolbar" />
      <span v-if="!loading" class="node-table-count">
        {{ $plural(filteredRows.length, noun, nounPlural) }}
      </span>
      <SelectionActions
        v-if="selectable && selectionActions"
        :count="selectedRows.length"
        :actions="toolbarActions"
        @clear="clearSelection"
      />
      <div class="node-table-end">
        <slot name="toolbar-end" />
        <Button
          v-tooltip.bottom="'Export to CSV'"
          icon="pi pi-file-export"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Export to CSV"
          :disabled="loading || !filteredRows.length"
          @click="exportCsv"
        />
      </div>
    </div>

    <AppTable
      ref="tableRef"
      :columns="columns"
      :rows="filteredRows"
      :loading="loading"
      :error="error"
      :sort-field="sortField"
      :sort-order="sortOrder"
      :page-size="pageSize"
      :page-size-options="[25, 50, 100, 200, 500]"
      :storage-key="storageKey"
      :selectable="selectable"
      :selected-ids="selectedIds"
      auto-width
      striped
      size="small"
      class="node-table"
      @selection-change="selectedIds = $event"
      @row-contextmenu="onRowContextMenu"
      @retry="emit('retry')"
    >
      <template #cell="slotProps">
        <slot name="cell" v-bind="slotProps" :filtering="filtering" />
      </template>
      <template #empty>
        <div class="empty-message">{{ collected ? emptyMessage : notCollectedMessage }}</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>
</template>

<style scoped>
.node-table-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.node-table-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.node-table-filter {
  flex: 0 1 300px;
  min-width: 8rem;
}

.filter-input {
  width: 100%;
}

.node-table-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.node-table-end {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
}

.node-table {
  flex: 1;
  min-height: 0;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}
</style>
