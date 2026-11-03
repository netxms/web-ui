<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent } from 'echarts/components'
import { getDciSeriesKind } from '@/utils/objectUtils'
import { escapeHtml } from '@/utils/sanitize'
import { formatDateTime } from '@/utils/timeFormat'
import { useChartTheme, formatWithMultiplier } from '@/utils/chartTheme'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, DataZoomComponent])

const props = defineProps({
  historyData: { type: Object, required: true },
})

const theme = useChartTheme()

function boolLabel(v) {
  return v === 1 ? 'Yes' : v === 0 ? 'No' : ''
}

const chartOption = computed(() => {
  const values = props.historyData?.values ?? []
  const unit = props.historyData?.unitName ?? ''

  const kind = getDciSeriesKind(values)
  const isBoolean = kind === 'boolean'
  const isStep = kind === 'boolean' || kind === 'discrete'

  const axis = theme.axisStyle.value
  const color = theme.seriesColor(0)

  // Styled like utils/dciChartOptions, also without an entrance animation.
  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { animation: false },
      ...theme.tooltipStyle.value,
      formatter: (params) => {
        const point = params[0]
        if (!point) return ''
        const date = new Date(point.value[0])
        const formatted = formatDateTime(date)
        const value = isBoolean ? boolLabel(point.value[1]) : formatWithMultiplier(point.value[1])
        const suffix = !isBoolean && unit ? ' ' + unit : ''
        // ECharts injects this as HTML; the value comes from the device.
        return `${formatted}<br/>${escapeHtml(value)}${escapeHtml(suffix)}`
      },
    },
    grid: {
      left: 8,
      right: 16,
      // The unit is the y axis name, printed above the plot.
      top: unit && !isBoolean ? 28 : 12,
      bottom: 8,
      containLabel: true,
    },
    xAxis: {
      type: 'time',
      ...axis,
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      ...axis,
      axisLine: { show: false },
      axisTick: { show: false },
      ...(isBoolean
        ? {
            min: 0,
            max: 1,
            interval: 1,
            axisLabel: { ...axis.axisLabel, formatter: boolLabel },
          }
        : {
            name: unit || undefined,
            nameTextStyle: { fontSize: 11, color: axis.axisLabel.color },
            axisLabel: { ...axis.axisLabel, formatter: formatWithMultiplier },
          }),
    },
    dataZoom: [{ type: 'inside', start: 0, end: 100 }],
    series: [
      {
        type: 'line',
        step: isStep ? 'end' : undefined,
        showSymbol: values.length < 50,
        data: values.map((v) => [new Date(v.timestamp).getTime(), Number(v.value ?? v.avg)]),
        smooth: false,
        lineStyle: { width: 1.5, color },
        itemStyle: { color },
        ...(isStep ? {} : { areaStyle: { color, opacity: 0.08 } }),
      },
    ],
  }
})
</script>

<template>
  <VChart :option="chartOption" autoresize style="height: 200px; width: 100%" />
</template>
