<script setup>
/**
 * Extended legend: current, min, max, average and 95th percentile per series, as in the legacy
 * graph view. A table so a screen reader announces the column names. Chrome comes from the
 * global `chart-legend.css`.
 */
import { computed } from 'vue'
import { summarizeSeries } from '@/utils/dciChartModel'
import { formatWithMultiplier } from '@/utils/chartTheme'

const props = defineProps({
  /** @type {Array<{ name: string, color: string, unit: string, points: Array<[number, number]> }>} */
  series: { type: Array, default: () => [] },
  /** Chosen by `utils/chartLegendLayout.js`. */
  place: {
    type: String,
    default: 'bottom',
    validator: (v) => ['top', 'bottom', 'left', 'right'].includes(v),
  },
})

const rows = computed(() =>
  props.series.map((s) => ({
    name: s.name,
    color: s.color,
    unit: s.unit,
    ...summarizeSeries(s.points.map((p) => p[1])),
  })),
)

function format(value, unit) {
  if (value == null) return '-'
  return unit ? `${formatWithMultiplier(value)} ${unit}` : formatWithMultiplier(value)
}
</script>

<template>
  <div class="chart-legend" :class="`chart-legend--${place}`">
    <table class="chart-legend__table">
      <thead>
        <tr>
          <th scope="col" class="chart-legend__name-col">Series</th>
          <th scope="col">Curr</th>
          <th scope="col">Min</th>
          <th scope="col">Max</th>
          <th scope="col">Avg</th>
          <th scope="col">95%</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="`${row.name}-${i}`">
          <th scope="row" class="chart-legend__name">
            <span class="chart-legend__swatch" :style="{ background: row.color }" />
            <span class="chart-legend__label" :title="row.name">{{ row.name }}</span>
          </th>
          <td>{{ format(row.curr, row.unit) }}</td>
          <td>{{ format(row.min, row.unit) }}</td>
          <td>{{ format(row.max, row.unit) }}</td>
          <td>{{ format(row.avg, row.unit) }}</td>
          <td>{{ format(row.p95, row.unit) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
