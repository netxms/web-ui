<script setup>
/**
 * The link labels of a node too crowded to label its links in place, one row per link,
 * clockwise from 12 o'clock. Content is in box-local coordinates (overflowTableContent()),
 * placement is the table centre (layoutLabelsWithTables()).
 */
import { OVERFLOW_TABLE_HEADER, OVERFLOW_TABLE_TICK_RADIUS } from '@/utils/networkMapLinkLabels'

defineProps({
  table: { type: Object, required: true },
  fontSize: { type: Number, required: true },
  /** While set, only this row is lit. */
  hotRow: { type: String, default: null },
  hotEdges: { type: Array, default: () => [] },
})

const emit = defineEmits(['drag-start', 'reset', 'row-enter', 'row-leave'])

const isLit = (row, hotRow, hotEdges) =>
  hotRow ? row.key === hotRow : hotEdges.includes(row.edgeId)
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
  <g
    class="overflow-table"
    :transform="`translate(${table.x - table.width / 2}, ${table.y - table.height / 2})`"
    @mousedown.stop="emit('drag-start', $event)"
    @pointerdown.stop
    @dblclick.stop="emit('reset')"
  >
    <title>Drag to move, double-click to place it automatically</title>
    <rect
      :width="table.width"
      :height="table.height"
      rx="7"
      ry="7"
      class="overflow-table-frame"
      :stroke="table.statusColor"
    />
    <rect
      x="0.75"
      y="0.75"
      :width="table.width - 1.5"
      :height="OVERFLOW_TABLE_HEADER - 4"
      rx="6"
      ry="6"
      :fill="table.statusColor"
      class="overflow-table-band"
    />
    <text
      :x="table.title.x"
      :y="table.title.textY"
      :font-size="fontSize"
      :font-weight="table.title.weight"
      font-family="inherit"
      dominant-baseline="hanging"
      class="overflow-table-text"
    >
      {{ table.title.text }}
    </text>
    <text
      :x="table.count.x"
      :y="table.count.textY"
      :font-size="fontSize"
      font-family="inherit"
      dominant-baseline="hanging"
      class="overflow-table-text overflow-table-text--muted"
    >
      {{ table.count.text }}
    </text>

    <!-- The map's drawing surface has no keyboard path, so there is no focus event to pair. -->
    <!-- eslint-disable-next-line vuejs-accessibility/mouse-events-have-key-events -->
    <g
      v-for="row in table.rows"
      :key="row.key"
      @mouseenter="emit('row-enter', row)"
      @mouseleave="emit('row-leave', row)"
    >
      <rect
        x="2"
        :y="row.top"
        :width="table.width - 4"
        :height="row.height"
        rx="3"
        ry="3"
        class="overflow-table-row"
        :class="{ 'overflow-table-row--lit': isLit(row, hotRow, hotEdges) }"
      />
      <circle
        :cx="row.tick.cx"
        :cy="row.tick.cy"
        :r="OVERFLOW_TABLE_TICK_RADIUS"
        class="overflow-table-tick-ring"
      />
      <line
        :x1="row.tick.cx"
        :y1="row.tick.cy"
        :x2="row.tick.x2"
        :y2="row.tick.y2"
        :stroke="row.tick.color"
        class="overflow-table-tick"
      />
      <template v-for="(segment, k) in row.segments" :key="k">
        <template v-if="segment.arrow">
          <line
            :x1="segment.arrow.shaft.x1"
            :y1="segment.arrow.shaft.y1"
            :x2="segment.arrow.shaft.x2"
            :y2="segment.arrow.shaft.y2"
            class="overflow-table-arrow-shaft"
          />
          <polygon :points="segment.arrow.head" class="overflow-table-arrow-head" />
        </template>
        <text
          :x="segment.x"
          :y="row.textY"
          :font-size="fontSize"
          :font-weight="segment.weight"
          font-family="inherit"
          dominant-baseline="hanging"
          class="overflow-table-text"
          :class="{ 'overflow-table-text--muted': segment.muted }"
        >
          {{ segment.text }}
        </text>
      </template>
    </g>
  </g>
</template>

<style scoped>
/* The overlay ignores the pointer; a table takes it. */
.overflow-table {
  pointer-events: all;
  cursor: move;
  user-select: none;
}

.overflow-table-frame {
  fill: var(--p-surface-0);
  stroke-width: 1.5;
}

html.app-dark .overflow-table-frame {
  fill: var(--p-surface-800);
}

.overflow-table-band {
  fill-opacity: 0.14;
}

.overflow-table-text {
  fill: var(--p-text-color);
}

.overflow-table-text--muted {
  fill: var(--p-text-muted-color);
}

/* Painted even while unlit, so the whole row takes the pointer. */
.overflow-table-row {
  fill: var(--p-primary-color);
  fill-opacity: 0;
}

.overflow-table-row--lit {
  fill-opacity: 0.14;
}

.overflow-table-tick-ring {
  fill: none;
  stroke: var(--p-surface-400);
  stroke-width: 1;
}

html.app-dark .overflow-table-tick-ring {
  stroke: var(--p-surface-500);
}

.overflow-table-tick {
  stroke-width: 2;
  stroke-linecap: round;
}

.overflow-table-arrow-shaft {
  stroke: var(--p-text-color);
  stroke-width: 1.7;
  stroke-linecap: round;
}

.overflow-table-arrow-head {
  fill: var(--p-text-color);
}
</style>
