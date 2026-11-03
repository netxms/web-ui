<script setup>
import { computed, ref } from 'vue'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import ChartStatsLegend from '@/components/common/ChartStatsLegend.vue'
import { escapeHtml } from '@/utils/sanitize'
import { useDciHistory } from '@/queries/useObjectQueries'
import { useChartTheme, formatWithMultiplier, timeAxisSplitNumber } from '@/utils/chartTheme'
import { resolveLegendLayout, isSidePlacement } from '@/utils/chartLegendLayout'
import { useElementSize } from '@/composables/useElementSize'
import { useWidgetDrillDown } from '@/composables/useWidgetDrillDown'
import { useWidgetActive } from '@/composables/useWidgetActive'
import { useRuntimeDciList } from '@/composables/useRuntimeDciList'
import { formatDateTime } from '@/utils/timeFormat'

use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
])

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})
// Template entries expanded for the dashboard's context object; concrete ones pass through.
const { dciList, isResolving, resolveError } = useRuntimeDciList(cfg)

const theme = useChartTheme()
const { hasDrillDown, drillDownBindings } = useWidgetDrillDown(cfg)

// Legacy timeUnits: 0 minutes, 1 hours, 2 days
const TIME_UNIT_SECONDS = { 0: 60, 1: 3600, 2: 86400 }
const timeRangeSeconds = computed(
  () => (cfg.value.timeRange || 1) * (TIME_UNIT_SECONDS[cfg.value.timeUnits] ?? 3600),
)

// Hooks cannot be called conditionally: fixed query slots, extras gated with `enabled`.
const MAX_DCIS = 8

// Always true outside a dashboard. With a history query per DCI, an off-screen refresh costs
// the most here.
const active = useWidgetActive()

const queries = Array.from({ length: MAX_DCIS }, (_, i) => {
  const nodeId = computed(() => dciList.value[i]?.nodeId ?? null)
  const dciId = computed(() => dciList.value[i]?.dciId ?? null)
  return useDciHistory(nodeId, dciId, {
    enabled: computed(
      () => active.value && i < dciList.value.length && !!nodeId.value && !!dciId.value,
    ),
    timeRangeSeconds,
    refetchInterval: (props.widget.config?.refreshRate ?? 30) * 1000,
  })
})

const isLoading = computed(
  () => isResolving.value || queries.some((q, i) => i < dciList.value.length && q.isLoading.value),
)
const hasError = computed(
  () => !!resolveError.value || queries.some((q, i) => i < dciList.value.length && q.isError.value),
)
const firstError = computed(() => {
  if (resolveError.value) return resolveError.value
  const q = queries.find((q, i) => i < dciList.value.length && q.isError.value)
  return q?.error?.value ?? null
})

function retryFailed() {
  queries.forEach((q, i) => {
    if (i < dciList.value.length && q.isError.value) q.refetch()
  })
}

const hasNoData = computed(
  () =>
    !isLoading.value &&
    dciList.value.length > 0 &&
    dciList.value.every((_, i) => !queries[i]?.data?.value?.values?.length),
)

// Series in a chart usually share a unit.
const unit = computed(() => {
  for (let i = 0; i < dciList.value.length; i++) {
    const u = queries[i]?.data?.value?.unitName
    if (u) return u
  }
  return ''
})

// The legend choice is measured from the outer box, never the plot area: the plot shrinks when
// the stats table appears, which would flip the choice every frame. The plot is measured only
// for tick density.

const rootRef = ref(null)
const plotRef = ref(null)
const { width: widgetWidth, height: widgetHeight } = useElementSize(rootRef)
const { width: plotWidth } = useElementSize(plotRef)

const legendLayout = computed(() =>
  resolveLegendLayout({
    width: widgetWidth.value,
    height: widgetHeight.value,
    showLegend: cfg.value.showLegend !== false,
    extendedLegend: cfg.value.extendedLegend === true,
    seriesCount: dciList.value.length,
    position: cfg.value.legendPosition,
  }),
)

const showLegend = computed(() => legendLayout.value.mode === 'plain')
const showStatsLegend = computed(() => legendLayout.value.mode === 'extended')
const legendPlace = computed(() => legendLayout.value.place)
// Only the stats table changes layout; the plain legend is drawn inside the ECharts canvas.
const statsLegendOnSide = computed(
  () => showStatsLegend.value && isSidePlacement(legendPlace.value),
)

/** The same points the plot draws, per-series units. */
const statsSeries = computed(() =>
  dciList.value.slice(0, MAX_DCIS).map((dci, i) => {
    const invert = dci.invertValues === true
    const values = queries[i]?.data?.value?.values ?? []
    return {
      name: dci.name || `DCI ${dci.dciId}`,
      color: dci.color ?? theme.seriesColor(i),
      unit: queries[i]?.data?.value?.unitName ?? '',
      points: values.map((v) => [
        new Date(v.timestamp).getTime(),
        invert ? -Number(v.value) : Number(v.value),
      ]),
    }
  }),
)

