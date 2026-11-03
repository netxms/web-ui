<script setup>
import { computed } from 'vue'
import {
  Type as TypeIcon,
  CircleDot,
  Map as MapIcon,
  LineChart,
  BarChart3,
  PieChart,
  LayoutGrid,
  List,
  Gauge,
  Box,
} from 'lucide-vue-next'
import { getTypeDef } from '@/utils/dashboardElements'

const props = defineProps({
  /** null/undefined while loading or unavailable. */
  widgets: { type: Array, default: null },
  cols: { type: Number, default: 12 },
  loading: { type: Boolean, default: false },
})

/** Block content per registry `variant`; the color also comes from the registry. */
const VARIANT_VISUAL = {
  plain: { icon: Box },
  lines: { icon: List },
  dot: { icon: CircleDot },
  bars: { icon: BarChart3 },
  ring: { icon: PieChart },
  zigzag: { icon: LineChart },
  grid: { icon: LayoutGrid },
  // gauge renders like a ring but keeps its own icon
  gauge: { icon: Gauge, renderAs: 'ring' },
}

/** Where the variant default icon is too generic. */
const TYPE_ICON_OVERRIDE = {
  label: TypeIcon,
  'network-map': MapIcon,
  'geo-map': MapIcon,
}

const BAR_HEIGHTS = [45, 78, 58, 92]

const rows = computed(() => {
  if (!props.widgets?.length) return 1
  return Math.max(1, ...props.widgets.map((w) => (w.y ?? 0) + (w.h ?? 1)))
})

const blocks = computed(() =>
  (props.widgets ?? []).map((widget) => {
    const x = widget.x ?? 0
    const y = widget.y ?? 0
    const w = Math.max(1, widget.w ?? 1)
    const h = Math.max(1, widget.h ?? 1)
    const def = getTypeDef(widget.type)
    const color = def.color
    const entry = VARIANT_VISUAL[def.variant] ?? VARIANT_VISUAL.plain
    const visual = {
      variant: entry.renderAs ?? (def.variant in VARIANT_VISUAL ? def.variant : 'plain'),
      icon: TYPE_ICON_OVERRIDE[widget.type] ?? entry.icon,
    }
    return {
      widget,
      visual,
      tooltip: widget.config?.title || def.label,
      style: {
        gridColumn: `${x + 1} / span ${w}`,
        gridRow: `${y + 1} / span ${h}`,
        '--block-color': color,
        background: `color-mix(in srgb, ${color} 22%, var(--p-surface-card))`,
        borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
      },
    }
  }),
)
</script>

<template>
  <div
    class="dashboard-thumbnail"
    :class="{ 'dashboard-thumbnail--empty': !loading && !widgets?.length }"
  >
    <div v-if="loading" class="dashboard-thumbnail-skeleton" />
    <div
      v-else-if="blocks.length"
      class="dashboard-thumbnail-grid"
      :style="{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }"
    >
      <div
        v-for="block in blocks"
        :key="block.widget.id"
        v-tooltip.top="block.tooltip"
        class="dashboard-thumbnail-block"
        :class="`variant-${block.visual.variant}`"
        :style="block.style"
      >
        <template v-if="block.visual.variant === 'bars'">
          <span
            v-for="(h, i) in BAR_HEIGHTS"
            :key="i"
            class="thumb-bar"
            :style="{ height: h + '%' }"
          />
        </template>
        <template v-else-if="block.visual.variant === 'lines'">
          <span class="thumb-line" style="width: 90%" />
          <span class="thumb-line" style="width: 65%" />
          <span class="thumb-line" style="width: 78%" />
        </template>
        <span v-else-if="block.visual.variant === 'ring'" class="thumb-ring" />
        <span v-else-if="block.visual.variant === 'dot'" class="thumb-dot" />
        <svg
          v-else-if="block.visual.variant === 'zigzag'"
          class="thumb-zigzag"
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
        >
          <polyline points="0,30 20,12 38,24 58,6 78,20 100,10" />
        </svg>
        <div v-else-if="block.visual.variant === 'grid'" class="thumb-grid">
          <span v-for="i in 4" :key="i" class="thumb-grid-cell" />
        </div>

        <component
          :is="block.visual.icon"
          class="thumb-icon"
          :class="`thumb-icon--${block.visual.variant}`"
          :size="block.visual.variant === 'plain' ? 14 : 9"
          :stroke-width="2"
        />
      </div>
    </div>
    <i v-else class="pi pi-th-large dashboard-thumbnail-placeholder-icon" />
  </div>
</template>

<style scoped>
.dashboard-thumbnail {
  width: 92px;
  height: 66px;
  border: 1px solid var(--p-surface-border);
  border-radius: 5px;
  background: var(--p-surface-ground);
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dashboard-thumbnail--empty {
  color: var(--p-text-muted-color);
}

.dashboard-thumbnail-grid {
  width: 100%;
  height: 100%;
  display: grid;
  gap: 2px;
  padding: 3px;
}

.dashboard-thumbnail-block {
  position: relative;
  border: 1px solid transparent;
  border-radius: 2px;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.thumb-icon {
  color: var(--block-color);
}

.thumb-icon--plain {
  opacity: 0.9;
}

.thumb-icon:not(.thumb-icon--plain) {
  position: absolute;
  bottom: 1px;
  right: 1px;
  opacity: 0.85;
}

/* bar-chart */
.variant-bars {
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  padding: 3px 4px;
}

.thumb-bar {
  width: 4px;
  min-height: 2px;
  border-radius: 1px 1px 0 0;
  background: var(--block-color);
}

/* alarm-monitor / alarm-viewer */
.variant-lines {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 3px;
  padding: 0 6px;
}

.thumb-line {
  height: 2px;
  border-radius: 1px;
  background: var(--block-color);
}

/* donut-chart */
.thumb-ring {
  width: 55%;
  height: 55%;
  max-width: 22px;
  max-height: 22px;
  border-radius: 50%;
  border: 3px solid var(--block-color);
}

/* status-indicator */
.thumb-dot {
  width: 42%;
  height: 42%;
  max-width: 16px;
  max-height: 16px;
  border-radius: 50%;
  background: var(--block-color);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--block-color) 30%, transparent);
}

/* performance-chart */
.thumb-zigzag {
  width: 80%;
  height: 60%;
  stroke: var(--block-color);
  stroke-width: 2.5;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* status-map */
.thumb-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px;
  width: 55%;
  height: 55%;
  max-width: 18px;
  max-height: 18px;
}

.thumb-grid-cell {
  border-radius: 1px;
  background: var(--block-color);
}

.thumb-grid-cell:nth-child(2) {
  opacity: 0.55;
}

.thumb-grid-cell:nth-child(3) {
  opacity: 0.75;
}

.thumb-grid-cell:nth-child(4) {
  opacity: 0.4;
}

.dashboard-thumbnail-placeholder-icon {
  font-size: 1rem;
  opacity: 0.4;
}

.dashboard-thumbnail-skeleton {
  width: calc(100% - 8px);
  height: calc(100% - 8px);
  margin: 4px;
  border-radius: 3px;
  background: var(--p-surface-200);
  animation: dashboard-thumbnail-pulse 1.4s ease-in-out infinite;
}

@keyframes dashboard-thumbnail-pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}
</style>
