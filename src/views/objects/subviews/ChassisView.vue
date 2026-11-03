<script setup>
import { ref, computed, watch, nextTick, inject } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import ChassisCanvas from '@/components/chassis/ChassisCanvas.vue'
import ChassisElementPanel from '@/components/chassis/ChassisElementPanel.vue'
import AddChassisElementDialog from '@/components/chassis/AddChassisElementDialog.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import {
  useChassisLayout,
  useObject,
  useUpdateObjectPhysicalPlacement,
} from '@/queries/useObjectQueries'
import { useImagesByGuid } from '@/queries/useImageLibraryQueries'
import { getStatusHexColor } from '@/utils/objectUtils'
import { chassisPlacementToApiPayload } from '@/api/objectAdapters'
import { describePlacementError } from '@/utils/placementErrors'
import { objectTarget } from '@/utils/routeTargets'

// Base scale at zoom 1.0
const BASE_HP_PX = 8 // px per HP
const BASE_RU_PX = 70 // px per RU
const BASE_MM_PX = 2 // px per mm

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const ZOOM_STEP = 0.25

const STATUS_LABELS = ['Normal', 'Warning', 'Minor', 'Major', 'Critical', 'Unknown']

const props = defineProps({
  object: { type: Object, required: true },
})

const router = useRouter()
const toast = useToast()
const objectId = computed(() => props.object.id)

const { mutateAsync: updatePlacementAsync } = useUpdateObjectPhysicalPlacement()

// Dimensions and images are not in the chassis-layout endpoint.
const { data: fullObject, refetch } = useObject(objectId)

const unitSystem = computed(() => (fullObject.value ?? props.object).unitSystem ?? 'hp-ru')

const {
  data: chassisLayout,
  isLoading,
  isFetching,
  isError,
  error,
  refetch: refetchLayout,
} = useChassisLayout(objectId, unitSystem)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) {
  watch(refreshSignal, () => {
    refetch()
    refetchLayout()
  })
}

const chassisMeta = computed(() => {
  const obj = fullObject.value ?? props.object
  return {
    id: obj.id,
    name: obj.name,
    chassisWidth: obj.chassisWidth ?? 80,
    chassisHeight: obj.chassisHeight ?? 2,
    unitSystem: obj.unitSystem ?? 'hp-ru',
    chassisMode: obj.chassisMode ?? 'front-back',
    frontImageGuid: obj.frontImageGuid ?? null,
    backImageGuid: obj.backImageGuid ?? null,
  }
})

const elements = computed(() => chassisLayout.value?.elements ?? [])

const dialogVisible = ref(false)
const editElement = ref(null)
const prefilledX = ref(null)
const prefilledY = ref(null)
const prefilledWidth = ref(null)
const prefilledHeight = ref(null)

const elementsForDialog = computed(() =>
  editElement.value
    ? elements.value.filter((el) => el.id !== editElement.value.id)
    : elements.value,
)

function openAdd(x, y, _side, width = null, height = null) {
  editElement.value = null
  prefilledX.value = x
  prefilledY.value = y
  prefilledWidth.value = width
  prefilledHeight.value = height
  dialogVisible.value = true
}

function openEdit(elementId) {
  editElement.value = elements.value.find((el) => el.id === elementId) ?? null
  if (editElement.value) {
    prefilledX.value = null
    prefilledY.value = null
    prefilledWidth.value = null
    prefilledHeight.value = null
    dialogVisible.value = true
  }
}

// Placement is a property of the placed object; chassis have no passive elements (unlike racks).
async function persistPlacement(element) {
  await updatePlacementAsync({
    id: element.objectId,
    payload: chassisPlacementToApiPayload(objectId.value, element, unitSystem.value),
  })
}

async function onSave(element) {
  try {
    await persistPlacement(element)
    dialogVisible.value = false
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Failed to save chassis element',
      detail: describePlacementError(err),
      life: 5000,
    })
  }
}

async function onMove(elementId, newX, newY) {
  const element = elements.value.find((el) => el.id === elementId)
  if (!element) return
  try {
    await persistPlacement({ ...element, x: newX, y: newY })
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Failed to move chassis element',
      detail: describePlacementError(err),
      life: 5000,
    })
    refetchLayout()
  }
}

