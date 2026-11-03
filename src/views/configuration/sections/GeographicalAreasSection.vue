<script setup>
import { ref, computed } from 'vue'

import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import AreaMapPanel from '@/components/geographical-areas/AreaMapPanel.vue'
import AreaDetailPanel from '@/components/geographical-areas/AreaDetailPanel.vue'
import AreaCreatePanel from '@/components/geographical-areas/AreaCreatePanel.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import { useGeographicalAreas } from '@/queries/useGeographicalAreaQueries'
import { useResizeHandle } from '@/composables/useResizeHandle'
import { useWorkingState } from '@/composables/useWorkingState'

const { data: areasData, isLoading, isFetching, isError, error, refetch } = useGeographicalAreas()
const areas = computed(() => areasData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('geographical-areas', { view: { filterState } })

const filteredAreas = computed(() => {
  if (!filterState.value.text) return areas.value
  const q = filterState.value.text.toLowerCase()
  return areas.value.filter((a) => a.name.toLowerCase().includes(q))
})

const selectedId = ref(null)
const selectedArea = computed(() => areas.value.find((a) => a.id === selectedId.value) ?? null)

function selectArea(id) {
  if (isCreating.value) return // ignore clicks while creating
  if (id !== selectedId.value) stopEditGeometry()
  selectedId.value = id
}

const isCreating = ref(false)
const createPanelRef = ref(null)

function startCreate() {
  selectedId.value = null
  isCreating.value = true
  stopEditGeometry()
}

function onCreated(area) {
  isCreating.value = false
  selectedId.value = area.id
}

function cancelCreate() {
  isCreating.value = false
  drawMode.value = 'idle'
  previewGeoJson.value = null
}

function onDeleted() {
  selectedId.value = null
  stopEditGeometry()
}

const isEditingGeometry = ref(false)
const editGeoJson = ref(null)

function startEditGeometry() {
  editGeoJson.value = JSON.parse(JSON.stringify(selectedArea.value.geoJson))
  isEditingGeometry.value = true
}

/** Exit the visual map-editing mode but keep staged editGeoJson until Save or Discard */
function stopEditGeometry() {
  isEditingGeometry.value = false
}

/** Exit edit mode AND throw away any staged geometry changes */
function discardEditGeometry() {
  isEditingGeometry.value = false
  editGeoJson.value = null
}

function onEditGeoJsonChange(geoJson) {
  editGeoJson.value = geoJson
}

const drawMode = ref('idle')
const previewGeoJson = ref(null)

function onDrawModeChange(mode) {
  drawMode.value = mode
}

function onPreviewChange(geoJson) {
  previewGeoJson.value = geoJson
}

function onMapDrawingComplete(geoJson) {
  createPanelRef.value?.onDrawingComplete(geoJson)
}

const workareaRef = ref(null)
const panelHeight = ref(300)

// A getter: the map must keep at least 120px whatever the window height.
const { isResizing: isDragging, handleBindings: resizeBindings } = useResizeHandle({
  size: panelHeight,
  setSize: (px) => (panelHeight.value = px),
  min: 160,
  max: () => (workareaRef.value?.getBoundingClientRect().height ?? 600) - 120,
  label: 'Resize area details panel',
  orientation: 'horizontal',
})
</script>

<template>
  <div class="geo-areas-section">
    <div class="area-list-panel">
      <SectionHeader title="Geographical Areas">
        <template #actions>
          <RefetchIndicator :is-fetching="isFetching" :is-loading="isLoading" />
          <Button
            v-tooltip.bottom="'Refresh'"
            icon="pi pi-refresh"
            size="small"
            severity="secondary"
            text
            rounded
            aria-label="Refresh"
            @click="refetch"
          />
          <Button
            v-tooltip.bottom="'New area'"
            aria-label="New area"
            icon="pi pi-plus"
            size="small"
            severity="secondary"
            text
            rounded
            :disabled="isCreating"
            @click="startCreate"
          />
        </template>
      </SectionHeader>

      <div class="list-toolbar">
        <SmartFilterInput
          v-model="filterState"
          placeholder="Search areas..."
          size="small"
          class="list-filter"
        />
        <span class="list-count">{{ $plural(filteredAreas.length, 'area') }}</span>
      </div>

      <div class="area-scroll">
        <template v-if="isLoading">
          <div v-for="n in 4" :key="n" class="area-row area-row--skeleton">
            <Skeleton height="1rem" width="60%" />
            <Skeleton height="1rem" width="3rem" />
          </div>
        </template>

        <div v-else-if="isError" class="list-error">
          <QueryErrorState :error="error" @retry="refetch" />
        </div>

        <template v-else>
          <div v-if="filteredAreas.length === 0" class="list-empty">
            <i class="pi pi-map" />
            <span>No areas found</span>
          </div>
          <button
            type="button"
            v-for="area in filteredAreas"
            :key="area.id"
            class="area-row"
            :class="{ 'area-row--selected': selectedId === area.id && !isCreating }"
            @click="selectArea(area.id)"
          >
            <i class="pi pi-map-marker area-row-icon" />
            <span class="area-row-name">{{ area.name }}</span>
          </button>
        </template>
      </div>
    </div>

    <div ref="workareaRef" class="area-workarea">
      <div class="area-map-container">
        <AreaMapPanel
          :areas="areas"
          :selected-id="selectedId"
          :draw-mode="drawMode"
          :preview-geo-json="previewGeoJson"
          :edit-mode="isEditingGeometry"
          :edit-geo-json="editGeoJson"
          @drawing-complete="onMapDrawingComplete"
          @update:edit-geo-json="onEditGeoJsonChange"
        />
      </div>

      <!-- Handle and panel render together so the handle is always above the panel -->
      <Transition name="panel-slide">
        <div v-if="selectedArea || isCreating" class="area-bottom-wrapper">
          <div
            class="resize-handle"
            :class="{ 'resize-handle--dragging': isDragging }"
            v-bind="resizeBindings"
          />

          <div class="area-bottom-panel" :style="{ height: panelHeight + 'px' }">
            <AreaCreatePanel
              v-if="isCreating"
              ref="createPanelRef"
              @cancel="cancelCreate"
              @created="onCreated"
              @draw-mode-change="onDrawModeChange"
              @preview-change="onPreviewChange"
            />
            <AreaDetailPanel
              v-else
              :area="selectedArea"
              :is-editing-geometry="isEditingGeometry"
              :edit-geo-json="editGeoJson"
              @deleted="onDeleted"
              @start-edit-geometry="startEditGeometry"
              @stop-edit-geometry="stopEditGeometry"
              @discard-edit-geometry="discardEditGeometry"
              @update:edit-geo-json="onEditGeoJsonChange"
            />
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.geo-areas-section {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.area-list-panel {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--p-surface-border);
  overflow: hidden;
  background: var(--p-surface-card);
}

.list-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  flex-shrink: 0;
}

