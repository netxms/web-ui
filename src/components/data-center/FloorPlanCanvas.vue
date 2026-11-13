<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { useNavTarget } from '@/composables/useNavTarget'
import {
  BACKDROP_CORNERS,
  bounds,
  deriveAisles,
  footprint,
  frontArrow,
  frontBand,
  nearestEdge,
  offsetRectangle,
  RESIZE_HANDLES,
  resizeCursor,
  resizeHandlePoint,
  resizeHandleSpread,
  shortenMiddle,
  svgPoints,
  tileGrid,
} from '@/utils/floorPlan'
import { RACK_DRAG_TYPE } from '@/utils/floorPlanEdits'

const props = defineProps({
  /** GET /v1/objects/{id}/floor-plan document */
  plan: { type: Object, required: true },
  /** `(rack) => RackLook` (floorPlanOverlays) */
  lookFor: { type: Function, required: true },
  /** Item keys (`r:<id>`, `e:<id>`, `v:<index>`) drawn as selected */
  selectedKeys: { type: Set, default: () => new Set() },
  /** Item keys drawn with a warning outline */
  warnedKeys: { type: Set, default: () => new Set() },
  /** Racks and elements take drags, the outline shows its corners */
  editMode: { type: Boolean, default: false },
  /** Footprint corners of a rack about to be dropped */
  ghost: { type: Array, default: null },
  /** `(rack) => RouteLocationRaw|null` for ctrl/middle click */
  targetFor: { type: Function, default: () => null },
  /** `{ url, x, y, width, height }` in room millimetres */
  backdrop: { type: Object, default: null },
  backdropOpacity: { type: Number, default: 0.85 },
  /** In edit mode: the backdrop takes the pointer, the rest of the plan fades */
  backdropMode: { type: Boolean, default: false },
  /** `{ points: [{x, y}] }` while two points of the backdrop are being picked */
  calibration: { type: Object, default: null },
  /** Screen pixels at the top that a fit leaves clear, for controls laid over the plan */
  fitInsetTop: { type: Number, default: 0 },
})

const emit = defineEmits([
  'select',
  'activate',
  'drag-start',
  'drag-move',
  'drag-end',
  'marquee',
  'clear-selection',
  'insert-vertex',
  'rack-over',
  'rack-drop',
  'context-menu',
  'calibrate-point',
  'calibrate-miss',
])

const { navBindings } = useNavTarget()

const containerRef = ref(null)
const svgRef = ref(null)
const size = ref({ width: 0, height: 0 })

const outline = computed(() => props.plan.outline ?? [])
const roomBounds = computed(() =>
  outline.value.length ? bounds(outline.value.map((p) => [p.x, p.y])) : null,
)
const grid = computed(() => tileGrid(props.plan))

const racks = computed(() =>
  (props.plan.racks ?? [])
    .filter((rack) => rack.placed)
    .map((rack) => {
      const corners = footprint(rack.x, rack.y, rack.width, rack.depth, rack.rotation)
      const b = bounds(corners)
      const bandSize = Math.min(rack.depth * 0.15, 200)
      return {
        rack,
        key: `r:${rack.id}`,
        corners,
        rotation: rack.rotation,
        band: frontBand(corners, rack.depth, bandSize),
        bandSize,
        arrow: frontArrow(corners, rack.depth, bandSize),
        cx: (b.minX + b.maxX) / 2,
        cy: (b.minY + b.maxY) / 2,
        boxWidth: b.maxX - b.minX,
        boxHeight: b.maxY - b.minY,
      }
    }),
)

const aisles = computed(() => deriveAisles(racks.value))

const ELEMENT_LABEL_TYPES = new Set(['DOOR', 'OTHER', 'RAMP', 'STAIRS'])

const elements = computed(() =>
  (props.plan.passiveElements ?? []).map((element) => {
    const corners = footprint(element.x, element.y, element.width, element.depth, element.rotation)
    const b = bounds(corners)
    return {
      element,
      key: `e:${element.id}`,
      corners,
      cx: (b.minX + b.maxX) / 2,
      cy: (b.minY + b.maxY) / 2,
      boxWidth: b.maxX - b.minX,
      boxHeight: b.maxY - b.minY,
    }
  }),
)

// View box in room millimetres. Labels sit outside the outline, so the fit leaves a margin.
const view = ref({ x: 0, y: 0, w: 1, h: 1 })
const fitted = ref(null)

function fitBox() {
  const b = roomBounds.value
  if (!b) return { x: 0, y: 0, w: 6000, h: 6000 }
  const tile = props.plan.gridTileSize > 0 ? props.plan.gridTileSize : 600
  const margin = Math.max(900, tile * 1.5, (b.maxX - b.minX) * 0.04)
  const content = {
    x: b.minX - margin,
    y: b.minY - margin,
    w: b.maxX - b.minX + margin * 2,
    h: b.maxY - b.minY + margin * 2,
  }
  const { width, height } = size.value
  const inset = props.fitInsetTop
  if (!inset || !width || height <= inset * 2) return content
  // A box of the canvas's own shape, so the inset stays in screen pixels.
  const scale = Math.min(width / content.w, (height - inset) / content.h)
  const w = width / scale
  const h = height / scale
  return {
    x: content.x - (w - content.w) / 2,
    y: content.y - inset / scale - ((height - inset) / scale - content.h) / 2,
    w,
    h,
  }
}

/** Until the user zooms or pans, a resized canvas fits again. */
let viewIsFit = true

function fit() {
  fitted.value = fitBox()
  view.value = { ...fitted.value }
  viewIsFit = true
}

// Refit for another room or an outline changed elsewhere, not under a corner being dragged.
let fittedFor = null
watch(
  () => [props.plan.roomId, JSON.stringify(outline.value)],
  ([roomId, key]) => {
    if (fittedFor?.roomId === roomId && (props.editMode || fittedFor.key === key)) return
    fittedFor = { roomId, key }
    fit()
  },
  { immediate: true },
)

