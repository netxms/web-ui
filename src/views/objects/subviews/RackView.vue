<script setup>
import { ref, computed, nextTick, inject, watch, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Button from 'primevue/button'
import RackCanvas from '@/components/rack/RackCanvas.vue'

// three.js is large; load it only when someone switches to 3D.
const Rack3DCanvas = defineAsyncComponent(() => import('@/components/rack/Rack3DCanvas.vue'))
import RackElementPanel from '@/components/rack/RackElementPanel.vue'
import AddRackElementDialog from '@/components/rack/AddRackElementDialog.vue'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useObjectActionMenu } from '@/composables/useObjectActionMenu'
import { resolveHref } from '@/utils/navigation'
import {
  useRackLayout,
  useObject,
  useUpdateObjectPhysicalPlacement,
  useCreatePassiveRackElement,
  useUpdatePassiveRackElement,
  useDeletePassiveRackElement,
} from '@/queries/useObjectQueries'
import { useImagesByGuid } from '@/queries/useImageLibraryQueries'
import { getStatusHexColor } from '@/utils/objectUtils'
import { rackPlacementToApiPayload, passiveElementToApiPayload } from '@/api/objectAdapters'
import { describeRackElementError } from '@/utils/placementErrors'
import {
  PANEL_WIDTH_PER_U,
  RACK_DIVIDER_WIDTH,
  RACK_LABEL_COL_WIDTH,
} from '@/components/rack/rackUtils.js'
import { objectTarget } from '@/utils/routeTargets'
import { userPrefs } from '@/utils/appStorage'

const STATUS_LABELS = ['Normal', 'Warning', 'Minor', 'Major', 'Critical', 'Unknown']
const PASSIVE_BAR_COLOR = '#607d8b'

const props = defineProps({
  object: { type: Object, required: true },
})

const router = useRouter()
const toast = useToast()
const objectId = computed(() => props.object.id)

const { mutateAsync: updatePlacementAsync } = useUpdateObjectPhysicalPlacement()
const { mutateAsync: createPassiveAsync } = useCreatePassiveRackElement()
const { mutateAsync: updatePassiveAsync } = useUpdatePassiveRackElement()
const { mutateAsync: deletePassiveAsync } = useDeletePassiveRackElement()

// rackMode is not in the rack-layout endpoint.
const { data: fullObject, refetch } = useObject(objectId)

// Elements + authoritative height
const {
  data: rackLayout,
  isLoading,
  isFetching,
  isError,
  error,
  refetch: refetchLayout,
} = useRackLayout(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) {
  watch(refreshSignal, () => {
    refetch()
    refetchLayout()
  })
}

const rackMeta = computed(() => {
  const obj = fullObject.value ?? props.object
  return {
    id: obj.id,
    name: obj.name,
    rackHeight: rackLayout.value?.height ?? obj.rackHeight ?? 42,
    rackMode: obj.rackMode ?? 'front-back',
  }
})

const elements = computed(() => rackLayout.value?.elements ?? [])
const topBottomNumbering = computed(() => rackLayout.value?.topBottomNumbering ?? false)

const VIEW_3D_PREF = 'rackView.use3D'
const view3D = ref(userPrefs.get(VIEW_3D_PREF, false) === true)

function toggleView3D() {
  view3D.value = !view3D.value
  userPrefs.set(VIEW_3D_PREF, view3D.value)
}

const dialogVisible = ref(false)
const editElement = ref(null)
const prefilledSlot = ref(null)
const prefilledHeightU = ref(null)

const elementsForDialog = computed(() =>
  editElement.value
    ? elements.value.filter((el) => el.id !== editElement.value.id)
    : elements.value,
)

function openAdd(slot, _side, heightU = 1) {
  editElement.value = null
  prefilledSlot.value = slot
  prefilledHeightU.value = heightU
  dialogVisible.value = true
}

function openEdit(elementId) {
  editElement.value = elements.value.find((el) => el.id === elementId) ?? null
  if (editElement.value) {
    prefilledSlot.value = null
    prefilledHeightU.value = null
    dialogVisible.value = true
  }
}

