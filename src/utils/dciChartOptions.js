import { escapeHtml } from '@/utils/sanitize'
import { formatDateTime, formatDurationCompact, formatTimeShort } from '@/utils/timeFormat'
import { formatWithMultiplier, timeAxisSplitNumber } from '@/utils/chartTheme'
import { percentile, resolveTimeRange } from '@/utils/dciChartModel'

/**
 * @typedef {object} ChartSeries
 * @property {string} name - legend label
 * @property {Array<{ timestamp: string|number, value?: number, avg?: number, min?: number, max?: number }>} values
 * @property {string} [unitName]
 * @property {boolean} [aggregated] - rows carry avg/min/max, so a band can be drawn
 * @property {string} [color] - explicit colour; falls back to the theme's slot colour
 */

/** `SLIDER_BAND` is reserved below the grid: `containLabel` knows nothing about the slider. */
const SLIDER_HEIGHT = 18
const SLIDER_BOTTOM = 10
const SLIDER_BAND = SLIDER_HEIGHT + SLIDER_BOTTOM + 14

const MARKER_LABEL_BAND = 24

/** Series sit at z 2; marker chrome below that is painted over by the data. */
const MARKER_Z = 10

function markerPillStyle(ink) {
  return {
    fontSize: 10,
    color: ink.markerText,
    backgroundColor: ink.marker,
    padding: [2, 5],
    borderRadius: 3,
  }
}

function pointValue(row) {
  return Number(row.value ?? row.avg)
}

function timestampOf(row) {
  return new Date(row.timestamp).getTime()
}

/**
 * @param {object} model - see utils/dciChartModel
 * @param {ChartSeries[]} series
 * @param {object} theme - snapshot from useChartTheme()
 * @param {number} [plotWidth] - plot width in px, for time axis tick density (0 = unknown)
 * @returns {object} ECharts option
 */
export function buildLineChartOption(model, series, theme, plotWidth = 0) {
  const render = model.render ?? {}
  const axis = theme.axisStyle.value
  const unit = series.find((s) => s.unitName)?.unitName ?? ''
  const formatValue = (v) => formatWithMultiplier(v)

  // From the DCI index, not the ECharts series position: a band adds two series per DCI.
  const colorFor = (s, i) => s.color ?? theme.seriesColor(i)

  const echartsSeries = []

  series.forEach((s, i) => {
    const color = colorFor(s, i)
    const rows = s.values ?? []
    const points = rows.map((row) => [timestampOf(row), pointValue(row)])

    // Band: an invisible lower bound plus a stacked delta carrying the fill. The pair must
    // stack together and on nothing else, hence a per-series stack id.
    if (model.band && s.aggregated && rows.some((r) => r.min != null && r.max != null)) {
      const stack = `band-${i}`
      echartsSeries.push(
        {
          name: `${s.name} (min)`,
          type: 'line',
          stack,
          silent: true,
          symbol: 'none',
          lineStyle: { opacity: 0 },
          tooltip: { show: false },
          data: rows.map((row) => [timestampOf(row), Number(row.min)]),
        },
        {
          name: `${s.name} (band)`,
          type: 'line',
          stack,
          silent: true,
          symbol: 'none',
          lineStyle: { opacity: 0 },
          areaStyle: { color, opacity: 0.15 },
          tooltip: { show: false },
          data: rows.map((row) => [timestampOf(row), Number(row.max) - Number(row.min)]),
        },
      )
    }

    const asArea = render.area || render.stacked
    echartsSeries.push({
      name: s.name,
      type: 'line',
      showSymbol: points.length < 50,
      smooth: false,
      color,
      lineStyle: { width: 1.5, color },
      itemStyle: { color },
      ...(render.stacked ? { stack: 'total' } : {}),
      ...(asArea ? { areaStyle: { opacity: render.translucent ? 0.15 : 0.3 } } : {}),
      // Always present, even when empty: ECharts merges options, so an omitted
      // markLine/markArea keeps whatever was drawn last.
      markLine: {
        symbol: 'none',
        silent: true,
        z: MARKER_Z,
        data: percentileItem(model, points, color, i),
      },
      markArea: { silent: true, z: MARKER_Z, data: [] },
      data: points,
    })
  })

  // Delta-t markers are chart-level, but a markLine needs a host series.
  const firstReal = echartsSeries.find((s) => !s.silent)
  const markers = [...(model.markers ?? [])].sort((a, b) => a - b)
  if (firstReal && markers.length) {
    const stamp = markerTimeFormatter(model)
    const ink = theme.ink.value

    firstReal.markLine.data = [
      ...firstReal.markLine.data,
      ...markers.map((x) => ({
        xAxis: x,
        lineStyle: { color: ink.marker, type: 'dashed', width: 1.5, opacity: 0.9 },
        label: {
          show: true,
          position: 'end',
          formatter: stamp(x),
          ...markerPillStyle(ink),
        },
      })),
    ]

    // A markArea so the gap label tracks the pair through zoom and resize.
    if (markers.length > 1) {
      // Value delta only with exactly one series, as in legacy LineChart.paintMarkerDeltas.
      const single =
        series.length === 1
          ? (series[0].values ?? []).map((row) => [timestampOf(row), pointValue(row)])
          : null
      const valueDelta = (from, to) => {
        const a = single && nearestValue(single, from)
        const b = single && nearestValue(single, to)
        if (a == null || b == null) return ''
        return `  \u0394 ${formatWithMultiplier(b - a)}${unit ? ' ' + unit : ''}`
      }

      firstReal.markArea.itemStyle = { color: ink.marker, opacity: 0.05 }
      firstReal.markArea.data = markers.slice(0, -1).map((from, i) => [
        {
          xAxis: from,
          label: {
            show: true,
            position: 'insideBottom',
            formatter:
              `\u0394t ${formatDurationCompact(Math.round((markers[i + 1] - from) / 1000))}` +
              valueDelta(from, markers[i + 1]),
            ...markerPillStyle(ink),
          },
        },
        { xAxis: markers[i + 1] },
      ])
    }
  }

  const legendShown = render.legend !== 'none' && series.length > 0
  // The extended legend is a separate component; ECharts' legend is only the brief form.
  const useNativeLegend = legendShown && !render.extendedLegend
  const legendAt = useNativeLegend ? render.legend : null
  const legendOnSide = legendAt === 'left' || legendAt === 'right'
  const SIDE_LEGEND_BAND = 150

  return {
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { animation: false },
      ...theme.tooltipStyle.value,
      formatter: (params) => {
        const rows = (Array.isArray(params) ? params : [params]).filter(
          (p) =>
            p.seriesName && !p.seriesName.endsWith('(min)') && !p.seriesName.endsWith('(band)'),
        )
        if (!rows.length) return ''
        const date = formatDateTime(rows[0].value[0])
        // p.marker is ECharts' own swatch HTML; everything else is server data.
        const lines = rows.map(
          (p) =>
            `${p.marker}${escapeHtml(p.seriesName)}: ${escapeHtml(formatValue(p.value[1]))}` +
            (unit ? ' ' + escapeHtml(unit) : ''),
        )
        return [date, ...lines].join('<br/>')
      },
    },
    legend: legendAt
      ? {
          type: 'scroll',
          // Keeps the band helper series out of the legend.
          data: series.map((s) => s.name),
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
                ...(legendAt === 'top' ? { top: 0 } : { bottom: SLIDER_BAND - 6 }),
              }),
        }
      : { show: false },
    grid: {
      left: 8 + (legendAt === 'left' ? SIDE_LEGEND_BAND + 8 : 0),
      right: 16 + (legendAt === 'right' ? SIDE_LEGEND_BAND + 8 : 0),
      // Marker chips hang above the plot's top edge.
      top: (legendAt === 'top' ? 30 : 12) + (markers.length ? MARKER_LABEL_BAND : 0),
      bottom: SLIDER_BAND + (legendAt === 'bottom' ? 22 : 0),
      containLabel: true,
    },
    xAxis: {
      type: 'time',
      splitNumber: timeAxisSplitNumber(plotWidth),
      ...axis,
      splitLine: { show: false },
    },
    yAxis: buildYAxis(model, unit, axis, formatValue),
    dataZoom: [
      // Plain drag belongs to the marker interaction; panning stays on the slider.
      { type: 'inside', moveOnMouseMove: false, zoomOnMouseWheel: true },
      {
        type: 'slider',
        height: SLIDER_HEIGHT,
        bottom: SLIDER_BOTTOM,
        textStyle: theme.legendStyle.value.textStyle,
      },
    ],
    series: echartsSeries,
  }
}

