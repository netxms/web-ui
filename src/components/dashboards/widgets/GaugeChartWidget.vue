<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { GaugeChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useChartTheme } from '@/utils/chartTheme'
import { getStatusHexColor } from '@/utils/objectUtils'
import { useWidgetDrillDown } from '@/composables/useWidgetDrillDown'
import { useGaugeItems } from '@/composables/useGaugeItems'

use([GaugeChart, TooltipComponent, CanvasRenderer])

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})

const theme = useChartTheme()
const { hasDrillDown, drillDownBindings } = useWidgetDrillDown(cfg)

// One component for the DCI gauge and the scripted gauge; everything works off `items`.
const { isScripted, items, isLoading, hasError, firstError, isConfigured, retryFailed } =
  useGaugeItems(cfg, () => props.widget.type, theme)

const unconfiguredMessage = computed(() => {
  if (!isScripted.value) return 'No DCIs configured'
  return cfg.value.script ? 'Save the dashboard to run the script' : 'No script configured'
})

const hasNoData = computed(() => isScripted.value && items.value.length === 0)

// Legacy gauge types: 0 dial, 1 bar, 2 text
const gaugeType = computed(() => cfg.value.gaugeType ?? 0)

const range = computed(() => {
  const min = cfg.value.minValue ?? 0
  const max = cfg.value.maxValue ?? 100
  return { min, max: max > min ? max : min + 100 }
})

// Zones at both ends: below leftRed/leftYellow and above rightYellow/rightRed.
const axisColorStops = computed(() => {
  const { min, max } = range.value
  const span = max - min
  const frac = (v) => Math.min(1, Math.max(0, (v - min) / span))
  const red = getStatusHexColor(4)
  const yellow = getStatusHexColor(1)
  const ok = getStatusHexColor(0)

  const stops = []
  const leftRed = frac(cfg.value.leftRedZone ?? 0)
  const leftYellow = frac(cfg.value.leftYellowZone ?? 0)
  const rightYellow = frac(cfg.value.rightYellowZone ?? 0)
  const rightRed = frac(cfg.value.rightRedZone ?? 0)

  if (leftRed > 0) stops.push([leftRed, red])
  if (leftYellow > leftRed) stops.push([leftYellow, yellow])
  const okEnd = rightYellow > leftYellow ? rightYellow : 1
  stops.push([okEnd, ok])
  if (rightRed > rightYellow) stops.push([rightRed, yellow])
  if (rightRed < 1) stops.push([1, red])
  // Drop degenerate stops (equal fractions)
  return stops.filter((s, i) => i === 0 || s[0] > stops[i - 1][0])
})

function statusColorForValue(value) {
  const leftRed = cfg.value.leftRedZone ?? 0
  const leftYellow = cfg.value.leftYellowZone ?? 0
  const rightYellow = cfg.value.rightYellowZone ?? 0
  const rightRed = cfg.value.rightRedZone ?? 0
  if ((leftRed > range.value.min && value < leftRed) || (rightRed > 0 && value >= rightRed)) {
    return getStatusHexColor(4)
  }
  if (
    (leftYellow > range.value.min && value < leftYellow) ||
    (rightYellow > 0 && value >= rightYellow)
  ) {
    return getStatusHexColor(1)
  }
  return getStatusHexColor(0)
}

// DCI items carry mapped or formatted text; scripted numbers and DCIs without a value keep two
// decimals.
const valueText = (item) =>
  item.displayValue ??
  `${Math.round(item.value * 100) / 100}${item.unitName ? ' ' + item.unitName : ''}`

function gaugeOptionFor(item) {
  return {
    backgroundColor: 'transparent',
    animation: false,
    series: [
      {
        type: 'gauge',
        min: range.value.min,
        max: range.value.max,
        startAngle: 210,
        endAngle: -30,
        axisLine: { lineStyle: { width: 10, color: axisColorStops.value } },
        pointer: { width: 4, itemStyle: { color: theme.ink.value.text } },
        axisTick: { show: false },
        splitLine: { length: 8, lineStyle: { color: 'auto', width: 1 } },
        axisLabel: { fontSize: 9, color: theme.ink.value.muted, distance: 12 },
        title: { fontSize: 11, color: theme.ink.value.text, offsetCenter: [0, '75%'] },
        detail: {
          fontSize: 16,
          fontWeight: 'bold',
          color: theme.ink.value.text,
          formatter: () => valueText(item),
          offsetCenter: [0, '45%'],
        },
        data: [{ value: item.value, name: item.name }],
      },
    ],
  }
}

const percentFor = (item) =>
  Math.min(
    100,
    Math.max(0, ((item.value - range.value.min) / (range.value.max - range.value.min)) * 100),
  )
</script>

<template>
  <div class="gauge-widget">
    <div v-if="isLoading" class="chart-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading…</span>
    </div>
    <div v-else-if="hasError" class="chart-state chart-state--error">
      <QueryErrorState
        :error="firstError"
        :message="isScripted ? 'Script execution failed' : 'Failed to load DCI data'"
        @retry="retryFailed"
      />
    </div>
    <div v-else-if="!isConfigured" class="chart-state">
      <i class="pi pi-gauge" />
      <span>{{ unconfiguredMessage }}</span>
    </div>
    <div v-else-if="hasNoData" class="chart-state">
      <i class="pi pi-gauge" />
      <span>No data returned</span>
    </div>
    <div
      v-else
      class="gauge-grid"
      :class="{ 'gauge-grid--clickable': hasDrillDown }"
      :style="{ '--gauge-cols': Math.min(items.length, 4) }"
      v-bind="drillDownBindings"
    >
      <template v-if="gaugeType === 0">
        <VChart
          v-for="(item, i) in items"
          :key="i"
          class="gauge-cell"
          :option="gaugeOptionFor(item)"
          autoresize
        />
      </template>

      <template v-else-if="gaugeType === 1">
        <div v-for="(item, i) in items" :key="i" class="bar-gauge">
          <div class="bar-gauge-header">
            <span class="bar-gauge-name">{{ item.name }}</span>
            <span class="bar-gauge-value" :style="{ color: statusColorForValue(item.value) }">
              {{ valueText(item) }}
            </span>
          </div>
          <div class="bar-gauge-track">
            <div
              class="bar-gauge-fill"
              :style="{
                width: percentFor(item) + '%',
                background: statusColorForValue(item.value),
              }"
            />
          </div>
        </div>
      </template>

      <template v-else>
        <div v-for="(item, i) in items" :key="i" class="text-gauge">
          <span class="text-gauge-value" :style="{ color: statusColorForValue(item.value) }">
            {{ valueText(item) }}
          </span>
          <span class="text-gauge-name">{{ item.name }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.gauge-widget {
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.gauge-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(var(--gauge-cols, 1), 1fr);
  align-items: stretch;
  gap: 0.25rem;
  min-width: 0;
  min-height: 0;
}

.gauge-grid--clickable {
  cursor: pointer;
}

.gauge-cell {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.bar-gauge {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
}

.bar-gauge-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.bar-gauge-name {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-gauge-value {
  font-size: 0.875rem;
  font-weight: 700;
}

.bar-gauge-track {
  height: 10px;
  border-radius: 5px;
  background: var(--p-surface-200, #e2e8f0);
  overflow: hidden;
}

.bar-gauge-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.3s ease;
}

.text-gauge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.5rem;
}

.text-gauge-value {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1;
}

.text-gauge-name {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  text-align: center;
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
</style>