// Object-backed placement is a property of the placed object. Passive elements (PDU, patch
// panel) use the rack's own endpoints.
async function persistPlacement(element) {
  const rackHeight = rackMeta.value.rackHeight
  if (element.objectId != null) {
    await updatePlacementAsync({
      id: element.objectId,
      payload: rackPlacementToApiPayload(
        objectId.value,
        element,
        rackHeight,
        topBottomNumbering.value,
      ),
    })
  } else if (element.id) {
    const elementId = Number(element.id.replace('passive-', ''))
    await updatePassiveAsync({
      rackId: objectId.value,
      elementId,
      payload: passiveElementToApiPayload(element, rackHeight, topBottomNumbering.value),
    })
  } else {
    await createPassiveAsync({
      rackId: objectId.value,
      payload: passiveElementToApiPayload(element, rackHeight, topBottomNumbering.value),
    })
  }
}

async function onSave(element) {
  try {
    await persistPlacement(element)
    dialogVisible.value = false
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Failed to save rack element',
      detail: describeRackElementError(err, { objectBacked: element.objectId != null }),
      life: 5000,
    })
  }
}

async function onMoveElement(elementId, newSlot) {
  const element = elements.value.find((el) => el.id === elementId)
  if (!element) return
  try {
    await persistPlacement({ ...element, slot: newSlot })
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Failed to move rack element',
      detail: describeRackElementError(err, { objectBacked: element.objectId != null }),
      life: 5000,
    })
    refetchLayout()
  }
}

async function onResizeElement(elementId, newSlot, newHeightU) {
  const element = elements.value.find((el) => el.id === elementId)
  if (!element) return
  try {
    await persistPlacement({ ...element, slot: newSlot, heightU: newHeightU })
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Failed to resize rack element',
      detail: describeRackElementError(err, { objectBacked: element.objectId != null }),
      life: 5000,
    })
    refetchLayout()
  }
}

async function onRemoveElement(elementId) {
  const element = elements.value.find((el) => el.id === elementId)
  if (!element) return
  try {
    if (element.objectId != null) {
      await updatePlacementAsync({
        id: element.objectId,
        payload: rackPlacementToApiPayload(null, null),
      })
    } else {
      const elId = Number(element.id.replace('passive-', ''))
      await deletePassiveAsync({ rackId: objectId.value, elementId: elId })
    }
    if (selectedElement.value?.id === elementId) selectedElement.value = null
  } catch (err) {
    toast.add({
      severity: 'error',
      summary: 'Failed to remove rack element',
      detail: describeRackElementError(err, { objectBacked: element.objectId != null }),
      life: 5000,
    })
  }
}

// Only the images this view places: the whole library can be tens of MB.
const rackImageGuids = computed(() => {
  const guids = new Set()
  for (const el of elements.value) {
    if (el.frontImageGuid) guids.add(el.frontImageGuid)
    if (el.backImageGuid) guids.add(el.backImageGuid)
  }
  return [...guids]
})

const { data: rackImageUrls } = useImagesByGuid(rackImageGuids)
const resolvedImages = computed(() => rackImageUrls.value ?? {})

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

// Placement editing stays here; everything else comes from the shared action registry.
// Passive elements have no object behind them and get the placement items only.
const menuRef = ref(null)
const menuTarget = ref(null)
const { objectId: menuObjectId, buildItems } = useObjectActionMenu('rack')

const menuItems = computed(() => {
  const target = menuTarget.value
  if (!target) return []

  if (target.type === 'slot') {
    return [
      {
        label: 'Add object',
        icon: 'pi pi-plus',
        command: () => openAdd(target.slot, target.side),
      },
    ]
  }

  const element = target.element
  const before = element.objectId
    ? [
        {
          label: 'Go to object',
          icon: 'pi pi-arrow-right',
          url: resolveHref(objectTargetFor(element.objectId)),
          command: () => goToObject(element.objectId),
        },
      ]
    : []

  return buildItems({
    label: element.objectName || element.label || element.passiveType,
    before,
    after: [
      {
        label: 'Edit placement...',
        icon: 'pi pi-pencil',
        command: () => openEdit(element.id),
      },
      {
        label: 'Remove from rack',
        icon: 'pi pi-trash',
        danger: true,
        command: () => onRemoveElement(element.id),
      },
    ],
  })
})

function onElementContextMenu(event, element) {
  menuTarget.value = { type: 'element', element }
  menuObjectId.value = element.objectId ?? null
  menuRef.value?.show(event)
}

function onSlotContextMenu(event, slot, side) {
  menuTarget.value = { type: 'slot', slot, side }
  menuObjectId.value = null
  menuRef.value?.show(event)
}

