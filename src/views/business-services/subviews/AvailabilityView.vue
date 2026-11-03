<script setup>
import { computed, inject, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Skeleton from 'primevue/skeleton'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { formatDateTimeShort } from '@/utils/timeFormat'
import {
  useBusinessServiceAvailability,
  AVAILABILITY_PERIODS as PERIODS,
} from '@/queries/useBusinessServiceQueries'

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)
const { stats, downtimeLog, isLoading, isFetching, isError, error, refetch } =
  useBusinessServiceAvailability(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

function getUptimePct(key) {
  return stats.value?.[key]?.uptimePct ?? null
}

function getDowntimeLabel(key) {
  const mins = stats.value?.[key]?.downtimeMinutes
  if (mins == null) return null
  if (mins === 0) return 'No downtime'
  if (mins < 60) return `${mins}m downtime`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m downtime` : `${h}h downtime`
}

function uptimeClass(key) {
  const pct = getUptimePct(key)
  if (pct == null) return ''
  if (pct >= 99) return 'uptime-green'
  if (pct >= 95) return 'uptime-yellow'
  return 'uptime-red'
}

function formatPct(key) {
  const pct = getUptimePct(key)
  if (pct == null) return '--'
  return `${pct.toFixed(2)}%`
}

function formatDatetime(ts) {
  if (!ts) return '-'
  return formatDateTimeShort(ts)
}

function formatDuration(minutes) {
  if (minutes == null) return '-'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
</script>

<template>
  <div class="availability-view">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <QueryErrorState v-if="isError" :error="error" @retry="refetch" />
    <template v-else>
      <div class="summary-row">
        <div v-for="period in PERIODS" :key="period.key" class="summary-card">
          <span class="summary-label">{{ period.label }}</span>
          <template v-if="isLoading">
            <Skeleton width="5rem" height="2rem" class="mb-1" />
            <Skeleton width="4rem" height="0.875rem" />
          </template>
          <template v-else>
            <span class="summary-pct" :class="uptimeClass(period.key)">
              {{ formatPct(period.key) }}
            </span>
            <span v-if="getDowntimeLabel(period.key)" class="summary-downtime">
              {{ getDowntimeLabel(period.key) }}
            </span>
          </template>
        </div>
      </div>

      <div class="downtime-section">
        <div class="downtime-toolbar">
          <span class="downtime-title">Downtime Log</span>
        </div>

        <div v-if="isLoading" class="downtime-loading">
          <Skeleton v-for="i in 4" :key="i" height="2.25rem" class="mb-2" />
        </div>

        <DataTable
          v-else
          :value="downtimeLog"
          data-key="id"
          striped-rows
          show-gridlines
          scrollable
          scroll-height="flex"
          resizable-columns
          column-resize-mode="fit"
          sort-field="startTime"
          :sort-order="-1"
          class="downtime-table"
        >
          <template #empty>
            <div class="empty-message">
              <i class="pi pi-check-circle empty-icon" />
              <p class="empty-title">No downtime recorded</p>
              <p class="empty-text">This business service has had no recorded downtime events.</p>
            </div>
          </template>

          <Column
            field="startTime"
            header="Start"
            :sortable="true"
            style="width: 190px; flex: 0 0 190px"
          >
            <template #body="{ data }">{{ formatDatetime(data.startTime) }}</template>
          </Column>

          <Column
            field="endTime"
            header="End"
            :sortable="true"
            style="width: 190px; flex: 0 0 190px"
          >
            <template #body="{ data }">
              <span v-if="data.endTime">{{ formatDatetime(data.endTime) }}</span>
              <span v-else class="ongoing-badge">Ongoing</span>
            </template>
          </Column>

          <Column
            field="durationMinutes"
            header="Duration"
            :sortable="true"
            style="width: 120px; flex: 0 0 120px"
          >
            <template #body="{ data }">{{ formatDuration(data.durationMinutes) }}</template>
          </Column>

          <Column field="reason" header="Reason">
            <template #body="{ data }">
              <span :class="{ 'text-muted': !data.reason }">{{ data.reason || '-' }}</span>
            </template>
          </Column>
        </DataTable>
      </div>
    </template>
  </div>
</template>

<style scoped>
.availability-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.summary-row {
  display: flex;
  gap: 1px;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-border);
  flex-shrink: 0;
}

.summary-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem 1.25rem;
  background: var(--p-surface-card);
}

.summary-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.summary-pct {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1;
  color: var(--p-text-muted-color);
}

.uptime-green {
  color: var(--p-green-500);
}
.uptime-yellow {
  color: var(--p-yellow-500);
}
.uptime-red {
  color: var(--p-red-500);
}

.summary-downtime {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.downtime-section {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.downtime-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  flex-shrink: 0;
}

.downtime-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.downtime-loading {
  padding: 1rem;
}

.downtime-table {
  flex: 1;
  min-height: 0;
  --p-datatable-body-cell-padding: 0.35rem 0.75rem;
  --p-datatable-header-cell-padding: 0.25rem 0.5rem;
}

.downtime-table :deep(.p-datatable-table) {
  table-layout: fixed;
}

.ongoing-badge {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--p-red-100);
  color: var(--p-red-700);
  font-size: 0.75rem;
  font-weight: 500;
}

:root.app-dark .ongoing-badge {
  background: color-mix(in srgb, var(--p-red-900) 60%, transparent);
  color: var(--p-red-300);
}

.text-muted {
  color: var(--p-text-muted-color);
}

.empty-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  text-align: center;
  color: var(--p-text-muted-color);
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  opacity: 0.4;
}

.empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin: 0 0 0.375rem;
}

.empty-text {
  font-size: 0.875rem;
  max-width: 360px;
  margin: 0;
  line-height: 1.5;
}
</style>
