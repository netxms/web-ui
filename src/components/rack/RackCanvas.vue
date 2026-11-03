<script setup>
import { computed, ref, onUnmounted } from 'vue'
import { getStatusHexColor } from '@/utils/objectUtils'
import { getClassIconCodepoint } from '@/utils/topologyUtils'
import { checkOverlap, PANEL_WIDTH_PER_U } from './rackUtils.js'

const PASSIVE_COLORS = {
  PDU: '#5c6bc0',
  PatchPanel: '#00897b',
  Organizer: '#8d6e63',
  FilterPanel: '#7b1fa2',
}

const PASSIVE_ICONS = {
  PDU: 'pi pi-bolt',
  PatchPanel: 'pi pi-sitemap',
  Organizer: 'pi pi-th-large',
  FilterPanel: 'pi pi-filter',
}

const props = defineProps({
  rackHeight: { type: Number, required: true },
  /** 'front-back' | 'front' */
  rackMode: { type: String, default: 'front-back' },
  elements: { type: Array, default: () => [] },
  /** Map<guid, dataUrl> */
  resolvedImages: { type: Object, default: () => ({}) },
  /** px per rack unit */
  rowHeight: { type: Number, default: 30 },
  /** Move, resize, add and delete from the drawing itself; only the rack view edits. */
  editable: { type: Boolean, default: false },
})

const emit = defineEmits([
  'add-to-slot',
  'select-element',
  'remove-element',
  'move-element',
  'resize-element',
  'element-contextmenu',
  'slot-contextmenu',
])

/**
 * Consecutive empty slots are merged into a single free-block item.
 * @param {'front'|'back'} side
 */
function buildPanelItems(side) {
  const byStartSlot = new Map()
  const continuations = new Set()

  for (const el of props.elements) {
    if (el.orientation === 'full' || el.orientation === side) {
      byStartSlot.set(el.slot, el)
      for (let i = 1; i < el.heightU; i++) {
        continuations.add(el.slot + i)
      }
    }
  }

  const items = []
  let slot = 1
  while (slot <= props.rackHeight) {
    if (byStartSlot.has(slot)) {
      const el = byStartSlot.get(slot)
      // CSS row 1 = top of rack; top slot of element = slot+heightU-1
      const cssRow = props.rackHeight - slot - el.heightU + 2
      items.push({ type: 'element', element: el, cssRow, slot })
      slot += el.heightU
    } else if (continuations.has(slot)) {
      // Orphaned continuation — skip (shouldn't occur with valid data)
      slot++
    } else {
      const startSlot = slot
      while (slot <= props.rackHeight && !byStartSlot.has(slot) && !continuations.has(slot)) {
        slot++
      }
      const runSlots = slot - startSlot
      const cssRow = props.rackHeight - startSlot - runSlots + 2
      items.push({ type: 'free-block', startSlot, slots: runSlots, cssRow })
    }
  }
  return items
}

const frontItems = computed(() => buildPanelItems('front'))
const backItems = computed(() => buildPanelItems('back'))

const panelWidth = computed(() => Math.round(props.rowHeight * PANEL_WIDTH_PER_U))
const panelStyle = computed(() => ({ width: `${panelWidth.value}px` }))

const rowLabels = computed(() => {
  const labels = []
  for (let u = props.rackHeight; u >= 1; u--) {
    labels.push(u)
  }
  return labels
})

// The parent owns the menu; the drawing only reports what was right-clicked.

function onElementRightClick(event, element) {
  emit('element-contextmenu', event, element)
}

function onEmptySlotRightClick(event, slot, side) {
  emit('slot-contextmenu', event, slot, side)
}

function freeSlotAttrs(item) {
  if (!props.editable) return {}
  return {
    role: 'button',
    tabindex: 0,
    'aria-label': `${item.slots}U free at slot ${item.startSlot}. Press Enter to add.`,
  }
}

function elementBgColor(el) {
  if (el.passiveType) return PASSIVE_COLORS[el.passiveType] ?? '#607d8b'
  return getStatusHexColor(el.objectStatus ?? 5)
}

