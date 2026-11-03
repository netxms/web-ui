<script setup>
import { computed, ref, onUnmounted } from 'vue'
import ContextMenu from 'primevue/contextmenu'
import { getStatusHexColor } from '@/utils/objectUtils'
import { getClassIconCodepoint } from '@/utils/topologyUtils'
import { checkChassisOverlap } from './chassisUtils.js'

const props = defineProps({
  chassisWidth: { type: Number, required: true },
  chassisHeight: { type: Number, required: true },
  /** 'front-back' | 'front' */
  chassisMode: { type: String, default: 'front-back' },
  elements: { type: Array, default: () => [] },
  /** Map<guid, dataUrl> */
  resolvedImages: { type: Object, default: () => ({}) },
  /** px per horizontal unit (HP or mm) */
  scaleH: { type: Number, required: true },
  /** px per vertical unit (RU or mm) */
  scaleV: { type: Number, required: true },
  frontChassisImageUrl: { type: String, default: null },
  backChassisImageUrl: { type: String, default: null },
})

const emit = defineEmits([
  'add-at-position',
  'select-element',
  'edit-element',
  'remove-element',
  'go-to-object',
  'move-element',
  'resize-element',
])

const canvasWidthPx = computed(() => props.chassisWidth * props.scaleH)
const canvasHeightPx = computed(() => props.chassisHeight * props.scaleV)

function makePanelStyle(hasBgImage) {
  const base = {
    width: canvasWidthPx.value + 'px',
    height: canvasHeightPx.value + 'px',
  }
  if (hasBgImage) return base
  return {
    ...base,
    backgroundImage: [
      'linear-gradient(to right, rgba(0,0,0,0.07) 1px, transparent 1px)',
      'linear-gradient(to bottom, rgba(0,0,0,0.07) 1px, transparent 1px)',
    ].join(', '),
    backgroundSize: `${props.scaleH}px ${props.scaleV}px`,
  }
}

const frontPanelStyle = computed(() => makePanelStyle(!!props.frontChassisImageUrl))
const backPanelStyle = computed(() => makePanelStyle(!!props.backChassisImageUrl))

const frontElements = computed(() =>
  props.elements.filter((el) => el.orientation === 'full' || el.orientation === 'front'),
)

const backElements = computed(() =>
  props.elements.filter((el) => el.orientation === 'full' || el.orientation === 'back'),
)

function elementStyle(el) {
  return {
    left: el.x * props.scaleH + 'px',
    top: el.y * props.scaleV + 'px',
    width: el.width * props.scaleH + 'px',
    height: el.height * props.scaleV + 'px',
  }
}

function elementBgColor(el) {
  return getStatusHexColor(el.objectStatus ?? 5)
}

function isAlertStatus(el) {
  return el.objectStatus != null && el.objectStatus >= 3 && el.objectStatus <= 4
}

function elementCodepoint(el) {
  return getClassIconCodepoint(el.objectClass ?? 'Node')
}

function elementLabel(el) {
  return el.label || el.objectName || '—'
}

function frontImage(el) {
  return el.frontImageGuid ? props.resolvedImages[el.frontImageGuid] : null
}

function backImage(el) {
  return el.backImageGuid ? props.resolvedImages[el.backImageGuid] : null
}

function coordFromEvent(event, panelRef, scaleH, scaleV) {
  const rect = panelRef.getBoundingClientRect()
  const x = Math.max(0, Math.round((event.clientX - rect.left) / scaleH))
  const y = Math.max(0, Math.round((event.clientY - rect.top) / scaleV))
  return { x, y }
}

const contextMenu = ref(null)
const contextTarget = ref(null)
const pendingPosition = ref(null)

