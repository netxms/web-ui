<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
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

const { mutate: deleteTable } = useDeleteMappingTable()

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
      for (const table of targets) {
        deleteTable(table.id, {
          onError: (err) => {
            toast.add({
              severity: 'error',
              summary: 'Delete Failed',
              detail: err.message ?? `Failed to delete "${table.name}".`,
              life: 5000,
            })
          },
        })
      }
      selectedIds.value = new Set()
    },
  })
}

const contextMenu = ref()

function contextTargets() {
  const row = contextMenu.value?.contextData
  if (!row) return []
  return selectedIds.value.has(row.id) && selectedTables.value.length > 1
    ? selectedTables.value
    : [row]
}

const contextMenuItems = computed(() => {
  const row = contextMenu.value?.contextData
  const multiple = selectedIds.value.has(row?.id) && selectedTables.value.length > 1
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
      command: () => confirmDelete(contextTargets()),
    },
  ]
})

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

const tableDetailId = computed(() => {
  if (!isDetailView.value || isNewTable.value) return null
  const id = Number(entityId.value)
  return Number.isInteger(id) && id > 0 ? id : null
})

const {
  data: tableDetail,
  isLoading: isDetailLoading,
  isError: isDetailError,
  error: detailError,
  refetch: refetchDetail,
} = useMappingTable(tableDetailId)

// Replace rather than push: Back should return to the list, not to an empty "new" form.
function onCreated(id) {
  router.replace(detailTarget(id))
}
</script>

<template>
  <div v-if="isDetailView" class="mapping-tables-detail">
    <MappingTableDetailView
      v-if="isNewTable"
      :table="null"
      @close="closeDetail"
      @created="onCreated"
    />

    <template v-else>
      <MappingTableDetailView
        v-if="tableDetail && tableDetail.id === tableDetailId"
        :key="tableDetailId"
        :table="tableDetail"
        @close="closeDetail"
      />

      <template v-else-if="isDetailLoading">
        <EntityDetailHeader title="Loading..." @back="closeDetail" />
        <div class="detail-loading">
          <Skeleton height="1.5rem" width="40%" class="mb-3" />
          <Skeleton height="1rem" width="60%" class="mb-2" />
          <Skeleton height="1rem" width="55%" class="mb-2" />
        </div>
      </template>

      <template v-else-if="isDetailError">
        <EntityDetailHeader title="Error" @back="closeDetail" />
        <div class="detail-message">
          <QueryErrorState :error="detailError" @retry="refetchDetail" />
        </div>
      </template>

      <template v-else>
        <EntityDetailHeader title="Not Found" @back="closeDetail" />
        <div class="detail-message">
          <p class="empty-message">Mapping table not found.</p>
        </div>
      </template>
    </template>
  </div>

  <!-- Kept mounted to preserve paginator state -->
  <div v-show="!isDetailView" class="mapping-tables-section">
    <SectionHeader title="Mapping Tables" icon="pi pi-arrow-right-arrow-left">
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
          label="New Mapping Table"
          icon="pi pi-plus"
          size="small"
          severity="primary"
          @click="openDetail('new')"
        />
      </template>
    </SectionHeader>

    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="section-toolbar">
      <SmartFilterInput
        v-model="filterState"
        placeholder="Filter mapping tables..."
        class="filter-input"
      />
      <span v-if="!isLoading" class="item-count">
        {{ $plural(filteredTables.length, 'table') }}
      </span>
    </div>

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

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 8" :key="i" height="2rem" class="mb-2" />
    </div>

    <QueryErrorState v-else-if="isError" :error="error" class="section-error" @retry="refetch" />

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredTables"
      striped
      column-borders
      resize-fit
      selectable
      :selected-ids="selectedIds"
      sort-field="name"
      :sort-order="1"
      :page-size="50"
      storage-key="mapping-tables"
      class="tables-table"
      :target-for="(row) => detailTarget(row.id)"
      @selection-change="selectedIds = $event"
      @row-click="(row) => openDetail(row.id)"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
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
        <Button
          v-else-if="col.id === 'actions'"
          icon="pi pi-ellipsis-v"
          text
          rounded
          severity="secondary"
          size="small"
          class="row-action-btn"
          aria-label="Actions"
          @click.stop="onRowContextMenu({ event: $event, row })"
        />
      </template>
      <template #empty>
        <div v-if="tables.length === 0" class="empty-message">
          No mapping tables. They translate raw values into readable ones, for NXSL
          <code>map()</code> and for DCI value display.
        </div>
        <div v-else class="empty-message">No mapping tables match the current filter.</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>
</template>

<style scoped>
.mapping-tables-section,
.mapping-tables-detail {
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
  width: 300px;
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

.section-loading,
.detail-loading {
  padding: 1rem;
}

.section-error {
  justify-content: center;
  padding: 4rem 2rem;
}

.detail-message {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.tables-table {
  flex: 1;
  min-height: 0;
}

.tables-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.table-name {
  font-weight: 500;
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
