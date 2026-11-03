<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import AppTable from '@/components/common/AppTable.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useDciTableValue } from '@/queries/useObjectQueries'
import { tableDataToGrid } from '@/utils/tableData'
import { getStatusSoftTextHexColor } from '@/utils/objectUtils'
import { toCsv, downloadCsv, safeFilename } from '@/utils/csvExport'

const props = defineProps({
  objectId: { type: [Number, String], required: true },
  dciId: { type: [Number, String], required: true },
  /** Export filename only. */
  dciName: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
})

const enabled = computed(() => props.enabled)

const {
  data: tableValue,
  isLoading,
  isError,
  error,
  refetch,
} = useDciTableValue(
  computed(() => Number(props.objectId)),
  computed(() => Number(props.dciId)),
  { enabled },
)

const grid = computed(() => tableDataToGrid(tableValue.value?.table))
const columns = computed(() => grid.value.columns)
const rows = computed(() => grid.value.rows)

const collectedAt = computed(() => {
  const ts = tableValue.value?.timestamp
  return ts ? new Date(ts).toLocaleString() : null
})

// Normal is left uncoloured so an ordinary table is not a wall of green.
function cellColor(row, field) {
  const status = row._status?.[field]
  return status ? getStatusSoftTextHexColor(status) : null
}

function exportCsv() {
  const name = safeFilename(props.dciName || `dci-${props.dciId}`, 'table-dci')
  downloadCsv(name, toCsv(rows.value, columns.value))
}
</script>

<template>
  <div class="dci-table-view">
    <div v-if="isLoading" class="dtv-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading table&hellip;</span>
    </div>
    <QueryErrorState
      v-else-if="isError"
      :error="error"
      message="Could not read this table DCI"
      @retry="refetch"
    />
    <template v-else>
      <div class="dtv-toolbar">
        <span v-if="collectedAt" class="dtv-collected">Collected {{ collectedAt }}</span>
        <span v-else class="dtv-collected">No value collected yet</span>
        <Button
          icon="pi pi-download"
          label="Export"
          severity="secondary"
          text
          size="small"
          :disabled="rows.length === 0"
          @click="exportCsv"
        />
      </div>
      <!-- A table DCI can return hundreds of rows. -->
      <AppTable
        :columns="columns"
        :rows="rows"
        :page-size="25"
        compact
        column-borders
        auto-width
        size="small"
        class="dtv-table"
      >
        <template #cell="{ col, row }">
          <span
            v-tooltip.top="row[col.field]"
            class="cell-value"
            :style="{ color: cellColor(row, col.field) }"
          >
            {{ row[col.field] }}
          </span>
        </template>
        <template #empty>No current data available.</template>
      </AppTable>
    </template>
  </div>
</template>

<style scoped>
.dci-table-view {
  max-height: 300px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.dtv-table {
  flex: 1;
  min-height: 0;
}

.dtv-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding-bottom: 0.25rem;
}

.dtv-collected {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.dtv-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.cell-value {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
</style>
