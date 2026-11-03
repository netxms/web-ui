<script setup>
/**
 * Shell for the read-only device tables collected by polls (ARP cache, routing table, FDB,
 * radio interfaces, wireless stations).
 *
 * @slot cell {col: TableColumn, row: Object} - Forwarded to AppTable.
 * @event retry - Retry button in the error state, or the toolbar refresh, was clicked.
 */
import { computed, ref } from 'vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import { useWorkingState } from '@/composables/useWorkingState'

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
  // A switch FDB runs to thousands of entries and AppTable renders every row it is given.
  pageSize: { type: Number, default: 50 },
  storageKey: { type: String, default: null },
})

const emit = defineEmits(['retry'])

const toast = useToast()

const filterText = ref('')

if (props.storageKey) useWorkingState(props.storageKey, { view: { filterText } })

const filteredRows = computed(() => {
  const search = filterText.value.trim().toLowerCase()
  if (!search) return props.rows
  return props.rows.filter((row) =>
    props.filterFields.some((field) =>
      String(row[field] ?? '')
        .toLowerCase()
        .includes(search),
    ),
  )
})

const contextMenu = ref(null)

function copy(text, what) {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    toast.add({ severity: 'success', summary: `${what} copied`, life: 2000 })
  })
}

const contextMenuItems = computed(() => {
  const row = contextMenu.value?.contextData
  const items = [
    {
      label: 'Copy row',
      icon: 'pi pi-copy',
      command: () => copy(props.copyFields.map((f) => row?.[f] ?? '').join('\t'), 'Row'),
    },
  ]
  if (props.macField) {
    items.push({
      label: 'Copy MAC address',
      icon: 'pi pi-copy',
      disabled: !row?.[props.macField],
      command: () => copy(row?.[props.macField], 'MAC address'),
    })
  }
  return items
})

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}
</script>

<template>
  <div class="node-table-view">
    <RefetchIndicator :is-fetching="isFetching && !loading" />

    <div class="node-table-toolbar">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filterText"
          data-filter-input
          :placeholder="filterPlaceholder"
          class="filter-input"
        />
      </IconField>
      <span v-if="!loading" class="node-table-count">
        {{ $plural(filteredRows.length, noun, nounPlural) }}
      </span>
    </div>

    <AppTable
      :columns="columns"
      :rows="filteredRows"
      :loading="loading"
      :error="error"
      :sort-field="sortField"
      :sort-order="sortOrder"
      :page-size="pageSize"
      :page-size-options="[25, 50, 100, 200, 500]"
      :storage-key="storageKey"
      auto-width
      striped
      size="small"
      class="node-table"
      @row-contextmenu="onRowContextMenu"
      @retry="emit('retry')"
    >
      <template #cell="slotProps">
        <slot name="cell" v-bind="slotProps" />
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

.filter-input {
  width: 300px;
}

.node-table-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
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