.list-filter {
  width: 100%;
  font-size: 0.8125rem;
}

.list-count {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
  min-width: 1.5rem;
  text-align: right;
  margin-left: auto;
}

.area-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.list-empty .pi {
  font-size: 1.5rem;
  opacity: 0.35;
}

.list-error {
  display: flex;
  justify-content: center;
  padding: 2rem 1rem;
}

.area-row {
  /* Now a <button>: undo the chrome a button brings that a row never had. */
  width: 100%;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  border-bottom: 1px solid var(--p-surface-border);
  transition: background-color 0.12s;
  min-height: 2.625rem;
}

.area-row:hover {
  background: var(--p-surface-hover);
}

.area-row--selected {
  background: var(--p-highlight-background);
  color: var(--p-highlight-color);
}

.area-row--skeleton {
  justify-content: space-between;
  cursor: default;
}

.area-row--skeleton:hover {
  background: transparent;
}

.area-row-icon {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.area-row--selected .area-row-icon {
  color: var(--p-highlight-color);
}

.area-row-name {
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.area-workarea {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.area-map-container {
  flex: 1;
  min-height: 0;
  position: relative;
}

.area-bottom-wrapper {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.resize-handle {
  height: 5px;
  flex-shrink: 0;
  cursor: ns-resize;
  background: var(--p-surface-border);
  transition: background 0.15s;
  user-select: none;
}

/* A 5px strip gives no other focus cue; an outline would be clipped by the panel edge. */
.resize-handle:hover,
.resize-handle:focus-visible,
.resize-handle--dragging {
  background: var(--p-primary-color);
  outline: none;
}

.area-bottom-panel {
  flex-shrink: 0;
  background: var(--p-surface-ground);
  overflow: hidden;
  overflow-y: auto;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: opacity 0.15s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
}
</style>
