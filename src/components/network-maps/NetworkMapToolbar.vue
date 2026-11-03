<script setup>
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import Select from 'primevue/select'
import { computed, ref } from 'vue'
import { MAP_TYPE_LABELS } from '@/utils/networkMapUtils'
import { useRouter } from 'vue-router'
import { logTarget } from '@/utils/routeTargets'

const props = defineProps({
  mapData: { type: Object, default: null },
  isFetching: { type: Boolean, default: false },
  searchTerm: { type: String, default: '' },
  /** False for demo maps, which cannot be saved. */
  editable: { type: Boolean, default: false },
  /** False on the geographical canvas, where objects sit at their geolocation. */
  layoutTools: { type: Boolean, default: true },
  editMode: { type: Boolean, default: false },
})

const emit = defineEmits([
  'refresh',
  'apply-layout',
  'open-tools-panel',
  'update:searchTerm',
  'open-map-settings',
])

const LAYOUT_OPTIONS = [
  { label: 'Manual', value: 'manual' },
  { label: 'Spring', value: 'spring' },
  { label: 'Horizontal Tree', value: 'htree' },
  { label: 'Vertical Tree', value: 'vtree' },
  { label: 'Radial', value: 'radial' },
]

const router = useRouter()
const selectedLayout = ref('manual')

const toolsMenuRef = ref(null)
const TOOLS_MENU_ITEMS = computed(() => [
  { label: 'Polls', icon: 'pi pi-chart-line', command: () => emit('open-tools-panel', 'polls') },
  {
    label: 'Execute Script',
    icon: 'pi pi-code',
    command: () => emit('open-tools-panel', 'script'),
  },
  {
    label: 'Audit Log',
    icon: 'pi pi-list',
    command: () => router.push(auditTarget.value),
  },
])

const auditTarget = computed(() =>
  logTarget('AuditLog', {
    object: String(props.mapData?.id ?? ''),
    objectName: props.mapData?.name ?? '',
    t: 'last30d',
  }),
)

function toggleToolsMenu(event) {
  toolsMenuRef.value?.toggle(event)
}
</script>

<template>
  <div class="network-map-toolbar">
    <div class="toolbar-left">
      <span v-if="mapData" class="map-type-badge">
        {{ MAP_TYPE_LABELS[mapData.mapType] ?? 'Map' }}
      </span>
      <span v-if="isFetching" class="refetch-indicator">
        <i class="pi pi-spin pi-spinner" />
        Refreshing...
      </span>
    </div>
    <div v-if="layoutTools" class="toolbar-center">
      <Select
        v-model="selectedLayout"
        :options="LAYOUT_OPTIONS"
        option-label="label"
        option-value="value"
        size="small"
        class="layout-select"
      />
      <Button
        :label="editMode ? 'Apply' : 'Preview'"
        size="small"
        severity="secondary"
        :disabled="selectedLayout === 'manual'"
        v-tooltip.bottom="
          editMode
            ? 'Apply this layout to the draft'
            : 'Rearranges only your view — the saved map is unchanged'
        "
        @click="emit('apply-layout', selectedLayout)"
      />
    </div>
    <div class="toolbar-right">
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
      <div class="toolbar-tool-divider" />
      <Button
        label="Tools"
        icon="pi pi-wrench"
        size="small"
        severity="secondary"
        text
        :disabled="!mapData"
        @click="toggleToolsMenu"
      />
      <Menu ref="toolsMenuRef" :model="TOOLS_MENU_ITEMS" :popup="true" />
      <Button
        v-if="editable"
        icon="pi pi-cog"
        size="small"
        severity="secondary"
        text
        rounded
        v-tooltip.bottom="'Map properties'"
        aria-label="Map properties"
        @click="emit('open-map-settings')"
      />
      <Button
        icon="pi pi-refresh"
        size="small"
        severity="secondary"
        text
        rounded
        v-tooltip.bottom="'Refresh'"
        aria-label="Refresh"
        @click="emit('refresh')"
      />
    </div>
  </div>
</template>

<style scoped>
.network-map-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.375rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  gap: 0.5rem;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex: 1;
  justify-content: flex-end;
}

.toolbar-tool-divider {
  width: 1px;
  height: 1.25rem;
  background: var(--p-surface-border);
  margin: 0 0.25rem;
  flex-shrink: 0;
}

.layout-select {
  width: 140px;
}

.map-type-badge {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  background: var(--p-surface-ground);
  border: 1px solid var(--p-surface-border);
  border-radius: 4px;
  padding: 0.125rem 0.5rem;
  font-weight: 500;
}

.refetch-indicator {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  display: flex;
  align-items: center;
  gap: 0.375rem;
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
