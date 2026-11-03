<script setup>
// Business service availability as an uptime/downtime pie, as in legacy. Refresh is the
// query's business: `useObjectAvailability` refreshes an open window and caches a closed one.
import { computed } from 'vue'
import { use } from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import ChartValueLegend from '@/components/common/ChartValueLegend.vue'
import { useChartTheme } from '@/utils/chartTheme'
import { buildPieOption } from '@/utils/chartOptions'
import { useChartLegend } from '@/composables/useChartLegend'
import { useWidgetActive } from '@/composables/useWidgetActive'
import { useObjectAvailability } from '@/queries/useBusinessServiceQueries'
import { availabilityRange, isOpenEnded, periodLabel } from '@/utils/availabilityPeriod'

use([PieChart, TooltipComponent, CanvasRenderer])

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})

const theme = useChartTheme()
const active = useWidgetActive()

const objectId = computed(() => cfg.value.objectId || null)

// Not recomputed as the clock runs: a sliding window would change the query key every render
// and defeat the cache.
const range = computed(() => availabilityRange(cfg.value.period, cfg.value.numberOfDays))

const live = computed(() => isOpenEnded(cfg.value.period))

const { data, isLoading, isError, error, refetch } = useObjectAvailability(objectId, range, {
  live,
  enabled: active,
})

const uptime = computed(() => {
  const value = data.value?.uptime
  return typeof value === 'number' ? value : null
})

// Both slices always present, so the legend does not reflow. Legacy colours: uptime/downtime is
// a fixed semantic pair, not an arbitrary series.
const items = computed(() => {
  if (uptime.value === null) return []
  return [
    { name: 'Uptime', value: Number(uptime.value.toFixed(3)), color: '#7f9a48' },
    { name: 'Downtime', value: Number((100 - uptime.value).toFixed(3)), color: '#9e413e' },
  ]
})

const { rootRef, legendItems, showLegend, legendExtended, legendPlace, legendOnSide } =
  useChartLegend(cfg, items, theme)

const chartOption = computed(() =>
  buildPieOption({
    items: items.value,
    doughnut: cfg.value.doughnutRendering === true,
    showTotal: false,
    theme,
  }),
)

const subtitle = computed(() => periodLabel(cfg.value.period, cfg.value.numberOfDays))
</script>

<template>
  <div
    ref="rootRef"
    class="dci-chart-widget"
    :class="{ 'dci-chart-widget--legend-side': legendOnSide }"
  >
    <div v-if="!objectId" class="chart-state">
      <i class="pi pi-check-circle" />
      <span>No business service configured</span>
    </div>
    <div v-else-if="isLoading" class="chart-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading…</span>
    </div>
    <div v-else-if="isError" class="chart-state chart-state--error">
      <QueryErrorState :error="error" message="Failed to load availability" @retry="refetch()" />
    </div>
    <div v-else-if="uptime === null" class="chart-state">
      <i class="pi pi-check-circle" />
      <span>No availability recorded for {{ subtitle.toLowerCase() }}</span>
    </div>
    <template v-else>
      <div class="chart-wrap">
        <VChart class="chart" :option="chartOption" autoresize />
      </div>
      <ChartValueLegend
        v-if="showLegend"
        :items="legendItems"
        :place="legendPlace"
        :extended="legendExtended"
        show-percent
      />
    </template>
  </div>
</template>

<style scoped>
/* Shares the shape of the DCI chart widgets so a dashboard mixing them lines up. */
.dci-chart-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.dci-chart-widget--legend-side {
  flex-direction: row;
}

.chart-wrap {
  flex: 1;
  position: relative;
  min-width: 0;
  min-height: 0;
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
  padding: 0.5rem;
  text-align: center;
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
