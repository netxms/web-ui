<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import ChartValueLegend from '@/components/common/ChartValueLegend.vue'
import { useScriptedChartData } from '@/queries/useObjectQueries'
import { useChartTheme } from '@/utils/chartTheme'
import { buildBarOption, buildPieOption } from '@/utils/chartOptions'
import { normalizeScriptResult } from '@/utils/scriptedChartData'
import { useWidgetDrillDown } from '@/composables/useWidgetDrillDown'
import { useChartLegend } from '@/composables/useChartLegend'
import { useEffectiveObjectId } from '@/composables/useDashboardContext'
import { useWidgetActive } from '@/composables/useWidgetActive'

use([BarChart, PieChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})
const isPie = computed(() => props.widget.type === 'scripted-pie-chart')

const theme = useChartTheme()
const { hasDrillDown, drillDownBindings } = useWidgetDrillDown(cfg)

const {
  data: rawData,
  isLoading,
  isError,
  error,
  refetch,
} = useScriptedChartData(
  computed(() => cfg.value.dashboardId ?? 0),
  // The server does not understand the context sentinel (FindObjectById(0xFFFFFFFF) is a 400).
  useEffectiveObjectId(() => cfg.value.objectId),
  computed(() => cfg.value.elementIndex ?? 0),
  {
    // Off-screen widgets stop polling; on screen, legacy refreshes at the element's own rate.
    enabled: useWidgetActive(),
    refetchInterval: computed(() => (cfg.value.refreshRate ?? 30) * 1000),
  },
)

const items = computed(() => {
  const raw = rawData.value
  if (raw == null) return []
  return normalizeScriptResult(raw?.result ?? raw)
})

const hasNoData = computed(() => !isLoading.value && !isError.value && items.value.length === 0)

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
  isPie.value
    ? buildPieOption({
        items: items.value,
        doughnut: cfg.value.doughnutRendering === true,
        showTotal: cfg.value.showTotal === true,
        theme,
      })
    : buildBarOption({
        items: items.value,
        transposed: cfg.value.transposed === true,
        theme,
      }),
)
</script>

<template>
  <div
    ref="rootRef"
    class="scripted-chart-widget"
    :class="{ 'scripted-chart-widget--legend-side': legendOnSide }"
  >
    <div v-if="isLoading" class="chart-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading…</span>
    </div>
    <div v-else-if="isError" class="chart-state chart-state--error">
      <QueryErrorState :error="error" message="Script execution failed" @retry="refetch" />
    </div>
    <template v-else>
      <div
        class="chart-wrap"
        :class="{ 'chart-wrap--clickable': hasDrillDown }"
        v-bind="drillDownBindings"
      >
        <VChart class="chart" :option="chartOption" autoresize />
        <div v-if="hasNoData" class="no-data-overlay">
          <i :class="isPie ? 'pi pi-chart-pie' : 'pi pi-chart-bar'" class="no-data-icon" />
          <span>No data returned</span>
        </div>
      </div>
      <ChartValueLegend
        v-if="showLegend && !hasNoData"
        :items="legendItems"
        :place="legendPlace"
        :extended="legendExtended"
        :show-percent="showPercentInLegend"
      />
    </template>
  </div>
</template>

<style scoped>
.scripted-chart-widget {
  display: flex;
  /* A side legend turns the widget into a row instead. */
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.scripted-chart-widget--legend-side {
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
