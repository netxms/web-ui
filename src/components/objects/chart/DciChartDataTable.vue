<script setup>
// Exact values as the server returned them (no formatting). DCIs are polled independently and
// rarely share a timestamp, so rows are snapped to buckets sized from the densest series.
import { computed } from 'vue'
import AppTable from '@/components/common/AppTable.vue'
import { formatDateTimeWithSeconds } from '@/utils/timeFormat'
import { toCsv, downloadCsv, safeFilename } from '@/utils/csvExport'

const props = defineProps({
  /** @type {Array<{ name: string, unit: string, points: Array<[number, number]> }>} */
  series: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  /** File name stem. */
  exportName: { type: String, default: 'dci-data' },
})

// Median gap of the densest series; the median keeps one collection outage from stretching it.
const bucketMs = computed(() => {
  let smallest = null
  for (const s of props.series) {
    const gaps = []
    for (let i = 1; i < s.points.length; i++) gaps.push(s.points[i][0] - s.points[i - 1][0])
    if (!gaps.length) continue
    gaps.sort((a, b) => a - b)
    const median = gaps[Math.floor(gaps.length / 2)]
    if (median > 0 && (smallest == null || median < smallest)) smallest = median
  }
  return smallest ?? 1
})

const columns = computed(() => [
  { id: 'timestamp', field: 'timestamp', label: 'Timestamp', sortable: true, width: 190 },
  ...props.series.map((s, i) => ({
    id: `s${i}`,
    field: `s${i}`,
    label: s.unit ? `${s.name} (${s.unit})` : s.name,
    sortable: true,
    width: 160,
  })),
])

const rows = computed(() => {
  const byBucket = new Map()
  const width = bucketMs.value

  props.series.forEach((s, i) => {
    for (const [time, value] of s.points) {
      const bucket = Math.round(time / width)
      let row = byBucket.get(bucket)
      if (!row) {
        row = { id: bucket, _time: time }
        byBucket.set(bucket, row)
      }
      // The first series in a bucket sets its instant, so the time column does not jitter.
      row[`s${i}`] = value
    }
  })

  return [...byBucket.values()]
    .sort((a, b) => b._time - a._time)
    .map((row) => ({ ...row, timestamp: formatDateTimeWithSeconds(row._time) }))
})

function exportCsv() {
  const exportColumns = columns.value.map((c) => ({ field: c.field, label: c.label }))
  downloadCsv(safeFilename(props.exportName, 'dci-data'), toCsv(rows.value, exportColumns))
}

defineExpose({ exportCsv, hasRows: computed(() => rows.value.length > 0) })
</script>

<template>
  <AppTable
    :columns="columns"
    :rows="rows"
    :loading="loading"
    sort-field="timestamp"
    :sort-order="-1"
    :page-size="100"
    storage-key="dci-chart-data"
    auto-width
    striped
  >
    <template #cell="{ col, row }">
      <span v-if="col.id === 'timestamp'" class="data-table__time">{{ row.timestamp }}</span>
      <span v-else-if="row[col.field] == null" class="data-table__gap">-</span>
      <span v-else class="data-table__value">{{ row[col.field] }}</span>
    </template>
    <template #empty>No values in this time range.</template>
  </AppTable>
</template>

<style scoped>
.data-table__time,
.data-table__value {
  font-variant-numeric: tabular-nums;
}

.data-table__gap {
  color: var(--p-text-muted-color);
}
</style>
