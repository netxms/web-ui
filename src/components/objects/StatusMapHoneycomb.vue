<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { getStatusInfo } from '@/utils/objectUtils'
import { flattenUnique, sortStatusMapObjects } from '@/utils/statusMapObjects'
import { useNavTarget } from '@/composables/useNavTarget'

const props = defineProps({
  tree: { type: Array, required: true },
  /** @type {import('vue').PropType<(objectId: number) => object>} */
  targetFor: { type: Function, default: null },
  sortBy: { type: String, default: 'status' },
})

const emit = defineEmits(['navigate'])

const { navBindings } = useNavTarget()

function tileBindings(objectId) {
  return navBindings(props.targetFor?.(objectId) ?? null, () => emit('navigate', objectId))
}

// A subtree lists an object under every parent it has; draw each once.
const flatObjects = computed(() => sortStatusMapObjects(flattenUnique(props.tree), props.sortBy))

// Pointy-top hex geometry
const S = 40 // circumradius in px
const W = Math.sqrt(3) * S // hex width, also horizontal center-to-center spacing
const V_SPACE = 1.5 * S

function hexPoints(cx, cy) {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2 // pointy-top: first vertex at top
    pts.push(`${(cx + S * Math.cos(angle)).toFixed(2)},${(cy + S * Math.sin(angle)).toFixed(2)}`)
  }
  return pts.join(' ')
}

function truncate(name) {
  return name.length > 10 ? name.slice(0, 9) + '\u2026' : name
}

function hexCenter(index, n) {
  const col = index % n
  const row = Math.floor(index / n)
  const cx = (row % 2 === 0 ? W / 2 : W) + col * W
  const cy = S + row * V_SPACE
  return { cx, cy }
}

const containerRef = ref(null)
const containerWidth = ref(0)
let ro = null

onMounted(() => {
  ro = new ResizeObserver((entries) => {
    containerWidth.value = entries[0].contentRect.width
  })
  if (containerRef.value) ro.observe(containerRef.value)
})

onBeforeUnmount(() => ro?.disconnect())

// Reserve W/2 for the odd-row offset
const numCols = computed(() => Math.max(1, Math.floor((containerWidth.value - W / 2) / W)))

const hexLayout = computed(() => {
  const n = numCols.value
  return flatObjects.value.map((obj, i) => {
    const { cx, cy } = hexCenter(i, n)
    return { obj, cx, cy, points: hexPoints(cx, cy) }
  })
})

const ghostLayout = computed(() => {
  const n = numCols.value
  const total = flatObjects.value.length
  if (!total || total % n === 0) return []
  const ghostCount = n - (total % n)
  return Array.from({ length: ghostCount }, (_, k) => {
    const { cx, cy } = hexCenter(total + k, n)
    return { cx, cy, points: hexPoints(cx, cy) }
  })
})

const svgWidth = computed(() => numCols.value * W + W / 2)

const svgHeight = computed(() => {
  if (!hexLayout.value.length) return 0
  const last = ghostLayout.value.length
    ? ghostLayout.value[ghostLayout.value.length - 1]
    : hexLayout.value[hexLayout.value.length - 1]
  return last.cy + S + 8
})
</script>

<template>
  <div class="status-map-honeycomb">
    <div ref="containerRef" class="honeycomb-container">
      <svg
        v-if="hexLayout.length && containerWidth > 0"
        :width="svgWidth"
        :height="svgHeight"
        class="honeycomb-svg"
      >
        <polygon
          v-for="(ghost, k) in ghostLayout"
          :key="`ghost-${k}`"
          :points="ghost.points"
          class="hex-ghost"
        />

        <g
          v-for="{ obj, cx, cy, points } in hexLayout"
          :key="obj.id"
          class="hex-cell"
          v-bind="tileBindings(obj.id)"
        >
          <title>{{ obj.name }} — {{ getStatusInfo(obj.status).label }}</title>
          <polygon
            :points="points"
            :style="{
              fill: getStatusInfo(obj.status).bgColor,
              stroke: getStatusInfo(obj.status).color,
            }"
            class="hex-polygon"
          />
          <text
            :x="cx"
            :y="cy"
            :style="{ fill: getStatusInfo(obj.status).textColor }"
            text-anchor="middle"
            dominant-baseline="middle"
            class="hex-label"
          >
            {{ truncate(obj.name) }}
          </text>
        </g>
      </svg>
      <div v-else-if="containerWidth > 0" class="honeycomb-empty">No objects</div>
    </div>
  </div>
</template>

<style scoped>
.status-map-honeycomb {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.honeycomb-container {
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
}

.honeycomb-svg {
  display: block;
  overflow: visible;
}

.hex-ghost {
  fill: var(--p-surface-100);
  stroke: var(--p-surface-300);
  stroke-width: 1;
  stroke-dasharray: 5 3;
  opacity: 0.55;
}

.hex-cell {
  cursor: pointer;
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 0.15s ease;
}

.hex-cell:hover .hex-polygon {
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.4));
}

.hex-polygon {
  stroke-width: 1.5;
}

.hex-label {
  font-size: 10px;
  font-weight: 600;
  pointer-events: none;
  user-select: none;
}

.honeycomb-empty {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
  padding: 1rem;
  text-align: center;
}
</style>
