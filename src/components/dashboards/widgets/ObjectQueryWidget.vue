<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AppTable from '@/components/common/AppTable.vue'
import { objectTarget } from '@/utils/routeTargets'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useObjectQuery } from '@/queries/useObjectQueries'
import { useWidgetActive } from '@/composables/useWidgetActive'
import { useEffectiveObjectId } from '@/composables/useDashboardContext'

const props = defineProps({
  widget: { type: Object, required: true },
})

const router = useRouter()
const cfg = computed(() => props.widget.config ?? {})
// Always true outside a dashboard.
const active = useWidgetActive()

// Legacy also hands the context object to the query script; POST /v1/objects/query has no field
// for it, so only the root object follows the context.
const rootObjectId = useEffectiveObjectId(() => cfg.value.rootObjectId)

const queryParams = computed(() => ({
  query: cfg.value.query,
  rootObjectId: rootObjectId.value,
  fields: (cfg.value.properties ?? []).map((p) => p.name).filter(Boolean),
  limit: cfg.value.recordLimit || undefined,
}))

const {
  data: results,
  isLoading,
  isError,
  error,
  refetch,
} = useObjectQuery(queryParams, {
  enabled: active,
  refetchInterval: computed(() => (cfg.value.refreshRate || 60) * 1000),
})

// Without configured columns, the union of returned field names (as in legacy).
const columns = computed(() => {
  const explicit = cfg.value.properties ?? []
  if (explicit.length) {
    return [
      { id: 'name', field: 'name', label: 'Name', sortable: true },
      ...explicit.map((p) => ({
        id: p.name,
        field: p.name,
        label: p.displayName || p.name,
        sortable: true,
      })),
    ]
  }
  const names = new Set()
  for (const r of results.value ?? []) {
    for (const key of Object.keys(r.fields ?? {})) names.add(key)
  }
  return [
    { id: 'name', field: 'name', label: 'Name', sortable: true },
    ...[...names].map((name) => ({ id: name, field: name, label: name, sortable: true })),
  ]
})

const rows = computed(() =>
  (results.value ?? []).map((r) => ({
    id: r.object.id,
    name: r.object.name,
    __objectId: r.object.id,
    ...r.fields,
  })),
)

function rowTarget(row) {
  return objectTarget({ id: row.__objectId }, 'status', { perspective: 'infrastructure' })
}

function goToObject(row) {
  router.push(rowTarget(row))
}
</script>

<template>
  <div class="object-query-widget">
    <div v-if="!cfg.query" class="oqw-state">
      <i class="pi pi-search" />
      <span>No query configured</span>
    </div>
    <div v-else-if="isLoading" class="oqw-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading&hellip;</span>
    </div>
    <div v-else-if="isError" class="oqw-state oqw-state--error">
      <QueryErrorState :error="error" message="Query failed" @retry="refetch" />
    </div>
    <AppTable
      v-else
      :columns="columns"
      :rows="rows"
      :page-size="10"
      compact
      resize-fit
      striped
      class="oqw-table"
      :target-for="rowTarget"
      @row-click="goToObject"
    >
      <template #empty>
        <span class="oqw-empty">No objects matched this query.</span>
      </template>
    </AppTable>
  </div>
</template>

<style scoped>
.object-query-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.oqw-table {
  flex: 1;
  min-height: 0;
}

.oqw-table :deep(.app-table-wrap tbody tr) {
  cursor: pointer;
}

.oqw-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.oqw-state i {
  font-size: 1.5rem;
  opacity: 0.3;
}

.oqw-state--error {
  color: var(--p-red-400, #f87171);
}

.oqw-empty {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}
</style>
