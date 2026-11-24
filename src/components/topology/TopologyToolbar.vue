<script setup>
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import Select from 'primevue/select'
import { ref } from 'vue'
import MapObjectSearch from '@/components/network-maps/MapObjectSearch.vue'
import { TOPOLOGY_TYPES, TOPOLOGY_TYPE_LABELS, LAYOUT_LABELS, LAYOUTS } from '@/utils/topologyUtils'

const TOPOLOGY_TYPES_ORDER = ['l2', 'ip', 'ospf', 'internal']

const LAYOUT_OPTIONS = Object.values(LAYOUTS).map((value) => ({
  label: LAYOUT_LABELS[value],
  value,
}))

defineProps({
  activeType: { type: String, required: true },
  activeLayout: { type: String, required: true },
  searchTerm: { type: String, default: '' },
  /** Entries from `mapObjectEntries`: what the canvas draws. */
  objects: { type: Array, default: () => [] },
  physicalLinks: { type: Boolean, default: false },
  /** Menu model for the Display button: display mode and status/label/link options. */
  displayItems: { type: Array, default: () => [] },
  isFetching: { type: Boolean, default: false },
  disabledTypes: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'type-change',
  'layout-change',
  'update:searchTerm',
  'update:physicalLinks',
  'focus-object',
  'refresh',
])

const displayMenuRef = ref(null)
</script>

<template>
  <div class="topology-toolbar">
    <div class="toolbar-section toolbar-types">
      <button
        v-for="type in TOPOLOGY_TYPES_ORDER"
        :key="type"
        class="type-btn"
        :class="{ active: activeType === type, disabled: disabledTypes.includes(type) }"
        :title="disabledTypes.includes(type) ? 'Not available for this node' : undefined"
        @click="emit('type-change', type)"
      >
        {{ TOPOLOGY_TYPE_LABELS[type] }}
      </button>
    </div>

    <div class="toolbar-section toolbar-centre">
      <span v-if="isFetching" class="refetch-indicator">
        <i class="pi pi-spin pi-spinner" />
        Refreshing...
      </span>
      <Select
        :model-value="activeLayout"
        :options="LAYOUT_OPTIONS"
        option-label="label"
        option-value="value"
        size="small"
        class="layout-select"
        aria-label="Layout"
        @update:model-value="emit('layout-change', $event)"
      />
      <Button
        label="Display"
        icon="pi pi-eye"
        size="small"
        severity="secondary"
        text
        aria-haspopup="true"
        @click="displayMenuRef?.toggle($event)"
      />
      <Menu ref="displayMenuRef" :model="displayItems" :popup="true" />
    </div>

    <div class="toolbar-section toolbar-right">
      <Button
        v-if="activeType === TOPOLOGY_TYPES.L2"
        label="Physical links"
        icon="pi pi-link"
        size="small"
        severity="secondary"
        text
        class="toggle-button"
        :class="{ 'toggle-button--on': physicalLinks }"
        :aria-pressed="physicalLinks"
        v-tooltip.bottom="'Add the known physical (L1) links to the map'"
        @click="emit('update:physicalLinks', !physicalLinks)"
      />
      <MapObjectSearch
        :search-term="searchTerm"
        :objects="objects"
        @update:search-term="emit('update:searchTerm', $event)"
        @focus-object="emit('focus-object', $event)"
      />
      <div class="toolbar-tool-divider" />
      <Button
        icon="pi pi-refresh"
        size="small"
        severity="secondary"
        text
        rounded
        v-tooltip.bottom="'Refresh'"
        aria-label="Refresh topology"
        @click="emit('refresh')"
      />
    </div>
  </div>
</template>

<style scoped>
.topology-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  gap: 0.5rem;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.toolbar-types {
  gap: 0.125rem;
}

.type-btn {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  color: var(--p-text-muted-color);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
  white-space: nowrap;
}

.type-btn:hover:not(.disabled) {
  background: var(--p-surface-hover);
  color: var(--p-text-color);
}

.type-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.type-btn.active {
  background: var(--p-primary-color);
  border-color: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.toolbar-centre {
  gap: 0.5rem;
}

.layout-select {
  width: 160px;
}

.refetch-indicator {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.toolbar-right {
  gap: 0.125rem;
}

.toolbar-tool-divider {
  width: 1px;
  height: 1.25rem;
  background: var(--p-surface-border);
  margin: 0 0.25rem;
  flex-shrink: 0;
}

.toggle-button {
  flex-shrink: 0;
}

.toggle-button :deep(.p-button-label) {
  white-space: nowrap;
}

/* As the network map toolbar's open Layers button. */
.toggle-button--on {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
}
</style>