function elementIcon(el) {
  if (el.passiveType) return PASSIVE_ICONS[el.passiveType] ?? 'pi pi-server'
  return null
}

function elementCodepoint(el) {
  if (el.passiveType) return null
  return getClassIconCodepoint(el.objectClass ?? 'Node')
}

function elementLabel(el) {
  return el.label || el.objectName || el.passiveType || '—'
}

function frontImage(el) {
  return el.frontImageGuid ? props.resolvedImages[el.frontImageGuid] : null
}

function backImage(el) {
  return el.backImageGuid ? props.resolvedImages[el.backImageGuid] : null
}

/** Major/Critical. */
function isAlertStatus(el) {
  return !el.passiveType && el.objectStatus != null && el.objectStatus >= 3 && el.objectStatus <= 4
}

function onElementKeyDown(event, element) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('select-element', element.id)
  } else if (props.editable && (event.key === 'Delete' || event.key === 'Backspace')) {
    event.preventDefault()
    emit('remove-element', element.id)
  }
}

function onFreeBlockKeyDown(event, item, side) {
  if (!props.editable) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('add-to-slot', item.startSlot, side)
  }
}

const frontPanelRef = ref(null)
const backPanelRef = ref(null)

/** Set once the pointer has moved past the threshold. */
const dragging = ref(null)
const dragValid = ref(false)

let pendingDrag = null
/** Suppresses the click that ends a drag. */
let wasDrag = false

function getPanelRef(side) {
  return side === 'front' ? frontPanelRef.value : backPanelRef.value
}

function onElementPointerDown(event, element, side) {
  if (!props.editable || event.button !== 0) return
  event.currentTarget.setPointerCapture(event.pointerId)
  pendingDrag = {
    element,
    side,
    startX: event.clientX,
    startY: event.clientY,
    target: event.currentTarget,
    pointerId: event.pointerId,
  }
  wasDrag = false
  window.addEventListener('pointermove', onGlobalPointerMove)
  window.addEventListener('pointerup', onGlobalPointerUp)
  window.addEventListener('pointercancel', onDragCancel)
  window.addEventListener('keydown', onDragKeyDown)
}

function activateDrag(startY) {
  const { element, side } = pendingDrag
  const panel = getPanelRef(side)
  if (!panel) {
    pendingDrag = null
    return
  }

  const panelRect = panel.getBoundingClientRect()
  const pointerRowFromTop = Math.floor((startY - panelRect.top) / props.rowHeight)
  const elementTopRowIndex = props.rackHeight - element.slot - element.heightU + 1
  const grabOffsetRows = Math.max(
    0,
    Math.min(element.heightU - 1, pointerRowFromTop - elementTopRowIndex),
  )

  dragging.value = {
    elementId: element.id,
    element,
    side,
    grabOffsetRows,
    currentSlot: element.slot,
  }
  dragValid.value = true
  wasDrag = true
  pendingDrag = null
}

function updateDragSlot(clientY) {
  if (!dragging.value) return
  const { element, side, grabOffsetRows } = dragging.value
  const panel = getPanelRef(side)
  if (!panel) return

  const panelRect = panel.getBoundingClientRect()
  const pointerRowFromTop = Math.floor((clientY - panelRect.top) / props.rowHeight)
  const newElementTopRowIndex = pointerRowFromTop - grabOffsetRows
  const newSlot = props.rackHeight - newElementTopRowIndex - element.heightU + 1
  const clamped = Math.max(1, Math.min(props.rackHeight - element.heightU + 1, newSlot))

  dragging.value = { ...dragging.value, currentSlot: clamped }
  dragValid.value =
    checkOverlap(props.elements, clamped, element.heightU, element.orientation, element.id) === null
}

function onGlobalPointerMove(event) {
  if (pendingDrag) {
    const dx = event.clientX - pendingDrag.startX
    const dy = event.clientY - pendingDrag.startY
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      activateDrag(pendingDrag.startY)
    }
  }
  if (dragging.value) {
    updateDragSlot(event.clientY)
  }
}

