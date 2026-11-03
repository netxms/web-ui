<script setup>
import { computed, inject, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Tag from 'primevue/tag'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import AppTable from '@/components/common/AppTable.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import { useDciConfigList } from '@/queries/useDciConfigQueries'
import { thresholdExpressionLabel } from '@/utils/dciThresholdUtils'
import { useWorkingState } from '@/composables/useWorkingState'

const props = defineProps({
  object: { type: Object, required: true },
})

const route = useRoute()
const router = useRouter()

const objectId = computed(() => props.object.id)

const {
  data: dciConfig,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
} = useDciConfigList(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const rows = computed(() => {
  const out = []
  for (const dci of dciConfig.value ?? []) {
    for (const threshold of dci.thresholds ?? []) {
      out.push({
        id: `${dci.id}:${threshold.id}`,
        dciId: dci.id,
        dciName: dci.name,
        dciDescription: dci.description,
        expression: thresholdExpressionLabel(threshold),
        activationEvent: threshold.activationEvent,
        deactivationEvent: threshold.deactivationEvent,
        disabled: threshold.disabled,
      })
    }
  }
  return out
})

const filterText = ref('')

useWorkingState('thresholds', { view: { filterText } })
const filteredRows = computed(() => {
  if (!filterText.value) return rows.value
  const search = filterText.value.toLowerCase()
  return rows.value.filter(
    (r) =>
      (r.dciDescription ?? '').toLowerCase().includes(search) ||
      (r.dciName ?? '').toLowerCase().includes(search),
  )
})

const COLUMNS = [
  { id: 'parameter', field: 'dciDescription', label: 'Parameter', sortable: true, width: 260 },
  { id: 'expression', field: 'expression', label: 'Expression', sortable: true, width: 160 },
  {
    id: 'activationEvent',
    field: 'activationEvent',
    label: 'Activation Event',
    sortable: true,
    width: 200,
  },
  {
    id: 'deactivationEvent',
    field: 'deactivationEvent',
    label: 'Deactivation Event',
    sortable: true,
    width: 200,
  },
  { id: 'status', field: 'disabled', label: 'Status', sortable: true, width: 100 },
]

/** Also the row's open-in-new-tab href. */
function dciTarget(row) {
  return { name: route.name, params: { ...route.params, viewId: 'dcis', entityId: row.dciId } }
}

function openDci(row) {
  router.push(dciTarget(row))
}
</script>

<template>
  <div class="thresholds-view">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="thresholds-toolbar">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filterText"
          data-filter-input
          placeholder="Filter thresholds..."
          class="filter-input"
        />
      </IconField>
      <span v-if="!isLoading" class="thresholds-count">{{
        $plural(filteredRows.length, 'threshold')
      }}</span>
    </div>

    <AppTable
      :columns="COLUMNS"
      :rows="filteredRows"
      :loading="isLoading"
      :error="isError ? error : null"
      sort-field="dciDescription"
      :sort-order="1"
      :page-size="50"
      storage-key="thresholds"
      resize-fit
      :target-for="dciTarget"
      @row-click="openDci"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <template v-if="col.id === 'parameter'">
          <div class="threshold-parameter">
            <span class="parameter-desc">{{ row.dciDescription || row.dciName }}</span>
            <span v-if="row.dciDescription" class="parameter-name">{{ row.dciName }}</span>
          </div>
        </template>
        <template v-else-if="col.id === 'expression'">
          <code>{{ row.expression }}</code>
        </template>
        <template v-else-if="col.id === 'status'">
          <Tag
            :value="row.disabled ? 'Disabled' : 'Active'"
            :severity="row.disabled ? 'secondary' : 'success'"
          />
        </template>
      </template>
      <template #empty>
        <div class="empty-message">
          No thresholds configured. Add thresholds from a DCI's Processing tab under Data
          Collection.
        </div>
      </template>
    </AppTable>
  </div>
</template>

<style scoped>
.thresholds-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.thresholds-toolbar {
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

.thresholds-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.threshold-parameter {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.parameter-desc {
  font-size: 0.875rem;
}

.parameter-name {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}
</style>
