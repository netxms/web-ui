<script setup>
import Button from 'primevue/button'
import { TOPOLOGY_TYPE_LABELS, LAYOUT_LABELS, LAYOUTS } from '@/utils/topologyUtils'

const TOPOLOGY_TYPES_ORDER = ['l2', 'ip', 'ospf', 'internal']

const LAYOUT_ICONS = {
  [LAYOUTS.RADIAL]: 'pi pi-circle-on',
  [LAYOUTS.GRID]: 'pi pi-th-large',
  [LAYOUTS.TREE_V]: 'pi pi-sitemap',
  [LAYOUTS.TREE_H]: 'pi pi-share-alt',
}

defineProps({
  activeType: { type: String, required: true },
  activeLayout: { type: String, required: true },
  searchTerm: { type: String, default: '' },
  isFetching: { type: Boolean, default: false },
  disabledTypes: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'type-change',
  'layout-change',
  'update:searchTerm',
  'fit',
  'zoom-in',
  'zoom-out',
  'refresh',
])
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
      <div class="layout-btns">
        <Button
          :aria-label="`${LAYOUT_LABELS[layout]} layout`"
          v-for="(icon, layout) in LAYOUT_ICONS"
          :key="layout"
          :icon="icon"
          size="small"
          :severity="activeLayout === layout ? 'primary' : 'secondary'"
          :text="activeLayout !== layout"
          rounded
          :title="LAYOUT_LABELS[layout]"
          @click="emit('layout-change', layout)"
        />
      </div>
    </div>

    <div class="toolbar-section toolbar-right">
      <div class="search-wrap">
        <i class="pi pi-search search-icon" />
        <input
          class="search-input"
          type="text"
          data-filter-input
          placeholder="Search nodes..."
          :value="searchTerm"
          @input="emit('update:searchTerm', $event.target.value)"
        />
        <button v-if="searchTerm" class="search-clear" @click="emit('update:searchTerm', '')">
          <i class="pi pi-times" />
        </button>
      </div>
      <Button
        aria-label="Fit to window"
        icon="pi pi-expand"
        size="small"
        severity="secondary"
        text
        rounded
        title="Fit to view"
        @click="emit('fit')"
      />
      <Button
        aria-label="Zoom in"
        icon="pi pi-plus"
        size="small"
        severity="secondary"
        text
        rounded
        title="Zoom in"
        @click="emit('zoom-in')"
      />
      <Button
        aria-label="Zoom out"
        icon="pi pi-minus"
        size="small"
        severity="secondary"
        text
        rounded
        title="Zoom out"
        @click="emit('zoom-out')"
      />
      <Button
        aria-label="Refresh topology"
        icon="pi pi-refresh"
        size="small"
        severity="secondary"
        text
        rounded
        title="Refresh"
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

.layout-btns {
  display: flex;
  align-items: center;
  gap: 0.125rem;
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

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  margin-right: 0.25rem;
}

.search-icon {
  position: absolute;
  left: 0.5rem;
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
  pointer-events: none;
}

.search-input {
  font-size: 0.75rem;
  padding: 0.25rem 1.5rem 0.25rem 1.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 4px;
  background: var(--p-surface-ground);
  color: var(--p-text-color);
  width: 160px;
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: var(--p-primary-color);
}

.search-clear {
  position: absolute;
  right: 0.4rem;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--p-text-muted-color);
  padding: 0;
  font-size: 0.65rem;
  display: flex;
  align-items: center;
}

.search-clear:hover {
  color: var(--p-text-color);
}
</style>