function buildYAxis(model, unit, axis, formatValue) {
  const render = model.render ?? {}
  const y = model.yAxis ?? { auto: true }

  return {
    type: render.log ? 'log' : 'value',
    scale: y.auto !== false,
    ...(y.auto === false ? { min: y.min ?? undefined, max: y.max ?? undefined } : {}),
    name: y.label || unit || undefined,
    nameTextStyle: { fontSize: 11, color: axis.axisLabel.color },
    ...axis,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: render.showGrid === false ? { show: false } : axis.splitLine,
    axisLabel: { ...axis.axisLabel, formatter: formatValue },
  }
}

/** Style lives on the data item: markers share this markLine and need their own style. */
function percentileItem(model, points, color, index = 0) {
  if (!model.percentile) return []
  const value = percentile(
    points.map((p) => p[1]),
    model.percentile,
  )
  if (value == null) return []

  return [
    {
      yAxis: value,
      lineStyle: { color, type: 'dashed', width: 1.5 },
      label: {
        show: true,
        formatter: `${model.percentile}%`,
        // Alternating sides and stepping the distance keeps close percentile labels apart.
        position: index % 2 === 0 ? 'insideEndTop' : 'insideStartTop',
        distance: 3 + Math.floor(index / 2) * 14,
        fontSize: 10,
        color: '#ffffff',
        backgroundColor: color,
        padding: [2, 5],
        borderRadius: 3,
      },
    },
  ]
}

/**
 * @param {Array<[number, number]>} points
 * @param {number} ms
 */
function nearestValue(points, ms) {
  let best = null
  let bestGap = Infinity
  for (const [t, v] of points) {
    if (!Number.isFinite(v)) continue
    const gap = Math.abs(t - ms)
    if (gap < bestGap) {
      bestGap = gap
      best = v
    }
  }
  return best
}

function markerTimeFormatter(model) {
  const { timeFrom, timeTo } = resolveTimeRange(model)
  const withinADay = timeTo - timeFrom <= 86400
  return (ms) => (withinADay ? formatTimeShort(ms) : formatDateTime(ms))
}

/**
 * @param {ChartSeries[]} series
 * @param {object} theme
 */
export function buildSeriesPoints(series, theme) {
  return series.map((s, i) => ({
    name: s.name,
    color: s.color ?? theme.seriesColor(i),
    unit: s.unitName ?? '',
    points: (s.values ?? []).map((row) => [timestampOf(row), pointValue(row)]),
  }))
}
