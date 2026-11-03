<script setup>
import { computed } from 'vue'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useObjectChildren } from '@/queries/useObjectQueries'
import { getStatusInfo, getStatusHexColor } from '@/utils/objectUtils'
import { useChartTheme } from '@/utils/chartTheme'
import { buildBarOption } from '@/utils/chartOptions'
import { useWidgetDrillDown } from '@/composables/useWidgetDrillDown'
import { useEffectiveObjectId } from '@/composables/useDashboardContext'

use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps({
  widget: { type: Object, required: true },
})

const cfg = computed(() => props.widget.config ?? {})
const effectiveObjectId = useEffectiveObjectId(() => cfg.value.objectId)
const objectId = computed(() => effectiveObjectId.value || null)

const theme = useChartTheme()
const { hasDrillDown, drillDownBindings } = useWidgetDrillDown(cfg)

const { data: children, isLoading, isError, error, refetch } = useObjectChildren(objectId)

// Count children per status (0 Normal … 4 Critical, 5+ folded into Unknown)
const items = computed(() => {
  const counts = new Map()
  for (const child of children.value ?? []) {
    const status = child.status >= 0 && child.status <= 4 ? child.status : 5
    counts.set(status, (counts.get(status) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([status, count]) => ({
      name: getStatusInfo(status).label,
      value: count,
      color: getStatusHexColor(status),
    }))
})

const chartOption = computed(() =>
  buildBarOption({
    items: items.value,
    transposed: cfg.value.transposed === true,
    theme,
  }),
)
</script>

<template>
  <div class="status-chart-widget">
    <div v-if="!objectId" class="chart-state">
      <i class="pi pi-chart-bar" />
      <span>No root object configured</span>
    </div>
    <div v-else-if="isLoading" class="chart-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading…</span>
    </div>
    <div v-else-if="isError" class="chart-state chart-state--error">
      <QueryErrorState :error="error" message="Failed to load object status" @retry="refetch" />
    </div>
    <div v-else-if="items.length === 0" class="chart-state">
      <i class="pi pi-chart-bar" />
      <span>No child objects</span>
    </div>
    <div
      v-else
      class="chart-wrap"
      :class="{ 'chart-wrap--clickable': hasDrillDown }"
      v-bind="drillDownBindings"
    >
      <VChart class="chart" :option="chartOption" autoresize />
    </div>
  </div>
</template>

<style scoped>
.status-chart-widget {
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
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