const pxPerMm = computed(() => {
  const { width, height } = size.value
  if (!width || !height) return 0.05
  return Math.min(width / view.value.w, height / view.value.h)
})

/** Screen pixels to room millimetres at the current zoom. */
const px = (n) => n / pxPerMm.value

const showGridLabels = computed(
  () => grid.value.columns.length > 0 && props.plan.gridTileSize * pxPerMm.value >= 14,
)
const showGrid = computed(() => props.plan.gridTileSize * pxPerMm.value >= 3)
// A dot on every tile corner around the room, once tiles are far enough apart for dots to read.
const showDots = computed(() => props.plan.gridTileSize * pxPerMm.value >= 10)

const looks = computed(() => racks.value.map((entry) => props.lookFor(entry.rack)))
const nodataFill = computed(() => `url(#fp-nodata-${props.plan.roomId})`)

// Below this the arrow in the front band is a speck.
const MIN_ARROW_BAND_PX = 4

/** The rack under the pointer or the keyboard focus. */
const hoveredKey = ref(null)

// Screen pixels: the floor-colored gap between a rack and its ring, and the ring widths.
const RING_GAP = 2
const RING_WIDTH = { selected: 2, hover: 1.5 }

/** Rings around selected and hovered racks, drawn above every rack so no neighbour covers them. */
const rackRings = computed(() =>
  racks.value.flatMap((entry) => {
    const kind = props.selectedKeys.has(entry.key)
      ? 'selected'
      : hoveredKey.value === entry.key
        ? 'hover'
        : null
    if (!kind) return []
    return [
      {
        key: entry.key,
        kind,
        gap: offsetRectangle(entry.corners, px(RING_GAP / 2)),
        ring: offsetRectangle(entry.corners, px(RING_GAP + RING_WIDTH[kind] / 2)),
      },
    ]
  }),
)

// Average advance of a label character in em: the semibold UI font for racks, the monospace one
// (with its letter spacing) for elements and aisles.
const RACK_CHAR_EM = 0.68
const MONO_CHAR_EM = 0.64
const MIN_LABEL_PX = 8
const MIN_RACK_LABEL_CHARS = 4

/**
 * A rack's name across the rack and its screen font size: smaller as the rack gets smaller, then
 * shortened at the smallest size. Null when the rack is too short, or under four letters fit.
 */
function rackLabel(entry) {
  const scale = pxPerMm.value
  const { name } = entry.rack
  const room = entry.boxWidth * scale * 0.86
  const byHeight = (entry.boxHeight * scale) / 2.5
  const size = Math.min(12, byHeight, room / (name.length * RACK_CHAR_EM))
  if (size >= MIN_LABEL_PX) return { text: name, size }
  if (byHeight < MIN_LABEL_PX) return null
  // The ellipsis counts as a character.
  const fit = Math.floor(room / (MIN_LABEL_PX * RACK_CHAR_EM))
  if (fit <= MIN_RACK_LABEL_CHARS) return null
  return { text: shortenMiddle(name, fit), size: MIN_LABEL_PX }
}

const rackLabels = computed(() => racks.value.map(rackLabel))

/**
 * How a label of `text` fits a box of `width` × `height` mm: across, turned along a box taller
 * than wide, or not at all.
 */
function labelPlacement(text, width, height, fontPx, padPx = 8) {
  const scale = pxPerMm.value
  const length = text.length * fontPx * MONO_CHAR_EM + padPx * 2
  const thick = fontPx * 1.4
  if (width * scale >= length && height * scale >= thick) return 'across'
  if (height > width && height * scale >= length && width * scale >= thick) return 'turned'
  return null
}

const turnAt = (placement, x, y) => (placement === 'turned' ? `rotate(-90 ${x} ${y})` : undefined)

const elementLabels = computed(() =>
  elements.value.map((entry) => {
    const { name, type } = entry.element
    if (!name || !ELEMENT_LABEL_TYPES.has(type)) return null
    return labelPlacement(name, entry.boxWidth, entry.boxHeight, 10.5, 4)
  }),
)

const aisleLabels = computed(() =>
  aisles.value.map((aisle) =>
    labelPlacement(
      aisle.kind === 'hot' ? 'HOT AISLE' : 'COLD AISLE',
      aisle.width,
      aisle.height,
      10,
    ),
  ),
)

/** Outline corners and walls, for editing. */
const vertices = computed(() => outline.value.map((p, i) => ({ ...p, key: `v:${i}`, index: i })))
const walls = computed(() =>
  outline.value.map((p, i) => ({ from: p, to: outline.value[(i + 1) % outline.value.length] })),
)

