<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { TreemapChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import {
  getStatusInfo,
  getStatusSoftBgHexColor,
  getStatusSoftTextHexColor,
} from '@/utils/objectUtils'
import { escapeHtml } from '@/utils/sanitize'
import { openInNewTab, shouldOpenInNewTab } from '@/utils/navigation'

use([CanvasRenderer, TreemapChart, TooltipComponent])

const props = defineProps({
  tree: { type: Array, required: true },
  rootName: { type: String, default: 'Root' },
  /** @type {import('vue').PropType<(objectId: number) => object>} */
  targetFor: { type: Function, default: null },
})

const emit = defineEmits(['navigate'])

function buildTreemapData(nodes) {
  return nodes.map((node) => {
    const hasChildren = node.children?.length > 0
    const textColor = getStatusSoftTextHexColor(node.status)
    return {
      name: node.name,
      ...(hasChildren ? {} : { value: 1 }),
      itemStyle: { color: getStatusSoftBgHexColor(node.status) },
      label: { color: textColor },
      upperLabel: { color: textColor },
      objectId: node.id,
      status: node.status,
      children: hasChildren ? buildTreemapData(node.children) : undefined,
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
      type: 'treemap',
      data: buildTreemapData(props.tree),
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      label: {
        show: true,
        formatter: '{b}',
        fontSize: 11,
        overflow: 'truncate',
        ellipsis: '…',
      },
      upperLabel: {
        show: true,
        height: 20,
        fontSize: 11,
        overflow: 'truncate',
        ellipsis: '…',
        offset: [5, 0],
      },
      levels: [
        {
          itemStyle: {
            borderWidth: 0,
            gapWidth: 4,
            borderColorSaturation: 0,
          },
        },
        {
          itemStyle: {
            borderWidth: 0,
            gapWidth: 2,
            borderColorSaturation: 0.65,
          },
        },
        {
          itemStyle: {
            borderWidth: 1,
            gapWidth: 1,
            borderColorSaturation: 0.75,
          },
        },
        {
          itemStyle: {
            borderWidth: 1,
            gapWidth: 1,
            borderColorSaturation: 0.85,
          },
        },
        {
          itemStyle: {
            borderWidth: 1,
            gapWidth: 1,
            borderColorSaturation: 0.9,
          },
        },
      ],
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
  <div class="status-map-treemap">
    <VChart
      :option="chartOption"
      autoresize
      class="treemap-chart"
      @click="handleClick"
      @mouseup="handleMouseUp"
    />
  </div>
</template>

<style scoped>
.status-map-treemap {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
}

.treemap-chart {
  width: 100%;
  height: 100%;
  min-height: 400px;
}
</style>