const contextMenuItems = computed(() => {
  if (pendingPosition.value) {
    return [
      {
        label: 'Add element',
        icon: 'pi pi-plus',
        command: () =>
          emit(
            'add-at-position',
            pendingPosition.value.x,
            pendingPosition.value.y,
            pendingPosition.value.side,
          ),
      },
    ]
  }
  const items = []
  if (contextTarget.value?.objectId) {
    items.push({
      label: 'Go to object',
      icon: 'pi pi-arrow-right',
      command: () => emit('go-to-object', contextTarget.value.objectId),
    })
    items.push({ separator: true })
  }
  items.push(
    {
      label: 'Edit',
      icon: 'pi pi-pencil',
      command: () => emit('edit-element', contextTarget.value?.id),
    },
    {
      label: 'Remove',
      icon: 'pi pi-trash',
      command: () => emit('remove-element', contextTarget.value?.id),
    },
  )
  return items
})

function onElementRightClick(event, element) {
  event.stopPropagation()
  contextTarget.value = element
  pendingPosition.value = null
  contextMenu.value?.show(event)
}

function onBackgroundRightClick(event, side, panelRef) {
  const { x, y } = coordFromEvent(event, panelRef, props.scaleH, props.scaleV)
  pendingPosition.value = { x, y, side }
  contextTarget.value = null
  contextMenu.value?.show(event)
}

const frontPanelRef = ref(null)
const backPanelRef = ref(null)

let drawDrag = null // { startX, startY, side, panelRef } — plain var; not reactive

const drawGhost = ref(null)
// { x, y, w, h, side }

function onPanelPointerDown(event, side, panelRef) {
  if (event.button !== 0) return
  const { x, y } = coordFromEvent(event, panelRef, props.scaleH, props.scaleV)
  drawDrag = { startX: x, startY: y, side, panelRef }
  drawGhost.value = null
  event.currentTarget.setPointerCapture(event.pointerId)
  window.addEventListener('pointermove', onDrawMove)
  window.addEventListener('pointerup', onDrawUp)
}

function onDrawMove(event) {
  if (!drawDrag) return
  const { panelRef, startX, startY, side } = drawDrag
  const rect = panelRef.getBoundingClientRect()
  const rawX = Math.round((event.clientX - rect.left) / props.scaleH)
  const rawY = Math.round((event.clientY - rect.top) / props.scaleV)
  const curX = Math.max(0, Math.min(props.chassisWidth, rawX))
  const curY = Math.max(0, Math.min(props.chassisHeight, rawY))
  drawGhost.value = {
    x: Math.min(startX, curX),
    y: Math.min(startY, curY),
    w: Math.abs(curX - startX),
    h: Math.abs(curY - startY),
    side,
  }
}

function onDrawUp(event) {
  if (!drawDrag) return
  const { panelRef, startX, startY, side } = drawDrag
  const rect = panelRef.getBoundingClientRect()
  const rawX = Math.round((event.clientX - rect.left) / props.scaleH)
  const rawY = Math.round((event.clientY - rect.top) / props.scaleV)
  const curX = Math.max(0, Math.min(props.chassisWidth, rawX))
  const curY = Math.max(0, Math.min(props.chassisHeight, rawY))
  const dw = Math.abs(curX - startX)
  const dh = Math.abs(curY - startY)
  const isDrag = dw >= 1 || dh >= 1
  emit(
    'add-at-position',
    Math.min(startX, curX),
    Math.min(startY, curY),
    side,
    isDrag ? Math.max(1, dw) : null,
    isDrag ? Math.max(1, dh) : null,
  )
  drawDrag = null
  drawGhost.value = null
  window.removeEventListener('pointermove', onDrawMove)
  window.removeEventListener('pointerup', onDrawUp)
}

const MOVE_THRESHOLD = 5 // px before move activates

let pendingMove = null
let activeMoveEl = null
let wasMoved = false

const moveGhost = ref(null)
// { x, y, width, height, valid, side }

