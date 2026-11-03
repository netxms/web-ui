<script setup>
// Markers use zrender events: ECharts' `click` only fires over a data point.
import { computed, ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
} from 'echarts/components'
import { useChartTheme } from '@/utils/chartTheme'
import { useElementSize } from '@/composables/useElementSize'
import { buildLineChartOption } from '@/utils/dciChartOptions'

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
])

const props = defineProps({
  /** @type {object} chart model — see utils/dciChartModel */
  model: { type: Object, required: true },
  /** @type {import('@/utils/dciChartOptions').ChartSeries[]} */
  series: { type: Array, default: () => [] },
})

const emit = defineEmits(['update:markers'])

const theme = useChartTheme()
const chartRef = shallowRef(null)

// ECharts cannot read CSS custom properties, so the marker colour flows from chartTheme to CSS.
const markerVars = computed(() => ({
  '--chart-marker': theme.ink.value.marker,
  '--chart-marker-text': theme.ink.value.markerText,
}))

/** Pixels. */
const GRAB_RADIUS = 8

// Committed markers live in the model (and the URL); during a drag the moved one is held here,
// so the drag writes one history entry on release, not one per pixel.

const sortedMarkers = computed(() => [...(props.model.markers ?? [])].sort((a, b) => a - b))

const dragIndex = ref(null)
const dragValue = ref(null)
const hovered = ref(false)

const effectiveMarkers = computed(() => {
  if (dragIndex.value == null || dragValue.value == null) return sortedMarkers.value
  const next = [...sortedMarkers.value]
  next[dragIndex.value] = dragValue.value
  return next
})

const renderModel = computed(() =>
  dragIndex.value == null ? props.model : { ...props.model, markers: effectiveMarkers.value },
)

// Width only thins out axis ticks, so measuring it cannot feed back into the chart's size.
const canvasRef = ref(null)
const { width: canvasWidth } = useElementSize(canvasRef)

const chartOption = computed(() =>
  buildLineChartOption(renderModel.value, props.series, theme, canvasWidth.value),
)

function toPixel(value) {
  const px = chartRef.value?.convertToPixel({ xAxisIndex: 0 }, value)
  return Number.isFinite(px) ? px : null
}

function toValue(pixelX) {
  const v = chartRef.value?.convertFromPixel({ xAxisIndex: 0 }, pixelX)
  return Number.isFinite(v) ? v : null
}

function inPlotArea(event) {
  return chartRef.value?.containPixel('grid', [event.offsetX, event.offsetY]) === true
}

function markerAt(pixelX) {
  let found = null
  let best = GRAB_RADIUS
  effectiveMarkers.value.forEach((marker, i) => {
    const px = toPixel(marker)
    if (px == null) return
    const distance = Math.abs(px - pixelX)
    if (distance <= best) {
      best = distance
      found = i
    }
  })
  return found
}

function addMarker(value) {
  emit('update:markers', [...sortedMarkers.value, Math.round(value)])
}

// Shift is the advertised modifier: most Linux window managers swallow alt-click.
function onClick(event) {
  const native = event.event
  if (!(native?.altKey || native?.shiftKey) || !inPlotArea(event)) return
  const value = toValue(event.offsetX)
  if (value != null) addMarker(value)
}

function addMarkerAtCentre() {
  const instance = chartRef.value?.chart
  if (!instance) return
  const centreX = instance.getWidth() / 2
  const value = toValue(centreX)
  if (value == null) return

  // Step aside rather than stack two indistinguishable lines.
  const offsetX = markerAt(centreX) == null ? centreX : centreX + instance.getWidth() * 0.15
  addMarker(toValue(offsetX) ?? value)
}

function onMouseDown(event) {
  const index = markerAt(event.offsetX)
  if (index == null) return
  dragIndex.value = index
  dragValue.value = effectiveMarkers.value[index]
}

