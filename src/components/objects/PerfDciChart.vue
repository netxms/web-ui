<script setup>
import { computed, ref } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
} from 'echarts/components'
import Skeleton from 'primevue/skeleton'
import Button from 'primevue/button'
import ChartStatsLegend from '@/components/common/ChartStatsLegend.vue'
import { escapeHtml } from '@/utils/sanitize'
import { parseConfigColor } from '@/utils/colorUtils'
import { formatDateTime } from '@/utils/timeFormat'
import { resolveHref, isPlainLeftClick } from '@/utils/navigation'
import { useChartTheme } from '@/utils/chartTheme'
import { useElementSize } from '@/composables/useElementSize'
import { resolveLegendLayout } from '@/utils/chartLegendLayout'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
])

const props = defineProps({
  title: { type: String, default: '' },
  /**
   * Array of series descriptors:
   * { name, color, automaticColor, isArea, historyData }
   * historyData: { values: [{timestamp, value}], unitName }
   */
  series: { type: Array, required: true },
  /**
   * Chart-level settings from chartConfig (shared across series in a group):
   * { yAxisLabel, logScaleEnabled, stacked, autoScale, minYScaleValue, maxYScaleValue, showLegendAlways }
   */
  chartConfig: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  /** @type {import('vue').PropType<object>} */
  chartTarget: { type: Object, default: null },
})

const emit = defineEmits(['open-chart'])

const theme = useChartTheme()

function parseColor(colorStr) {
  if (!colorStr) return undefined
  // Legacy "0xRRGGBB" (leading zeroes dropped) or decimal; named CSS colors pass through.
  return parseConfigColor(colorStr) ?? colorStr
}

// Also covers query errors (historyData stays undefined after loading).
const hasNoData = computed(
  () =>
    !props.loading &&
    props.series.length > 0 &&
    props.series.every((s) => !s.historyData?.values?.length),
)

// Resolved here, not by ECharts: the extended legend draws its swatches outside the canvas.
function seriesColor(s, i) {
  return (s.automaticColor ? undefined : parseColor(s.color)) ?? theme.seriesColor(i)
}

const cardRef = ref(null)
const { width: cardWidth, height: cardHeight } = useElementSize(cardRef)

const legendLayout = computed(() =>
  resolveLegendLayout({
    width: cardWidth.value,
    height: cardHeight.value,
    // PerfTabGraph.java: the legend shows for a group, or whenever the DCI asked for it.
    showLegend: props.series.length > 1 || props.chartConfig.showLegendAlways === true,
    extendedLegend: props.chartConfig.extendedLegend === true,
    seriesCount: props.series.length,
    hideSingleSeriesLegend: false,
  }),
)

const showLegend = computed(() => legendLayout.value.mode === 'plain')
const showStatsLegend = computed(() => legendLayout.value.mode === 'extended')

const statsSeries = computed(() =>
  props.series.map((s, i) => ({
    name: s.name,
    color: seriesColor(s, i),
    unit: s.historyData?.unitName ?? '',
    points: (s.historyData?.values ?? []).map((v) => [
      new Date(v.timestamp).getTime(),
      Number(v.value),
    ]),
  })),
)

// The anchor handles ctrl/cmd/middle click natively; a plain click goes to the parent.
function onOpenClick(event) {
  if (!isPlainLeftClick(event)) return
  event.preventDefault()
  emit('open-chart')
}

