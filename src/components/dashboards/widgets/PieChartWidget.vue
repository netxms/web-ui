<script setup>
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
import { useWidgetDrillDown } from '@/composables/useWidgetDrillDown'
import { useChartItems } from '@/composables/useChartItems'
import { useChartLegend } from '@/composables/useChartLegend'

use([PieChart, TooltipComponent, CanvasRenderer])

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})
const widgetType = computed(() => props.widget.type)

const theme = useChartTheme()
const { hasDrillDown, drillDownBindings } = useWidgetDrillDown(cfg)

// Serves both the DCI-list pie chart and its table-DCI counterpart.
const { items, isConfigured, isTableChart, isLoading, hasError, firstError, retryFailed } =
  useChartItems(cfg, widgetType, theme)

const {
  rootRef,
  legendItems,
  showLegend,
  legendExtended,
  legendPlace,
  legendOnSide,
  showPercentInLegend,
} = useChartLegend(cfg, items, theme)

const chartOption = computed(() =>
  buildPieOption({
    items: items.value,
    doughnut: cfg.value.doughnutRendering === true,
    showTotal: cfg.value.showTotal === true,
    theme,
  }),
)
</script>

<template>
  <div
    ref="rootRef"
    class="dci-chart-widget"
    :class="{ 'dci-chart-widget--legend-side': legendOnSide }"
  >
    <div v-if="isLoading" class="chart-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading…</span>
    </div>
    <div v-else-if="hasError" class="chart-state chart-state--error">
      <QueryErrorState :error="firstError" message="Failed to load DCI data" @retry="retryFailed" />
    </div>
    <div v-else-if="!isConfigured" class="chart-state">
      <i class="pi pi-chart-pie" />
      <span>{{ isTableChart ? 'No table DCI configured' : 'No DCIs configured' }}</span>
    </div>
    <template v-else>
      <div
        class="chart-wrap"
        :class="{ 'chart-wrap--clickable': hasDrillDown }"
        v-bind="drillDownBindings"
      >
        <VChart class="chart" :option="chartOption" autoresize />
      </div>
      <ChartValueLegend
        v-if="showLegend"
        :items="legendItems"
        :place="legendPlace"
        :extended="legendExtended"
        :show-percent="showPercentInLegend"
      />
    </template>
  </div>
</template>

<style scoped>
.dci-chart-widget {
  display: flex;
  /* A side legend turns the widget into a row instead. */
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
</style>
