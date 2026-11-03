<script setup>
import { computed } from 'vue'
import AppTable from '@/components/common/AppTable.vue'
import LogCell from './LogCell.vue'
import { COLUMN_KIND, getColumnKind, getColumnLabel } from '@/utils/logColumnTypes'
import { isArriving } from '@/utils/logArrival'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  resolver: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  selectable: { type: Boolean, default: false },
  /**
   * Rows rendered at once; `rows` accumulates every fetched page. No `storage-key`: the caller
   * already stores the page size and gets changes through `page-size-change`.
   */
  pageSize: { type: Number, default: 250 },
  /** By column name; reported back through `column-resize`. */
  columnWidths: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['select', 'column-resize', 'page-size-change'])

function rowClass(row) {
  return isArriving(row) ? 'log-row--arriving' : null
}

const WIDTH_BY_KIND = {
  [COLUMN_KIND.TIME]: 170,
  [COLUMN_KIND.SEVERITY]: 110,
  [COLUMN_KIND.OBJECT]: 170,
  [COLUMN_KIND.USER]: 130,
  [COLUMN_KIND.EVENT]: 180,
  [COLUMN_KIND.ZONE]: 120,
  [COLUMN_KIND.CODED]: 130,
  [COLUMN_KIND.NUMERIC]: 100,
  [COLUMN_KIND.MAC]: 150,
  [COLUMN_KIND.JSON]: 260,
  [COLUMN_KIND.TEXT]: 260,
}

const tableColumns = computed(() =>
  props.columns.map((column) => ({
    id: column.name,
    field: column.name,
    label: getColumnLabel(column),
    sortable: true,
    width: props.columnWidths[column.name] ?? WIDTH_BY_KIND[getColumnKind(column.type)] ?? 150,
  })),
)

const columnsByName = computed(() => {
  const index = {}
  for (const column of props.columns) index[column.name] = column
  return index
})
</script>

<template>
  <AppTable
    :columns="tableColumns"
    :rows="rows"
    :loading="loading"
    :page-size="pageSize"
    :page-size-options="[50, 100, 250, 500]"
    :row-class="rowClass"
    auto-width
    striped
    size="small"
    v-bind="selectable ? { onRowClick: (row) => emit('select', row) } : {}"
    @column-resize="emit('column-resize', $event)"
    @page-size-change="emit('page-size-change', $event)"
  >
    <template #cell="{ col, row }">
      <LogCell :value="row[col.field]" :column="columnsByName[col.field]" :resolver="resolver" />
    </template>
    <template #empty>
      <slot name="empty">No records match this query.</slot>
    </template>
  </AppTable>
</template>

<style scoped>
/* On the cells, not the row: striping paints `td` backgrounds over anything on the `tr`. */
:deep(tr.log-row--arriving td) {
  animation: log-row-arrive 900ms ease-out;
}

@keyframes log-row-arrive {
  0% {
    background-color: color-mix(in srgb, var(--p-primary-color) 26%, transparent);
  }
}
</style>