function onGlobalPointerUp() {
  if (dragging.value) {
    const { element, currentSlot } = dragging.value
    if (dragValid.value && currentSlot !== element.slot) {
      emit('move-element', element.id, currentSlot)
    }
  }
  clearDrag()
}

function onDragCancel() {
  clearDrag()
}

function onDragKeyDown(event) {
  if (event.key === 'Escape') clearDrag()
}

function clearDrag() {
  pendingDrag = null
  dragging.value = null
  dragValid.value = false
  window.removeEventListener('pointermove', onGlobalPointerMove)
  window.removeEventListener('pointerup', onGlobalPointerUp)
  window.removeEventListener('pointercancel', onDragCancel)
  window.removeEventListener('keydown', onDragKeyDown)
}

onUnmounted(() => {
  clearDrag()
  window.removeEventListener('pointermove', onSelectPointerMove)
  window.removeEventListener('pointerup', onSelectPointerUp)
  window.removeEventListener('pointermove', onResizePointerMove)
  window.removeEventListener('pointerup', onResizePointerUp)
})

function onElementClick(element) {
  if (wasDrag) {
    wasDrag = false
    return
  }
  emit('select-element', element.id)
}

function onFreeBlockClick(event, item, side) {
  if (!props.editable) return
  if (wasDrag || wasSelect) {
    wasDrag = false
    wasSelect = false
    return
  }
  const blockEl = event.currentTarget
  const rect = blockEl.getBoundingClientRect()
  const relativeY = event.clientY - rect.top
  const rowWithinBlock = Math.floor(relativeY / props.rowHeight)
  const topSlot = item.startSlot + item.slots - 1
  const slot = Math.max(item.startSlot, Math.min(topSlot, topSlot - rowWithinBlock))
  emit('add-to-slot', slot, side, 1)
}

const selecting = ref(null)
// { startSlot, currentSlot, side, freeBlock }
let pendingSelect = null
let wasSelect = false

function onFreeBlockPointerDown(event, item, side) {
  if (!props.editable || event.button !== 0) return
  const rect = event.currentTarget.getBoundingClientRect()
  const relativeY = event.clientY - rect.top
  const rowWithinBlock = Math.floor(relativeY / props.rowHeight)
  const topSlot = item.startSlot + item.slots - 1
  const clickSlot = Math.max(item.startSlot, Math.min(topSlot, topSlot - rowWithinBlock))
  pendingSelect = {
    clickSlot,
    freeBlock: item,
    side,
    startY: event.clientY,
    target: event.currentTarget,
    pointerId: event.pointerId,
  }
  wasSelect = false
  window.addEventListener('pointermove', onSelectPointerMove)
  window.addEventListener('pointerup', onSelectPointerUp)
}

function onSelectPointerMove(event) {
  if (!pendingSelect && !selecting.value) return
  if (pendingSelect) {
    if (Math.abs(event.clientY - pendingSelect.startY) < props.rowHeight) return
    const { clickSlot, freeBlock, side, target, pointerId } = pendingSelect
    selecting.value = { startSlot: clickSlot, currentSlot: clickSlot, side, freeBlock }
    target.setPointerCapture(pointerId)
    wasSelect = true
    pendingSelect = null
  }
  if (!selecting.value) return
  const { freeBlock, side } = selecting.value
  const panel = getPanelRef(side)
  if (!panel) return
  const panelRect = panel.getBoundingClientRect()
  const rowFromTop = Math.floor((event.clientY - panelRect.top) / props.rowHeight)
  const slotAtPointer = props.rackHeight - rowFromTop
  const clamped = Math.max(
    freeBlock.startSlot,
    Math.min(freeBlock.startSlot + freeBlock.slots - 1, slotAtPointer),
  )
  selecting.value = { ...selecting.value, currentSlot: clamped }
}

function onSelectPointerUp() {
  if (selecting.value) {
    const { startSlot, currentSlot, side } = selecting.value
    const slot = Math.min(startSlot, currentSlot)
    const heightU = Math.abs(currentSlot - startSlot) + 1
    emit('add-to-slot', slot, side, heightU)
  }
  pendingSelect = null
  selecting.value = null
  window.removeEventListener('pointermove', onSelectPointerMove)
  window.removeEventListener('pointerup', onSelectPointerUp)
}

