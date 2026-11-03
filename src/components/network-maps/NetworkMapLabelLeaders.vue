<script setup>
/**
 * Leaders from a link to its moved-off label, and from a node to its overflow table. Drawn in
 * a layer beneath the graph, not with the labels, so nodes paint over a leader where they cross.
 */
import { computed } from 'vue'

const props = defineProps({
  boxes: { type: Array, required: true },
  tables: { type: Array, default: () => [] },
})

const leaders = computed(() => props.boxes.filter((box) => box.leader))
const tableLeaders = computed(() => props.tables.filter((table) => table.leader))
</script>

<template>
  <g class="link-label-leaders">
    <g v-for="box in leaders" :key="box.id" :style="{ color: box.color }">
      <line :x1="box.leader.x1" :y1="box.leader.y1" :x2="box.leader.x2" :y2="box.leader.y2" />
      <circle :cx="box.leader.x1" :cy="box.leader.y1" r="2.4" />
    </g>
    <g
      v-for="table in tableLeaders"
      :key="table.id"
      class="table-leader"
      :style="{ color: table.statusColor }"
    >
      <line
        :x1="table.leader.x1"
        :y1="table.leader.y1"
        :x2="table.leader.x2"
        :y2="table.leader.y2"
      />
      <circle :cx="table.leader.x2" :cy="table.leader.y2" r="3" />
    </g>
  </g>
</template>

<style scoped>
.link-label-leaders {
  pointer-events: none;
}

.link-label-leaders line {
  stroke: currentColor;
  stroke-width: 1.1;
}

.link-label-leaders circle {
  fill: currentColor;
}

.link-label-leaders .table-leader line {
  stroke-width: 1.4;
  stroke-dasharray: 4 3;
  opacity: 0.85;
}
</style>