function onElementPointerDown(event, el, side, panelRef) {
  if (event.button !== 0) return
  event.currentTarget.setPointerCapture(event.pointerId)
  pendingMove = {
    el,
    side,
    panelRef,
    startClientX: event.clientX,
    startClientY: event.clientY,
    pointerId: event.pointerId,
    target: event.currentTarget,
  }
  wasMoved = false
  window.addEventListener('pointermove', onMovePointerMove)
  window.addEventListener('pointerup', onMovePointerUp)
}

function getMoveCoords(event) {
  const src = activeMoveEl ?? pendingMove
  const { el, startClientX, startClientY } = src
  const dxPx = event.clientX - startClientX
  const dyPx = event.clientY - startClientY
  return {
    x: Math.max(0, Math.min(props.chassisWidth - el.width, el.x + Math.round(dxPx / props.scaleH))),
    y: Math.max(
      0,
      Math.min(props.chassisHeight - el.height, el.y + Math.round(dyPx / props.scaleV)),
    ),
  }
}

function onMovePointerMove(event) {
  if (!pendingMove && !activeMoveEl) return
  if (pendingMove) {
    const dx = event.clientX - pendingMove.startClientX
    const dy = event.clientY - pendingMove.startClientY
    if (Math.hypot(dx, dy) < MOVE_THRESHOLD) return
    activeMoveEl = pendingMove
    pendingMove = null
    wasMoved = true
  }
  const { el, side } = activeMoveEl
  const { x, y } = getMoveCoords(event)
  const overlap = checkChassisOverlap(
    props.elements,
    x,
    y,
    el.width,
    el.height,
    el.orientation,
    el.id,
  )
  moveGhost.value = { x, y, width: el.width, height: el.height, valid: !overlap, side }
}

function onMovePointerUp(event) {
  if (activeMoveEl) {
    const { el } = activeMoveEl
    if (moveGhost.value?.valid) {
      const { x, y } = getMoveCoords(event)
      if (x !== el.x || y !== el.y) emit('move-element', el.id, x, y)
    }
  }
  pendingMove = null
  activeMoveEl = null
  moveGhost.value = null
  window.removeEventListener('pointermove', onMovePointerMove)
  window.removeEventListener('pointerup', onMovePointerUp)
}

function onElementClick(el) {
  if (wasMoved) {
    wasMoved = false
    return
  }
  emit('select-element', el.id)
}

// Same keys as `onElementKeyDown` in RackCanvas.vue. Placement still needs a pointer.
function onElementKeyDown(event, el) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('select-element', el.id)
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    emit('remove-element', el.id)
  }
}

let activeResize = null

const resizeGhost = ref(null)
// { x, y, width, height, valid, side }

function onHandlePointerDown(event, el, side, dir) {
  if (event.button !== 0) return
  activeResize = {
    el,
    side,
    dir,
    startClientX: event.clientX,
    startClientY: event.clientY,
    pointerId: event.pointerId,
  }
  event.currentTarget.setPointerCapture(event.pointerId)
  window.addEventListener('pointermove', onResizePointerMove)
  window.addEventListener('pointerup', onResizePointerUp)
}

function getResizeDims(event) {
  const { el, dir, startClientX, startClientY } = activeResize
  let w = el.width
  let h = el.height
  const dxPx = event.clientX - startClientX
  const dyPx = event.clientY - startClientY
  if (dir === 'e' || dir === 'se')
    w = Math.max(1, Math.min(props.chassisWidth - el.x, el.width + Math.round(dxPx / props.scaleH)))
  if (dir === 's' || dir === 'se')
    h = Math.max(
      1,
      Math.min(props.chassisHeight - el.y, el.height + Math.round(dyPx / props.scaleV)),
    )
  return { w, h }
}

function onResizePointerMove(event) {
  if (!activeResize) return
  const { el, side } = activeResize
  const { w, h } = getResizeDims(event)
  const overlap = checkChassisOverlap(props.elements, el.x, el.y, w, h, el.orientation, el.id)
  resizeGhost.value = { x: el.x, y: el.y, width: w, height: h, valid: !overlap, side }
}