function selectionGhostFor(item, side) {
  const sel = selecting.value
  if (!sel || sel.side !== side || sel.freeBlock.startSlot !== item.startSlot) return null
  const { freeBlock, startSlot: selStart, currentSlot } = sel
  const minSlot = Math.min(selStart, currentSlot)
  const maxSlot = Math.max(selStart, currentSlot)
  const heightU = maxSlot - minSlot + 1
  const topOffset = (freeBlock.startSlot + freeBlock.slots - 1 - maxSlot) * props.rowHeight
  return {
    top: topOffset + 'px',
    height: heightU * props.rowHeight + 'px',
  }
}

function ghostStyle(side) {
  if (!dragging.value || dragging.value.side !== side) return null
  const { element, currentSlot } = dragging.value
  const cssRow = props.rackHeight - currentSlot - element.heightU + 2
  return {
    top: (cssRow - 1) * props.rowHeight + 'px',
    height: element.heightU * props.rowHeight + 'px',
  }
}

let activeResize = null
// { element, side, startY, originalHeightU }
const resizingEl = ref(null)
// { elementId, currentHeightU, valid, side }

function onResizePointerDown(event, element, side) {
  if (!props.editable || event.button !== 0) return
  activeResize = { element, side, startY: event.clientY, originalHeightU: element.heightU }
  resizingEl.value = { elementId: element.id, currentHeightU: element.heightU, valid: true, side }
  wasDrag = false
  event.currentTarget.setPointerCapture(event.pointerId)
  window.addEventListener('pointermove', onResizePointerMove)
  window.addEventListener('pointerup', onResizePointerUp)
}

function onResizePointerMove(event) {
  if (!activeResize) return
  const { element, startY, originalHeightU } = activeResize
  // Bottom handle: dragging DOWN grows the element toward slot 1 (lower slots)
  const deltaRows = Math.round((event.clientY - startY) / props.rowHeight)
  const newHeightU = Math.max(1, originalHeightU + deltaRows)
  // Top slot stays fixed; bottom slot moves down as height increases
  const topSlot = element.slot + element.heightU - 1
  const newSlot = topSlot - newHeightU + 1
  const valid =
    newSlot >= 1 &&
    checkOverlap(props.elements, newSlot, newHeightU, element.orientation, element.id) === null
  // The release lands on a free block or the element in the not-yet-updated DOM; suppress
  // that click as move-drag does.
  if (newHeightU !== originalHeightU) wasDrag = true
  resizingEl.value = {
    elementId: element.id,
    currentHeightU: newHeightU,
    currentSlot: newSlot,
    valid,
    side: activeResize.side,
  }
}

function onResizePointerUp() {
  if (activeResize && resizingEl.value?.valid) {
    const { element } = activeResize
    const { currentHeightU: newHeightU, currentSlot: newSlot } = resizingEl.value
    if (newHeightU !== element.heightU || newSlot !== element.slot) {
      emit('resize-element', element.id, newSlot, newHeightU)
    }
  }
  activeResize = null
  resizingEl.value = null
  window.removeEventListener('pointermove', onResizePointerMove)
  window.removeEventListener('pointerup', onResizePointerUp)
}

function resizeGhostStyle(side) {
  const r = resizingEl.value
  if (!r || r.side !== side) return null
  const el = props.elements.find((e) => e.id === r.elementId)
  if (!el) return null
  // Anchor the ghost top to the original top slot; only height changes
  const cssRow = props.rackHeight - el.slot - el.heightU + 2
  return {
    top: (cssRow - 1) * props.rowHeight + 'px',
    height: r.currentHeightU * props.rowHeight + 'px',
    background: r.valid ? 'rgba(76,175,80,0.18)' : 'rgba(244,67,54,0.15)',
    border: `2px dashed ${r.valid ? 'rgba(76,175,80,0.7)' : 'rgba(244,67,54,0.6)'}`,
  }
}
</script>

