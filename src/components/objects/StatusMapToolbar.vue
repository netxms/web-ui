<script setup>
/**
 * Floating controls over a status map's top-right corner. The host gives the map holder
 * `position: relative` and keeps the toolbar outside any scroll container.
 */
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import {
  LayoutGrid,
  Hexagon,
  Rows3,
  ChartPie,
  LayoutDashboard,
  TriangleAlert,
  ArrowDownAZ,
  ChevronsRight,
  SlidersHorizontal,
} from 'lucide-vue-next'
import { prefs } from '@/utils/appStorage'

const props = defineProps({
  layout: { type: String, default: 'flat' },
  showLayouts: { type: Boolean, default: true },
  /** Off for e.g. a dashboard outside edit mode; the card then only shows the count. */
  editable: { type: Boolean, default: true },
  sortBy: { type: String, default: 'status' },
  /** null while loading. */
  count: { type: Number, default: null },
  refreshing: { type: Boolean, default: false },
  /** e.g. `widget:<element guid>` */
  storageKey: { type: String, required: true },
  defaultCollapsed: { type: Boolean, default: false },
})

const emit = defineEmits(['update:layout', 'update:sortBy'])

// Lucide pads each glyph inside its 24-unit box, so the icon is sized up to fill the button.
const ICON_SIZE = 20

const LAYOUTS = [
  { value: 'flat', label: 'Flat', icon: LayoutGrid },
  { value: 'honeycomb', label: 'Honeycomb', icon: Hexagon },
  { value: 'grouped', label: 'Grouped', icon: Rows3 },
  { value: 'sunburst', label: 'Sunburst', icon: ChartPie },
  { value: 'treemap', label: 'Treemap', icon: LayoutDashboard },
]

const SORTS = [
  { value: 'status', label: 'Sort by status', icon: TriangleAlert },
  { value: 'name', label: 'Sort by name', icon: ArrowDownAZ },
]

const SORTABLE_LAYOUTS = new Set(['flat', 'honeycomb'])

const showPicker = computed(() => props.editable && props.showLayouts)
const showSort = computed(
  () => props.editable && (!props.showLayouts || SORTABLE_LAYOUTS.has(props.layout)),
)

// One prefs field for every status map, keyed by host.

const PREFS_FIELD = 'statusMap.toolbarCollapsed'

function readCollapsedMap() {
  const stored = prefs.get(PREFS_FIELD, {})
  return stored && typeof stored === 'object' ? stored : {}
}

const collapsed = ref(readCollapsedMap()[props.storageKey] ?? props.defaultCollapsed)

function setCollapsed(value) {
  collapsed.value = value
  prefs.set(PREFS_FIELD, { ...readCollapsedMap(), [props.storageKey]: value })
}
</script>

<template>
  <div class="status-map-toolbar" :class="{ 'status-map-toolbar--collapsed': collapsed }">
    <Button
      v-if="collapsed"
      severity="secondary"
      text
      rounded
      aria-label="Show controls"
      :aria-expanded="false"
      v-tooltip.left="'Show controls'"
      @click="setCollapsed(false)"
    >
      <template #icon>
        <SlidersHorizontal :size="ICON_SIZE" />
      </template>
    </Button>

    <div v-else class="smt-card" role="toolbar" aria-label="Status map controls">
      <div v-if="showPicker" class="smt-group" role="group" aria-label="Layout">
        <Button
          v-for="l in LAYOUTS"
          :key="l.value"
          severity="secondary"
          text
          rounded
          :class="{ 'tool-active': layout === l.value }"
          :aria-label="l.label"
          :aria-pressed="layout === l.value"
          v-tooltip.bottom="l.label"
          @click="emit('update:layout', l.value)"
        >
          <template #icon>
            <component :is="l.icon" :size="ICON_SIZE" />
          </template>
        </Button>
      </div>
      <div v-if="showPicker && showSort" class="smt-divider" />

      <div v-if="showSort" class="smt-group" role="group" aria-label="Sort">
        <Button
          v-for="s in SORTS"
          :key="s.value"
          severity="secondary"
          text
          rounded
          :class="{ 'tool-active': sortBy === s.value }"
          :aria-label="s.label"
          :aria-pressed="sortBy === s.value"
          v-tooltip.bottom="s.label"
          @click="emit('update:sortBy', s.value)"
        >
          <template #icon>
            <component :is="s.icon" :size="ICON_SIZE" />
          </template>
        </Button>
      </div>

      <template v-if="count != null">
        <div v-if="showPicker || showSort" class="smt-divider" />
        <span class="smt-count">
          {{ count }} objects
          <i v-if="refreshing" class="pi pi-spin pi-spinner" aria-label="Refreshing" />
        </span>
      </template>

      <div v-if="showPicker || showSort || count != null" class="smt-divider" />
      <Button
        severity="secondary"
        text
        rounded
        aria-label="Hide controls"
        :aria-expanded="true"
        v-tooltip.bottom="'Hide controls'"
        @click="setCollapsed(true)"
      >
        <template #icon>
          <ChevronsRight :size="ICON_SIZE" />
        </template>
      </Button>
    </div>
  </div>
</template>

<style scoped>
.status-map-toolbar {
  position: absolute;
  top: 0.25rem;
  right: 0.75rem;
  z-index: 2;
}

.smt-card,
.status-map-toolbar--collapsed {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.3rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 8px;
  background: var(--p-surface-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.status-map-toolbar--collapsed {
  padding: 0.15rem;
  opacity: 0.6;
  transition: opacity 0.15s;
}

:hover > .status-map-toolbar--collapsed,
.status-map-toolbar--collapsed:focus-within {
  opacity: 1;
}

.smt-group {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.smt-divider {
  width: 1px;
  height: 1.25rem;
  background: var(--p-surface-border);
  margin: 0 0.125rem;
  flex-shrink: 0;
}

.smt-count {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0 0.375rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.smt-count .pi {
  font-size: 0.8125rem;
}

.smt-card :deep(.tool-active) {
  background: var(--p-surface-ground);
  color: var(--p-primary-color);
}
</style>