/** "+" handles on the two walls of the selected corner. */
const insertHandles = computed(() => {
  if (!props.editMode) return []
  const selected = vertices.value.find((v) => props.selectedKeys.has(v.key))
  if (!selected) return []
  const n = outline.value.length
  return [(selected.index - 1 + n) % n, selected.index].map((edge) => {
    const a = outline.value[edge]
    const b = outline.value[(edge + 1) % n]
    return { edge, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  })
})

const HANDLE_PX = 10

/**
 * `{ cursor, moved, spread }` of the resize handle being dragged; the size shows once it has
 * moved.
 */
const resizing = ref(null)

/**
 * Resize handles of the one selected element. On an element under three handles across on
 * screen they spread out from it, so all eight stay apart.
 */
const resize = computed(() => {
  if (!props.editMode || props.backdropMode || props.selectedKeys.size !== 1) return null
  const entry = elements.value.find((e) => props.selectedKeys.has(e.key))
  if (!entry) return null
  const { element } = entry
  // Held through a drag: a spread that shrinks as the side grows would leave the handle behind
  // the pointer.
  const spread = resizing.value?.spread ?? resizeHandleSpread(element, px(HANDLE_PX * 3))
  const handles = RESIZE_HANDLES.map((id) => {
    const [x, y] = resizeHandlePoint(element, id, spread)
    return { id, x, y, cursor: resizeCursor(id, element.rotation) }
  })
  const readoutY = Math.max(...handles.map((h) => h.y)) + px(20)
  return { entry, element, handles, spread, readoutY }
})

const backdropEditing = computed(() => props.editMode && props.backdropMode)
/** A click on the image picks a calibration point until there are two. */
const calibrating = computed(
  () => backdropEditing.value && !!props.calibration && props.calibration.points.length < 2,
)

function onBackdrop({ x, y }) {
  const b = props.backdrop
  return !!b && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
}

const CORNER_CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' }

/** Frame and corner handles of the backdrop while it is being placed, not while calibrating. */
const backdropFrame = computed(() => {
  const b = props.backdrop
  if (!backdropEditing.value || !b || props.calibration) return null
  const at = {
    nw: [b.x, b.y],
    ne: [b.x + b.width, b.y],
    se: [b.x + b.width, b.y + b.height],
    sw: [b.x, b.y + b.height],
  }
  const handles = BACKDROP_CORNERS.map((id) => ({
    id,
    x: at[id][0],
    y: at[id][1],
    cursor: CORNER_CURSORS[id],
  }))
  return { ...b, handles }
})

function zoomBy(factor, center) {
  viewIsFit = false
  const v = view.value
  const base = fitted.value ?? v
  const w = Math.min(Math.max(v.w * factor, 1500), base.w * 2)
  const h = (v.h * w) / v.w
  const cx = center?.x ?? v.x + v.w / 2
  const cy = center?.y ?? v.y + v.h / 2
  view.value = {
    x: cx - ((cx - v.x) * w) / v.w,
    y: cy - ((cy - v.y) * h) / v.h,
    w,
    h,
  }
}

function toRoom(event) {
  const matrix = svgRef.value?.getScreenCTM?.()
  if (!matrix) return null
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

/** Room point at the centre of what is in view. */
function viewCentre() {
  const v = view.value
  return { x: v.x + v.w / 2, y: v.y + v.h / 2 }
}

function onWheel(event) {
  event.preventDefault()
  zoomBy(Math.pow(1.0015, event.deltaY), toRoom(event))
}

// A press becomes a drag past this many screen pixels.
const DRAG_THRESHOLD = 3

/** The pointer gesture in progress: pan, item drag or marquee. */
let gesture = null
const marquee = ref(null)

function capture(event) {
  svgRef.value?.setPointerCapture?.(event.pointerId)
}

/** Whether the last press was on the floor, for a double-click on a wall. */
let pressedFloor = false

function onPointerDown(event) {
  // A rack keeps its own click (select, ctrl/middle click); capturing here would take it.
  if (event.button !== 0 || event.target.closest?.('.fp-rack, .fp-insert')) return
  pressedFloor = true
  if (props.editMode && event.shiftKey && !props.backdropMode) {
    const start = toRoom(event)
    if (!start) return
    gesture = { type: 'marquee', start }
    marquee.value = { ...start, x2: start.x, y2: start.y }
  } else {
    // While calibrating, a press that does not move picks a point; one that moves still pans.
    gesture = {
      type: 'pan',
      x: event.clientX,
      y: event.clientY,
      view: { ...view.value },
      calibrate: calibrating.value,
    }
  }
  capture(event)
}

/** Press on a rack, element or corner in edit mode; ctrl/cmd clicks stay with the nav bindings. */
function onItemPointerDown(key, event) {
  if (!props.editMode || event.button !== 0 || event.ctrlKey || event.metaKey) return
  event.stopPropagation()
  pressedFloor = false
  const point = toRoom(event)
  if (!point) return
  hideTip()
  gesture = { type: 'item', x: event.clientX, y: event.clientY, moved: false }
  emit('drag-start', { key, point, toggle: event.shiftKey })
  capture(event)
}

function onBackdropPointerDown(handle, cursor, event) {
  onItemPointerDown(`b:${handle}`, event)
  if (gesture?.type === 'item') resizing.value = { cursor, moved: false, spread: null }
}

/** The SVG holds the pointer during the drag, so it shows the handle's cursor meanwhile. */
function onHandlePointerDown(handle, event) {
  const { element, spread } = resize.value
  onItemPointerDown(`s:${element.id}:${handle.id}`, event)
  if (gesture?.type === 'item') resizing.value = { cursor: handle.cursor, moved: false, spread }
}

function movedPast(event) {
  return Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > DRAG_THRESHOLD
}

function onPointerMove(event) {
  if (!gesture) return
  if (gesture.type === 'pan') {
    const scale = pxPerMm.value
    gesture.moved ||= movedPast(event)
    if (gesture.moved) viewIsFit = false
    view.value = {
      ...gesture.view,
      x: gesture.view.x - (event.clientX - gesture.x) / scale,
      y: gesture.view.y - (event.clientY - gesture.y) / scale,
    }
  } else if (gesture.type === 'item') {
    gesture.moved ||= movedPast(event)
    if (gesture.moved && resizing.value && !resizing.value.moved) {
      resizing.value = { ...resizing.value, moved: true }
    }
    const point = gesture.moved && toRoom(event)
    if (point) emit('drag-move', point)
  } else if (gesture.type === 'marquee') {
    const point = toRoom(event)
    if (point) marquee.value = { ...marquee.value, x2: point.x, y2: point.y }
  }
}

function onPointerUp(event) {
  const done = gesture
  gesture = null
  resizing.value = null
  svgRef.value?.releasePointerCapture?.(event.pointerId)
  if (!done) return
  if (done.type === 'item') {
    emit('drag-end')
  } else if (done.type === 'marquee') {
    const m = marquee.value
    marquee.value = null
    if (m) {
      emit('marquee', {
        minX: Math.min(m.x, m.x2),
        minY: Math.min(m.y, m.y2),
        maxX: Math.max(m.x, m.x2),
        maxY: Math.max(m.y, m.y2),
      })
    }
  } else if (done.type === 'pan' && !done.moved && event.type === 'pointerup') {
    if (done.calibrate) {
      const point = toRoom(event)
      if (point) emit(onBackdrop(point) ? 'calibrate-point' : 'calibrate-miss', point)
    } else {
      emit('clear-selection')
    }
  }
}

// The SVG holds the pointer during a press, so a double-click lands on it, not on a wall.
const WALL_REACH = 8

function onDoubleClick(event) {
  if (!props.editMode || props.backdropMode || !pressedFloor) return
  const point = toRoom(event)
  if (!point) return
  const edge = nearestEdge(
    outline.value.map((p) => [p.x, p.y]),
    point.x,
    point.y,
    px(WALL_REACH),
  )
  if (edge >= 0) emit('insert-vertex', { edge, point })
}

/**
 * Right click: what is under the pointer, as an item key (racks always, the rest while editing)
 * or a wall's index while editing, and the room point. A keyboard menu has no pointer and gets
 * the centre of the view.
 */
function onContextMenu(event) {
  event.preventDefault()
  hideTip()
  if (backdropEditing.value) return
  const fromKeyboard = !event.clientX && !event.clientY
  const point = (!fromKeyboard && toRoom(event)) || viewCentre()
  const marked = event.target.closest?.('[data-key]')?.dataset.key ?? null
  const key = marked && (props.editMode || marked.startsWith('r:')) ? marked : null
  let edge = null
  if (!key && props.editMode && !fromKeyboard) {
    const found = nearestEdge(
      outline.value.map((p) => [p.x, p.y]),
      point.x,
      point.y,
      px(WALL_REACH),
    )
    if (found >= 0) edge = found
  }
  emit('context-menu', { event, point, key, edge })
}

function isRackDrag(event) {
  return props.editMode && [...(event.dataTransfer?.types ?? [])].includes(RACK_DRAG_TYPE)
}

function onDragOver(event) {
  if (!isRackDrag(event)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  emit('rack-over', toRoom(event))
}

function onDragLeave(event) {
  if (!isRackDrag(event) || containerRef.value?.contains(event.relatedTarget)) return
  emit('rack-over', null)
}

function onDrop(event) {
  if (!isRackDrag(event)) return
  event.preventDefault()
  emit('rack-drop', toRoom(event))
}

const hover = ref(null)

function showTip(entry, event) {
  if (gesture?.type === 'item') return
  const box = containerRef.value?.getBoundingClientRect()
  if (!box) return
  let x
  let y
  if (event?.clientX != null) {
    x = event.clientX - box.left + 14
    y = event.clientY - box.top + 14
  } else {
    const rect = event?.currentTarget?.getBoundingClientRect?.()
    x = rect ? rect.right - box.left + 8 : 16
    y = rect ? rect.top - box.top : 16
  }
  hover.value = {
    rack: entry.rack,
    x: Math.min(x, box.width - 240),
    y: Math.min(y, box.height - 170),
  }
}

function hideTip() {
  hover.value = null
}

function onRackEnter(entry, event) {
  hoveredKey.value = entry.key
  showTip(entry, event)
}

function onRackLeave(entry) {
  if (hoveredKey.value === entry.key) hoveredKey.value = null
  hideTip()
}

/** In edit mode a plain click is the drag gesture's; Enter still activates. */
function rackBindings(entry) {
  return navBindings(props.targetFor(entry.rack), (event) => {
    if (!props.editMode) emit('select', entry.rack)
    else if (event.type === 'keydown') emit('activate', entry.key)
  })
}

function onItemKeydown(key, event) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  emit('activate', key)
}

let observer = null
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    size.value = { width: entry.contentRect.width, height: entry.contentRect.height }
  })
  if (containerRef.value) observer.observe(containerRef.value)
})
onBeforeUnmount(() => observer?.disconnect())