<template>
  <div class="rack-canvas" :class="{ 'rack-canvas--static': !editable }">
    <div class="rack-headers">
      <div class="rack-label-col" />
      <div class="rack-panel-header" :style="panelStyle">Front</div>
      <div v-if="rackMode === 'front-back'" class="rack-divider-col" />
      <div v-if="rackMode === 'front-back'" class="rack-panel-header" :style="panelStyle">Back</div>
    </div>

    <div class="rack-body">
      <div class="rack-label-col">
        <div
          v-for="u in rowLabels"
          :key="u"
          class="rack-u-label"
          :style="{ height: rowHeight + 'px' }"
        >
          {{ u }}
        </div>
      </div>

      <div
        ref="frontPanelRef"
        class="rack-panel"
        :style="{ gridTemplateRows: `repeat(${rackHeight}, ${rowHeight}px)`, ...panelStyle }"
      >
        <div
          v-if="ghostStyle('front')"
          class="rack-drag-ghost"
          :class="dragValid ? 'rack-drag-ghost--valid' : 'rack-drag-ghost--invalid'"
          :style="ghostStyle('front')"
        />
        <div
          v-if="resizeGhostStyle('front')"
          class="rack-drag-ghost rack-resize-ghost"
          :style="resizeGhostStyle('front')"
        />

        <template
          v-for="item in frontItems"
          :key="item.type === 'element' ? item.element.id : `free-${item.startSlot}`"
        >
          <div
            v-if="item.type === 'element'"
            class="rack-element"
            :class="{
              'rack-element--has-image': !!frontImage(item.element),
              'rack-element--dragging': dragging?.elementId === item.element.id,
            }"
            :style="{ gridRow: `${item.cssRow} / span ${item.element.heightU}` }"
            role="button"
            tabindex="0"
            :aria-label="elementLabel(item.element)"
            @pointerdown.stop="onElementPointerDown($event, item.element, 'front')"
            @contextmenu.prevent.stop="onElementRightClick($event, item.element)"
            @click.stop="onElementClick(item.element)"
            @keydown="onElementKeyDown($event, item.element)"
          >
            <div
              class="rack-element__status-strip"
              :class="{ 'rack-element__status-strip--alert': isAlertStatus(item.element) }"
              :style="{ background: elementBgColor(item.element) }"
            />
            <img
              v-if="frontImage(item.element)"
              :src="frontImage(item.element)"
              class="rack-element__image"
              alt=""
            />
            <template v-else>
              <span
                v-if="elementCodepoint(item.element)"
                class="rack-element__icon rack-element__icon--font"
              >
                {{ elementCodepoint(item.element) }}
              </span>
              <i
                v-else-if="elementIcon(item.element)"
                :class="elementIcon(item.element)"
                class="rack-element__icon"
              />
            </template>
            <span v-if="!frontImage(item.element)" class="rack-element__label">{{
              elementLabel(item.element)
            }}</span>
            <span v-if="frontImage(item.element)" class="rack-element__hover-label">{{
              elementLabel(item.element)
            }}</span>
            <div
              v-if="editable"
              class="rack-element__resize-handle"
              @pointerdown.stop="onResizePointerDown($event, item.element, 'front')"
            />
          </div>

          <!-- `freeSlotAttrs` supplies role and tabindex when editable; the rule cannot see it. -->
          <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
          <div
            v-else
            class="rack-slot--free"
            :style="{ gridRow: `${item.cssRow} / span ${item.slots}` }"
            v-bind="freeSlotAttrs(item)"
            @pointerdown="onFreeBlockPointerDown($event, item, 'front')"
            @click="onFreeBlockClick($event, item, 'front')"
            @contextmenu.prevent.stop="onEmptySlotRightClick($event, item.startSlot, 'front')"
            @keydown="onFreeBlockKeyDown($event, item, 'front')"
          >
            <i v-if="editable" class="pi pi-plus slot-add-icon" />
            <span v-if="item.slots * rowHeight >= 28" class="rack-free-label"
              >{{ item.slots }}U free</span
            >
            <div
              v-if="selectionGhostFor(item, 'front')"
              class="rack-select-ghost"
              :style="selectionGhostFor(item, 'front')"
            />
          </div>
        </template>
      </div>

      <div v-if="rackMode === 'front-back'" class="rack-divider-col">
        <div
          v-for="u in rowLabels"
          :key="u"
          class="rack-divider-mark"
          :style="{ height: rowHeight + 'px' }"
        />
      </div>

      <div
        v-if="rackMode === 'front-back'"
        ref="backPanelRef"
        class="rack-panel"
        :style="{ gridTemplateRows: `repeat(${rackHeight}, ${rowHeight}px)`, ...panelStyle }"
      >
        <div
          v-if="ghostStyle('back')"
          class="rack-drag-ghost"
          :class="dragValid ? 'rack-drag-ghost--valid' : 'rack-drag-ghost--invalid'"
          :style="ghostStyle('back')"
        />
        <div
          v-if="resizeGhostStyle('back')"
          class="rack-drag-ghost rack-resize-ghost"
          :style="resizeGhostStyle('back')"
        />

        <template
          v-for="item in backItems"
          :key="item.type === 'element' ? item.element.id + '-back' : `free-back-${item.startSlot}`"
        >
          <div
            v-if="item.type === 'element'"
            class="rack-element"
            :class="{
              'rack-element--has-image': !!backImage(item.element),
              'rack-element--dragging': dragging?.elementId === item.element.id,
            }"
            :style="{ gridRow: `${item.cssRow} / span ${item.element.heightU}` }"
            role="button"
            tabindex="0"
            :aria-label="elementLabel(item.element)"
            @pointerdown.stop="onElementPointerDown($event, item.element, 'back')"
            @contextmenu.prevent.stop="onElementRightClick($event, item.element)"
            @click.stop="onElementClick(item.element)"
            @keydown="onElementKeyDown($event, item.element)"
          >
            <div
              class="rack-element__status-strip"
              :class="{ 'rack-element__status-strip--alert': isAlertStatus(item.element) }"
              :style="{ background: elementBgColor(item.element) }"
            />
            <img
              v-if="backImage(item.element)"
              :src="backImage(item.element)"
              class="rack-element__image"
              alt=""
            />
            <template v-else>
              <span
                v-if="elementCodepoint(item.element)"
                class="rack-element__icon rack-element__icon--font"
              >
                {{ elementCodepoint(item.element) }}
              </span>
              <i
                v-else-if="elementIcon(item.element)"
                :class="elementIcon(item.element)"
                class="rack-element__icon"
              />
            </template>
            <span v-if="!backImage(item.element)" class="rack-element__label">{{
              elementLabel(item.element)
            }}</span>
            <span v-if="backImage(item.element)" class="rack-element__hover-label">{{
              elementLabel(item.element)
            }}</span>
            <div
              v-if="editable"
              class="rack-element__resize-handle"
              @pointerdown.stop="onResizePointerDown($event, item.element, 'back')"
            />
          </div>

          <!-- Same as the front panel: interactive only while `editable`. -->
          <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
          <div
            v-else
            class="rack-slot--free"
            :style="{ gridRow: `${item.cssRow} / span ${item.slots}` }"
            v-bind="freeSlotAttrs(item)"
            @pointerdown="onFreeBlockPointerDown($event, item, 'back')"
            @click="onFreeBlockClick($event, item, 'back')"
            @contextmenu.prevent.stop="onEmptySlotRightClick($event, item.startSlot, 'back')"
            @keydown="onFreeBlockKeyDown($event, item, 'back')"
          >
            <i v-if="editable" class="pi pi-plus slot-add-icon" />
            <span v-if="item.slots * rowHeight >= 28" class="rack-free-label"
              >{{ item.slots }}U free</span
            >
            <div
              v-if="selectionGhostFor(item, 'back')"
              class="rack-select-ghost"
              :style="selectionGhostFor(item, 'back')"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rack-canvas {
  display: flex;
  flex-direction: column;
  width: max-content;
  font-size: 0.75rem;
  user-select: none;
}

