<script setup>
import { computed } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import { useObjectStatusExplanation } from '@/queries/useObjectQueries'

const props = defineProps({
  visible: { type: Boolean, required: true },
  object: { type: Object, default: null },
})

const emit = defineEmits(['update:visible'])

const objectId = computed(() => props.object?.id ?? null)
const { data, isLoading, isFetching, error, refetch } = useObjectStatusExplanation(objectId)

const DECIDING_FACTOR_LABELS = {
  children: 'Child object statuses',
  alarms: 'Alarms',
  additional: 'Additional status sources',
}

const decidingFactorLabel = computed(() => {
  const factor = data.value?.decidingFactor
  return DECIDING_FACTOR_LABELS[factor] ?? factor ?? ''
})

const SEVERITY_LABEL_TO_STATUS = { Warning: 1, Minor: 2, Major: 3, Critical: 4 }

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="`Explain Status: ${object?.name ?? ''}`"
    modal
    :style="{ width: '680px' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="isLoading" class="explain-status-loading">
      <Skeleton height="1.5rem" />
      <Skeleton height="1.5rem" />
      <Skeleton height="1.5rem" />
      <Skeleton height="6rem" />
    </div>

    <QueryErrorState v-else-if="error" :error="error" :retrying="isFetching" @retry="refetch()" />

    <div v-else-if="data" class="explain-status-body">
      <div class="explain-status-header">
        <div class="header-main">
          <span class="header-name">{{ data.objectName }}</span>
          <StatusTag :status="data.status" :value="data.statusText" />
          <StatusTag v-if="data.unmanaged" :status="6" />
        </div>
        <div class="header-meta">
          <span class="header-meta-item">
            <span class="header-meta-label">Algorithm</span>
            <span class="header-meta-value">{{ data.algorithm }}</span>
          </span>
          <span v-if="data.children?.length" class="header-meta-item">
            <span class="header-meta-label">Status from Children</span>
            <StatusTag :status="data.statusFromChildren" :value="data.statusFromChildrenText" />
          </span>
        </div>
      </div>

      <div v-if="data.children?.length" class="explain-status-section">
        <h4 class="section-title">Children</h4>
        <DataTable
          :value="data.children"
          size="small"
          striped-rows
          scrollable
          scroll-height="300px"
        >
          <Column field="name" header="Name" />
          <Column header="Status">
            <template #body="{ data: row }">
              <StatusTag :status="row.status" :value="row.statusText" />
            </template>
          </Column>
          <Column header="Propagated Status">
            <template #body="{ data: row }">
              <StatusTag :status="row.propagatedStatus" :value="row.propagatedStatusText" />
            </template>
          </Column>
          <Column field="propagation" header="Propagation" />
          <Column header="Contributor">
            <template #body="{ data: row }">
              <i v-if="row.contributor" class="pi pi-check contributor-icon" />
            </template>
          </Column>
        </DataTable>
      </div>

      <div class="explain-status-summary">
        <h4 class="section-title">Status Factors</h4>
        <div class="summary-row">
          <span class="summary-label">Alarm Severity</span>
          <span class="summary-value">
            <StatusTag :status="data.alarmSeverity" :value="data.alarmSeverityText" />
          </span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Additional Status</span>
          <span class="summary-value">
            <StatusTag :status="data.additionalStatus" :value="data.additionalStatusText" />
          </span>
        </div>
        <div v-if="data.additionalExplanation" class="summary-row">
          <span class="summary-label">Additional Explanation</span>
          <span class="summary-value">{{ data.additionalExplanation }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Deciding Factor</span>
          <span class="summary-value">{{ decidingFactorLabel }}</span>
        </div>
      </div>

      <div v-if="data.thresholdInfo" class="explain-status-section">
        <h4 class="section-title">
          Threshold Info ({{ data.thresholdInfo.totalChildren }} children)
        </h4>
        <DataTable :value="data.thresholdInfo.thresholds" size="small" striped-rows>
          <Column header="Severity">
            <template #body="{ data: row }">
              <StatusTag :status="SEVERITY_LABEL_TO_STATUS[row.severity]" :value="row.severity" />
            </template>
          </Column>
          <Column field="threshold" header="Threshold %" />
          <Column field="count" header="Count" />
          <Column field="percentage" header="Percentage %" />
        </DataTable>
      </div>

      <div v-if="data.modules?.length" class="explain-status-section">
        <h4 class="section-title">Modules</h4>
        <DataTable :value="data.modules" size="small" striped-rows>
          <Column field="name" header="Module" />
          <Column header="Status">
            <template #body="{ data: row }">
              <StatusTag :status="row.status" :value="row.statusText" />
            </template>
          </Column>
        </DataTable>
      </div>
    </div>

    <template #footer>
      <Button label="Refresh" icon="pi pi-refresh" text :loading="isFetching" @click="refetch()" />
      <Button label="Close" severity="secondary" @click="onClose" />
    </template>
  </Dialog>
</template>

<style scoped>
.explain-status-loading {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.explain-status-body {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.explain-status-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
}

.header-main {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin-right: 0.25rem;
}

.header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.header-meta-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.375rem 0.75rem;
  background: var(--p-content-hover-background);
  border-radius: var(--p-content-border-radius);
}

.header-meta-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
}

.header-meta-value {
  font-size: 0.875rem;
  color: var(--p-text-color);
}

.explain-status-summary {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 1rem 0.5rem;
  background: var(--p-content-background);
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
}

.explain-status-summary .summary-row {
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--p-content-border-color);
}

.explain-status-summary .summary-row:last-child {
  border-bottom: none;
}

.summary-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  font-size: 0.875rem;
}

.summary-label {
  flex: 0 0 11rem;
  color: var(--p-text-muted-color);
}

.summary-value {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--p-text-color);
}

.section-title {
  margin: 0 0 0.5rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.contributor-icon {
  color: var(--p-green-500);
}
</style>