function onResizePointerUp(event) {
  if (activeResize) {
    const { el } = activeResize
    const { w, h } = getResizeDims(event)
    if (resizeGhost.value?.valid && (w !== el.width || h !== el.height)) {
      emit('resize-element', el.id, w, h)
    }
  }
  activeResize = null
  resizeGhost.value = null
  window.removeEventListener('pointermove', onResizePointerMove)
  window.removeEventListener('pointerup', onResizePointerUp)
}

function dragGhostStyleFor(side) {
  const g = moveGhost.value ?? resizeGhost.value
  if (!g || g.side !== side) return null
  return {
    left: g.x * props.scaleH + 'px',
    top: g.y * props.scaleV + 'px',
    width: g.width * props.scaleH + 'px',
    height: g.height * props.scaleV + 'px',
    outline: `2px dashed ${g.valid ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)'}`,
    background: g.valid ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
  }
}

const frontDragGhostStyle = computed(() => dragGhostStyleFor('front'))
const backDragGhostStyle = computed(() => dragGhostStyleFor('back'))

onUnmounted(() => {
  window.removeEventListener('pointermove', onDrawMove)
  window.removeEventListener('pointerup', onDrawUp)
  window.removeEventListener('pointermove', onMovePointerMove)
  window.removeEventListener('pointerup', onMovePointerUp)
  window.removeEventListener('pointermove', onResizePointerMove)
  window.removeEventListener('pointerup', onResizePointerUp)
})

function ghostStyleFor(side) {
  const g = drawGhost.value
  if (!g || g.side !== side || (g.w === 0 && g.h === 0)) return null
  return {
    left: g.x * props.scaleH + 'px',
    top: g.y * props.scaleV + 'px',
    width: Math.max(props.scaleH, g.w * props.scaleH) + 'px',
    height: Math.max(props.scaleV, g.h * props.scaleV) + 'px',
  }
}

const frontGhostStyle = computed(() => ghostStyleFor('front'))
const backGhostStyle = computed(() => ghostStyleFor('back'))
</script>