const usedSlots = computed(() => elements.value.reduce((sum, el) => sum + el.heightU, 0))
const freeSlots = computed(() => rackMeta.value.rackHeight - usedSlots.value)

const statusBar = computed(() => {
  const total = rackMeta.value.rackHeight
  if (total === 0) return []

  const uByKey = new Map()
  for (const el of elements.value) {
    const key = el.passiveType ? 'passive' : String(el.objectStatus ?? 5)
    uByKey.set(key, (uByKey.get(key) ?? 0) + el.heightU)
  }

  const segments = []
  for (const [key, count] of uByKey) {
    const color = key === 'passive' ? PASSIVE_BAR_COLOR : getStatusHexColor(Number(key))
    segments.push({ color, pct: count / total })
  }
  if (freeSlots.value > 0) {
    segments.push({ color: null, pct: freeSlots.value / total })
  }
  return segments
})

const statusCounts = computed(() => {
  const uByKey = new Map()
  for (const el of elements.value) {
    const key = el.passiveType ? 'passive' : String(el.objectStatus ?? 5)
    uByKey.set(key, (uByKey.get(key) ?? 0) + el.heightU)
  }
  return [...uByKey.entries()].map(([key, countU]) => ({
    label: key === 'passive' ? 'Passive' : (STATUS_LABELS[Number(key)] ?? 'Unknown'),
    color: key === 'passive' ? PASSIVE_BAR_COLOR : getStatusHexColor(Number(key)),
    countU,
  }))
})

const BASE_ROW_HEIGHT = 30
const MIN_ROW_HEIGHT = 16
const MAX_ROW_HEIGHT = 60
const ZOOM_STEP = 4

const rowHeight = ref(BASE_ROW_HEIGHT)
const scrollRef = ref(null)
const userZoomed = ref(false)
const hasAutoFitted = ref(false)

const zoomPercent = computed(() => Math.round((rowHeight.value / BASE_ROW_HEIGHT) * 100))

function zoomIn() {
  userZoomed.value = true
  rowHeight.value = Math.min(MAX_ROW_HEIGHT, rowHeight.value + ZOOM_STEP)
}

function zoomOut() {
  userZoomed.value = true
  rowHeight.value = Math.max(MIN_ROW_HEIGHT, rowHeight.value - ZOOM_STEP)
}

/** Panel width is a fixed multiple of the row height, so width constrains too. */
function fitToWindow() {
  if (!scrollRef.value) return
  // The scroll container's own padding, on both axes.
  const availableHeight = scrollRef.value.clientHeight - 32
  const panels = rackMeta.value.rackMode === 'front-back' ? 2 : 1
  const availableWidth =
    scrollRef.value.clientWidth - 32 - RACK_LABEL_COL_WIDTH - (panels - 1) * RACK_DIVIDER_WIDTH
  const byHeight = Math.floor(availableHeight / rackMeta.value.rackHeight)
  const byWidth = Math.floor(availableWidth / (panels * PANEL_WIDTH_PER_U))
  const ideal = Math.min(byHeight, byWidth)
  rowHeight.value = Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, ideal))
}

