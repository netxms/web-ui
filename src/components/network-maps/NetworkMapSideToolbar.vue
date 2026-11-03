<script setup>
import Button from 'primevue/button'
import {
  Waypoints,
  Tags,
  Merge,
  TableProperties,
  Grid3x3,
  Magnet,
  LayoutGrid,
  Globe,
} from 'lucide-vue-next'

defineProps({
  editMode: { type: Boolean, default: false },
  hideLinks: { type: Boolean, default: false },
  hideLinkLabels: { type: Boolean, default: false },
  /** Edit mode always shows every link, so the toggle is off and disabled there. */
  mergeParallelLinks: { type: Boolean, default: false },
  overflowTables: { type: Boolean, default: true },
  showGrid: { type: Boolean, default: false },
  snapToGrid: { type: Boolean, default: false },
  /** Align acts on the selection rather than the map. */
  hasSelection: { type: Boolean, default: false },
  /** Grid tools are hidden on the geographical canvas. */
  geoCanvas: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:hideLinks',
  'update:hideLinkLabels',
  'update:mergeParallelLinks',
  'update:overflowTables',
  'update:showGrid',
  'update:snapToGrid',
  'update:geoCanvas',
  'align-to-grid',
])
</script>

<template>
  <div class="side-toolbar" role="toolbar" aria-label="Map tools">
    <Button
      severity="secondary"
      text
      rounded
      :class="{ 'tool-active': hideLinks }"
      :aria-pressed="hideLinks"
      v-tooltip.left="hideLinks ? 'Show links' : 'Hide links'"
      @click="emit('update:hideLinks', !hideLinks)"
    >
      <template #icon>
        <Waypoints :size="16" />
      </template>
    </Button>
    <Button
      severity="secondary"
      text
      rounded
      :class="{ 'tool-active': hideLinkLabels }"
      :aria-pressed="hideLinkLabels"
      :disabled="hideLinks"
      v-tooltip.left="hideLinkLabels ? 'Show link labels' : 'Hide link labels'"
      @click="emit('update:hideLinkLabels', !hideLinkLabels)"
    >
      <template #icon>
        <Tags :size="16" />
      </template>
    </Button>
    <Button
      severity="secondary"
      text
      rounded
      :class="{ 'tool-active': mergeParallelLinks && !editMode }"
      :aria-pressed="mergeParallelLinks && !editMode"
      :disabled="hideLinks || editMode"
      v-tooltip.left="
        mergeParallelLinks ? 'Show parallel links separately' : 'Merge parallel links'
      "
      @click="emit('update:mergeParallelLinks', !mergeParallelLinks)"
    >
      <template #icon>
        <Merge :size="16" />
      </template>
    </Button>
    <Button
      severity="secondary"
      text
      rounded
      :class="{ 'tool-active': overflowTables }"
      :aria-pressed="overflowTables"
      :disabled="hideLinks || hideLinkLabels"
      v-tooltip.left="overflowTables ? 'Hide overflow tables' : 'Show overflow tables'"
      @click="emit('update:overflowTables', !overflowTables)"
    >
      <template #icon>
        <TableProperties :size="16" />
      </template>
    </Button>
    <Button
      v-if="!geoCanvas"
      severity="secondary"
      text
      rounded
      :class="{ 'tool-active': showGrid }"
      :aria-pressed="showGrid"
      v-tooltip.left="showGrid ? 'Hide grid' : 'Show grid'"
      @click="emit('update:showGrid', !showGrid)"
    >
      <template #icon>
        <Grid3x3 :size="16" />
      </template>
    </Button>
    <Button
      severity="secondary"
      text
      rounded
      :class="{ 'tool-active': geoCanvas }"
      :aria-pressed="geoCanvas"
      v-tooltip.left="
        geoCanvas
          ? 'Show on the graph canvas (this view only)'
          : 'Show on the geographical canvas (this view only)'
      "
      @click="emit('update:geoCanvas', !geoCanvas)"
    >
      <template #icon>
        <Globe :size="16" />
      </template>
    </Button>

    <template v-if="editMode && !geoCanvas">
      <div class="side-toolbar-divider" />
      <Button
        severity="secondary"
        text
        rounded
        :class="{ 'tool-active': snapToGrid }"
        :aria-pressed="snapToGrid"
        v-tooltip.left="'Snap to grid'"
        @click="emit('update:snapToGrid', !snapToGrid)"
      >
        <template #icon>
          <Magnet :size="16" />
        </template>
      </Button>
      <Button
        severity="secondary"
        text
        rounded
        v-tooltip.left="hasSelection ? 'Align selection to grid' : 'Align all elements to grid'"
        @click="emit('align-to-grid')"
      >
        <template #icon>
          <LayoutGrid :size="16" />
        </template>
      </Button>
    </template>
  </div>
</template>

<style scoped>
/* Same card chrome as NetworkMapEditControls, so the two read as one stack. */
.side-toolbar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.25rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 8px;
  background: var(--p-surface-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.side-toolbar-divider {
  height: 1px;
  width: 1.25rem;
  background: var(--p-surface-border);
  margin: 0.125rem 0;
  flex-shrink: 0;
}

/* Matches .mode-switch-btn.active */
.side-toolbar :deep(.tool-active) {
  background: var(--p-surface-ground);
  color: var(--p-primary-color);
}
</style>
