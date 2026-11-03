<script setup>
import { computed } from 'vue'
import DciHistoryChart from '@/components/objects/DciHistoryChart.vue'
import DciStringHistory from '@/components/objects/DciStringHistory.vue'
import ChartSkeleton from '@/components/common/ChartSkeleton.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { useDciHistory } from '@/queries/useObjectQueries'
import { formatDateTimeWithSeconds } from '@/utils/timeFormat'
import { lastCollectedAt, previewWindowEnd } from '@/utils/dciHistoryPreview'

const props = defineProps({
  objectId: { type: Number, required: true },
  dciId: { type: Number, required: true },
  /** Data type 4. */
  isString: { type: Boolean, default: false },
  /** The window ends at the last poll when it is older than the window. */
  lastTimestamp: { type: String, default: null },
})

const endAt = computed(() => previewWindowEnd(props.lastTimestamp))
const neverCollected = computed(() => lastCollectedAt(props.lastTimestamp) == null)

const { data: historyData, isLoading } = useDciHistory(
  () => props.objectId,
  () => props.dciId,
  { endAt },
)

const hasValues = computed(() => (historyData.value?.values?.length ?? 0) > 0)
</script>

<template>
  <div v-if="endAt != null" class="history-note">
    <i class="pi pi-info-circle" />
    No values collected since {{ formatDateTimeWithSeconds(lastTimestamp) }}. Showing the 24 hours
    before that.
  </div>
  <!-- Sized like what replaces it (DciStringHistory's page), so nothing jumps on load. -->
  <template v-if="isLoading">
    <TableSkeleton
      v-if="isString"
      :columns="['180fr', '320fr']"
      :rows="10"
      label="Loading history"
    />
    <ChartSkeleton v-else height="200px" label="Loading history" />
  </template>
  <template v-else-if="hasValues">
    <DciStringHistory v-if="isString" :history-data="historyData" />
    <DciHistoryChart v-else :history-data="historyData" />
  </template>
  <div v-else class="history-empty">
    {{
      neverCollected
        ? 'No values have been collected for this DCI yet.'
        : 'No history data available.'
    }}
  </div>
</template>

<style scoped>
.history-note {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.history-empty {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}
</style>