// Auto-fit once the layout has loaded, unless the user has zoomed manually.
watch(
  () => [isLoading.value, rackLayout.value],
  ([loading, layout]) => {
    if (loading || !layout || hasAutoFitted.value || userZoomed.value) return
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

function onViewKeyDown(event) {
  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomIn()
  } else if (event.key === '-') {
    event.preventDefault()
    zoomOut()
  }
}
</script>

<template>
  <!-- Keyboard-only: catches the +/- zoom shortcuts from whatever inside has focus. -->
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
  <div class="rack-view" @keydown="onViewKeyDown">
    <div class="rack-toolbar">
      <span class="rack-toolbar__stat">
        <i class="pi pi-server" />
        {{ rackMeta.rackHeight }}U rack
      </span>
      <span class="rack-toolbar__stat rack-toolbar__stat--muted">
        {{ usedSlots }}U used &middot; {{ freeSlots }}U free
      </span>
      <div v-if="statusBar.length" class="rack-status-bar" title="Slot utilization by status">
        <div
          v-for="(seg, i) in statusBar"
          :key="i"
          class="rack-status-bar__seg"
          :style="{ flex: seg.pct, background: seg.color ?? 'var(--p-surface-300, #d1d5db)' }"
        />
      </div>
      <div class="rack-toolbar__spacer" />
      <i v-if="isFetching" class="pi pi-spin pi-spinner rack-toolbar__spinner" />
      <span class="rack-toolbar__mode">
        <i :class="rackMeta.rackMode === 'front-back' ? 'pi pi-align-justify' : 'pi pi-minus'" />
        {{ rackMeta.rackMode === 'front-back' ? 'Front + Back' : 'Front only' }}
      </span>
      <div v-if="!view3D" class="rack-zoom">
        <Button
          aria-label="Zoom out"
          icon="pi pi-search-minus"
          text
          rounded
          severity="secondary"
          size="small"
          :disabled="rowHeight <= MIN_ROW_HEIGHT"
          @click="zoomOut"
        />
        <span class="rack-zoom__label">{{ zoomPercent }}%</span>
        <Button
          aria-label="Zoom in"
          icon="pi pi-search-plus"
          text
          rounded
          severity="secondary"
          size="small"
          :disabled="rowHeight >= MAX_ROW_HEIGHT"
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
      <Button
        v-tooltip.bottom="view3D ? 'Switch to 2D view' : 'Switch to 3D view'"
        :aria-label="view3D ? 'Switch to 2D view' : 'Switch to 3D view'"
        :icon="view3D ? 'pi pi-table' : 'pi pi-box'"
        text
        rounded
        severity="secondary"
        size="small"
        @click="toggleView3D"
      />
    </div>

    <div v-if="isLoading" class="rack-loading">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading rack layout…</span>
    </div>

    <QueryErrorState v-else-if="isError" :error="error" class="rack-error" @retry="refetchLayout" />

    <div v-else class="rack-main">
      <div
        ref="scrollRef"
        class="rack-scroll"
        :class="{ 'rack-scroll--3d': view3D }"
        @wheel="onWheel"
      >
        <Rack3DCanvas
          v-if="view3D"
          :rack-height="rackMeta.rackHeight"
          :top-bottom-numbering="topBottomNumbering"
          :elements="elements"
          :resolved-images="resolvedImages"
          :selected-element-id="selectedElement?.id"
          @select-element="openSelect"
        />
        <RackCanvas
          v-else
          :rack-height="rackMeta.rackHeight"
          :rack-mode="rackMeta.rackMode"
          :elements="elements"
          :resolved-images="resolvedImages"
          :row-height="rowHeight"
          editable
          @select-element="openSelect"
          @add-to-slot="openAdd"
          @move-element="onMoveElement"
          @resize-element="onResizeElement"
          @remove-element="onRemoveElement"
          @element-contextmenu="onElementContextMenu"
          @slot-contextmenu="onSlotContextMenu"
        />
      </div>

      <!-- Element info or rack summary -->
      <div class="rack-side-panel">
        <Transition name="panel-slide" mode="out-in">
          <RackElementPanel
            v-if="selectedElement"
            key="element-panel"
            :element="selectedElement"
            :resolved-images="resolvedImages"
            :rack-mode="rackMeta.rackMode"
            @close="selectedElement = null"
            @go-to-object="goToObject"
            :target-for="objectTargetFor"
            @edit="openEdit"
            @remove="onRemoveElement"
          />

          <div v-else key="summary-panel" class="rack-summary-panel">
            <div class="rack-summary-panel__header">
              <i class="pi pi-server rack-summary-panel__icon" />
              <span class="rack-summary-panel__name">{{ rackMeta.name }}</span>
            </div>

            <div class="rack-summary-stats">
              <div class="rack-summary-stat">
                <span class="rack-summary-stat__label">Height</span>
                <span class="rack-summary-stat__value">{{ rackMeta.rackHeight }}U</span>
              </div>
              <div class="rack-summary-stat">
                <span class="rack-summary-stat__label">Used</span>
                <span class="rack-summary-stat__value">{{ usedSlots }}U</span>
              </div>
              <div class="rack-summary-stat">
                <span class="rack-summary-stat__label">Free</span>
                <span
                  class="rack-summary-stat__value"
                  :class="{ 'rack-summary-stat__value--warn': freeSlots === 0 }"
                  >{{ freeSlots }}U</span
                >
              </div>
            </div>

            <div v-if="statusBar.length" class="rack-summary-bar-wrap">
              <div class="rack-summary-bar">
                <div
                  v-for="(seg, i) in statusBar"
                  :key="i"
                  class="rack-summary-bar__seg"
                  :style="{
                    flex: seg.pct,
                    background: seg.color ?? 'var(--p-surface-300, #d1d5db)',
                  }"
                />
              </div>
              <div class="rack-summary-bar__labels">
                <span>{{ Math.round((usedSlots / rackMeta.rackHeight) * 100) }}% used</span>
                <span>{{ freeSlots }}U free</span>
              </div>
            </div>

            <div v-if="statusCounts.length" class="rack-summary-statuses">
              <div v-for="stat in statusCounts" :key="stat.label" class="rack-summary-status-row">
                <span class="rack-summary-status-dot" :style="{ background: stat.color }" />
                <span class="rack-summary-status-name">{{ stat.label }}</span>
                <span class="rack-summary-status-count">{{ stat.countU }}U</span>
              </div>
            </div>

            <div v-if="!elements.length" class="rack-summary-empty">
              <i class="pi pi-inbox" />
              <span>No elements placed in this rack.</span>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>

  <AddRackElementDialog
    v-model:visible="dialogVisible"
    :rack-id="rackMeta.id"
    :rack-height="rackMeta.rackHeight"
    :rack-mode="rackMeta.rackMode"
    :existing-elements="elementsForDialog"
    :edit-element="editElement"
    :prefilled-slot="prefilledSlot"
    :prefilled-height-u="prefilledHeightU"
    @save="onSave"
  />

  <ActionContextMenu ref="menuRef" :items="menuItems" />
