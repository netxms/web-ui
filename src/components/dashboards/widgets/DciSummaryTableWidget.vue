<script setup>
import { computed } from 'vue'
import AppTable from '@/components/common/AppTable.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useQuerySummaryTable } from '@/queries/useSummaryTableQueries'
import { useWidgetActive } from '@/composables/useWidgetActive'
import { tableDataToGrid } from '@/utils/tableData'
import { useEffectiveObjectId } from '@/composables/useDashboardContext'

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})
const tableId = computed(() => cfg.value.tableId || null)
const baseObjectId = useEffectiveObjectId(() => cfg.value.baseObjectId)
const objectId = computed(() => baseObjectId.value || null)
// Always true outside a dashboard.
const active = useWidgetActive()

const {
  data: tableData,
  isLoading,
  isError,
  error,
  refetch,
} = useQuerySummaryTable(tableId, objectId, {
  enabled: active,
  refetchInterval: computed(() => (cfg.value.refreshInterval || 30) * 1000),
})

const grid = computed(() => tableDataToGrid(tableData.value))
const columns = computed(() => grid.value.columns)
const rows = computed(() => grid.value.rows)
</script>

<template>
  <div class="summary-table-widget">
    <div v-if="!tableId || !objectId" class="stw-state">
      <i class="pi pi-table" />
      <span>No summary table configured</span>
    </div>
    <div v-else-if="isLoading" class="stw-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading&hellip;</span>
    </div>
    <div v-else-if="isError" class="stw-state stw-state--error">
      <QueryErrorState :error="error" message="Query failed" @retry="refetch" />
    </div>
    <!-- Paged: a summary table can have hundreds of rows for one grid cell. -->
    <AppTable
      v-else
      :columns="columns"
      :rows="rows"
      :page-size="10"
      compact
      resize-fit
      striped
      class="stw-table"
    >
      <template #empty>
        <span class="stw-empty">No data returned for this object.</span>
      </template>
    </AppTable>
  </div>
</template>

<style scoped>
.summary-table-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.stw-table {
  flex: 1;
  min-height: 0;
}

.stw-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.stw-state i {
  font-size: 1.5rem;
  opacity: 0.3;
}

.stw-state--error {
  color: var(--p-red-400, #f87171);
}

.stw-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}
</style>
