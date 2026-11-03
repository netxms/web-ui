<script setup>
import { ref, computed } from 'vue'
import Button from 'primevue/button'
import AppTable from '@/components/common/AppTable.vue'
import Skeleton from 'primevue/skeleton'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import SummaryTableDetailView from '@/components/summary-tables/SummaryTableDetailView.vue'
import {
  useSummaryTables,
  useSummaryTable,
  useDeleteSummaryTable,
  useCreateSummaryTable,
} from '@/queries/useSummaryTableQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'

const confirm = useConfirm()
const toast = useToast()

const { entityId, isDetailView, detailTarget, openDetail, closeDetail } = useEntityDetail()

const isNewTable = computed(() => entityId.value === 'new')

const { data: tablesData, isLoading, isFetching, isError, error, refetch } = useSummaryTables()
const tables = computed(() => tablesData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('dci-summary-tables', { view: { filterState } })
const filteredTables = computed(() => {
  if (!filterState.value.text) return tables.value
  const search = filterState.value.text.toLowerCase()
  return tables.value.filter(
    (t) =>
      (t.title ?? '').toLowerCase().includes(search) ||
      (t.menuPath ?? '').toLowerCase().includes(search),
  )
})

function onRowClick(row) {
  openDetail(row.id)
}

const contextMenu = ref()

const { mutate: deleteTable } = useDeleteSummaryTable()
const { mutate: cloneTable } = useCreateSummaryTable()

const contextMenuItems = computed(() => {
  const data = contextMenu.value?.contextData
  return [
    {
      label: 'Edit',
      icon: 'pi pi-pencil',
      command: () => openDetail(data.id),
    },
    {
      label: 'Clone',
      icon: 'pi pi-copy',
      command: () => confirmClone(data),
    },
    { separator: true },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      command: () => confirmDelete(data),
    },
  ]
})

function confirmDelete(table) {
  confirm.require({
    message: `Delete summary table "${table.title || table.menuPath}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Delete',
    acceptClass: 'p-button-danger',
    accept: () => {
      deleteTable(table.id, {
        onSuccess: () => {
          toast.add({
            severity: 'success',
            summary: 'Deleted',
            detail: `Summary table "${table.title || table.menuPath}" deleted.`,
            life: 3000,
          })
        },
        onError: (err) => {
          toast.add({
            severity: 'error',
            summary: 'Delete Failed',
            detail: err.message ?? 'Failed to delete summary table.',
            life: 5000,
          })
        },
      })
    },
  })
}

function confirmClone(listEntry) {
  const fullDetail = tableDetail.value
  const source =
    fullDetail?.id === listEntry.id
      ? fullDetail
      : { title: listEntry.title, menuPath: listEntry.menuPath, flags: listEntry.flags }

  const data = {
    title: `${source.title || source.menuPath || 'Summary Table'} (copy)`,
    menuPath: source.menuPath || undefined,
    nodeFilter: source.nodeFilter || undefined,
    flags: source.flags ?? 0,
    tableDciName: source.tableDciName || undefined,
    columns: source.columns ? source.columns.map((c) => ({ ...c })) : undefined,
  }

  cloneTable(data, {
    onSuccess: (res) => {
      toast.add({
        severity: 'success',
        summary: 'Cloned',
        detail: `Summary table cloned as "${data.title}".`,
        life: 3000,
      })
      if (res?.id) openDetail(res.id)
    },
    onError: (err) => {
      toast.add({
        severity: 'error',
        summary: 'Clone Failed',
        detail: err.message ?? 'Failed to clone summary table.',
        life: 5000,
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

const columns = [
  { id: 'title', field: 'title', label: 'Title', sortable: true, width: 220 },
  { id: 'menuPath', field: 'menuPath', label: 'Menu Path', sortable: true, width: 220 },
  { id: 'actions', field: 'actions', label: '', width: 48 },
]

const tableDetailId = computed(() =>
  isDetailView.value && !isNewTable.value ? entityId.value : null,
)
const {
  data: tableDetail,
  isLoading: isDetailLoading,
  isError: isDetailError,
  error: detailError,
  refetch: refetchDetail,
} = useSummaryTable(tableDetailId)
</script>

<template>
  <div v-if="isDetailView" class="summary-tables-detail">
    <SummaryTableDetailView v-if="isNewTable" :table="null" @close="closeDetail" />

    <template v-else>
      <div v-if="isDetailLoading" class="detail-loading">
        <Skeleton height="1.5rem" width="40%" class="mb-3" />
        <Skeleton height="1rem" width="60%" class="mb-2" />
        <Skeleton height="1rem" width="55%" class="mb-2" />
      </div>
      <SummaryTableDetailView
        v-else-if="tableDetail"
        :table="tableDetail"
        @close="closeDetail"
        @saved="() => {}"
      />
      <QueryErrorState v-else-if="isDetailError" :error="detailError" @retry="refetchDetail" />
    </template>
  </div>

  <!-- Kept mounted to preserve paginator state -->
  <div v-show="!isDetailView" class="summary-tables-section">
    <SectionHeader title="DCI Summary Tables" icon="pi pi-table">
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
          label="New Summary Table"
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
        placeholder="Filter summary tables..."
        class="filter-input"
      />
      <span v-if="!isLoading" class="item-count">{{
        $plural(filteredTables.length, 'table')
      }}</span>
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 8" :key="i" height="2rem" class="mb-2" />
    </div>

    <AppTable
      v-else
      :columns="columns"
      :rows="filteredTables"
      :error="isError ? error : null"
      striped
      column-borders
      resize-fit
      sort-field="title"
      :sort-order="1"
      :page-size="50"
      storage-key="dci-summary-tables"
      class="tables-table"
      :target-for="(row) => detailTarget(row.id)"
      @row-click="onRowClick"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <span v-if="col.id === 'title'" class="table-name">{{ row.title || '-' }}</span>
        <span v-else-if="col.id === 'menuPath'" :class="{ 'text-muted': !row.menuPath }">
          {{ row.menuPath || '-' }}
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
        <div class="empty-message">No DCI summary tables found.</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>
</template>

<style scoped>
.summary-tables-section,
.summary-tables-detail {
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

.section-loading,
.detail-loading {
  padding: 1rem;
}

.tables-table {
  flex: 1;
  min-height: 0;
}

.tables-table :deep(.app-table tbody tr) {
  cursor: pointer;
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

.table-name {
  font-weight: 500;
}

.text-muted {
  color: var(--p-text-muted-color);
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}
</style>
