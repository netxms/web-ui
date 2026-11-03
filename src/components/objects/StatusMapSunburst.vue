<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { SunburstChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { getStatusInfo, getStatusHexColor, getStatusOnFillHexColor } from '@/utils/objectUtils'
import { escapeHtml } from '@/utils/sanitize'
import { openInNewTab, shouldOpenInNewTab } from '@/utils/navigation'

use([CanvasRenderer, SunburstChart, TooltipComponent])

const props = defineProps({
  tree: { type: Array, required: true },
  rootName: { type: String, default: 'Root' },
  /** @type {import('vue').PropType<(objectId: number) => object>} */
  targetFor: { type: Function, default: null },
})

const emit = defineEmits(['navigate'])

function buildSunburstData(nodes) {
  return nodes.map((node) => {
    const hasChildren = node.children?.length > 0
    return {
      name: node.name,
      // ECharts sums parent values from children
      ...(hasChildren ? {} : { value: 1 }),
      itemStyle: { color: getStatusHexColor(node.status) },
      // Labels sit on the slice: ECharts' default white is unreadable on lemon or green.
      label: { color: getStatusOnFillHexColor(node.status) },
      objectId: node.id,
      status: node.status,
      children: hasChildren ? buildSunburstData(node.children) : undefined,
    }
  })
}

const chartOption = computed(() => ({
  tooltip: {
    formatter(params) {
      const status = getStatusInfo(params.data.status)
      // ECharts injects this string as HTML, and params.name is the object name.
      return `<strong>${escapeHtml(params.name)}</strong><br/>Status: ${escapeHtml(status.label)}`
    },
  },
  series: [
    {
      type: 'sunburst',
      data: buildSunburstData(props.tree),
      radius: ['15%', '90%'],
      sort: null,
      emphasis: { focus: 'ancestor' },
      levels: [
        {},
        {
          r0: '15%',
          r: '45%',
          label: { rotate: 'radial', fontSize: 11 },
        },
        {
          r0: '45%',
          r: '70%',
          label: { rotate: 'radial', fontSize: 10 },
        },
        {
          r0: '70%',
          r: '90%',
          label: { show: false },
        },
      ],
      label: {
        overflow: 'truncate',
        ellipsis: '...',
        minAngle: 10,
        width: 100,
      },
    },
  ],
}))

function handleClick(params) {
  const objectId = params.data?.objectId
  if (!objectId) return

  const target = props.targetFor?.(objectId)
  if (target && shouldOpenInNewTab(params.event?.event)) {
    openInNewTab(target)
    return
  }
  emit('navigate', objectId)
}

// Middle-click: the canvas has no per-tile node for navBindings' `onAuxclick`, but ECharts
// forwards the native event on `mouseup` along with the tile.
function handleMouseUp(params) {
  if (params.event?.event?.button !== 1) return
  const objectId = params.data?.objectId
  const target = objectId ? props.targetFor?.(objectId) : null
  if (!target) return
  params.event.event.preventDefault()
  openInNewTab(target)
}
</script>

<template>
  <div class="status-map-sunburst">
    <VChart
      :option="chartOption"
      autoresize
      class="sunburst-chart"
      @click="handleClick"
      @mouseup="handleMouseUp"
    />
  </div>
</template>

<style scoped>
.status-map-sunburst {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
}

.sunburst-chart {
  width: 100%;
  height: 100%;
  min-height: 400px;
}
</style>
