<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import { getStatusInfo } from '@/utils/objectUtils'
import { objectTarget } from '@/utils/routeTargets'
import { useNavTarget } from '@/composables/useNavTarget'
import { useDashboardContext } from '@/composables/useDashboardContext'
import { resolveContextObjectId } from '@/utils/dashboardContext'

// Legacy single-object configs are normalized into a one-element list by the registry's fromApi.
const props = defineProps({
  widget: { type: Object, required: true },
})

const router = useRouter()
const { navBindings } = useNavTarget()

const cfg = computed(() => props.widget.config ?? {})
const { contextObjectId } = useDashboardContext()

// An element whose context sentinel resolves to nothing is left out.
const elements = computed(() =>
  (cfg.value.elements ?? [])
    .map((e) => ({ ...e, objectId: resolveContextObjectId(e.objectId, contextObjectId.value) }))
    .filter((e) => e.objectId),
)

const objectIds = computed(() => elements.value.map((e) => e.objectId))
const { objectsById } = useObjectsByIds(objectIds)

// Legacy shapes: 0 circle, 1 rectangle, 2 rounded rectangle
const shapeClass = computed(
  () => ({ 0: 'shape-circle', 1: 'shape-rect', 2: 'shape-rounded' })[cfg.value.shape ?? 0],
)
// Legacy label placement: 0 none, 1 inside, 2 outside
const labelType = computed(() => cfg.value.labelType ?? 2)

const cells = computed(() =>
  elements.value.map((element) => {
    const object = objectsById.value.get(element.objectId)
    const status = object?.status ?? 5
    const info = getStatusInfo(status)
    // Compressed range (legacy default): normal green, any problem red
    const shown = cfg.value.fullColorRange
      ? info
      : status === 0
        ? getStatusInfo(0)
        : status >= 1 && status <= 4
          ? getStatusInfo(4)
          : info
    return {
      element,
      label: element.label || object?.name || `Object ${element.objectId}`,
      statusLabel: info.label,
      color: shown.color,
      // Text on the card: the level's text color, not the fill.
      textColor: shown.textColor,
      onFillColor: shown.onFillColor,
      drillDownObjectId: element.drillDownObjectId || 0,
    }
  }),
)

const gridCols = computed(() => Math.max(1, Math.min(cfg.value.numColumns ?? 1, 8)))

function cellTarget(cell) {
  if (!cell.drillDownObjectId) return null
  return objectTarget({ id: cell.drillDownObjectId }, undefined, { perspective: 'infrastructure' })
}

function handleCellClick(cell) {
  const target = cellTarget(cell)
  if (target) router.push(target)
}
</script>

<template>
  <div class="status-indicator-widget">
    <div v-if="!cells.length" class="si-unconfigured">
      <i class="pi pi-circle-fill" />
      <span>No objects configured</span>
    </div>
    <div v-else class="si-grid" :style="{ '--si-cols': gridCols }">
      <div
        v-for="(cell, i) in cells"
        :key="i"
        class="si-cell"
        :class="{ 'si-cell--clickable': cell.drillDownObjectId }"
        v-bind="navBindings(cellTarget(cell), () => handleCellClick(cell))"
      >
        <div class="si-shape" :class="shapeClass" :style="{ background: cell.color }">
          <span
            v-if="labelType === 1"
            class="si-label-inside"
            :style="{ color: cell.onFillColor }"
            >{{ cell.label }}</span
          >
        </div>
        <div v-if="labelType === 2" class="si-label-outside">
          <span class="si-status" :style="{ color: cell.textColor }">{{ cell.statusLabel }}</span>
          <span class="si-name">{{ cell.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-indicator-widget {
  height: 100%;
  min-height: 0;
  padding: 0.25rem;
  overflow: hidden;
}

.si-grid {
  display: grid;
  grid-template-columns: repeat(var(--si-cols, 1), 1fr);
  align-items: center;
  justify-items: center;
  gap: 0.5rem;
  height: 100%;
}

.si-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 0;
  max-width: 100%;
}

.si-cell--clickable {
  cursor: pointer;
}

.si-shape {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 3.5rem;
  flex-shrink: 0;
  transition: background 0.3s ease;
  box-shadow: 0 0 18px 2px color-mix(in srgb, currentColor 10%, transparent);
}

.shape-circle {
  border-radius: 50%;
}

.shape-rect {
  border-radius: 2px;
  width: 4.5rem;
  height: 2.75rem;
}

.shape-rounded {
  border-radius: 10px;
  width: 4.5rem;
  height: 2.75rem;
}

.si-label-inside {
  font-size: 0.6875rem;
  font-weight: 600;
  text-align: center;
  padding: 0 0.25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.si-label-outside {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  min-width: 0;
  max-width: 100%;
}

.si-status {
  font-size: 0.9375rem;
  font-weight: 700;
  line-height: 1;
  transition: color 0.3s ease;
}

.si-name {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.si-unconfigured {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.si-unconfigured i {
  font-size: 1.5rem;
  opacity: 0.3;
}
</style>
