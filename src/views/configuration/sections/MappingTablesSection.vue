<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import EntityListSection from '@/components/layout/EntityListSection.vue'
import EntityDetailState from '@/components/layout/EntityDetailState.vue'
import MappingTableDetailView from '@/components/mapping-tables/MappingTableDetailView.vue'
import {
  useMappingTables,
  useMappingTable,
  useDeleteMappingTable,
} from '@/queries/useMappingTableQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'
import { FLAG_NUMERIC_KEYS } from '@/utils/mappingTables'

/**
 * Properties is not a separate dialog as in legacy: name, description and the numeric-keys flag
 * are edited with the entries (see `MappingTableDetailView`).
 */

const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

const { entityId, isDetailView, detailTarget, openDetail, closeDetail } = useEntityDetail()

const isNewTable = computed(() => entityId.value === 'new')

const { data: tablesData, isLoading, isFetching, isError, error, refetch } = useMappingTables()
const tables = computed(() => tablesData.value ?? [])

const filterState = ref({ text: '', tokens: [] })
const filteredTables = computed(() => {
  const search = filterState.value.text.toLowerCase()
  if (!search) return tables.value
  return tables.value.filter(
    (t) => t.name.toLowerCase().includes(search) || t.description.toLowerCase().includes(search),
  )
})

const isNumeric = (table) => !!(table.flags & FLAG_NUMERIC_KEYS)

const columns = [
  { id: 'id', field: 'id', label: 'ID', sortable: true, width: 80 },
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 220 },
  { id: 'flags', field: 'flags', label: 'Keys', sortable: true, width: 100 },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 420 },
  { id: 'actions', field: null, label: '', width: 48 },
]

const selectedIds = ref(new Set())

useWorkingState('mapping-tables', { view: { filterState }, object: { selectedIds } })
const selectedTables = computed(() =>
  filteredTables.value.filter((t) => selectedIds.value.has(t.id)),
)

watch(filteredTables, (visibleTables) => {
  if (selectedIds.value.size === 0) return
  const visible = new Set(visibleTables.map((t) => t.id))
  const next = new Set([...selectedIds.value].filter((id) => visible.has(id)))
  if (next.size !== selectedIds.value.size) selectedIds.value = next
})

const { mutateAsync: deleteTable } = useDeleteMappingTable()

function confirmDelete(targets) {
  confirm.require({
    message:
      targets.length === 1
        ? `Delete mapping table "${targets[0].name}"? This cannot be undone.`
        : `Delete ${targets.length} mapping tables? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      // One observer runs every delete and keeps only the last call's callbacks, so each
      // failure is caught on its own promise.
      for (const table of targets) {
        deleteTable(table.id).catch((err) => {
          toast.add({
            severity: 'error',
            summary: 'Delete Failed',
            detail: err.message ?? `Failed to delete "${table.name}".`,
            life: 5000,
          })
        })
      }
      selectedIds.value = new Set()
    },
  })
}

function menuItems(row) {
  const multiple = selectedIds.value.has(row.id) && selectedTables.value.length > 1
  return [
    {
      label: 'Edit',
      icon: 'pi pi-pencil',
      disabled: multiple,
      command: () => openDetail(row.id),
    },
    { separator: true },
    {
      label: multiple ? `Delete (${selectedTables.value.length})` : 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      command: () => confirmDelete(multiple ? selectedTables.value : [row]),
    },
  ]
}

const tableDetailId = computed(() => {
  if (!isDetailView.value || isNewTable.value) return null
  const id = Number(entityId.value)
  return Number.isInteger(id) && id > 0 ? id : null
})

const {
  data: tableDetail,
  isLoading: isDetailLoading,
  error: detailError,
  refetch: refetchDetail,
} = useMappingTable(tableDetailId)

// Replace rather than push: Back should return to the list, not to an empty "new" form.
function onCreated(id) {
  router.replace(detailTarget(id))
}
</script>

<template>
  <EntityListSection
    v-model:filter="filterState"
    :detail="isDetailView"
    title="Mapping Tables"
    icon="pi pi-arrow-right-arrow-left"
    add-label="New Mapping Table"
    filter-placeholder="Filter mapping tables..."
    count-noun="table"
    :columns="columns"
    :rows="filteredTables"
    :loading="isLoading"
    :fetching="isFetching"
    :error="isError ? error : null"
    :menu-items="menuItems"
    selectable
    :selected-ids="selectedIds"
    sort-field="name"
    :sort-order="1"
    storage-key="mapping-tables"
    :target-for="(row) => detailTarget(row.id)"
    @selection-change="selectedIds = $event"
    @refresh="refetch"
    @add="openDetail('new')"
    @row-click="(row) => openDetail(row.id)"
  >
    <template #detail>
      <MappingTableDetailView
        v-if="isNewTable"
        :table="null"
        @close="closeDetail"
        @created="onCreated"
      />
      <MappingTableDetailView
        v-else-if="tableDetail && tableDetail.id === tableDetailId"
        :key="tableDetailId"
        :table="tableDetail"
        @close="closeDetail"
      />
      <EntityDetailState
        v-else
        :loading="isDetailLoading"
        :error="detailError"
        not-found-text="Mapping table not found."
        @back="closeDetail"
        @retry="refetchDetail"
      />
    </template>

    <template #before-table>
      <div v-if="selectedTables.length" class="selection-bar">
        <span class="selection-count">{{ $plural(selectedTables.length, 'table') }} selected</span>
        <Button
          label="Delete"
          icon="pi pi-trash"
          size="small"
          severity="danger"
          outlined
          @click="confirmDelete(selectedTables)"
        />
        <Button
          label="Clear"
          size="small"
          text
          severity="secondary"
          @click="selectedIds = new Set()"
        />
      </div>
    </template>

    <template #cell="{ col, row }">
      <span v-if="col.id === 'id'" class="text-muted">{{ row.id }}</span>
      <span v-else-if="col.id === 'name'" class="table-name">{{ row.name }}</span>
      <Tag
        v-else-if="col.id === 'flags' && isNumeric(row)"
        value="Numeric"
        severity="info"
        outlined
      />
      <span v-else-if="col.id === 'flags'" class="text-muted">Text</span>
      <span v-else-if="col.id === 'description'" :class="{ 'text-muted': !row.description }">
        {{ row.description || '-' }}
      </span>
    </template>

    <template #empty>
      <template v-if="tables.length === 0">
        No mapping tables. They translate raw values into readable ones, for NXSL
        <code>map()</code> and for DCI value display.
      </template>
      <template v-else>No mapping tables match the current filter.</template>
    </template>
  </EntityListSection>
</template>

<style scoped>
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

.table-name {
  font-weight: 500;
}

.text-muted {
  color: var(--p-text-muted-color);
}
</style>