</template>

<style scoped>
.rack-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.rack-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  flex-shrink: 0;
}

.rack-toolbar__stat {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
}

.rack-toolbar__stat--muted {
  color: var(--p-text-muted-color);
}

.rack-toolbar__spacer {
  flex: 1;
}

.rack-toolbar__spinner {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
}

.rack-toolbar__mode {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.rack-status-bar {
  display: flex;
  height: 8px;
  width: 96px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--p-surface-200, #e5e7eb);
  flex-shrink: 0;
  gap: 1px;
}

.rack-status-bar__seg {
  height: 100%;
  min-width: 2px;
}

.rack-zoom {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.rack-zoom__label {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  min-width: 2.75rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.rack-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  flex: 1;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.rack-error {
  flex: 1;
  justify-content: center;
}

.rack-main {
  display: flex;
  flex: 1;
  min-height: 0;
}

.rack-scroll {
  flex: 1;
  overflow: auto;
  padding: 1rem;
  display: flex;
  /* `safe` keeps the left edge reachable at high zoom; browsers without the keyword drop the
     line and keep plain centring. */
  justify-content: center;
  justify-content: safe center;
  align-items: flex-start;
  background: var(--p-surface-ground, #f8fafc);
}

.rack-scroll--3d {
  padding: 0;
  overflow: hidden;
  align-items: stretch;
  justify-content: stretch;
}

.rack-side-panel {
  width: 268px;
  flex-shrink: 0;
  border-left: 1px solid var(--p-content-border-color);
  overflow: hidden;
  position: relative;
  background: var(--p-content-background);
}

.rack-side-panel :deep(.rack-element-panel) {
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

.rack-summary-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 0.8125rem;
  overflow-y: auto;
}

.rack-summary-panel__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.rack-summary-panel__icon {
  font-size: 1rem;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.rack-summary-panel__name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rack-summary-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  padding: 0.75rem 0.75rem 0;
}

.rack-summary-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rack-summary-stat__label {
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.rack-summary-stat__value {
  font-size: 1.0625rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.rack-summary-stat__value--warn {
  color: var(--p-red-500, #ef4444);
}

.rack-summary-bar-wrap {
  padding: 0.875rem 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rack-summary-bar {
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--p-surface-200, #e5e7eb);
  gap: 1px;
}

.rack-summary-bar__seg {
  height: 100%;
  min-width: 2px;
  transition: flex 0.3s ease;
}

.rack-summary-bar__labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
}

.rack-summary-statuses {
  padding: 0.75rem 0.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.rack-summary-status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.rack-summary-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.rack-summary-status-name {
  flex: 1;
  color: var(--p-text-color);
}

.rack-summary-status-count {
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}

.rack-summary-empty {
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

.rack-summary-empty .pi {
  font-size: 1.75rem;
  opacity: 0.4;
}
</style>
