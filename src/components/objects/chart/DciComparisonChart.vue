<script setup>
// Latest value of each DCI, read from the last point of the already-fetched history rather
// than a current-values request per object.
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import EmptyState from '@/components/common/EmptyState.vue'
import ChartValueLegend from '@/components/common/ChartValueLegend.vue'
import { useChartTheme, formatWithMultiplier } from '@/utils/chartTheme'
import { buildBarOption, buildPieOption } from '@/utils/chartOptions'

use([CanvasRenderer, BarChart, PieChart, GridComponent, TooltipComponent])

const props = defineProps({
  /** @type {Array<{ name: string, color: string, unit: string, points: Array<[number, number]> }>} */
  series: { type: Array, default: () => [] },
  /** @type {'bar'|'pie'} */
  type: { type: String, default: 'bar' },
  /** An edge, or 'none'. */
  legend: { type: String, default: 'bottom' },
  /** Adds the value and share columns. */
  extendedLegend: { type: Boolean, default: false },
})

const theme = useChartTheme()

const items = computed(() =>
  props.series
    .filter((s) => s.points.length > 0)
    .map((s) => ({
      name: s.name,
      value: s.points.at(-1)[1],
      color: s.color,
      unitName: s.unit,
    })),
)

const legendPlace = computed(() => (props.legend === 'none' ? 'bottom' : props.legend))

// On the bar chart the plain legend would repeat the category axis; the extended one adds figures.
const showLegend = computed(
  () =>
    props.legend !== 'none' &&
    items.value.length > 0 &&
    (props.type === 'pie' || props.extendedLegend),
)

const pieUnusable = computed(
  () => props.type === 'pie' && items.value.some((item) => item.value < 0),
)

const chartOption = computed(() => {
  if (props.type === 'pie') {
    return buildPieOption({ items: items.value, doughnut: true, showTotal: true, theme })
  }
  return buildBarOption({
    items: items.value,
    transposed: true,
    theme,
    valueFormatter: formatWithMultiplier,
  })
})
</script>

<template>
  <EmptyState
    v-if="!items.length"
    icon="pi pi-chart-bar"
    title="Nothing to compare"
    message="None of the selected metrics returned a value in this time range."
  />
  <EmptyState
    v-else-if="pieUnusable"
    icon="pi pi-chart-pie"
    title="Pie chart unavailable"
    message="Some of these metrics are negative, so they cannot be shown as shares of a whole. Switch to the bar chart to compare them."
  />
  <div v-else class="comparison-chart" :class="`comparison-chart--legend-${legendPlace}`">
    <!-- `notMerge`: bar and pie share one instance, and a merge leaves the bar's axis behind. -->
    <div class="comparison-chart__plot">
      <VChart class="chart" :option="chartOption" :update-options="{ notMerge: true }" autoresize />
    </div>
    <ChartValueLegend
      v-if="showLegend"
      :items="items"
      :place="legendPlace"
      :extended="extendedLegend"
    />
  </div>
</template>

<style scoped>
.comparison-chart {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  padding: 0.75rem;
}

.comparison-chart--legend-left,
.comparison-chart--legend-right {
  flex-direction: row;
}

.comparison-chart__plot {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.chart {
  width: 100%;
  height: 100%;
}
</style>
