<script setup>
import EntityListSection from '@/components/layout/EntityListSection.vue'
import EntityDetailState from '@/components/layout/EntityDetailState.vue'
import { useConfirmDelete } from '@/composables/useConfirmDelete'
import { ref, computed } from 'vue'
import { useToast } from 'primevue/usetoast'
import SummaryTableDetailView from '@/components/summary-tables/SummaryTableDetailView.vue'
import {
  useSummaryTables,
  useSummaryTable,
  useDeleteSummaryTable,
  useCreateSummaryTable,
} from '@/queries/useSummaryTableQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'

const confirmDelete = useConfirmDelete()
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

const { mutateAsync: deleteTable } = useDeleteSummaryTable()
const { mutate: cloneTable } = useCreateSummaryTable()

function menuItems(table) {
  return [
    { label: 'Edit', icon: 'pi pi-pencil', command: () => openDetail(table.id) },
    { label: 'Clone', icon: 'pi pi-copy', command: () => confirmClone(table) },
    { separator: true },
    {
      label: 'Delete',
      icon: 'pi pi-trash',
      class: 'p-menuitem-danger',
      command: () => onDelete(table),
    },
  ]
}

function onDelete(table) {
  confirmDelete({
    message: `Delete summary table "${table.title || table.menuPath}"? This cannot be undone.`,
    run: () => deleteTable(table.id),
    successDetail: `Summary table "${table.title || table.menuPath}" deleted.`,
    failureDetail: 'Failed to delete summary table.',
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
  error: detailError,
  refetch: refetchDetail,
} = useSummaryTable(tableDetailId)
</script>

<template>
  <EntityListSection
    v-model:filter="filterState"
    :detail="isDetailView"
    title="DCI Summary Tables"
    icon="pi pi-table"
    add-label="New Summary Table"
    filter-placeholder="Filter summary tables..."
    count-noun="table"
    :columns="columns"
    :rows="filteredTables"
    :loading="isLoading"
    :fetching="isFetching"
    :error="isError ? error : null"
    empty-text="No DCI summary tables found."
    :menu-items="menuItems"
    sort-field="title"
    :sort-order="1"
    storage-key="dci-summary-tables"
    :target-for="(row) => detailTarget(row.id)"
    @refresh="refetch"
    @add="() => openDetail('new')"
    @row-click="(row) => openDetail(row.id)"
  >
    <template #detail>
      <SummaryTableDetailView v-if="isNewTable" :table="null" @close="closeDetail" />
      <SummaryTableDetailView
        v-else-if="!isDetailLoading && tableDetail"
        :table="tableDetail"
        @close="closeDetail"
      />
      <EntityDetailState
        v-else
        :loading="isDetailLoading"
        :error="detailError"
        not-found-text="Summary table not found."
        @back="closeDetail"
        @retry="refetchDetail"
      />
    </template>

    <template #cell="{ col, row }">
      <span v-if="col.id === 'title'" class="table-name">{{ row.title || '-' }}</span>
      <span v-else-if="col.id === 'menuPath'" :class="{ 'text-muted': !row.menuPath }">
        {{ row.menuPath || '-' }}
      </span>
    </template>
  </EntityListSection>
</template>

<style scoped>
.table-name {
  font-weight: 500;
}

.text-muted {
  color: var(--p-text-muted-color);
}
</style>