function onMouseMove(event) {
  if (dragIndex.value == null) {
    hovered.value = markerAt(event.offsetX) != null
    return
  }
  // Off the plot area the marker holds its last position.
  if (!inPlotArea(event)) return
  const value = toValue(event.offsetX)
  if (value != null) dragValue.value = Math.round(value)
}

function onMouseUp() {
  if (dragIndex.value == null) return
  emit('update:markers', [...effectiveMarkers.value])
  dragIndex.value = null
  dragValue.value = null
}

function onDoubleClick(event) {
  const index = markerAt(event.offsetX)
  if (index == null) return
  emit(
    'update:markers',
    sortedMarkers.value.filter((_, i) => i !== index),
  )
}

// vue-echarts exposes the instance (and so zrender) only after it mounts, hence a watcher.
let detach = null

watch(
  () => chartRef.value?.chart,
  (instance) => {
    detach?.()
    detach = null
    if (!instance) return

    const zr = instance.getZr()
    zr.on('click', onClick)
    zr.on('mousedown', onMouseDown)
    zr.on('mousemove', onMouseMove)
    zr.on('mouseup', onMouseUp)
    // A drag released outside the canvas would otherwise never commit.
    zr.on('globalout', onMouseUp)
    zr.on('dblclick', onDoubleClick)

    detach = () => {
      zr.off('click', onClick)
      zr.off('mousedown', onMouseDown)
      zr.off('mousemove', onMouseMove)
      zr.off('mouseup', onMouseUp)
      zr.off('globalout', onMouseUp)
      zr.off('dblclick', onDoubleClick)
    }
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => detach?.())

/** Percentages. */
function currentWindow() {
  const zoom = chartRef.value?.chart?.getOption()?.dataZoom?.[0]
  return { start: zoom?.start ?? 0, end: zoom?.end ?? 100 }
}

function zoomBy(factor) {
  const { start, end } = currentWindow()
  const centre = (start + end) / 2
  const half = ((end - start) / 2) * factor
  chartRef.value?.dispatchAction({
    type: 'dataZoom',
    start: Math.max(0, centre - half),
    end: Math.min(100, centre + half),
  })
}

const zoomIn = () => zoomBy(0.5)
const zoomOut = () => zoomBy(2)

function resetZoom() {
  chartRef.value?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })
}

function getDataURL() {
  return chartRef.value?.getDataURL({ pixelRatio: 2, backgroundColor: 'transparent' })
}

defineExpose({ resetZoom, zoomIn, zoomOut, getDataURL, addMarkerAtCentre })
</script>

<template>
  <div ref="canvasRef" class="chart-canvas">
    <!-- Not an overlay: it would cover the marker chips on the plot's top edge. -->
    <div v-if="sortedMarkers.length" class="chart-canvas__hint-row">
      <p class="chart-canvas__hint" :style="markerVars">
        <i class="pi pi-map-marker" aria-hidden="true" />
        Drag to move, double-click to remove, shift-click the chart to add another
      </p>
    </div>

    <VChart
      ref="chartRef"
      class="chart"
      :class="{
        'chart--grabbable': hovered,
        'chart--grabbing': dragIndex !== null,
      }"
      :option="chartOption"
      autoresize
    />
  </div>
</template>

<style scoped>
.chart-canvas {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.chart {
  flex: 1;
  width: 100%;
  min-height: 0;
}

.chart--grabbable {
  cursor: ew-resize;
}

.chart--grabbing {
  cursor: grabbing;
}

.chart-canvas__hint-row {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding: 0.25rem 0 0.125rem;
}

.chart-canvas__hint {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0;
  padding: 0.1875rem 0.5rem;
  border-radius: 999px;
  background: var(--chart-marker);
  color: var(--chart-marker-text);
  font-size: 0.75rem;
  line-height: 1;
  pointer-events: none;
}

.chart-canvas__hint .pi {
  font-size: 0.6875rem;
}
</style>
