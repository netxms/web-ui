<script setup>
import { computed } from 'vue'
import Button from 'primevue/button'
import AppTable from '@/components/common/AppTable.vue'
import { useToolExecution } from '@/composables/useToolExecution'
import { formatTimeShort } from '@/utils/timeFormat'

const props = defineProps({
  execution: {
    type: Object,
    required: true,
  },
})

const { reExecute } = useToolExecution()

const isLoading = computed(
  () => props.execution.status === 'pending' || props.execution.status === 'running',
)

const tableData = computed(() => {
  const result = props.execution.result
  return result?.type === 'table' ? result.table : null
})

const columns = computed(() =>
  (tableData.value?.columns ?? []).map((col, idx) => ({
    id: `col_${idx}`,
    field: `col_${idx}`,
    label: col.displayName || col.name,
    sortable: true,
  })),
)

const rows = computed(() =>
  (tableData.value?.data ?? []).map((row, index) => {
    // AppTable keys rows by `id`; tool output rows have no identity of their own.
    const obj = { id: index }
    row.values.forEach((cell, idx) => {
      obj[`col_${idx}`] = cell.value
    })
    return obj
  }),
)

// AppTable's error state wants an Error-shaped value; an execution carries only a message.
const error = computed(() =>
  props.execution.status === 'error'
    ? new Error(props.execution.error || 'Tool execution failed')
    : null,
)

const title = computed(() => tableData.value?.title || props.execution.toolName)
</script>

<template>
  <div class="tool-table-result">
    <div class="tool-table-header">
      <div class="tool-table-info">
        <span class="tool-table-title">{{ title }}</span>
        <span class="tool-table-object">on {{ execution.objectName }}</span>
        <span v-if="execution.startedAt" class="tool-table-time">
          {{ formatTimeShort(execution.startedAt) }}
        </span>
      </div>
      <Button
        v-tooltip.bottom="'Run again'"
        aria-label="Run again"
        icon="pi pi-replay"
        text
        severity="secondary"
        size="small"
        :disabled="isLoading"
        @click="reExecute(execution.id)"
      />
    </div>

    <div class="tool-table-content">
      <AppTable
        :columns="columns"
        :rows="rows"
        :loading="isLoading"
        :error="error"
        :page-size="50"
        striped
        auto-width
        size="small"
        class="tool-data-table"
        @retry="reExecute(execution.id)"
      >
        <template #empty>No data returned.</template>
      </AppTable>
    </div>
  </div>
</template>

<style scoped>
.tool-table-result {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tool-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  flex-shrink: 0;
}

.tool-table-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
}

.tool-table-title {
  font-weight: 600;
  color: var(--p-text-color);
}

.tool-table-object {
  color: var(--p-text-muted-color);
}

.tool-table-time {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.tool-table-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.tool-data-table {
  flex: 1;
}
</style>