watch(size, () => {
  if (viewIsFit) fit()
})

defineExpose({ fit, viewCentre })
</script>

<template>
  <!-- The container only takes drops; the racks dropped here are in the side list. -->
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
  <div
    ref="containerRef"
    class="fp-canvas"
    :class="{
      'fp-canvas--edit': editMode,
      'fp-canvas--backdrop': backdropEditing,
      'fp-canvas--calibrate': calibrating,
    }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Double-click by a wall adds a corner; the "+" handles of a selected corner do it by key. -->
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
    <svg
      ref="svgRef"
      class="fp-svg"
      :viewBox="`${view.x} ${view.y} ${view.w} ${view.h}`"
      preserveAspectRatio="xMidYMid meet"
      role="group"
      :aria-label="`Floor plan of ${plan.name}`"
      :style="resizing ? { cursor: resizing.cursor } : undefined"
      @wheel="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="onDoubleClick"
      @contextmenu="onContextMenu"
    >
      <defs>
        <clipPath :id="`fp-clip-${plan.roomId}`">
          <polygon :points="svgPoints(outline)" />
        </clipPath>
        <pattern
          :id="`fp-nodata-${plan.roomId}`"
          patternUnits="userSpaceOnUse"
          :width="px(6)"
          :height="px(6)"
          patternTransform="rotate(45)"
        >
          <rect :width="px(6)" :height="px(6)" class="fp-nodata-bg" />
          <line x1="0" y1="0" x2="0" :y2="px(6)" class="fp-nodata-line" :stroke-width="px(1.5)" />
        </pattern>
        <pattern
          v-if="showDots"
          :id="`fp-dots-${plan.roomId}`"
          patternUnits="userSpaceOnUse"
          :x="(plan.gridOriginX ?? 0) - plan.gridTileSize / 2"
          :y="(plan.gridOriginY ?? 0) - plan.gridTileSize / 2"
          :width="plan.gridTileSize"
          :height="plan.gridTileSize"
        >
          <circle
            :cx="plan.gridTileSize / 2"
            :cy="plan.gridTileSize / 2"
            :r="px(1.1)"
            class="fp-dot"
          />
        </pattern>
        <pattern
          :id="`fp-outside-${plan.roomId}`"
          patternUnits="userSpaceOnUse"
          :width="px(7)"
          :height="px(7)"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" :y2="px(7)" class="fp-outside-line" :stroke-width="px(1)" />
        </pattern>
      </defs>

      <rect
        v-if="showDots"
        :x="view.x"
        :y="view.y"
        :width="view.w"
        :height="view.h"
        :fill="`url(#fp-dots-${plan.roomId})`"
      />
      <!-- The part of the room's bounding box outside its walls. -->
      <rect
        v-if="roomBounds"
        :x="roomBounds.minX"
        :y="roomBounds.minY"
        :width="roomBounds.maxX - roomBounds.minX"
        :height="roomBounds.maxY - roomBounds.minY"
        :fill="`url(#fp-outside-${plan.roomId})`"
      />
      <polygon :points="svgPoints(outline)" class="fp-floor" />
      <image
        v-if="backdrop"
        :href="backdrop.url"
        :x="backdrop.x"
        :y="backdrop.y"
        :width="backdrop.width"
        :height="backdrop.height"
        preserveAspectRatio="none"
        class="fp-backdrop"
        :style="{ opacity: backdropOpacity }"
      />

      <g v-if="showGrid && roomBounds" :clip-path="`url(#fp-clip-${plan.roomId})`" class="fp-grid">
        <line
          v-for="x in grid.xs"
          :key="`x${x}`"
          :x1="x"
          :x2="x"
          :y1="roomBounds.minY"
          :y2="roomBounds.maxY"
          vector-effect="non-scaling-stroke"
        />
        <line
          v-for="y in grid.ys"
          :key="`y${y}`"
          :y1="y"
          :y2="y"
          :x1="roomBounds.minX"
          :x2="roomBounds.maxX"
          vector-effect="non-scaling-stroke"
        />
      </g>

      <g class="fp-aisles">
        <g v-for="(aisle, i) in aisles" :key="`a${i}`">
          <rect
            :x="aisle.x"
            :y="aisle.y"
            :width="aisle.width"
            :height="aisle.height"
            :class="aisle.kind === 'hot' ? 'fp-aisle-hot' : 'fp-aisle-cold'"
          />
          <text
            v-if="aisleLabels[i]"
            :x="aisle.x + aisle.width / 2"
            :y="aisle.y + aisle.height / 2"
            text-anchor="middle"
            dominant-baseline="central"
            class="fp-aisle-label"
            :font-size="px(10)"
            :transform="
              turnAt(aisleLabels[i], aisle.x + aisle.width / 2, aisle.y + aisle.height / 2)
            "
          >
            {{ aisle.kind === 'hot' ? 'HOT AISLE' : 'COLD AISLE' }}
          </text>
        </g>
      </g>

      <!-- Under the racks and elements; only the cursor: a double-click near a wall adds a corner. -->
      <g v-if="editMode && !backdropMode" class="fp-wall-hits">
        <line
          v-for="(wall, i) in walls"
          :key="`w${i}`"
          :x1="wall.from.x"
          :y1="wall.from.y"
          :x2="wall.to.x"
          :y2="wall.to.y"
          class="fp-wall-hit"
          :stroke-width="px(WALL_REACH * 2)"
        />
      </g>

      <g class="fp-elements">
        <!-- A button in edit mode; in view mode the handlers return at once. -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
        <g
          v-for="(entry, i) in elements"
          :key="entry.element.id"
          :class="[
            `fp-el fp-el-${entry.element.type.toLowerCase()}`,
            { selected: selectedKeys.has(entry.key), warned: warnedKeys.has(entry.key) },
          ]"
          :data-key="entry.key"
          :role="editMode ? 'button' : undefined"
          :tabindex="editMode ? 0 : undefined"
          :aria-label="editMode ? entry.element.name || entry.element.type : undefined"
          @pointerdown="onItemPointerDown(entry.key, $event)"
          @keydown="editMode && onItemKeydown(entry.key, $event)"
        >
          <polygon :points="svgPoints(entry.corners)" vector-effect="non-scaling-stroke" />
          <template v-if="entry.element.type === 'STAIRS'">
            <line
              :x1="entry.corners[0][0]"
              :y1="entry.corners[0][1]"
              :x2="entry.corners[2][0]"
              :y2="entry.corners[2][1]"
              vector-effect="non-scaling-stroke"
            />
            <line
              :x1="entry.corners[1][0]"
              :y1="entry.corners[1][1]"
              :x2="entry.corners[3][0]"
              :y2="entry.corners[3][1]"
              vector-effect="non-scaling-stroke"
            />
          </template>
          <polygon
            v-if="editMode && (selectedKeys.has(entry.key) || warnedKeys.has(entry.key))"
            :points="svgPoints(entry.corners)"
            class="fp-mark"
            vector-effect="non-scaling-stroke"
          />
          <text
            v-if="elementLabels[i]"
            :x="entry.cx"
            :y="entry.cy"
            text-anchor="middle"
            dominant-baseline="central"
            class="fp-el-label"
            :font-size="px(10.5)"
            :transform="turnAt(elementLabels[i], entry.cx, entry.cy)"
          >
            {{ entry.element.name }}
          </text>
          <title>{{ entry.element.name || entry.element.type }}</title>
        </g>
      </g>

      <polygon :points="svgPoints(outline)" class="fp-wall" vector-effect="non-scaling-stroke" />

      <g v-if="showGridLabels && roomBounds" class="fp-grid-labels" :font-size="px(10)">
        <text
          v-for="column in grid.columns"
          :key="`c${column.x}`"
          :x="column.x"
          :y="roomBounds.minY - px(8)"
          text-anchor="middle"
        >
          {{ column.label }}
        </text>
        <text
          v-for="row in grid.rows"
          :key="`r${row.y}`"
          :x="roomBounds.minX - px(8)"
          :y="row.y"
          text-anchor="end"
          dominant-baseline="central"
        >
          {{ row.label }}
        </text>
      </g>

      <g class="fp-racks">
        <g
          v-for="(entry, i) in racks"
          :key="entry.rack.id"
          class="fp-rack"
          :class="{ selected: selectedKeys.has(entry.key), warned: warnedKeys.has(entry.key) }"
          :data-key="entry.key"
          role="button"
          :aria-label="entry.rack.name"
          v-bind="rackBindings(entry)"
          @pointerdown="onItemPointerDown(entry.key, $event)"
          @pointerenter="onRackEnter(entry, $event)"
          @pointermove="showTip(entry, $event)"
          @pointerleave="onRackLeave(entry)"
          @focus="onRackEnter(entry, $event)"
          @blur="onRackLeave(entry)"
        >
          <polygon
            :points="svgPoints(entry.corners)"
            class="fp-rack-body"
            :fill="looks[i].fill ?? nodataFill"
            :style="looks[i].edge ? { stroke: looks[i].edge } : undefined"
            vector-effect="non-scaling-stroke"
          />
          <polygon
            :points="svgPoints(entry.band)"
            class="fp-rack-front"
            :style="looks[i].band ? { fill: looks[i].band } : undefined"
          />
          <polygon
            v-if="entry.arrow && entry.bandSize * pxPerMm >= MIN_ARROW_BAND_PX"
            :points="svgPoints(entry.arrow)"
            class="fp-rack-arrow"
            :fill="looks[i].fill ?? nodataFill"
          />
          <polygon
            v-if="looks[i].ring"
            :points="svgPoints(offsetRectangle(entry.corners, -px(1.75)))"
            class="fp-rack-ring"
            :stroke="looks[i].ring"
            vector-effect="non-scaling-stroke"
          />
          <polygon
            v-if="editMode && warnedKeys.has(entry.key)"
            :points="svgPoints(entry.corners)"
            class="fp-mark"
            vector-effect="non-scaling-stroke"
          />
          <text
            v-if="rackLabels[i]"
            :x="entry.cx"
            :y="entry.cy"
            text-anchor="middle"
            dominant-baseline="central"
            class="fp-rack-label"
            :font-size="px(rackLabels[i].size)"
            :style="looks[i].label ? { fill: looks[i].label } : undefined"
          >
            {{ rackLabels[i].text }}
          </text>
        </g>
      </g>

      <g class="fp-rack-rings">
        <g v-for="mark in rackRings" :key="mark.key" :class="`fp-rack-ring--${mark.kind}`">
          <polygon
            :points="svgPoints(mark.gap)"
            class="fp-ring-gap"
            :stroke-width="RING_GAP"
            vector-effect="non-scaling-stroke"
          />
          <polygon
            :points="svgPoints(mark.ring)"
            class="fp-ring"
            :stroke-width="RING_WIDTH[mark.kind]"
            vector-effect="non-scaling-stroke"
          />
        </g>
      </g>

      <polygon
        v-if="ghost"
        :points="svgPoints(ghost)"
        class="fp-ghost"
        vector-effect="non-scaling-stroke"
      />

      <g v-if="editMode && !backdropMode" class="fp-outline-edit">
        <rect
          v-for="vertex in vertices"
          :key="vertex.key"
          :x="vertex.x - px(5)"
          :y="vertex.y - px(5)"
          :width="px(10)"
          :height="px(10)"
          class="fp-vertex"
          :class="{ selected: selectedKeys.has(vertex.key) }"
          :data-key="vertex.key"
          vector-effect="non-scaling-stroke"
          role="button"
          tabindex="0"
          :aria-label="`Corner ${vertex.index + 1}`"
          @pointerdown="onItemPointerDown(vertex.key, $event)"
          @keydown="onItemKeydown(vertex.key, $event)"
        />
        <g
          v-for="handle in insertHandles"
          :key="`i${handle.edge}`"
          class="fp-insert"
          role="button"
          tabindex="0"
          aria-label="Add a corner here"
          @pointerdown.stop
          @click="emit('insert-vertex', { edge: handle.edge, point: handle })"
          @keydown.enter.prevent="emit('insert-vertex', { edge: handle.edge, point: handle })"
        >
          <circle :cx="handle.x" :cy="handle.y" :r="px(7)" vector-effect="non-scaling-stroke" />
          <path
            :d="`M ${handle.x - px(3.5)} ${handle.y} H ${handle.x + px(3.5)} M ${handle.x} ${handle.y - px(3.5)} V ${handle.y + px(3.5)}`"
            vector-effect="non-scaling-stroke"
          />
        </g>
      </g>

      <!-- For the pointer only: Width and Depth in the side panel are the keyboard path. -->
      <g v-if="resize" class="fp-resize" :data-key="resize.entry.key" aria-hidden="true">
        <rect
          v-for="handle in resize.handles"
          :key="handle.id"
          :x="handle.x - px(HANDLE_PX / 2)"
          :y="handle.y - px(HANDLE_PX / 2)"
          :width="px(HANDLE_PX)"
          :height="px(HANDLE_PX)"
          :transform="`rotate(${resize.element.rotation} ${handle.x} ${handle.y})`"
          class="fp-handle"
          :style="{ cursor: handle.cursor }"
          :data-handle="handle.id"
          vector-effect="non-scaling-stroke"
          @pointerdown="onHandlePointerDown(handle, $event)"
        />
        <text
          v-if="resizing?.moved"
          :x="resize.entry.cx"
          :y="resize.readoutY"
          text-anchor="middle"
          dominant-baseline="central"
          class="fp-readout"
          :font-size="px(11)"
          :stroke-width="px(3)"
        >
          {{ resize.element.width }} &times; {{ resize.element.depth }}
        </text>
      </g>

      <!-- For the pointer only: arrows and the side panel's fields are the keyboard path. -->
      <g v-if="backdropFrame" class="fp-backdrop-edit" aria-hidden="true">
        <rect
          :x="backdropFrame.x"
          :y="backdropFrame.y"
          :width="backdropFrame.width"
          :height="backdropFrame.height"
          class="fp-backdrop-frame"
          vector-effect="non-scaling-stroke"
        />
        <rect
          :x="backdropFrame.x"
          :y="backdropFrame.y"
          :width="backdropFrame.width"
          :height="backdropFrame.height"
          class="fp-backdrop-surface"
          @pointerdown="onBackdropPointerDown('move', 'move', $event)"
        />
        <rect
          v-for="handle in backdropFrame.handles"
          :key="handle.id"
          :x="handle.x - px(HANDLE_PX / 2)"
          :y="handle.y - px(HANDLE_PX / 2)"
          :width="px(HANDLE_PX)"
          :height="px(HANDLE_PX)"
          class="fp-handle"
          :style="{ cursor: handle.cursor }"
          :data-handle="handle.id"
          vector-effect="non-scaling-stroke"
          @pointerdown="onBackdropPointerDown(handle.id, handle.cursor, $event)"
        />
      </g>

      <g v-if="backdropEditing && calibration" class="fp-calibration">
        <line
          v-if="calibration.points.length === 2"
          :x1="calibration.points[0].x"
          :y1="calibration.points[0].y"
          :x2="calibration.points[1].x"
          :y2="calibration.points[1].y"
          vector-effect="non-scaling-stroke"
        />
        <g v-for="(point, i) in calibration.points" :key="i">
          <circle :cx="point.x" :cy="point.y" :r="px(6)" vector-effect="non-scaling-stroke" />
          <path
            :d="`M ${point.x - px(10)} ${point.y} H ${point.x + px(10)} M ${point.x} ${point.y - px(10)} V ${point.y + px(10)}`"
            vector-effect="non-scaling-stroke"
          />
        </g>
      </g>

      <rect
        v-if="marquee"
        :x="Math.min(marquee.x, marquee.x2)"
        :y="Math.min(marquee.y, marquee.y2)"
        :width="Math.abs(marquee.x2 - marquee.x)"
        :height="Math.abs(marquee.y2 - marquee.y)"
        class="fp-marquee"
        vector-effect="non-scaling-stroke"
      />
    </svg>

    <div v-if="$slots.controls" class="fp-controls">
      <slot name="controls" />
    </div>

    <div class="fp-zoom">
      <Button
        icon="pi pi-expand"
        size="small"
        severity="secondary"
        text
        v-tooltip.left="'Fit to view'"
        aria-label="Fit to view"
        @click="fit"
      />
      <Button
        icon="pi pi-plus"
        size="small"
        severity="secondary"
        text
        v-tooltip.left="'Zoom in'"
        aria-label="Zoom in"
        @click="zoomBy(1 / 1.25)"
      />
      <Button
        icon="pi pi-minus"
        size="small"
        severity="secondary"
        text
        v-tooltip.left="'Zoom out'"
        aria-label="Zoom out"
        @click="zoomBy(1.25)"
      />
    </div>

    <div
      v-if="hover"
      class="fp-tip"
      :style="{ left: `${Math.max(8, hover.x)}px`, top: `${Math.max(8, hover.y)}px` }"
    >
      <slot name="tooltip" :rack="hover.rack" />
    </div>
  </div>
