<script setup>
/**
 * Renders on `GeoMapCanvas`, as geographical network maps do. Filters are client-side: the
 * single query result is already held, so a server-side filter would cost a round trip per
 * checkbox.
 */
import { computed, defineAsyncComponent, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import MultiSelect from 'primevue/multiselect'
import { useObjectQuery } from '@/queries/useObjectQueries'
import { openInNewTab, shouldOpenInNewTab } from '@/utils/navigation'
import { MAP_INITIAL_VIEW_FIT_TO_SCREEN } from '@/utils/networkMapUtils'
import { getClassLabel, getStatusInfo } from '@/utils/objectUtils'
import { objectTarget } from '@/utils/routeTargets'
import { toMapElements, worldMapRequest, WORLD_MAP_LIMIT } from '@/utils/worldMapQuery'

// Leaflet plus cytoscape is a large dependency pair; the tool catalog must not pay for it.
const GeoMapCanvas = defineAsyncComponent(
  () => import('@/components/network-maps/GeoMapCanvas.vue'),
)

const router = useRouter()

const request = computed(worldMapRequest)
const { data: results, isLoading, isFetching, error, refetch } = useObjectQuery(request)

const elements = computed(() => toMapElements(results.value))

const isTruncated = computed(() => (results.value?.length ?? 0) >= WORLD_MAP_LIMIT)

const selectedClasses = ref([])
const selectedStatuses = ref([])

/** Only the classes and statuses actually present; an empty selection means "all". */
const classOptions = computed(() => {
  const classes = new Set(elements.value.map((element) => element.objectClass))
  return [...classes]
    .map((value) => ({ value, label: getClassLabel(value) }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

const statusOptions = computed(() => {
  const statuses = new Set(elements.value.map((element) => element.objectStatus))
  return [...statuses]
    .sort((a, b) => a - b)
    .map((value) => ({ value, label: getStatusInfo(value).label }))
})

const visibleElements = computed(() =>
  elements.value.filter(
    (element) =>
      (selectedClasses.value.length === 0 || selectedClasses.value.includes(element.objectClass)) &&
      (selectedStatuses.value.length === 0 ||
        selectedStatuses.value.includes(element.objectStatus)),
  ),
)

const mapData = computed(() => ({ elements: visibleElements.value, links: [] }))

const isFiltered = computed(
  () => selectedClasses.value.length > 0 || selectedStatuses.value.length > 0,
)

function clearFilters() {
  selectedClasses.value = []
  selectedStatuses.value = []
}

/**
 * The canvas applies the initial view once, so filtering later does not move the viewport.
 */
const INITIAL_VIEW = { mode: MAP_INITIAL_VIEW_FIT_TO_SCREEN, lat: 0, lon: 0, zoom: 3 }

function targetFor(node) {
  return node?.objectId ? objectTarget({ id: node.objectId, class: node.objectClass }) : null
}

function openObject(node, event) {
  const target = targetFor(node)
  if (!target) return
  if (event && shouldOpenInNewTab(event)) {
    openInNewTab(target)
    return
  }
  router.push(target)
}

function openObjectInNewTab(node) {
  const target = targetFor(node)
  if (target) openInNewTab(target)
}

/**
 * Shown over the map rather than instead of it: a full-pane error would hide what the user
 * came for.
 *
 * @returns {{severity: string, icon: string, text: string, action: string|null}|null}
 */
const notice = computed(() => {
  if (error.value) {
    return {
      severity: 'error',
      icon: 'pi pi-exclamation-triangle',
      text: error.value.message || 'Could not load geolocated objects.',
      action: 'retry',
    }
  }
  if (isLoading.value) return null
  // Matched "has a position" but without usable coordinates: a query fault, not an empty
  // estate.
  if (elements.value.length === 0 && (results.value?.length ?? 0) > 0) {
    return {
      severity: 'error',
      icon: 'pi pi-exclamation-triangle',
      text: `${results.value.length} object(s) reported a location, but none returned usable coordinates.`,
      action: 'retry',
    }
  }
  if (elements.value.length === 0) {
    return {
      severity: 'info',
      icon: 'pi pi-map-marker',
      text: 'No objects have coordinates set. Add them under Properties > Location.',
      action: null,
    }
  }
  if (visibleElements.value.length === 0) {
    return {
      severity: 'info',
      icon: 'pi pi-filter',
      text: 'No objects match these filters.',
      action: 'clear',
    }
  }
  return null
})
</script>

<template>
  <div class="world-map-view">
    <div class="section-toolbar">
      <MultiSelect
        v-model="selectedClasses"
        :options="classOptions"
        option-label="label"
        option-value="value"
        placeholder="All classes"
        size="small"
        :max-selected-labels="2"
        selected-items-label="{0} classes"
        class="world-map-filter"
        :disabled="classOptions.length === 0"
      />
      <MultiSelect
        v-model="selectedStatuses"
        :options="statusOptions"
        option-label="label"
        option-value="value"
        placeholder="All statuses"
        size="small"
        :max-selected-labels="2"
        selected-items-label="{0} statuses"
        class="world-map-filter"
        :disabled="statusOptions.length === 0"
      />
      <Button
        v-if="isFiltered"
        label="Clear"
        icon="pi pi-filter-slash"
        size="small"
        text
        @click="clearFilters"
      />

      <div class="toolbar-actions">
        <span class="item-count">
          {{ $plural(visibleElements.length, 'object', 'objects') }}
          <template v-if="isFiltered"> of {{ elements.length }}</template>
          <template v-else-if="isTruncated"> (server limit)</template>
        </span>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          :loading="isFetching"
          @click="refetch()"
        />
      </div>
    </div>

    <div class="world-map-canvas">
      <GeoMapCanvas
        :map-data="mapData"
        :initial-view="INITIAL_VIEW"
        hide-links
        hide-link-labels
        @node-dblclick="openObject"
        @node-middleclick="openObjectInNewTab"
      />

      <div v-if="notice" class="map-notice" :class="`map-notice--${notice.severity}`">
        <i :class="notice.icon" class="map-notice-icon" />
        <span class="map-notice-text">{{ notice.text }}</span>
        <template v-if="notice.action === 'retry'">
          <span class="map-notice-sep" />
          <button type="button" class="map-notice-action" @click="refetch()">
            <i class="pi pi-refresh" />
            Retry
          </button>
        </template>
        <template v-else-if="notice.action === 'clear'">
          <span class="map-notice-sep" />
          <button type="button" class="map-notice-action" @click="clearFilters">
            <i class="pi pi-filter-slash" />
            Clear filters
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.world-map-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  margin: -1rem;
}

.section-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.world-map-filter {
  min-width: 180px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.item-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.world-map-canvas {
  flex: 1;
  min-height: 0;
  position: relative;
}

/* Floating note over the map, matching the network map canvas's own overlays. */
.map-notice {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 500; /* above Leaflet panes, below its controls' own popups */
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: min(560px, calc(100% - 1.5rem));
  padding: 0.5rem 0.75rem;
  border-radius: var(--p-border-radius-md, 8px);
  border: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  box-shadow: 0 2px 10px rgb(0 0 0 / 15%);
  font-size: 0.8125rem;
  color: var(--p-text-color);
}

.map-notice-icon {
  flex-shrink: 0;
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.map-notice--error .map-notice-icon {
  color: var(--p-red-500);
}

.map-notice-text {
  min-width: 0;
}

.map-notice-sep {
  flex-shrink: 0;
  width: 1px;
  align-self: stretch;
  background: var(--p-surface-border);
}

.map-notice-action {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  color: var(--p-primary-color);
}

.map-notice-action:hover {
  text-decoration: underline;
}
</style>