const chartOption = computed(() => {
  const autoScale = cfg.value.autoScale !== false
  const stacked = cfg.value.stacked === true
  const globalArea = cfg.value.area === true
  const useMultipliers = cfg.value.useMultipliers !== false
  const u = unit.value
  const axis = theme.axisStyle.value

  const seriesList = dciList.value.slice(0, MAX_DCIS).map((dci, i) => {
    const values = queries[i]?.data?.value?.values ?? []
    const invert = dci.invertValues === true
    const asArea = globalArea || dci.lineChartType === 1
    return {
      name: dci.name || `DCI ${dci.dciId}`,
      type: 'line',
      showSymbol: values.length < 50,
      smooth: false,
      lineStyle: { width: 2 },
      color: dci.color ?? theme.seriesColor(i),
      ...(stacked ? { stack: 'total' } : {}),
      ...(asArea || stacked ? { areaStyle: { opacity: 0.25 } } : {}),
      data: values.map((v) => [
        new Date(v.timestamp).getTime(),
        invert ? -Number(v.value) : Number(v.value),
      ]),
    }
  })

  const formatValue = (v) => (useMultipliers ? formatWithMultiplier(v) : String(v))
  const gridLeft = 8
  const gridRight = 16
  const LEGEND_BAND = 24
  // A vertical legend gets a fixed column and truncates labels, so a long DCI description
  // cannot eat the plot.
  const SIDE_LEGEND_BAND = 130
  const legendAt = showLegend.value ? legendPlace.value : null
  const legendOnSide = isSidePlacement(legendAt)

  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { animation: false },
      ...theme.tooltipStyle.value,
      formatter: (params) => {
        if (!params?.length) return ''
        const date = formatDateTime(params[0].value[0])
        // p.marker is ECharts' own colour-swatch HTML; everything else is server data.
        const lines = params.map(
          (p) =>
            `${p.marker}${escapeHtml(p.seriesName)}: ${escapeHtml(formatValue(p.value[1]))}${u ? ' ' + escapeHtml(u) : ''}`,
        )
        return [date, ...lines].join('<br/>')
      },
    },
    legend: legendAt
      ? {
          type: 'scroll',
          ...theme.legendStyle.value,
          ...(legendOnSide
            ? {
                orient: 'vertical',
                top: 'middle',
                [legendAt]: 4,
                width: SIDE_LEGEND_BAND,
                textStyle: {
                  ...theme.legendStyle.value.textStyle,
                  width: SIDE_LEGEND_BAND - 24,
                  overflow: 'truncate',
                },
              }
            : {
                orient: 'horizontal',
                ...(legendAt === 'top' ? { top: 0 } : { bottom: 0 }),
                left: 40,
                right: gridRight,
              }),
        }
      : { show: false },
    grid: {
      left: gridLeft + (legendAt === 'left' ? SIDE_LEGEND_BAND + 8 : 0),
      right: gridRight + (legendAt === 'right' ? SIDE_LEGEND_BAND + 8 : 0),
      top: (legendAt === 'top' ? LEGEND_BAND : 0) + 10,
      bottom: (legendAt === 'bottom' ? LEGEND_BAND : 0) + 4,
      containLabel: true,
    },
    xAxis: {
      type: 'time',
      // `hideOverlap` in the shared axis style is only the safety net.
      splitNumber: timeAxisSplitNumber(plotWidth.value),
      ...axis,
      splitLine: { show: false },
    },
    yAxis: {
      type: cfg.value.logScaleEnabled ? 'log' : 'value',
      scale: autoScale,
      ...(autoScale
        ? {}
        : {
            min: cfg.value.minYScaleValue ?? undefined,
            max: cfg.value.maxYScaleValue ?? undefined,
          }),
      name: cfg.value.yAxisLabel || u || undefined,
      nameTextStyle: { fontSize: 11, color: theme.ink.value.muted },
      ...axis,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: cfg.value.showGrid === false ? { show: false } : axis.splitLine,
      axisLabel: { ...axis.axisLabel, formatter: formatValue },
    },
    dataZoom: [{ type: 'inside' }],
    series: seriesList,
  }
})
</script>

<template>
  <div
    ref="rootRef"
    class="line-chart-widget"
    :class="[
      `line-chart-widget--legend-${legendPlace}`,
      { 'line-chart-widget--legend-side': statsLegendOnSide },
    ]"
  >
    <div v-if="isLoading" class="chart-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading…</span>
    </div>
    <div v-else-if="hasError" class="chart-state chart-state--error">
      <QueryErrorState :error="firstError" message="Failed to load DCI data" @retry="retryFailed" />
    </div>
    <div v-else-if="dciList.length === 0" class="chart-state">
      <i class="pi pi-chart-line" />
      <span>No DCIs configured</span>
    </div>
    <template v-else>
      <div
        ref="plotRef"
        class="chart-wrap"
        :class="{ 'chart-wrap--clickable': hasDrillDown }"
        v-bind="drillDownBindings"
      >
        <VChart class="chart" :option="chartOption" autoresize />
        <div v-if="hasNoData" class="no-data-overlay">
          <i class="pi pi-chart-line no-data-icon" />
          <span>No values found</span>
        </div>
      </div>
      <ChartStatsLegend v-if="showStatsLegend" :series="statsSeries" :place="legendPlace" />
    </template>
  </div>
</template>

<style scoped>
.line-chart-widget {
  display: flex;
  /* A side legend turns the widget into a row instead. */
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.line-chart-widget--legend-side {
  flex-direction: row;
}

.chart-wrap {
  flex: 1;
  position: relative;
  min-width: 0;
  min-height: 0;
}

/* A widget has less room than a full-page chart, so the table gets a larger share. */
.line-chart-widget--legend-top :deep(.chart-legend),
.line-chart-widget--legend-bottom :deep(.chart-legend) {
  max-height: 40%;
}

.chart-wrap--clickable {
  cursor: pointer;
}

.chart {
  width: 100%;
  height: 100%;
}

.chart-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  width: 100%;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.chart-state i {
  font-size: 1.5rem;
  opacity: 0.5;
}

.chart-state--error {
  color: var(--p-red-400, #f87171);
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