async function onResize(elementId, newWidth, newHeight) {
  const element = elements.value.find((el) => el.id === elementId)
  if (!element) return
  try {
    await persistPlacement({ ...element, width: newWidth, height: newHeight })
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Failed to resize chassis element',
      detail: describePlacementError(err),
      life: 5000,
    })
    refetchLayout()
  }
}

async function onRemove(elementId) {
  const element = elements.value.find((el) => el.id === elementId)
  if (!element) return
  try {
    await updatePlacementAsync({
      id: element.objectId,
      payload: chassisPlacementToApiPayload(null, null),
    })
    if (selectedElement.value?.id === elementId) selectedElement.value = null
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Failed to remove chassis element',
      detail: describePlacementError(err),
      life: 5000,
    })
  }
}

// Only the images this view places: the whole library can be tens of MB.
const chassisImageGuids = computed(() => {
  const guids = new Set()
  if (chassisMeta.value.frontImageGuid) guids.add(chassisMeta.value.frontImageGuid)
  if (chassisMeta.value.backImageGuid) guids.add(chassisMeta.value.backImageGuid)
  for (const el of elements.value) {
    if (el.frontImageGuid) guids.add(el.frontImageGuid)
    if (el.backImageGuid) guids.add(el.backImageGuid)
  }
  return [...guids]
})

const { data: chassisImageUrls } = useImagesByGuid(chassisImageGuids)
const resolvedImages = computed(() => chassisImageUrls.value ?? {})

const frontChassisImageUrl = computed(() => {
  const guid = chassisMeta.value.frontImageGuid
  return guid ? resolvedImages.value[guid] : null
})

const backChassisImageUrl = computed(() => {
  const guid = chassisMeta.value.backImageGuid
  return guid ? resolvedImages.value[guid] : null
})

const selectedElement = ref(null)

function openSelect(elementId) {
  if (selectedElement.value?.id === elementId) {
    selectedElement.value = null
    return
  }
  selectedElement.value = elements.value.find((el) => el.id === elementId) ?? null
}

/** Also drives open-in-new-tab. */
function objectTargetFor(objectId) {
  return objectTarget({ id: objectId }, 'status', { perspective: 'infrastructure' })
}

function goToObject(objectId) {
  router.push(objectTargetFor(objectId))
}

const statusCounts = computed(() => {
  const uByKey = new Map()
  for (const el of elements.value) {
    const key = String(el.objectStatus ?? 5)
    uByKey.set(key, (uByKey.get(key) ?? 0) + 1)
  }
  return [...uByKey.entries()].map(([key, count]) => ({
    label: STATUS_LABELS[Number(key)] ?? 'Unknown',
    color: getStatusHexColor(Number(key)),
    count,
  }))
})

const zoomFactor = ref(1)
const scrollRef = ref(null)
const userZoomed = ref(false)
const hasAutoFitted = ref(false)

const scaleH = computed(() => {
  if (chassisMeta.value.unitSystem === 'mm') return BASE_MM_PX * zoomFactor.value
  return BASE_HP_PX * zoomFactor.value
})

const scaleV = computed(() => {
  if (chassisMeta.value.unitSystem === 'mm') return BASE_MM_PX * zoomFactor.value
  return BASE_RU_PX * zoomFactor.value
})

const zoomPercent = computed(() => Math.round(zoomFactor.value * 100))

function zoomIn() {
  userZoomed.value = true
  zoomFactor.value = Math.min(MAX_ZOOM, Math.round((zoomFactor.value + ZOOM_STEP) * 100) / 100)
}

function zoomOut() {
  userZoomed.value = true
  zoomFactor.value = Math.max(MIN_ZOOM, Math.round((zoomFactor.value - ZOOM_STEP) * 100) / 100)
}

function fitToWindow() {
  if (!scrollRef.value) return
  const availW = scrollRef.value.clientWidth - 32
  const availH = scrollRef.value.clientHeight - 32

  const meta = chassisMeta.value
  const isHpRu = meta.unitSystem === 'hp-ru'
  const baseW = isHpRu ? BASE_HP_PX : BASE_MM_PX
  const baseH = isHpRu ? BASE_RU_PX : BASE_MM_PX

  const canvasPanels = meta.chassisMode === 'front-back' ? 2 : 1
  const totalBaseW = meta.chassisWidth * baseW
  const totalBaseH = meta.chassisHeight * baseH * canvasPanels + (canvasPanels > 1 ? 20 : 0)

  const zoomW = totalBaseW > 0 ? availW / totalBaseW : 1
  const zoomH = totalBaseH > 0 ? availH / totalBaseH : 1
  const ideal = Math.min(zoomW, zoomH) * 0.75

  zoomFactor.value = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(ideal * 100) / 100))
}