<template>
  <div class="chassis-canvas">
    <div class="chassis-section">
      <div class="chassis-panel-label">Front</div>
      <!-- Drawing surface: `.self` handlers fire only on the empty background; the elements on
           it are focusable buttons. -->
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
      <div
        ref="frontPanelRef"
        class="chassis-panel"
        :style="frontPanelStyle"
        @pointerdown.self="onPanelPointerDown($event, 'front', frontPanelRef)"
        @contextmenu.prevent.self="onBackgroundRightClick($event, 'front', frontPanelRef)"
      >
        <img
          v-if="frontChassisImageUrl"
          :src="frontChassisImageUrl"
          class="chassis-panel__bg"
          alt=""
        />
        <div v-if="frontGhostStyle" class="chassis-draw-ghost" :style="frontGhostStyle" />
        <div v-if="frontDragGhostStyle" class="chassis-drag-ghost" :style="frontDragGhostStyle" />

        <div
          v-for="el in frontElements"
          :key="el.id"
          class="chassis-element"
          :class="{ 'chassis-element--has-image': !!frontImage(el) }"
          :style="elementStyle(el)"
          role="button"
          tabindex="0"
          :aria-label="elementLabel(el)"
          @pointerdown.stop="onElementPointerDown($event, el, 'front', frontPanelRef)"
          @click.stop="onElementClick(el)"
          @contextmenu.prevent.stop="onElementRightClick($event, el)"
          @keydown="onElementKeyDown($event, el)"
        >
          <div
            class="chassis-element__status-strip"
            :class="{ 'chassis-element__status-strip--alert': isAlertStatus(el) }"
            :style="{ background: elementBgColor(el) }"
          />
          <img v-if="frontImage(el)" :src="frontImage(el)" class="chassis-element__image" alt="" />
          <template v-else>
            <span
              v-if="elementCodepoint(el)"
              class="chassis-element__icon chassis-element__icon--font"
            >
              {{ elementCodepoint(el) }}
            </span>
          </template>
          <span v-if="!frontImage(el)" class="chassis-element__label">{{ elementLabel(el) }}</span>
          <span v-if="frontImage(el)" class="chassis-element__hover-label">{{
            elementLabel(el)
          }}</span>
          <div
            class="chassis-handle chassis-handle--e"
            @pointerdown.stop="onHandlePointerDown($event, el, 'front', 'e')"
          />
          <div
            class="chassis-handle chassis-handle--s"
            @pointerdown.stop="onHandlePointerDown($event, el, 'front', 's')"
          />
          <div
            class="chassis-handle chassis-handle--se"
            @pointerdown.stop="onHandlePointerDown($event, el, 'front', 'se')"
          />
        </div>
      </div>
    </div>

    <template v-if="chassisMode === 'front-back'">
      <div class="chassis-h-divider" />
      <div class="chassis-section">
        <div class="chassis-panel-label">Back</div>
        <!-- Drawing surface, same as the front panel. -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
        <div
          ref="backPanelRef"
          class="chassis-panel"
          :style="backPanelStyle"
          @pointerdown.self="onPanelPointerDown($event, 'back', backPanelRef)"
          @contextmenu.prevent.self="onBackgroundRightClick($event, 'back', backPanelRef)"
        >
          <img
            v-if="backChassisImageUrl"
            :src="backChassisImageUrl"
            class="chassis-panel__bg"
            alt=""
          />
          <div v-if="backGhostStyle" class="chassis-draw-ghost" :style="backGhostStyle" />
          <div v-if="backDragGhostStyle" class="chassis-drag-ghost" :style="backDragGhostStyle" />

          <div
            v-for="el in backElements"
            :key="el.id + '-back'"
            class="chassis-element"
            :class="{ 'chassis-element--has-image': !!backImage(el) }"
            :style="elementStyle(el)"
            role="button"
            tabindex="0"
            :aria-label="elementLabel(el)"
            @keydown="onElementKeyDown($event, el)"
            @pointerdown.stop="onElementPointerDown($event, el, 'back', backPanelRef)"
            @click.stop="onElementClick(el)"
            @contextmenu.prevent.stop="onElementRightClick($event, el)"
          >
            <div
              class="chassis-element__status-strip"
              :class="{ 'chassis-element__status-strip--alert': isAlertStatus(el) }"
              :style="{ background: elementBgColor(el) }"
            />
            <img v-if="backImage(el)" :src="backImage(el)" class="chassis-element__image" alt="" />
            <template v-else>
              <span
                v-if="elementCodepoint(el)"
                class="chassis-element__icon chassis-element__icon--font"
              >
                {{ elementCodepoint(el) }}
              </span>
            </template>
            <span v-if="!backImage(el)" class="chassis-element__label">{{ elementLabel(el) }}</span>
            <span v-if="backImage(el)" class="chassis-element__hover-label">{{
              elementLabel(el)
            }}</span>
            <div
              class="chassis-handle chassis-handle--e"
              @pointerdown.stop="onHandlePointerDown($event, el, 'back', 'e')"
            />
            <div
              class="chassis-handle chassis-handle--s"
              @pointerdown.stop="onHandlePointerDown($event, el, 'back', 's')"
            />
            <div
              class="chassis-handle chassis-handle--se"
              @pointerdown.stop="onHandlePointerDown($event, el, 'back', 'se')"
            />
          </div>
        </div>
      </div>
    </template>

    <ContextMenu ref="contextMenu" :model="contextMenuItems" />
  </div>
</template>

<style scoped>
.chassis-canvas {
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
  user-select: none;
  gap: 0;
}

.chassis-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chassis-panel-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--p-text-muted-color);
  text-align: center;
}

.chassis-h-divider {
  height: 20px;
  flex-shrink: 0;
}

