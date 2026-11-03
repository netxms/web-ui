<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Skeleton from 'primevue/skeleton'
import Message from 'primevue/message'
import { useSummaryTables } from '@/queries/useSummaryTableQueries'
import { querySummaryTable } from '@/api/summaryTablesApi'

const SUMMARY_TABLE_CLASSES = new Set(['Container', 'Collector'])

const props = defineProps({
  object: { type: Object, required: true },
})

const isSummaryTableTarget = computed(() => SUMMARY_TABLE_CLASSES.has(props.object.class))

const objectId = computed(() => props.object.id)

const router = useRouter()

const { data: tablesData, isLoading: isTablesLoading } = useSummaryTables()
const tables = computed(() => tablesData.value ?? [])

const selectedTable = ref(null)

const isExecuting = ref(false)
const queryResult = ref(null)
const executeError = ref(null)

const resultColumns = computed(() => {
  if (!queryResult.value?.columns?.length) return []
  return queryResult.value.columns.map((col) => ({
    field: col.name,
    header: col.displayName || col.name,
  }))
})

function formatCellValue(rawValue, unitName) {
  if (rawValue === '' || rawValue === null || rawValue === undefined) return ''
  if (!unitName) return rawValue
  const num = parseFloat(rawValue)
  if (isNaN(num)) return `${rawValue} ${unitName}`
  const formatted = unitName === '%' ? num.toFixed(2) : rawValue
  return `${formatted} ${unitName}`
}

// { objectId, values: [{value}, ...] } → { colName: formattedValue, ... }
const resultRows = computed(() => {
  const res = queryResult.value
  if (!res?.data) return null
  const cols = res.columns ?? []
  return res.data.map((row) => {
    const flat = {}
    cols.forEach((col, i) => {
      flat[col.name] = formatCellValue(row.values?.[i]?.value ?? '', col.unitName)
    })
    return flat
  })
})

async function execute() {
  if (!selectedTable.value) return
  isExecuting.value = true
  executeError.value = null
  queryResult.value = null
  try {
    queryResult.value = await querySummaryTable(selectedTable.value.id, objectId.value)
  } catch (err) {
    executeError.value = err.message ?? 'Query execution failed.'
  } finally {
    isExecuting.value = false
  }
}

function goToConfiguration() {
  router.push('/configuration/dci-summary-tables')
}
</script>

<template>
  <div class="summary-tables-view">
    <template v-if="!isSummaryTableTarget">
      <div class="summary-tables-placeholder">
        <i class="pi pi-table" />
        <p>Summary Tables are available for Container and Collector objects.</p>
      </div>
    </template>

    <div v-else-if="isTablesLoading" class="view-loading">
      <Skeleton height="2rem" width="300px" class="mb-3" />
      <Skeleton height="1rem" width="60%" class="mb-2" />
      <Skeleton height="1rem" width="50%" class="mb-2" />
    </div>

    <div v-else-if="!isTablesLoading && tables.length === 0" class="empty-state">
      <i class="pi pi-table empty-icon" />
      <h3 class="empty-title">No Summary Tables</h3>
      <p class="empty-message">
        No DCI summary tables have been defined yet. Create one in the Configuration section.
      </p>
      <Button
        label="Go to Configuration"
        icon="pi pi-cog"
        severity="primary"
        @click="goToConfiguration"
      />
    </div>

    <template v-else-if="!isTablesLoading && tables.length > 0">
      <div class="view-toolbar">
        <Select
          v-model="selectedTable"
          :options="tables"
          option-label="title"
          placeholder="Select a summary table..."
          class="table-select"
        >
          <template #option="{ option }">
            <div class="table-option">
              <span class="table-option-title">{{ option.title }}</span>
              <span v-if="option.menuPath" class="table-option-path">{{ option.menuPath }}</span>
            </div>
          </template>
        </Select>
        <Button
          label="Execute"
          icon="pi pi-play"
          severity="primary"
          :disabled="!selectedTable || isExecuting"
          :loading="isExecuting"
          @click="execute"
        />
      </div>

      <Message v-if="executeError" severity="error" class="execute-error">
        {{ executeError }}
      </Message>

      <div class="results-area">
        <div v-if="!queryResult && !isExecuting" class="results-placeholder">
          Select a summary table and click Execute to view results
        </div>

        <div v-else-if="isExecuting" class="results-loading">
          <Skeleton v-for="i in 5" :key="i" height="2rem" class="mb-1" />
        </div>

        <div v-else-if="resultRows !== null && resultRows.length === 0" class="results-empty">
          No data returned for this object
        </div>

        <DataTable
          v-else-if="resultRows && resultRows.length > 0"
          :value="resultRows"
          striped-rows
          scrollable
          scroll-height="flex"
          paginator
          :rows="20"
          :rows-per-page-options="[10, 20, 50, 100]"
          class="results-table"
        >
          <Column
            v-for="col in resultColumns"
            :key="col.field"
            :field="col.field"
            :header="col.header"
            :sortable="true"
            style="min-width: 120px"
          />
        </DataTable>
      </div>
    </template>
  </div>
</template>

<style scoped>
.summary-tables-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.view-loading {
  padding: 1.5rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 3rem 2rem;
  text-align: center;
  gap: 0.75rem;
}

.empty-icon {
  font-size: 3rem;
  color: var(--p-text-muted-color);
  opacity: 0.5;
}

.empty-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.empty-message {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  max-width: 380px;
}

.view-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  flex-shrink: 0;
}

.table-select {
  width: 320px;
}

.table-option {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.table-option-title {
  font-size: 0.875rem;
  font-weight: 500;
}

.table-option-path {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.execute-error {
  margin: 0.5rem;
}

.results-area {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.results-placeholder,
.results-empty {
  padding: 3rem 2rem;
  text-align: center;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.results-loading {
  padding: 1rem;
}

.results-table {
  flex: 1;
  min-height: 0;
  --p-datatable-body-cell-padding: 0.3rem 0.75rem;
  --p-datatable-header-cell-padding: 0.25rem 0.5rem;
}

.summary-tables-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 3rem 2rem;
  text-align: center;
  gap: 1rem;
  color: var(--p-text-muted-color);
}

.summary-tables-placeholder i {
  font-size: 3rem;
  opacity: 0.4;
}

.summary-tables-placeholder p {
  margin: 0;
  font-size: 0.875rem;
  max-width: 380px;
}
</style>
