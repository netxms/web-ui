// No ECharts legend: all items share one series, and a legend binds to series, not data points.
// The widgets render ChartValueLegend instead.

import { escapeHtml } from '@/utils/sanitize'

/**
 * @typedef {{ name: string, value: number, color?: string }} ChartItem
 */

/**
 * @param {object} opts
 * @param {ChartItem[]} opts.items
 * @param {boolean} [opts.transposed] - horizontal bars
 * @param {boolean} [opts.tube] - thick rounded bars on a background track
 * @param {object} opts.theme - snapshot from useChartTheme()
 * @param {(value: number) => string} [opts.valueFormatter]
 */
export function buildBarOption({ items, transposed = false, tube = false, theme, valueFormatter }) {
  const names = items.map((d) => d.name)
  const axis = theme.axisStyle.value
  const format = valueFormatter ?? ((v) => v)

  const categoryAxis = {
    type: 'category',
    data: names,
    ...axis,
    splitLine: { show: false },
  }
  const valueAxis = {
    type: 'value',
    ...axis,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { ...axis.axisLabel, formatter: format },
  }

  return {
    backgroundColor: 'transparent',
    animationDuration: 200,
    tooltip: {
      trigger: 'axis',
      confine: true,
      ...theme.tooltipStyle.value,
      valueFormatter: format,
    },
    legend: { show: false },
    grid: { left: 8, right: 16, top: 12, bottom: 4, containLabel: true },
    xAxis: transposed ? valueAxis : categoryAxis,
    yAxis: transposed ? categoryAxis : valueAxis,
    series: [
      {
        type: 'bar',
        barMaxWidth: tube ? 28 : 40,
        showBackground: tube,
        backgroundStyle: tube ? { color: theme.ink.value.grid, borderRadius: 14 } : undefined,
        itemStyle: {
          borderRadius: tube ? 14 : transposed ? [0, 4, 4, 0] : [4, 4, 0, 0],
        },
        data: items.map((d, i) => ({
          value: d.value,
          name: d.name,
          itemStyle: { color: d.color ?? theme.seriesColor(i) },
        })),
      },
    ],
  }
}

/**
 * @param {object} opts
 * @param {ChartItem[]} opts.items
 * @param {boolean} [opts.doughnut]
 * @param {boolean} [opts.showTotal] - total in the doughnut center
 * @param {object} opts.theme - snapshot from useChartTheme()
 */
export function buildPieOption({ items, doughnut = false, showTotal = false, theme }) {
  return {
    backgroundColor: 'transparent',
    animationDuration: 200,
    tooltip: {
      trigger: 'item',
      confine: true,
      ...theme.tooltipStyle.value,
      // p.marker is ECharts' own colour-swatch HTML; p.name is caller-supplied data.
      formatter: (p) => `${p.marker}${escapeHtml(p.name)}: ${escapeHtml(p.value)} (${p.percent}%)`,
    },
    legend: { show: false },
    series: [
      {
        type: 'pie',
        radius: doughnut ? ['40%', '70%'] : '65%',
        center: ['50%', '50%'],
        itemStyle: { borderWidth: 2, borderColor: 'transparent' },
        data: items.map((d, i) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: d.color ?? theme.seriesColor(i) },
        })),
        label: { show: false },
        emphasis: { label: { show: true, fontSize: 12, fontWeight: 'bold' } },
        ...(showTotal && doughnut
          ? {
              label: {
                show: true,
                position: 'center',
                formatter: () => items.reduce((sum, d) => sum + d.value, 0).toLocaleString(),
                fontSize: 14,
                fontWeight: 'bold',
                color: theme.ink.value.text,
              },
            }
          : {}),
      },
    ],
  }
}
