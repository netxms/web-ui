<script setup>
import { computed } from 'vue'
import AppTable from '@/components/common/AppTable.vue'
import { formatDateTimeWithSeconds } from '@/utils/timeFormat'

const props = defineProps({
  historyData: { type: Object, required: true },
})

const COLUMNS = [
  { id: 'timestamp', field: 'timestamp', label: 'Timestamp', sortable: true, width: 180 },
  { id: 'value', field: 'value', label: 'Value', sortable: true, width: 320 },
]

// Raw-tier string DCIs return hundreds of samples a day; rendering them all stalls the view.
const rows = computed(() =>
  (props.historyData?.values ?? []).map((v, index) => ({
    id: index,
    timestamp: v.timestamp,
    value: v.value,
  })),
)

function formatTimestamp(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  if (d.getFullYear() <= 1970) return '-'
  return formatDateTimeWithSeconds(d)
}
</script>

<template>
  <AppTable
    :columns="COLUMNS"
    :rows="rows"
    sort-field="timestamp"
    :sort-order="-1"
    :page-size="10"
    compact
    resize-fit
    striped
  >
    <template #cell="{ col, row }">
      <span v-if="col.id === 'timestamp'">{{ formatTimestamp(row.timestamp) }}</span>
      <span v-else class="string-value">{{ row.value }}</span>
    </template>
    <template #empty>No history available.</template>
  </AppTable>
</template>

<style scoped>
.string-value {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
}
</style>