// Auto-fit once layout and dimensions have loaded, unless the user has zoomed manually.
watch(
  () => [isLoading.value, fullObject.value],
  ([loading, obj]) => {
    if (loading || !obj || hasAutoFitted.value || userZoomed.value) return
    hasAutoFitted.value = true
    nextTick(fitToWindow)
  },
  { immediate: true },
)

function onWheel(event) {
  if (!event.ctrlKey) return
  event.preventDefault()
  if (event.deltaY < 0) zoomIn()
  else zoomOut()
}

const dimensionLabel = computed(() => {
  const { chassisWidth, chassisHeight, unitSystem } = chassisMeta.value
  if (unitSystem === 'hp-ru') return `${chassisWidth}HP x ${chassisHeight}RU`
  return `${chassisWidth} x ${chassisHeight}mm`
})
</script>

<template>
  <div class="chassis-view">
    <div class="chassis-toolbar">
      <span class="chassis-toolbar__stat">
        <i class="pi pi-server" />
        {{ dimensionLabel }}
      </span>
      <div class="chassis-toolbar__spacer" />
      <i v-if="isFetching" class="pi pi-spin pi-spinner chassis-toolbar__spinner" />
      <span class="chassis-toolbar__mode">
        <i
          :class="chassisMeta.chassisMode === 'front-back' ? 'pi pi-align-justify' : 'pi pi-minus'"
        />
        {{ chassisMeta.chassisMode === 'front-back' ? 'Front + Back' : 'Front only' }}
      </span>
      <div class="chassis-zoom">
        <Button
          aria-label="Zoom out"
          icon="pi pi-search-minus"
          text
          rounded
          severity="secondary"
          size="small"
          :disabled="zoomFactor <= MIN_ZOOM"
          @click="zoomOut"
        />
        <span class="chassis-zoom__label">{{ zoomPercent }}%</span>
        <Button
          aria-label="Zoom in"
          icon="pi pi-search-plus"
          text
          rounded
          severity="secondary"
          size="small"
          :disabled="zoomFactor >= MAX_ZOOM"
          @click="zoomIn"
        />
        <Button
          v-tooltip.bottom="'Fit to window'"
          aria-label="Fit to window"
          icon="pi pi-expand"
          text
          rounded
          severity="secondary"
          size="small"
          @click="fitToWindow"
        />
      </div>
    </div>

    <div v-if="isLoading" class="chassis-loading">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading chassis layout…</span>
    </div>

    <QueryErrorState
      v-else-if="isError"
      :error="error"
      class="chassis-error"
      @retry="refetchLayout"
    />

    <div v-else class="chassis-main">
      <div ref="scrollRef" class="chassis-scroll" @wheel="onWheel">
        <ChassisCanvas
          :chassis-width="chassisMeta.chassisWidth"
          :chassis-height="chassisMeta.chassisHeight"
          :chassis-mode="chassisMeta.chassisMode"
          :elements="elements"
          :resolved-images="resolvedImages"
          :scale-h="scaleH"
          :scale-v="scaleV"
          :front-chassis-image-url="frontChassisImageUrl"
          :back-chassis-image-url="backChassisImageUrl"
          @select-element="openSelect"
          @go-to-object="goToObject"
          @add-at-position="openAdd"
          @move-element="onMove"
          @resize-element="onResize"
          @edit-element="openEdit"
          @remove-element="onRemove"
        />
      </div>

      <!-- Element info or chassis summary -->
      <div class="chassis-side-panel">
        <Transition name="panel-slide" mode="out-in">
          <ChassisElementPanel
            v-if="selectedElement"
            key="element-panel"
            :element="selectedElement"
            :resolved-images="resolvedImages"
            :chassis-mode="chassisMeta.chassisMode"
            :unit-system="chassisMeta.unitSystem"
            @close="selectedElement = null"
            @go-to-object="goToObject"
            :target-for="objectTargetFor"
            @edit="openEdit"
            @remove="onRemove"
          />

          <div v-else key="summary-panel" class="chassis-summary-panel">
            <div class="chassis-summary-panel__header">
              <i class="pi pi-server chassis-summary-panel__icon" />
              <span class="chassis-summary-panel__name">{{ chassisMeta.name }}</span>
            </div>

            <div class="chassis-summary-stats">
              <div class="chassis-summary-stat">
                <span class="chassis-summary-stat__label">Width</span>
                <span class="chassis-summary-stat__value">
                  {{ chassisMeta.chassisWidth
                  }}{{ chassisMeta.unitSystem === 'hp-ru' ? 'HP' : 'mm' }}
                </span>
              </div>
              <div class="chassis-summary-stat">
                <span class="chassis-summary-stat__label">Height</span>
                <span class="chassis-summary-stat__value">
                  {{ chassisMeta.chassisHeight
                  }}{{ chassisMeta.unitSystem === 'hp-ru' ? 'RU' : 'mm' }}
                </span>
              </div>
              <div class="chassis-summary-stat">
                <span class="chassis-summary-stat__label">Elements</span>
                <span class="chassis-summary-stat__value">{{ elements.length }}</span>
              </div>
            </div>

            <div v-if="statusCounts.length" class="chassis-summary-statuses">
              <div
                v-for="stat in statusCounts"
                :key="stat.label"
                class="chassis-summary-status-row"
              >
                <span class="chassis-summary-status-dot" :style="{ background: stat.color }" />
                <span class="chassis-summary-status-name">{{ stat.label }}</span>
                <span class="chassis-summary-status-count">{{ stat.count }}</span>
              </div>
            </div>

            <div v-if="!elements.length" class="chassis-summary-empty">
              <i class="pi pi-inbox" />
              <span>No elements placed in this chassis.</span>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>

  <AddChassisElementDialog
    v-model:visible="dialogVisible"
    :chassis-id="chassisMeta.id"
    :chassis-width="chassisMeta.chassisWidth"
    :chassis-height="chassisMeta.chassisHeight"
    :unit-system="chassisMeta.unitSystem"
    :chassis-mode="chassisMeta.chassisMode"
    :existing-elements="elementsForDialog"
    :edit-element="editElement"
    :prefilled-x="prefilledX"
    :prefilled-y="prefilledY"
    :prefilled-width="prefilledWidth"
    :prefilled-height="prefilledHeight"
    @save="onSave"
  />
