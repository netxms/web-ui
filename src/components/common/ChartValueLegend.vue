<script setup>
/**
 * Legend for the comparison charts (bar, tube, pie), whose entries are data items rather than
 * series: a plain list, or an extended table with value and share of total, as in legacy.
 * DOM rather than the ECharts legend, which binds entries to series, and these charts put every
 * item in one series. Chrome comes from the global `chart-legend.css`.
 */
import { computed } from 'vue'
import { formatWithMultiplier } from '@/utils/chartTheme'

const props = defineProps({
  /** @type {Array<{ name: string, value: number, color: string, unitName?: string }>} */
  items: { type: Array, default: () => [] },
  /** Chosen by `utils/chartLegendLayout.js`. */
  place: {
    type: String,
    default: 'bottom',
    validator: (v) => ['top', 'bottom', 'left', 'right'].includes(v),
  },
  /** The legacy "extended legend": adds the value column. */
  extended: { type: Boolean, default: false },
  /** Extended legends only. */
  showPercent: { type: Boolean, default: true },
})

// A share of the total means nothing with mixed metrics or a negative reading.
const total = computed(() => {
  let sum = 0
  for (const item of props.items) {
    const value = Number(item.value)
    if (!Number.isFinite(value) || value < 0) return 0
    sum += value
  }
  return sum
})

const rows = computed(() =>
  props.items.map((item) => {
    const value = Number(item.value)
    const finite = Number.isFinite(value)
    return {
      name: item.name,
      color: item.color,
      value: finite
        ? item.unitName
          ? `${formatWithMultiplier(value)} ${item.unitName}`
          : formatWithMultiplier(value)
        : '-',
      percent: finite && total.value > 0 ? `${((value / total.value) * 100).toFixed(2)}%` : '-',
    }
  }),
)
</script>

<template>
  <div class="chart-legend" :class="`chart-legend--${place}`">
    <table v-if="extended" class="chart-legend__table">
      <thead>
        <tr>
          <th scope="col" class="chart-legend__name-col">Series</th>
          <th scope="col">Value</th>
          <th v-if="showPercent" scope="col">Pct</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in rows" :key="`${row.name}-${i}`">
          <th scope="row" class="chart-legend__name">
            <span class="chart-legend__swatch" :style="{ background: row.color }" />
            <span class="chart-legend__label" :title="row.name">{{ row.name }}</span>
          </th>
          <td>{{ row.value }}</td>
          <td v-if="showPercent">{{ row.percent }}</td>
        </tr>
      </tbody>
    </table>

    <ul v-else class="chart-legend__list">
      <li v-for="(row, i) in rows" :key="`${row.name}-${i}`" class="chart-legend__item">
        <span class="chart-legend__swatch" :style="{ background: row.color }" />
        <span class="chart-legend__label" :title="row.name">{{ row.name }}</span>
      </li>
    </ul>
  </div>
</template>
