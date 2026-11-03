<script setup>
import { computed } from 'vue'
import AppTable from '@/components/common/AppTable.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useDciCurrentValues, useDciTableValue } from '@/queries/useObjectQueries'
import { useWidgetActive } from '@/composables/useWidgetActive'
import { tableDataToGrid } from '@/utils/tableData'
import { getStatusSoftTextHexColor } from '@/utils/objectUtils'
import { useDashboardContext } from '@/composables/useDashboardContext'
import { isContextObjectId } from '@/utils/dashboardContext'
import { findTemplateTableDci } from '@/utils/templateDci'

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})
// Always true outside a dashboard.
const active = useWidgetActive()

// Bound to the context object, the configured DCI id belongs to the authoring template, so the
// table DCI is found on the dashboard's object by the `templateConfig` patterns instead.
const isContextBound = computed(() => isContextObjectId(cfg.value.objectId))
const { contextObjectId } = useDashboardContext()

const { data: contextValues, isLoading: isResolving } = useDciCurrentValues(contextObjectId, {
  enabled: computed(() => active.value && isContextBound.value && !!contextObjectId.value),
})

const contextMatch = computed(() => {
  if (!isContextBound.value) return { dci: null, error: null }
  try {
    const dci = findTemplateTableDci(cfg.value.templateConfig, contextValues.value?.values ?? null)
    return { dci, error: null }
  } catch (e) {
    return { dci: null, error: e }
  }
})

const objectId = computed(() =>
  isContextBound.value ? contextObjectId.value || null : cfg.value.objectId || null,
)
const dciId = computed(() =>
  isContextBound.value ? (contextMatch.value.dci?.id ?? null) : cfg.value.dciId || null,
)

const unconfiguredMessage = computed(() => {
  if (!isContextBound.value) return 'No table DCI configured'
  if (!contextObjectId.value) return 'Shown for the context object; this dashboard has none'
  if (contextMatch.value.error) {
    return `Error in DCI matching regular expression: ${contextMatch.value.error.message}`
  }
  return 'No matching table DCI on this object'
})

const {
  data: tableValue,
  isLoading,
  isError,
  error,
  refetch,
} = useDciTableValue(objectId, dciId, {
  enabled: active,
  refetchInterval: computed(() => (cfg.value.refreshRate || 30) * 1000),
})

const grid = computed(() => tableDataToGrid(tableValue.value?.table))
const columns = computed(() => grid.value.columns)
const rows = computed(() => grid.value.rows)

function cellColor(row, field) {
  const status = row._status?.[field]
  return status ? getStatusSoftTextHexColor(status) : null
}
</script>

<template>
  <div class="table-value-widget">
    <div v-if="isContextBound && isResolving" class="tvw-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading&hellip;</span>
    </div>
    <div v-else-if="!objectId || !dciId" class="tvw-state">
      <i class="pi pi-table" />
      <span>{{ unconfiguredMessage }}</span>
    </div>
    <div v-else-if="isLoading" class="tvw-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading&hellip;</span>
    </div>
    <div v-else-if="isError" class="tvw-state tvw-state--error">
      <QueryErrorState :error="error" message="Could not read this table DCI" @retry="refetch" />
    </div>
    <!-- Paged: a table DCI can have hundreds of rows for one grid cell. -->
    <AppTable
      v-else
      :columns="columns"
      :rows="rows"
      :page-size="10"
      compact
      resize-fit
      striped
      class="tvw-table"
    >
      <template #cell="{ col, row }">
        <span
          v-tooltip.top="row[col.field]"
          class="tvw-cell"
          :style="{ color: cellColor(row, col.field) }"
        >
          {{ row[col.field] }}
        </span>
      </template>
      <template #empty>
        <span class="tvw-empty">No value collected yet.</span>
      </template>
    </AppTable>
  </div>
</template>

<style scoped>
.table-value-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tvw-table {
  flex: 1;
  min-height: 0;
}

.tvw-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.tvw-state i {
  font-size: 1.5rem;
  opacity: 0.3;
}

.tvw-state--error {
  color: var(--p-red-400, #f87171);
}

.tvw-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.tvw-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}
</style>