/* Elements keep their hover highlight: right-click still acts on them. */
.rack-canvas--static .rack-element,
.rack-canvas--static .rack-slot--free {
  cursor: default;
}

.rack-canvas--static .rack-slot--free:hover {
  background: none;
  border-color: var(--p-content-border-color);
}

.rack-headers {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 4px;
}

.rack-panel-header {
  flex: none;
  text-align: center;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--p-text-muted-color);
  padding: 0 4px 2px;
}

.rack-body {
  display: flex;
  gap: 0;
}

.rack-label-col {
  width: 36px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.rack-u-label {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 6px;
  color: var(--p-text-muted-color);
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
  box-sizing: border-box;
  border-top: 1px solid transparent;
}

.rack-panel {
  flex: none;
  display: grid;
  grid-template-columns: 1fr;
  border: 1px solid var(--p-content-border-color);
  border-radius: 4px;
  background: var(--p-content-background);
  overflow: hidden;
  position: relative;
  box-shadow:
    0 0 0 6px var(--p-surface-100),
    0 4px 16px rgba(0, 0, 0, 0.1),
    0 1px 3px rgba(0, 0, 0, 0.08);
}

.rack-element {
  position: relative;
  grid-column: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px 2px 11px;
  color: var(--p-text-color);
  cursor: grab;
  overflow: hidden;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  transition: filter 0.1s;
  box-sizing: border-box;
  min-width: 0;
  background-color: rgba(0, 0, 0, 0.05);
}

.rack-element:hover {
  filter: brightness(1.12);
}

.rack-element:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
  z-index: 2;
}