</template>

<style scoped>
.chassis-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chassis-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  flex-shrink: 0;
}

.chassis-toolbar__stat {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
}

.chassis-toolbar__spacer {
  flex: 1;
}

.chassis-toolbar__spinner {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.chassis-toolbar__mode {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.chassis-zoom {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.chassis-zoom__label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  min-width: 2.75rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.chassis-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  flex: 1;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.chassis-error {
  flex: 1;
  justify-content: center;
}

.chassis-main {
  display: flex;
  flex: 1;
  min-height: 0;
}

.chassis-scroll {
  flex: 1;
  overflow: auto;
  padding: 1rem;
  display: flex;
  justify-content: safe center;
  align-items: flex-start;
  background: var(--p-surface-ground, #f8fafc);
}

.chassis-side-panel {
  width: 268px;
  flex-shrink: 0;
  border-left: 1px solid var(--p-content-border-color);
  overflow: hidden;
  position: relative;
  background: var(--p-content-background);
}

.chassis-side-panel :deep(.chassis-element-panel) {
  border-left: none;
  width: 100%;
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

.chassis-summary-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 0.8125rem;
  overflow-y: auto;
}

.chassis-summary-panel__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.chassis-summary-panel__icon {
  font-size: 1rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.chassis-summary-panel__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chassis-summary-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  padding: 0.75rem 0.75rem 0;
}

.chassis-summary-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chassis-summary-stat__label {
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.chassis-summary-stat__value {
  font-size: 1.0625rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.chassis-summary-statuses {
  padding: 0.75rem 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.chassis-summary-status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.chassis-summary-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.chassis-summary-status-name {
  flex: 1;
  color: var(--p-text-color);
}

.chassis-summary-status-count {
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.chassis-summary-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  padding: 2rem 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
  text-align: center;
  line-height: 1.5;
}

.chassis-summary-empty .pi {
  font-size: 1.75rem;
  opacity: 0.4;
}
</style>