.chassis-panel {
  position: relative;
  border: 1px solid var(--p-content-border-color);
  border-radius: 4px;
  background: var(--p-content-background);
  overflow: hidden;
  cursor: crosshair;
  flex-shrink: 0;
  box-shadow:
    0 0 0 6px var(--p-surface-100),
    0 4px 16px rgba(0, 0, 0, 0.1),
    0 1px 3px rgba(0, 0, 0, 0.08);
}

.chassis-panel__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  z-index: 0;
}

.chassis-element {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px 2px 10px;
  color: var(--p-text-color);
  cursor: pointer;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-sizing: border-box;
  z-index: 1;
  background: rgba(0, 0, 0, 0.08);
  transition: filter 0.1s;
}

.chassis-element:hover {
  filter: brightness(1.12);
}

.chassis-element--has-image {
  padding: 0;
}

.chassis-element__status-strip {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  flex-shrink: 0;
}

@keyframes status-strip-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.chassis-element__status-strip--alert {
  animation: status-strip-pulse 2s ease-in-out infinite;
}

.chassis-element__image {
  position: absolute;
  left: 6px;
  top: 0;
  right: 0;
  bottom: 0;
  width: calc(100% - 6px);
  height: 100%;
  object-fit: fill;
  pointer-events: none;
}

.chassis-element__icon {
  font-size: 0.875rem;
  flex-shrink: 0;
  opacity: 0.9;
}

.chassis-element__icon--font {
  font-family: 'primeicons', sans-serif;
  font-style: normal;
}

.chassis-element__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.6875rem;
  font-weight: 500;
  flex: 1;
  min-width: 0;
}

.chassis-element__hover-label {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) translateY(100%);
  background: var(--p-surface-100);
  box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.2);
  border-radius: 6px 6px 0 0;
  padding: 2px 10px;
  font-size: 0.6875rem;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  transition: transform 0.18s ease;
  z-index: 5;
  color: var(--p-text-color);
  max-width: calc(100% - 12px);
  overflow: hidden;
  text-overflow: ellipsis;
}

.chassis-element:hover .chassis-element__hover-label {
  transform: translateX(-50%) translateY(0);
}

.chassis-draw-ghost {
  position: absolute;
  background: rgba(59, 130, 246, 0.18);
  border: 2px dashed rgba(59, 130, 246, 0.7);
  border-radius: 2px;
  pointer-events: none;
  z-index: 10;
  box-sizing: border-box;
}

.chassis-drag-ghost {
  position: absolute;
  border-radius: 2px;
  pointer-events: none;
  z-index: 9;
  box-sizing: border-box;
}

/* The element clips its children, so handles are edge strips inside it with the marker
   drawn by ::after. `min(px, %)` leaves a middle to drag a small element by. */
.chassis-handle {
  position: absolute;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 3;
  pointer-events: all;
}

.chassis-handle::after {
  content: '';
  position: absolute;
  width: 8px;
  height: 8px;
  background: var(--p-primary-color, #3b82f6);
  border: 1px solid #fff;
  border-radius: 2px;
  box-sizing: border-box;
}

.chassis-element:hover .chassis-handle {
  opacity: 1;
}

.chassis-handle:hover {
  background: rgba(59, 130, 246, 0.3);
}

.chassis-handle--e {
  top: 0;
  bottom: 0;
  right: 0;
  width: min(12px, 33%);
  cursor: e-resize;
}

.chassis-handle--e::after {
  top: 50%;
  right: 1px;
  margin-top: -4px;
}

.chassis-handle--s {
  left: 0;
  right: 0;
  bottom: 0;
  height: min(12px, 33%);
  cursor: s-resize;
}

.chassis-handle--s::after {
  left: 50%;
  bottom: 1px;
  margin-left: -4px;
}

.chassis-handle--se {
  right: 0;
  bottom: 0;
  width: min(16px, 40%);
  height: min(16px, 40%);
  cursor: se-resize;
  z-index: 4;
}

.chassis-handle--se::after {
  right: 1px;
  bottom: 1px;
}
</style>