.rack-element--dragging {
  opacity: 0.3;
}

.rack-drag-ghost {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
  z-index: 10;
  box-sizing: border-box;
}

.rack-drag-ghost--valid {
  background: rgba(76, 175, 80, 0.25);
  border: 2px solid rgba(76, 175, 80, 0.7);
}

.rack-drag-ghost--invalid {
  background: rgba(244, 67, 54, 0.2);
  border: 2px solid rgba(244, 67, 54, 0.6);
}

.rack-element__status-strip {
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

.rack-element__status-strip--alert {
  animation: status-strip-pulse 2s ease-in-out infinite;
}

.rack-element--has-image {
  padding: 0;
}

.rack-element__image {
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

.rack-element__icon {
  font-size: 0.875rem;
  flex-shrink: 0;
  opacity: 0.9;
}

.rack-element__icon--font {
  font-family: 'primeicons', sans-serif;
  font-style: normal;
}

.rack-element__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.6875rem;
  font-weight: 500;
  flex: 1;
}

.rack-element__hover-label {
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

.rack-element:hover .rack-element__hover-label {
  transform: translateX(-50%) translateY(0);
}

.rack-slot--free {
  position: relative;
  grid-column: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  cursor: pointer;
  box-sizing: border-box;
  transition: background 0.12s;
  border: 1px dashed var(--p-content-border-color);
  border-radius: 2px;
  margin: 1px 2px;
  overflow: hidden;
  min-width: 0;
}

.rack-slot--free:hover {
  background: var(--p-content-hover-background);
  border-color: var(--p-primary-300, #93c5fd);
}

.rack-slot--free:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.slot-add-icon {
  font-size: 0.625rem;
  color: var(--p-text-muted-color);
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}

.rack-slot--free:hover .slot-add-icon,
.rack-slot--free:focus-visible .slot-add-icon {
  opacity: 0.5;
}

.rack-free-label {
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: var(--p-text-muted-color);
  pointer-events: none;
  line-height: 1;
}

.rack-element__resize-handle {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 6px;
  cursor: ns-resize;
  z-index: 3;
}

.rack-element__resize-handle:hover {
  background: rgba(59, 130, 246, 0.35);
}

.rack-resize-ghost {
  pointer-events: none;
}

.rack-select-ghost {
  position: absolute;
  left: 2px;
  right: 2px;
  background: rgba(59, 130, 246, 0.18);
  border: 2px dashed rgba(59, 130, 246, 0.7);
  border-radius: 2px;
  pointer-events: none;
  z-index: 5;
  box-sizing: border-box;
}

.rack-divider-col {
  width: 16px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.rack-divider-mark {
  width: 1px;
  background: var(--p-content-border-color);
  box-sizing: border-box;
}
</style>