const chartOption = computed(() => {
  const cfg = props.chartConfig
  const isStacked = cfg.stacked ?? false
  const unit = props.series[0]?.historyData?.unitName ?? ''

  const echartsSeriesList = props.series.map((s, i) => {
    const values = s.historyData?.values ?? []
    const color = seriesColor(s, i)
    const seriesDef = {
      name: s.name,
      type: 'line',
      showSymbol: values.length < 50,
      smooth: false,
      lineStyle: { width: 1.5, ...(color ? { color } : {}) },
      itemStyle: color ? { color } : {},
      data: values.map((v) => [new Date(v.timestamp).getTime(), Number(v.value)]),
    }
    if (s.isArea) {
      // No color: an explicit one overrides ECharts' derived gradient with a flat gray fill.
      seriesDef.areaStyle = { opacity: 0.3 }
    }
    if (isStacked) {
      seriesDef.stack = 'total'
    }
    return seriesDef
  })

  const topPadding = 12
  const legendBand = showLegend.value ? 34 : 0
  // ECharts draws the y-axis name above the plot area.
  const axisNameBand = cfg.yAxisLabel || unit ? 22 : 0

  return {
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { animation: false },
      formatter: (params) => {
        if (!params?.length) return ''
        const date = formatDateTime(params[0].value[0])
        // p.marker is ECharts' own colour-swatch HTML; everything else is server data.
        const lines = params.map(
          (p) =>
            `${p.marker}${escapeHtml(p.seriesName)}: ${escapeHtml(p.value[1])}${unit ? ' ' + escapeHtml(unit) : ''}`,
        )
        return [date, ...lines].join('<br/>')
      },
    },
    legend: showLegend.value
      ? { top: topPadding, left: 'center', type: 'scroll', textStyle: { fontSize: 11 } }
      : { show: false },
    grid: {
      left: 60,
      right: 20,
      top: topPadding + Math.max(legendBand, axisNameBand),
      bottom: 50,
    },
    xAxis: { type: 'time' },
    yAxis: {
      type: cfg.logScaleEnabled ? 'log' : 'value',
      name: cfg.yAxisLabel || unit || undefined,
      nameTextStyle: { fontSize: 11 },
      ...(!cfg.autoScale && cfg.minYScaleValue != null ? { min: cfg.minYScaleValue } : {}),
      ...(!cfg.autoScale && cfg.maxYScaleValue != null ? { max: cfg.maxYScaleValue } : {}),
    },
    dataZoom: [{ type: 'inside', start: 0, end: 100 }],
    series: echartsSeriesList,
  }
})
</script>

<template>
  <div ref="cardRef" class="perf-chart-card">
    <div class="perf-chart-header">
      <span class="perf-chart-title">{{ title }}</span>
      <Button
        v-if="chartTarget"
        v-tooltip.left="'Open in chart view'"
        as="a"
        :href="resolveHref(chartTarget)"
        icon="pi pi-external-link"
        size="small"
        text
        rounded
        severity="secondary"
        class="perf-chart-open"
        aria-label="Open in chart view"
        @click="onOpenClick"
      />
    </div>
    <Skeleton v-if="loading" height="280px" class="chart-skeleton" />
    <template v-else>
      <div class="chart-body">
        <VChart :option="chartOption" autoresize style="height: 280px; width: 100%" />
        <div v-if="hasNoData" class="no-data-overlay">
          <i class="pi pi-chart-line no-data-icon" />
          <span>No data</span>
        </div>
      </div>
      <ChartStatsLegend v-if="showStatsLegend && !hasNoData" :series="statsSeries" />
    </template>
  </div>
</template>

<style scoped>
.perf-chart-card {
  display: flex;
  flex-direction: column;
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  border-radius: var(--p-border-radius-md, 6px);
  overflow: hidden;
  transition: opacity 0.2s;
}

.perf-chart-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-section, var(--p-surface-ground));
}

.perf-chart-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-color);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.perf-chart-open {
  opacity: 0;
  transition: opacity 0.15s;
}

.perf-chart-card:hover .perf-chart-open,
.perf-chart-open:focus-visible {
  opacity: 1;
}

.chart-skeleton {
  border-radius: 0;
}

.chart-body {
  position: relative;
  flex-shrink: 0;
}

/* The plot has a fixed height here, so the table is capped against the card instead. */
.perf-chart-card :deep(.chart-legend) {
  max-height: 12rem;
}

.no-data-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  background: color-mix(in srgb, var(--p-surface-card) 75%, transparent);
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  pointer-events: none;
}

.no-data-icon {
  font-size: 1.25rem;
  opacity: 0.5;
}
</style>