</template>

<style scoped>
.fp-canvas {
  --fp-ink: var(--p-text-color);
  /* The floor, and what marks on it are mixed against. */
  --fp-bg: var(--p-content-background);
  /* The table the room lies on. */
  --fp-ground: var(--p-surface-ground);
  --fp-warn: var(--p-amber-500);
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--fp-ground);
}

html.app-dark .fp-canvas {
  --fp-warn: var(--p-amber-400);
}

.fp-svg {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
  user-select: none;
}

.fp-svg:active {
  cursor: grabbing;
}

.fp-floor {
  fill: var(--fp-bg);
}

.fp-dot {
  fill: color-mix(in srgb, var(--fp-ink) 20%, var(--fp-ground));
}

.fp-outside-line {
  stroke: color-mix(in srgb, var(--fp-ink) 16%, var(--fp-ground));
}


.fp-grid line {
  stroke: color-mix(in srgb, var(--fp-ink) 11%, var(--fp-bg));
  stroke-width: 1;
}

.fp-wall {
  fill: none;
  stroke: color-mix(in srgb, var(--fp-ink) 75%, var(--fp-bg));
  stroke-width: 2.5;
  stroke-linejoin: round;
  pointer-events: none;
}

.fp-aisle-cold {
  fill: color-mix(in srgb, #3987e5 14%, transparent);
}

.fp-aisle-hot {
  fill: color-mix(in srgb, #e34948 13%, transparent);
}

.fp-aisles {
  pointer-events: none;
}

.fp-aisle-label,
.fp-grid-labels text,
.fp-el-label {
  fill: var(--p-text-muted-color);
  font-family: var(--font-mono, ui-monospace, monospace);
  letter-spacing: 0.04em;
  pointer-events: none;
}

.fp-el polygon,
.fp-el line {
  fill: color-mix(in srgb, var(--fp-ink) 13%, var(--fp-bg));
  stroke: color-mix(in srgb, var(--fp-ink) 40%, var(--fp-bg));
  stroke-width: 1;
}

.fp-el-column polygon,
.fp-el-wall polygon {
  fill: color-mix(in srgb, var(--fp-ink) 70%, var(--fp-bg));
}

.fp-el-door polygon,
.fp-el-ramp polygon {
  stroke-dasharray: 4 3;
}

.fp-el-door polygon {
  opacity: 0.6;
}

.fp-el-ramp polygon,
.fp-el-stairs polygon {
  fill: none;
}

.fp-canvas--edit .fp-el {
  cursor: move;
  outline: none;
}

/* Outline-only shapes still take a press anywhere inside them. */
.fp-canvas--edit .fp-el polygon:not(.fp-mark) {
  pointer-events: all;
}

.fp-canvas--edit .fp-el:hover polygon:first-child,
.fp-canvas--edit .fp-el:focus-visible polygon:first-child {
  stroke: var(--fp-ink);
  stroke-width: 2;
}

.fp-el .fp-mark,
.fp-rack .fp-mark {
  fill: none;
  stroke-width: 2.5;
  pointer-events: none;
}

.fp-el.warned .fp-mark,
.fp-rack.warned .fp-mark {
  stroke: var(--fp-warn);
  stroke-dasharray: 6 3;
}

.fp-el.selected .fp-mark {
  stroke: var(--fp-ink);
  stroke-width: 3;
  stroke-dasharray: none;
  opacity: 1;
}

.fp-nodata-bg {
  fill: color-mix(in srgb, var(--fp-ink) 6%, var(--fp-bg));
}

.fp-nodata-line {
  stroke: color-mix(in srgb, var(--fp-ink) 22%, var(--fp-bg));
}

.fp-rack {
  cursor: pointer;
  outline: none;
}

.fp-canvas--edit .fp-rack {
  cursor: move;
}

.fp-rack-body {
  stroke: color-mix(in srgb, var(--fp-ink) 70%, var(--fp-bg));
  stroke-width: 1;
}

.fp-rack-front,
.fp-rack-arrow {
  pointer-events: none;
}

.fp-rack-front {
  fill: color-mix(in srgb, var(--fp-ink) 80%, var(--fp-bg));
}

.fp-rack-ring {
  fill: none;
  stroke-width: 2.5;
  pointer-events: none;
}

.fp-rack-label {
  fill: var(--fp-ink);
  font-weight: 600;
  pointer-events: none;
}

.fp-readout {
  fill: var(--fp-ink);
  stroke: var(--fp-bg);
  paint-order: stroke;
  stroke-linejoin: round;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.fp-rack-rings {
  pointer-events: none;
}

.fp-rack-rings polygon {
  fill: none;
  stroke-linejoin: round;
}

.fp-ring-gap {
  stroke: var(--fp-bg);
}

.fp-rack-ring--selected .fp-ring {
  stroke: var(--fp-ink);
}

.fp-rack-ring--hover .fp-ring {
  stroke: color-mix(in srgb, var(--fp-ink) 60%, var(--fp-bg));
}

.fp-ghost {
  fill: color-mix(in srgb, var(--p-primary-color) 18%, transparent);
  stroke: var(--p-primary-color);
  stroke-width: 2;
  stroke-dasharray: 6 3;
  pointer-events: none;
}

.fp-wall-hit {
  stroke: transparent;
  cursor: copy;
}

.fp-vertex,
.fp-handle {
  fill: var(--fp-bg);
  stroke: var(--fp-ink);
  stroke-width: 1.5;
  outline: none;
}

.fp-vertex {
  cursor: move;
}

.fp-vertex:hover,
.fp-vertex:focus-visible,
.fp-handle:hover {
  stroke-width: 2.5;
}

.fp-vertex.selected {
  fill: var(--p-primary-color);
  stroke: var(--p-primary-color);
}

.fp-insert {
  cursor: copy;
  outline: none;
}

.fp-insert circle {
  fill: var(--fp-bg);
  stroke: var(--p-primary-color);
  stroke-width: 1.5;
}

.fp-insert path {
  stroke: var(--p-primary-color);
  stroke-width: 1.5;
}

.fp-insert:hover circle,
.fp-insert:focus-visible circle {
  fill: color-mix(in srgb, var(--p-primary-color) 15%, var(--fp-bg));
}

.fp-marquee {
  fill: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
  stroke: var(--p-primary-color);
  stroke-width: 1;
  stroke-dasharray: 4 3;
  pointer-events: none;
}

.fp-canvas--backdrop :is(.fp-aisles, .fp-elements, .fp-racks, .fp-rack-rings) {
  opacity: 0.35;
}

.fp-canvas--backdrop .fp-racks,
.fp-canvas--backdrop .fp-elements,
.fp-canvas--edit.fp-canvas--backdrop .fp-el polygon:not(.fp-mark) {
  pointer-events: none;
}

.fp-canvas--calibrate .fp-svg,
.fp-canvas--calibrate .fp-svg:active {
  cursor: crosshair;
}

.fp-backdrop-frame {
  fill: none;
  stroke: var(--p-primary-color);
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
  pointer-events: none;
}

.fp-backdrop-surface {
  fill: transparent;
  cursor: move;
}

.fp-calibration {
  pointer-events: none;
}

.fp-calibration circle {
  fill: none;
  stroke: var(--p-primary-color);
  stroke-width: 2;
}

.fp-calibration line,
.fp-calibration path {
  stroke: var(--p-primary-color);
  stroke-width: 1.5;
}

.fp-calibration line {
  stroke-dasharray: 5 3;
}

.fp-controls {
  position: absolute;
  top: 0.75rem;
  inset-inline: 0.75rem;
  z-index: 1;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
}

/* A narrow pane wraps the card instead of cutting off its start. */
.fp-controls > :deep(*) {
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 100%;
  pointer-events: auto;
}

.fp-zoom {
  position: absolute;
  bottom: 1.25rem;
  inset-inline-end: 1.25rem;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.2rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 8px;
  background: var(--p-surface-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.fp-tip {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  min-width: 13rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-border-radius-md);
  background: var(--p-content-background);
  box-shadow: 0 6px 18px color-mix(in srgb, #000 14%, transparent);
  font-size: 0.8125rem;
}
</style>
