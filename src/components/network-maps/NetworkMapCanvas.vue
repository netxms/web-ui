<script setup>
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue'
import cytoscape from 'cytoscape'
import { useTheme } from '@/composables/useTheme'
import {
  getDecorations,
  getCanvasBackground,
  getLinkColor,
  getLinkDash,
  getLinkWidth,
  getHeatmapColor,
  getHeatmapWidth,
  resolveLinkVisual,
  linkDefaultsChanged,
  dciContainerLines,
  bendPointsToSegments,
  snapCoord,
  snapPoint,
  resolveMapRenderOptions,
  resolveMapBackdrop,
  GRID_SIZE,
} from '@/utils/networkMapUtils'
import { linkLabelBoxes, groupLabelBoxes } from '@/utils/networkMapLinkLabels'
import {
  createTableLayoutState,
  layoutLabelsWithTables,
  lineDegrees,
  lineSegments,
  nodeExtent,
  nodeOverflowTable,
} from '@/utils/networkMapOverflowTables'
import {
  buildDrawnLinks,
  fanEndpoint,
  groupLinkVisual,
  offsetEndpoints,
} from '@/utils/networkMapParallelLinks'
import { tilesForRect, buildTileUrl, offsetLatLon, TILE_SIZE } from '@/utils/osmTiles'
import { useTileUrl } from '@/composables/useTileUrl'
import { computeNodeVisual, NODE_RADIUS, LABEL_FONT_SIZE } from '@/utils/networkMapNodeVisual'
import { NODE_BORDER_WIDTH, mapIconSurface, paintMapNode } from '@/utils/networkMapNodePaint'
import { ICON_SURFACE, builtinIconComponent, customImageGuids } from '@/utils/objectIcons'
import { useObjectIcons } from '@/composables/useObjectIcons'
import NetworkMapLinkLabel from './NetworkMapLinkLabel.vue'
import MapNodeFigure from './MapNodeFigure.vue'
import MapIconMasks from './MapIconMasks.vue'
import NetworkMapLabelLeaders from './NetworkMapLabelLeaders.vue'
import NetworkMapOverflowTable from './NetworkMapOverflowTable.vue'
import { computeDisplayName } from '@/utils/topologyUtils'
import { LAYOUT_RUNNERS } from '@/utils/layoutEngine'

// Bumped per instance so concurrently mounted canvases never share SVG ids.
let gridPatternSeq = 0

const props = defineProps({
  mapData: { type: Object, required: true },
  draggable: { type: Boolean, default: false },
  snapToGrid: { type: Boolean, default: false },
  gridSize: { type: Number, default: GRID_SIZE },
  showGrid: { type: Boolean, default: false },
  heatmapEnabled: { type: Boolean, default: false },
  /** Highlight nodes whose name matches this string; '' = no filter */
  searchTerm: { type: String, default: '' },
  /** Layout/element edit mode — makes base decorations, text boxes and images editable. */
  editMode: { type: Boolean, default: false },
  /** image-library GUID -> resolved data URL, for rendering image decorations. */
  imageUrls: { type: Object, default: () => ({}) },
  /** Current DCI values for link labels and DCI containers, keyed "nodeId:dciId". */
  dciValues: { type: Map, default: () => new Map() },
  /** Hide all link label boxes (connector names, link names, DCI values). */
  hideLinkLabels: { type: Boolean, default: false },
  /** Hide the links themselves (and, implicitly, their labels). */
  hideLinks: { type: Boolean, default: false },
  /** More NORMAL links than this between two elements draw as one line; 0 never merges. */
  linkMergeThreshold: { type: Number, default: 0 },
  overflowTables: { type: Boolean, default: true },
  /**
   * Dragged overflow tables by node element id: table centre minus node centre, graph units.
   * Null keeps them in this canvas only.
   */
  tableOffsets: { type: Object, default: null },
  /** Modal: dragging the geographic backdrop repositions the map center (legacy "grab the map"). */
  geoPickMode: { type: Boolean, default: false },
})

const emit = defineEmits([
  'node-dblclick',
  'node-middleclick',
  'node-contextmenu',
  'zone-select',
  'zone-contextmenu',
  'image-region-select',
  'draw-mode-change',
  'node-select',
  'edge-select',
  'edge-contextmenu',
  'box-select-change',
  'layout-applied',
  'canvas-contextmenu',
  'viewport-change',
  'node-moved',
  // real-element editing (base decorations / text boxes / images)
  'element-select',
  'element-contextmenu',
  'element-updated',
  // link bend-point editing
  'link-updated',
  // geographic backdrop repositioning ("Pick on map")
  'geo-center-change',
  // an overflow table dragged, or put back (see tableOffsets)
  'update:tableOffsets',
])

const canvasWrapRef = ref(null)
const cyContainerRef = ref(null)
const overlayGroupRef = ref(null)
const backdropGroupRef = ref(null)
const leaderGroupRef = ref(null)

const { isDark } = useTheme()
const { tileUrl } = useTileUrl()

let cy = null
let textCtx = null
// Reactive: it is created in onMounted, after the first render, and the text-box /
// DCI-container overlays must re-measure once it exists.
const boxMeasureCtx = shallowRef(null)
let resizeObserver = null
let fontFamily = 'inherit'
const extraNodeIds = new Set()

const zoomLevel = ref(1)
const panOffset = ref({ x: 0, y: 0 })
const iconNodes = ref([])

// Below this on-screen pitch the grid lines merge into a solid wash, so the
// grid is dropped instead of drawn.
const MIN_GRID_SCREEN_PITCH = 6

const gridVisible = computed(
  () => props.showGrid && props.gridSize * zoomLevel.value >= MIN_GRID_SCREEN_PITCH,
)

// Screen pixels. An SVG pattern, not a tiled CSS background: a fractional
// `background-size` rounds each tile independently and drops or doubles lines.
const gridPitch = computed(() => props.gridSize * zoomLevel.value)

const gridPatternId = `network-map-grid-${++gridPatternSeq}`
const backdropClipId = `network-map-bg-clip-${gridPatternSeq}`

/**
 * A move snaps the top-left corner; a resize snaps both corners, with the minimum extent
 * rounded up to a whole cell.
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {string} type - 'move' or a 'resize-*' handle
 * @param {number} minSize
 */
function snapRectInPlace(rect, type, minSize) {
  const gs = props.gridSize
  const x = snapCoord(rect.x, gs)
  const y = snapCoord(rect.y, gs)
  if (type !== 'move') {
    const minExtent = Math.max(gs, Math.ceil(minSize / gs) * gs)
    rect.width = Math.max(minExtent, snapCoord(rect.x + rect.width, gs) - x)
    rect.height = Math.max(minExtent, snapCoord(rect.y + rect.height, gs) - y)
  }
  rect.x = x
  rect.y = y
}

function clientToGraph(clientX, clientY) {
  const pan = cy.pan()
  const zoom = cy.zoom()
  const rect = cyContainerRef.value.getBoundingClientRect()
  return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom }
}

function syncOverlay() {
  if (!cy || !overlayGroupRef.value) return
  const pan = cy.pan()
  const zoom = cy.zoom()
  const transform = `translate(${pan.x} ${pan.y}) scale(${zoom})`
  overlayGroupRef.value.setAttribute('transform', transform)
  if (backdropGroupRef.value) backdropGroupRef.value.setAttribute('transform', transform)
  if (leaderGroupRef.value) leaderGroupRef.value.setAttribute('transform', transform)
  zoomLevel.value = zoom
  panOffset.value = { x: pan.x, y: pan.y }
}

// Replaces cytoscape's wheel zoom, whose scroll-device auto-calibration changes the zoom step
// after the first few events. deltaMode-aware formula from d3-zoom.
function handleWheel(e) {
  if (!cy) return
  e.preventDefault()
  const dy =
    -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.002) * (e.ctrlKey ? 10 : 1)
  const rect = cyContainerRef.value.getBoundingClientRect()
  cy.zoom({
    level: cy.zoom() * Math.pow(2, dy),
    renderedPosition: { x: e.clientX - rect.left, y: e.clientY - rect.top },
  })
}

// Cytoscape only preventDefaults the native contextmenu, so it would also reach the parent
// view's @contextmenu handler; cxttap stays the single source here.
function stopNativeContextMenuBubble(e) {
  e.stopPropagation()
}

// Cytoscape never reports the middle button; resolve it through the hovered node.
function handleContainerAuxClick(e) {
  if (e.button !== 1 || !hoveredNodeId.value) return
  const node = cy?.getElementById(hoveredNodeId.value)
  if (!node?.length) return
  e.preventDefault()
  emit('node-middleclick', { id: node.id(), ...node.data() })
}

// Suppresses the autoscroll cursor Chrome and Firefox open on middle mouse down.
function suppressMiddleMouseDown(e) {
  if (e.button === 1) e.preventDefault()
}

const renderOptions = computed(() => resolveMapRenderOptions(props.mapData))

// MF_TRANSLUCENT_LABEL_BKGND set: the legacy figures paint only the status tint; clear: a
// solid plate is filled underneath first.
const labelPlateOpacity = computed(() => (renderOptions.value.translucentLabelBackground ? 0.8 : 1))

function measureText(text, fontSize = LABEL_FONT_SIZE, fontWeight = 400) {
  if (!textCtx) return text.length * fontSize * 0.6
  textCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  return textCtx.measureText(text).width
}

function rebuildOverlayNodes() {
  if (!cy) return
  const term = props.searchTerm?.toLowerCase()
  const options = renderOptions.value
  const elementsById = new Map(props.mapData.elements.map((e) => [e.id, e]))
  iconNodes.value = cy.nodes('.object').map((n) => {
    const displayName = n.data('displayName')
    const status = n.data('objectStatus') ?? 5
    const element = elementsById.get(n.id())
    return {
      id: n.id(),
      x: n.position().x,
      y: n.position().y,
      // The icon is resolved in paintedNodes rather than here: custom images arrive after
      // the rebuild, and must not cost one.
      element,
      name: n.data('name'),
      displayName,
      ...paintMapNode({ element, displayName, status, options, measureText, dark: isDark.value }),
      dimmed: term ? !n.data('name')?.toLowerCase().includes(term) : false,
    }
  })
}

const objectIcons = useObjectIcons()

const iconSurface = computed(() => mapIconSurface(renderOptions.value.displayMode))

// Map images are loaded only where a map shows them; category icons are always loaded.
objectIcons?.want(() =>
  iconSurface.value === ICON_SURFACE.MAP
    ? customImageGuids(
        (props.mapData.elements ?? []).filter((e) => e.type === 'object'),
        ICON_SURFACE.MAP,
        objectIcons.categoriesById.value,
      )
    : [],
)

function nodeIcon(element) {
  if (!element) return null
  return objectIcons
    ? objectIcons.resolve(element, iconSurface.value)
    : { kind: 'builtin', component: builtinIconComponent(element, iconSurface.value) }
}

// Per canvas instance, like the grid pattern: several canvases can share a page.
const iconMaskPrefix = `network-map-${gridPatternSeq}`

// Selected nodes paint last: the stylesheet raises their z-index too, so what is drawn on
// top is also what a click hits.
const paintedNodes = computed(() => {
  const selected = new Set(selectedNodes.value)
  const nodes = iconNodes.value.map((node) => {
    const isSelected = selected.has(node.id)
    let boxStroke = { color: node.stroke, width: NODE_BORDER_WIDTH }
    if (flashingNodes.value.has(node.id)) boxStroke = { color: '#ef4444', width: 4 }
    else if (isSelected) boxStroke = { color: '#60a5fa', width: 3.5 }
    return { ...node, selected: isSelected, boxStroke, icon: nodeIcon(node.element) }
  })
  return [...nodes.filter((n) => !n.selected), ...nodes.filter((n) => n.selected)]
})

/** One `<mask>` per glyph-style image the painted nodes use. */
const glyphIconMasks = computed(() => {
  const byGuid = new Map()
  for (const node of paintedNodes.value) {
    if (node.icon?.kind === 'glyph')
      byGuid.set(node.icon.guid, { guid: node.icon.guid, url: node.icon.url })
  }
  return [...byGuid.values()]
})

// Link labels live in the SVG overlay: cytoscape has only three label slots per edge, and a
// link needs up to three multi-line boxes.
const edgeLabels = ref([])

const placedTables = ref([])

// By edge id: one link or a merged group, with its fan offset. Not reactive.
let drawnLinksById = new Map()

// Each layout starts from the previous one, so labels ease aside during a drag instead of
// jumping.
const labelLayoutState = createTableLayoutState()

/** fitContent's padding: tables are kept inside the nodes' extent grown by it. */
const FIT_PADDING = 80

let labelFrame = null
let pendingLabelPass = 'warm'

/**
 * Per node: its box (border included) and, in icon mode, the name plate. Graph coordinates
 * from the overlay node list, so rebuildOverlayNodes() must have run first.
 * @returns {Map<string, { x: number, y: number, w: number, h: number }[]>}
 */
function labelObstacles() {
  const byNode = new Map()
  for (const node of iconNodes.value) {
    const { width, height, plate } = node.visual
    const boxes = [
      { x: node.x, y: node.y, w: width + NODE_BORDER_WIDTH, h: height + NODE_BORDER_WIDTH },
    ]
    if (plate) {
      boxes.push({
        x: node.x + plate.x + plate.width / 2,
        y: node.y + plate.y + plate.height / 2,
        w: plate.width,
        h: plate.height,
      })
    }
    byNode.set(node.id, boxes)
  }
  return byNode
}

/**
 * @param {'warm' | 'settle'} [pass] - 'warm' for a drag frame or a value refresh, 'settle'
 *   after a drop or a rebuild
 */
function rebuildOverlayEdgeLabels(pass = 'warm') {
  // Runs now instead of the pending frame, and at least as thoroughly.
  if (labelFrame !== null) {
    cancelAnimationFrame(labelFrame)
    labelFrame = null
    if (pendingLabelPass === 'settle') pass = 'settle'
    pendingLabelPass = 'warm'
  }
  if (!cy || props.hideLinkLabels || props.hideLinks) {
    edgeLabels.value = []
    placedTables.value = []
    clearTableRowHover()
    return
  }
  const boxes = []
  const lines = []
  const segments = []

  for (const ele of cy.edges()) {
    const drawn = drawnLinksById.get(ele.id())
    if (!drawn) continue
    // A fanned line's labels ride its own offset line, not the centre line.
    const { source, target } = offsetEndpoints(
      ele.source().position(),
      ele.target().position(),
      drawn.fanOffset,
    )
    // Live absolute bend points, updated during bend drags.
    const bendPoints = ele.data('bendPoints') ?? []
    const common = {
      edgeId: ele.id(),
      source,
      target,
      sourceId: ele.source().id(),
      targetId: ele.target().id(),
      dciValues: props.dciValues,
      measureText,
    }
    const built =
      drawn.kind === 'group'
        ? groupLabelBoxes({ group: drawn, ...common })
        : linkLabelBoxes({ link: drawn.link, ...common, bendPoints })
    const color = edgeLineColor(ele)
    for (const box of built) box.color = color
    boxes.push(...built)
    const points = [source, ...bendPoints, target]
    segments.push(...lineSegments(common.edgeId, points))
    lines.push({ ...common, drawn, points, color })
  }

  const nodeBoxes = labelObstacles()
  const nodesById = new Map(iconNodes.value.map((node) => [node.id, node]))
  const nodeInfo = (id) => {
    const node = nodesById.get(id)
    return node && { name: node.displayName, statusColor: node.statusColor }
  }
  const { labels, tables } = layoutLabelsWithTables(boxes, {
    nodeBoxes,
    segments,
    degrees: lineDegrees(lines),
    state: labelLayoutState,
    enabled: props.overflowTables,
    buildTable: (nodeId) =>
      nodeOverflowTable(nodeId, lines, { nodeInfo, dciValues: props.dciValues, measureText }),
    offsets: currentTableOffsets(),
    bounds: nodeExtent(nodeBoxes, FIT_PADDING),
    pass,
  })
  edgeLabels.value = labels
  placedTables.value = tables
  // A table that went away under the pointer never reports the pointer leaving.
  const row = hoveredTableRow.value
  if (row && !tables.some((t) => t.rows.some((r) => r.key === row.key))) clearTableRowHover()
}

/**
 * A drag fires `drag` for every dragged node; one layout per frame is plenty. A pending
 * 'settle' is not downgraded by a later 'warm'.
 * @param {'warm' | 'settle'} [pass]
 */
function scheduleLabelLayout(pass = 'warm') {
  if (pass === 'settle') pendingLabelPass = 'settle'
  if (labelFrame !== null) return
  labelFrame = requestAnimationFrame(() => {
    labelFrame = null
    const scheduled = pendingLabelPass
    pendingLabelPass = 'warm'
    rebuildOverlayEdgeLabels(scheduled)
  })
}

/** Pointer travel (px) before a press on a table counts as a drag. */
const TABLE_DRAG_THRESHOLD = 3

const localTableOffsets = ref({})
const activeTableOffsets = computed(() => props.tableOffsets ?? localTableOffsets.value)

// Not reactive. `offset` stays null until the pointer passes the drag threshold.
let tableDrag = null

function currentTableOffsets() {
  if (!tableDrag?.offset) return activeTableOffsets.value
  return { ...activeTableOffsets.value, [tableDrag.nodeId]: tableDrag.offset }
}

function commitTableOffsets(offsets) {
  localTableOffsets.value = offsets
  emit('update:tableOffsets', offsets)
}

function onTableDragStart(event, table) {
  if (event.button !== 0 || !cy) return
  const node = cy.getElementById(table.nodeId)
  if (!node.length) return
  event.preventDefault()
  clearTableRowHover()
  const centre = node.position()
  tableDrag = {
    nodeId: table.nodeId,
    startX: event.clientX,
    startY: event.clientY,
    base: { x: table.x - centre.x, y: table.y - centre.y },
    offset: null,
  }
  window.addEventListener('mousemove', onTableDragMove)
  window.addEventListener('mouseup', onTableDragEnd)
}

function onTableDragMove(event) {
  if (!tableDrag || !cy) return
  const dx = event.clientX - tableDrag.startX
  const dy = event.clientY - tableDrag.startY
  // A click is not a drag: laying out again on a plain click would get in the
  // way of the double-click that puts a table back.
  if (!tableDrag.offset && Math.hypot(dx, dy) < TABLE_DRAG_THRESHOLD) return
  const zoom = cy.zoom()
  tableDrag.offset = { x: tableDrag.base.x + dx / zoom, y: tableDrag.base.y + dy / zoom }
  scheduleLabelLayout('warm')
}

function onTableDragEnd() {
  window.removeEventListener('mousemove', onTableDragMove)
  window.removeEventListener('mouseup', onTableDragEnd)
  const drag = tableDrag
  tableDrag = null
  if (!drag?.offset) return
  // The offsets watcher settles the layout.
  commitTableOffsets({
    ...activeTableOffsets.value,
    [drag.nodeId]: { x: Math.round(drag.offset.x), y: Math.round(drag.offset.y) },
  })
}

/** Double-click: back to automatic placement. */
function onTableReset(table) {
  if (!activeTableOffsets.value[table.nodeId]) return
  const offsets = { ...activeTableOffsets.value }
  delete offsets[table.nodeId]
  commitTableOffsets(offsets)
}

// Hovering a table row acts like hovering its link.
const hoveredTableRow = ref(null)

function onTableRowEnter(row) {
  if (tableDrag || !cy) return
  clearTableRowHover()
  hoveredTableRow.value = { key: row.key, edgeId: row.edgeId }
  hoveredEdgeId.value = row.edgeId
  cy.getElementById(row.edgeId).addClass('table-row-hot')
}

function onTableRowLeave(row) {
  if (hoveredTableRow.value?.key === row.key) clearTableRowHover()
}

function clearTableRowHover() {
  const row = hoveredTableRow.value
  if (!row) return
  hoveredTableRow.value = null
  if (hoveredEdgeId.value === row.edgeId) hoveredEdgeId.value = null
  cy?.getElementById(row.edgeId).removeClass('table-row-hot')
}

/** Edges whose table rows are lit: hovered or selected. */
const hotTableEdges = computed(() =>
  hoveredEdgeId.value ? [hoveredEdgeId.value, ...selectedEdges.value] : selectedEdges.value,
)

/** @param {'warm' | 'settle'} [pass] */
function rebuildOverlay(pass = 'settle') {
  rebuildOverlayNodes()
  rebuildOverlayEdgeLabels(pass)
}

const selectedNodes = ref([])
const selectedEdges = ref([])
const selectedZoneId = ref(null)
const selectedImageRegionId = ref(null)
// A persisted base element (group box / text box / image) in edit mode, not a demo
// extraZone/extraImageRegion.
const selectedElementId = ref(null)

// Link labels paint beneath node labels; hovering or selecting a link, or either of its
// nodes, promotes its labels above everything.

const hoveredNodeId = ref(null)
const hoveredEdgeId = ref(null)

function isLabelPromoted(box) {
  if (box.edgeId === hoveredEdgeId.value) return true
  if (selectedEdges.value.includes(box.edgeId)) return true
  for (const nodeId of [box.sourceId, box.targetId]) {
    if (nodeId === hoveredNodeId.value) return true
    if (selectedNodes.value.includes(nodeId)) return true
  }
  return false
}

const promotedEdgeLabels = computed(() => edgeLabels.value.filter(isLabelPromoted))
const baseEdgeLabels = computed(() => edgeLabels.value.filter((b) => !isLabelPromoted(b)))

const extraZones = ref([])
const extraImageRegions = ref([])

const baseZones = computed(() =>
  getDecorations(props.mapData.elements)
    .filter((d) => d.decorationType === 'group-box')
    .map((d) => ({ ...d, ...baseGeom(d, d.width ?? 250, d.height ?? 100) })),
)
const baseImageRegions = computed(() =>
  getDecorations(props.mapData.elements).filter((d) => d.decorationType === 'image-region'),
)
const allZones = computed(() => [...baseZones.value, ...extraZones.value])
const allImageRegions = computed(() => [...baseImageRegions.value, ...extraImageRegions.value])

const canvasBackground = computed(() => getCanvasBackground(props.mapData.background))
const wrapStyle = computed(() => ({ background: canvasBackground.value }))

const mapBackdrop = computed(() => resolveMapBackdrop(props.mapData))

// The 'default' and 'center' modes draw the image unscaled, and SVG <image> needs explicit
// dimensions.
const backdropImageNatural = ref(null)
watch(
  () =>
    mapBackdrop.value.type === 'image' ? (props.imageUrls?.[mapBackdrop.value.guid] ?? null) : null,
  (url) => {
    backdropImageNatural.value = null
    if (!url) return
    const probe = new Image()
    probe.onload = () => {
      backdropImageNatural.value = { w: probe.naturalWidth, h: probe.naturalHeight }
    }
    probe.src = url
  },
  { immediate: true },
)

const backdropImage = computed(() => {
  const b = mapBackdrop.value
  if (b.type !== 'image') return null
  const url = props.imageUrls?.[b.guid] ?? null
  if (!url) return null
  const { w, h } = b.page
  const nat = backdropImageNatural.value

  if (b.mode === 'fit' && w > 0 && h > 0) {
    return { url, x: 0, y: 0, width: w, height: h, preserve: 'none' }
  }
  if (!nat) return null
  if (b.mode === 'center') {
    const pw = w > 0 ? w : nat.w
    const ph = h > 0 ? h : nat.h
    return {
      url,
      x: Math.round((pw - nat.w) / 2),
      y: Math.round((ph - nat.h) / 2),
      width: nat.w,
      height: nat.h,
      preserve: 'xMidYMid meet',
    }
  }
  // Also fit with no page.
  return { url, x: 0, y: 0, width: nat.w, height: nat.h, preserve: 'xMidYMid meet' }
})

const backdropTiles = computed(() => {
  const b = mapBackdrop.value
  if (b.type !== 'geo') return []
  const template = tileUrl.value
  return tilesForRect(b.lat, b.lon, b.zoom, b.page.w, b.page.h).map((t) => ({
    key: `${t.x}:${t.y}`,
    x: t.px,
    y: t.py,
    href: buildTileUrl(template, t.x, t.y, b.zoom),
  }))
})

// Only where the background fills the page rectangle; a native-size image ignores the size.
const backdropBoundary = computed(() => {
  const b = mapBackdrop.value
  if (b.type === 'geo') return { w: b.page.w, h: b.page.h }
  if (b.type === 'image' && b.mode !== 'default' && b.page.w > 0 && b.page.h > 0) {
    return { w: b.page.w, h: b.page.h }
  }
  return null
})

const geoPickActive = computed(() => props.geoPickMode && mapBackdrop.value.type === 'geo')

const geoDragState = ref(null)

function onGeoDragMousedown(event) {
  if (event.button !== 0) return
  const b = mapBackdrop.value
  if (b.type !== 'geo') return
  // Deltas are measured from this snapshot, so the live-updating backdrop never feeds back.
  geoDragState.value = {
    startClientX: event.clientX,
    startClientY: event.clientY,
    lat: b.lat,
    lon: b.lon,
    zoom: b.zoom,
  }
  window.addEventListener('mousemove', onGeoDragMove)
  window.addEventListener('mouseup', onGeoDragUp)
}

function onGeoDragMove(event) {
  const s = geoDragState.value
  if (!s) return
  const dx = (event.clientX - s.startClientX) / zoomLevel.value
  const dy = (event.clientY - s.startClientY) / zoomLevel.value
  const { lat, lon } = offsetLatLon(s.lat, s.lon, s.zoom, dx, dy)
  emit('geo-center-change', {
    lat: Math.round(lat * 1e6) / 1e6,
    lon: Math.round(lon * 1e6) / 1e6,
  })
}

function onGeoDragUp() {
  window.removeEventListener('mousemove', onGeoDragMove)
  window.removeEventListener('mouseup', onGeoDragUp)
  geoDragState.value = null
}

const baseDragState = ref(null)
const baseResizeState = ref(null)
const MIN_BASE_SIZE = 24

function baseElemPos(el) {
  const s = baseDragState.value
  if (s && s.id === el.id) return { x: s.curX, y: s.curY }
  return { x: el.x, y: el.y }
}

function baseGeom(el, w, h) {
  const rs = baseResizeState.value
  if (rs && rs.id === el.id) return { x: rs.curX, y: rs.curY, width: rs.curW, height: rs.curH }
  const drag = baseDragState.value
  if (drag && drag.id === el.id) return { x: drag.curX, y: drag.curY, width: w, height: h }
  return { x: el.x, y: el.y, width: w, height: h }
}

const baseTextBoxes = computed(() => {
  const ctx = boxMeasureCtx.value
  return props.mapData.elements
    .filter((e) => e.type === 'text-box')
    .map((el) => {
      const fontSize = el.fontSize ?? 10
      const lines = String(el.text ?? '').split('\n')
      let textW = 0
      if (ctx) {
        ctx.font = `${fontSize}px ${fontFamily}`
        for (const line of lines) textW = Math.max(textW, ctx.measureText(line).width)
      }
      const padH = 8
      const padV = 5
      const lineH = fontSize * 1.4
      return {
        id: el.id,
        pos: baseElemPos(el),
        lines,
        fontSize,
        padH,
        padV,
        lineH,
        boxW: Math.max(textW + padH * 2, 24),
        boxH: lines.length * lineH + padV * 2,
        bg: el.backgroundColor,
        fg: el.textColor,
        border: el.borderRequired ? el.borderColor : null,
      }
    })
})

const baseImageDecorations = computed(() =>
  props.mapData.elements
    .filter((e) => e.type === 'decoration' && e.decorationType === 'image')
    .map((el) => {
      const g = baseGeom(el, el.width ?? 128, el.height ?? 128)
      return {
        id: el.id,
        pos: { x: g.x, y: g.y },
        width: g.width,
        height: g.height,
        url: props.imageUrls?.[el.imageGuid] ?? null,
      }
    }),
)

// Like legacy, boxes never resized by hand size themselves around their text.
const DCI_CONTAINER_FONT_SIZE = 12
const DCI_CONTAINER_PAD_H = 10
const DCI_CONTAINER_PAD_V = 6

const baseDciContainers = computed(() => {
  const ctx = boxMeasureCtx.value
  const lineH = DCI_CONTAINER_FONT_SIZE * 1.4
  return props.mapData.elements
    .filter((e) => e.type === 'dci-container')
    .map((el) => {
      const lines = dciContainerLines(el, props.dciValues)
      let textW = 0
      if (ctx) {
        ctx.font = `600 ${DCI_CONTAINER_FONT_SIZE}px ${fontFamily}`
        for (const line of lines) textW = Math.max(textW, ctx.measureText(line).width)
      }
      const fitW = Math.max(textW + DCI_CONTAINER_PAD_H * 2, 48)
      const fitH = lines.length * lineH + DCI_CONTAINER_PAD_V * 2
      // A stored 0 means "unset" (the server always serializes the field).
      const storedW = el.width || el.raw?.width
      const storedH = el.height || el.raw?.height
      const g = baseGeom(el, storedW || fitW, storedH || fitH)
      return {
        id: el.id,
        pos: { x: g.x, y: g.y },
        width: g.width,
        height: g.height,
        lines,
        fontSize: DCI_CONTAINER_FONT_SIZE,
        lineH,
        bg: el.backgroundColor,
        fg: el.textColor,
        border: el.borderRequired ? el.borderColor : null,
      }
    })
})

// Always the default image: rule-based selection is not implemented.
const baseDciImages = computed(() =>
  props.mapData.elements
    .filter((e) => e.type === 'dci-image')
    .map((el) => {
      const g = baseGeom(el, el.width ?? el.raw?.width ?? 48, el.height ?? el.raw?.height ?? 48)
      return {
        id: el.id,
        pos: { x: g.x, y: g.y },
        width: g.width,
        height: g.height,
        url: el.defaultImage ? (props.imageUrls?.[el.defaultImage] ?? null) : null,
      }
    }),
)

// Any button selects, only the primary arms the drag: a right-click drag would emit a no-op
// element-updated on mouseup that ends in a viewport-change and closes the context menu.
function startBaseDrag(event, id, x, y) {
  selectBaseElement(id)
  if (!props.editMode || event.button !== 0) return
  baseDragState.value = {
    id,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: x,
    startY: y,
    curX: x,
    curY: y,
  }
  window.addEventListener('mousemove', onBaseDragMove)
  window.addEventListener('mouseup', onBaseDragUp)
}

function onBaseDragMove(event) {
  const s = baseDragState.value
  if (!s) return
  const dx = (event.clientX - s.startClientX) / zoomLevel.value
  const dy = (event.clientY - s.startClientY) / zoomLevel.value
  baseDragState.value = { ...s, curX: s.startX + dx, curY: s.startY + dy }
}

function onBaseDragUp() {
  const s = baseDragState.value
  window.removeEventListener('mousemove', onBaseDragMove)
  window.removeEventListener('mouseup', onBaseDragUp)
  baseDragState.value = null
  if (!s) return
  // Decorations are anchored at their top-left corner, node centers on the same lattice.
  const { x, y } = props.snapToGrid
    ? snapPoint({ x: s.curX, y: s.curY }, props.gridSize)
    : { x: s.curX, y: s.curY }
  emit('element-updated', { id: s.id, x: Math.round(x), y: Math.round(y) })
}

function selectBaseElement(id) {
  lastZoneClickTime = Date.now()
  if (selectedElementId.value === id) return
  selectedElementId.value = id
  clearOtherSelections()
  const el = props.mapData.elements.find((e) => e.id === id)
  emit('element-select', el ? { ...el } : null)
}

function clearBaseElementSelection() {
  if (selectedElementId.value === null) return
  selectedElementId.value = null
  emit('element-select', null)
}

function clearOtherSelections() {
  if (selectedZoneId.value !== null) {
    selectedZoneId.value = null
    emit('zone-select', null)
  }
  if (selectedImageRegionId.value !== null) {
    selectedImageRegionId.value = null
    emit('image-region-select', null)
  }
}

function onBaseElementContextMenu(event, id) {
  selectBaseElement(id)
  const el = props.mapData.elements.find((e) => e.id === id)
  emit('element-contextmenu', event, el ? { ...el } : { id })
}

const activeRipples = ref([])
const flashingNodes = ref(new Set())
let rafId = null
let rafLastTs = null
let flashingTimeoutId = null
const RIPPLE_EXPAND = 80
const RIPPLE_FADE = 0.6

function tickRipples(ts) {
  if (rafLastTs === null) rafLastTs = ts
  const dt = Math.min((ts - rafLastTs) / 1000, 0.1)
  rafLastTs = ts
  const next = activeRipples.value
    .map((r) => ({
      ...r,
      radius: r.radius + RIPPLE_EXPAND * dt,
      opacity: r.opacity - RIPPLE_FADE * dt,
    }))
    .filter((r) => r.opacity > 0)
  activeRipples.value = next
  if (next.length > 0) rafId = requestAnimationFrame(tickRipples)
  else {
    rafId = null
    rafLastTs = null
  }
}

let imageCounter = 0
const drawMode = ref(null)
const drawRect = ref(null)

function toggleDrawImageRegion() {
  drawMode.value = drawMode.value === 'image-region' ? null : 'image-region'
  if (drawMode.value === null) drawRect.value = null
  emit('draw-mode-change', drawMode.value === 'image-region')
}

function onDrawSurfaceMousedown(event) {
  const pt = clientToGraph(event.clientX, event.clientY)
  drawRect.value = { startX: pt.x, startY: pt.y, currentX: pt.x, currentY: pt.y }
  window.addEventListener('mousemove', onDrawWindowMousemove)
  window.addEventListener('mouseup', onDrawWindowMouseup)
}

function onDrawWindowMousemove(event) {
  if (!drawRect.value) return
  const pt = clientToGraph(event.clientX, event.clientY)
  drawRect.value = { ...drawRect.value, currentX: pt.x, currentY: pt.y }
}

function onDrawWindowMouseup() {
  window.removeEventListener('mousemove', onDrawWindowMousemove)
  window.removeEventListener('mouseup', onDrawWindowMouseup)
  const rect = drawRect.value
  drawRect.value = null
  if (!rect) return
  const x = Math.min(rect.startX, rect.currentX)
  const y = Math.min(rect.startY, rect.currentY)
  const w = Math.abs(rect.currentX - rect.startX)
  const h = Math.abs(rect.currentY - rect.startY)
  if (w < 40 || h < 40) return
  drawMode.value = null
  emit('draw-mode-change', false)
  const id = `img-region-${++imageCounter}`
  const newRegion = { id, x, y, width: w, height: h, imageUrl: '', opacity: 0.85, label: '' }
  extraImageRegions.value = [...extraImageRegions.value, newRegion]
  selectedImageRegionId.value = id
  emit('image-region-select', { ...newRegion, isEditable: true })
}

let zoneCounter = 0
const zoneDragState = ref(null)
const MIN_ZONE_SIZE = 80
let lastZoneClickTime = 0

function isExtraZone(zoneId) {
  return extraZones.value.some((z) => z.id === zoneId)
}

function isZoneDraggable(zoneId) {
  return isExtraZone(zoneId) || props.editMode
}

// Base boxes use selectedElementId in edit mode and selectedZoneId otherwise.
function isZoneSelected(zone) {
  if (isExtraZone(zone.id)) return selectedZoneId.value === zone.id
  return selectedElementId.value === zone.id || selectedZoneId.value === zone.id
}

function onZoneContextMenu(event, zone) {
  if (!isExtraZone(zone.id)) {
    if (props.editMode) return onBaseElementContextMenu(event, zone.id)
    return emit('zone-contextmenu', event, { ...zone, isEditable: false })
  }
  emit('zone-contextmenu', event, { ...zone, isEditable: true })
}

function onZoneMousedown(event, zone) {
  if (!isExtraZone(zone.id)) {
    if (props.editMode) return startBaseDrag(event, zone.id, zone.x, zone.y)
    lastZoneClickTime = Date.now()
    if (selectedZoneId.value !== zone.id) {
      selectedZoneId.value = zone.id
      emit('zone-select', { ...zone, isEditable: false })
    }
    return
  }
  lastZoneClickTime = Date.now()
  if (selectedZoneId.value !== zone.id) {
    selectedZoneId.value = zone.id
    emit('zone-select', { ...zone, isEditable: true })
  }
  zoneDragState.value = {
    zoneId: zone.id,
    type: 'move',
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: zone.x,
    startY: zone.y,
    startW: zone.width,
    startH: zone.height,
  }
  window.addEventListener('mousemove', onWindowMousemove)
  window.addEventListener('mouseup', onWindowMouseup)
}

function onHandleMousedown(event, zone, handleType) {
  event.stopPropagation()
  zoneDragState.value = {
    zoneId: zone.id,
    type: handleType,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: zone.x,
    startY: zone.y,
    startW: zone.width,
    startH: zone.height,
  }
  window.addEventListener('mousemove', onWindowMousemove)
  window.addEventListener('mouseup', onWindowMouseup)
}

function onWindowMousemove(event) {
  if (!zoneDragState.value) return
  const { zoneId, type, startClientX, startClientY, startX, startY, startW, startH } =
    zoneDragState.value
  const zone = extraZones.value.find((z) => z.id === zoneId)
  if (!zone) return
  const gDx = (event.clientX - startClientX) / zoomLevel.value
  const gDy = (event.clientY - startClientY) / zoomLevel.value
  if (type === 'move') {
    zone.x = startX + gDx
    zone.y = startY + gDy
  } else if (type === 'resize-se') {
    zone.width = Math.max(MIN_ZONE_SIZE, startW + gDx)
    zone.height = Math.max(MIN_ZONE_SIZE, startH + gDy)
  } else if (type === 'resize-nw') {
    const nW = Math.max(MIN_ZONE_SIZE, startW - gDx)
    const nH = Math.max(MIN_ZONE_SIZE, startH - gDy)
    zone.x = startX + (startW - nW)
    zone.y = startY + (startH - nH)
    zone.width = nW
    zone.height = nH
  } else if (type === 'resize-ne') {
    const nH = Math.max(MIN_ZONE_SIZE, startH - gDy)
    zone.width = Math.max(MIN_ZONE_SIZE, startW + gDx)
    zone.y = startY + (startH - nH)
    zone.height = nH
  } else if (type === 'resize-sw') {
    const nW = Math.max(MIN_ZONE_SIZE, startW - gDx)
    zone.x = startX + (startW - nW)
    zone.width = nW
    zone.height = Math.max(MIN_ZONE_SIZE, startH + gDy)
  }
}

function onWindowMouseup() {
  if (zoneDragState.value && props.snapToGrid) {
    const zone = extraZones.value.find((z) => z.id === zoneDragState.value.zoneId)
    if (zone) snapRectInPlace(zone, zoneDragState.value.type, MIN_ZONE_SIZE)
  }
  zoneDragState.value = null
  window.removeEventListener('mousemove', onWindowMousemove)
  window.removeEventListener('mouseup', onWindowMouseup)
}

function getZoneHandles(zone) {
  return [
    { type: 'resize-nw', x: zone.x, y: zone.y },
    { type: 'resize-ne', x: zone.x + zone.width, y: zone.y },
    { type: 'resize-sw', x: zone.x, y: zone.y + zone.height },
    { type: 'resize-se', x: zone.x + zone.width, y: zone.y + zone.height },
  ]
}

const imageDragState = ref(null)
const MIN_IMAGE_REGION_SIZE = 40

function isExtraImageRegion(regionId) {
  return extraImageRegions.value.some((r) => r.id === regionId)
}

function onImageRegionMousedown(event, region) {
  lastZoneClickTime = Date.now()
  if (selectedImageRegionId.value !== region.id) {
    selectedImageRegionId.value = region.id
    emit('image-region-select', { ...region, isEditable: isExtraImageRegion(region.id) })
  }
  if (!isExtraImageRegion(region.id)) return
  imageDragState.value = {
    regionId: region.id,
    type: 'move',
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: region.x,
    startY: region.y,
    startW: region.width,
    startH: region.height,
  }
  window.addEventListener('mousemove', onImageWindowMousemove)
  window.addEventListener('mouseup', onImageWindowMouseup)
}

function onImageHandleMousedown(event, region, handleType) {
  event.stopPropagation()
  imageDragState.value = {
    regionId: region.id,
    type: handleType,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: region.x,
    startY: region.y,
    startW: region.width,
    startH: region.height,
  }
  window.addEventListener('mousemove', onImageWindowMousemove)
  window.addEventListener('mouseup', onImageWindowMouseup)
}

function onImageWindowMousemove(event) {
  if (!imageDragState.value) return
  const { regionId, type, startClientX, startClientY, startX, startY, startW, startH } =
    imageDragState.value
  const region = extraImageRegions.value.find((r) => r.id === regionId)
  if (!region) return
  const gDx = (event.clientX - startClientX) / zoomLevel.value
  const gDy = (event.clientY - startClientY) / zoomLevel.value
  if (type === 'move') {
    region.x = startX + gDx
    region.y = startY + gDy
  } else if (type === 'resize-se') {
    region.width = Math.max(MIN_IMAGE_REGION_SIZE, startW + gDx)
    region.height = Math.max(MIN_IMAGE_REGION_SIZE, startH + gDy)
  } else if (type === 'resize-nw') {
    const nW = Math.max(MIN_IMAGE_REGION_SIZE, startW - gDx)
    const nH = Math.max(MIN_IMAGE_REGION_SIZE, startH - gDy)
    region.x = startX + (startW - nW)
    region.y = startY + (startH - nH)
    region.width = nW
    region.height = nH
  } else if (type === 'resize-ne') {
    const nH = Math.max(MIN_IMAGE_REGION_SIZE, startH - gDy)
    region.width = Math.max(MIN_IMAGE_REGION_SIZE, startW + gDx)
    region.y = startY + (startH - nH)
    region.height = nH
  } else if (type === 'resize-sw') {
    const nW = Math.max(MIN_IMAGE_REGION_SIZE, startW - gDx)
    region.x = startX + (startW - nW)
    region.width = nW
    region.height = Math.max(MIN_IMAGE_REGION_SIZE, startH + gDy)
  }
}

function onImageWindowMouseup() {
  if (imageDragState.value && props.snapToGrid) {
    const region = extraImageRegions.value.find((r) => r.id === imageDragState.value.regionId)
    if (region) snapRectInPlace(region, imageDragState.value.type, MIN_IMAGE_REGION_SIZE)
  }
  imageDragState.value = null
  window.removeEventListener('mousemove', onImageWindowMousemove)
  window.removeEventListener('mouseup', onImageWindowMouseup)
}

function getImageRegionHandles(region) {
  return [
    { type: 'resize-nw', x: region.x, y: region.y },
    { type: 'resize-ne', x: region.x + region.width, y: region.y },
    { type: 'resize-sw', x: region.x, y: region.y + region.height },
    { type: 'resize-se', x: region.x + region.width, y: region.y + region.height },
  ]
}

// Floor-plan mode, like the legacy figure, resizes from the bottom-right with the top-left
// fixed; node positions are centres, so the commit moves the centre to compensate.
const FLOOR_PLAN_MIN_W = 40
const FLOOR_PLAN_MIN_H = 20

const floorPlanResizeState = ref(null)

const floorPlanResizeTarget = computed(() => {
  if (!props.editMode) return null
  const s = floorPlanResizeState.value
  if (s) return s
  if (selectedNodes.value.length !== 1) return null
  const node = iconNodes.value.find((n) => n.id === selectedNodes.value[0])
  if (!node?.visual.resizable) return null
  return { id: node.id, x: node.x, y: node.y, w: node.visual.width, h: node.visual.height }
})

function onFloorPlanResizeMousedown(event, target) {
  event.stopPropagation()
  if (!props.editMode || event.button !== 0) return
  floorPlanResizeState.value = {
    ...target,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startW: target.w,
    startH: target.h,
    anchorX: target.x - target.w / 2,
    anchorY: target.y - target.h / 2,
  }
  window.addEventListener('mousemove', onFloorPlanResizeMove)
  window.addEventListener('mouseup', onFloorPlanResizeUp)
}

function onFloorPlanResizeMove(event) {
  const s = floorPlanResizeState.value
  if (!s) return
  const w = Math.max(
    FLOOR_PLAN_MIN_W,
    s.startW + (event.clientX - s.startClientX) / zoomLevel.value,
  )
  const h = Math.max(
    FLOOR_PLAN_MIN_H,
    s.startH + (event.clientY - s.startClientY) / zoomLevel.value,
  )
  floorPlanResizeState.value = { ...s, w, h, x: s.anchorX + w / 2, y: s.anchorY + h / 2 }
}

function onFloorPlanResizeUp() {
  const s = floorPlanResizeState.value
  window.removeEventListener('mousemove', onFloorPlanResizeMove)
  window.removeEventListener('mouseup', onFloorPlanResizeUp)
  floorPlanResizeState.value = null
  if (!s) return
  let { w, h } = s
  if (props.snapToGrid) {
    w = Math.max(FLOOR_PLAN_MIN_W, snapCoord(w))
    h = Math.max(FLOOR_PLAN_MIN_H, snapCoord(h))
  }
  emit('element-updated', {
    id: s.id,
    x: Math.round(s.anchorX + w / 2),
    y: Math.round(s.anchorY + h / 2),
    width: Math.round(w),
    height: Math.round(h),
  })
}

function getBaseHandles(rect) {
  return [
    { type: 'resize-nw', x: rect.x, y: rect.y },
    { type: 'resize-ne', x: rect.x + rect.width, y: rect.y },
    { type: 'resize-sw', x: rect.x, y: rect.y + rect.height },
    { type: 'resize-se', x: rect.x + rect.width, y: rect.y + rect.height },
  ]
}

function onBaseResizeMousedown(event, id, rect, handleType) {
  event.stopPropagation()
  if (!props.editMode || event.button !== 0) return
  baseResizeState.value = {
    id,
    type: handleType,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: rect.x,
    startY: rect.y,
    startW: rect.width,
    startH: rect.height,
    curX: rect.x,
    curY: rect.y,
    curW: rect.width,
    curH: rect.height,
  }
  window.addEventListener('mousemove', onBaseResizeMove)
  window.addEventListener('mouseup', onBaseResizeUp)
}

function onBaseResizeMove(event) {
  const s = baseResizeState.value
  if (!s) return
  const gDx = (event.clientX - s.startClientX) / zoomLevel.value
  const gDy = (event.clientY - s.startClientY) / zoomLevel.value
  let x = s.startX
  let y = s.startY
  let w = s.startW
  let h = s.startH
  if (s.type === 'resize-se') {
    w = Math.max(MIN_BASE_SIZE, s.startW + gDx)
    h = Math.max(MIN_BASE_SIZE, s.startH + gDy)
  } else if (s.type === 'resize-nw') {
    w = Math.max(MIN_BASE_SIZE, s.startW - gDx)
    h = Math.max(MIN_BASE_SIZE, s.startH - gDy)
    x = s.startX + (s.startW - w)
    y = s.startY + (s.startH - h)
  } else if (s.type === 'resize-ne') {
    w = Math.max(MIN_BASE_SIZE, s.startW + gDx)
    h = Math.max(MIN_BASE_SIZE, s.startH - gDy)
    y = s.startY + (s.startH - h)
  } else if (s.type === 'resize-sw') {
    w = Math.max(MIN_BASE_SIZE, s.startW - gDx)
    h = Math.max(MIN_BASE_SIZE, s.startH + gDy)
    x = s.startX + (s.startW - w)
  }
  baseResizeState.value = { ...s, curX: x, curY: y, curW: w, curH: h }
}

function onBaseResizeUp() {
  const s = baseResizeState.value
  window.removeEventListener('mousemove', onBaseResizeMove)
  window.removeEventListener('mouseup', onBaseResizeUp)
  baseResizeState.value = null
  if (!s) return
  const rect = { x: s.curX, y: s.curY, width: s.curW, height: s.curH }
  if (props.snapToGrid) snapRectInPlace(rect, s.type, MIN_BASE_SIZE)
  emit('element-updated', {
    id: s.id,
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  })
}

// Bend points are absolute graph coordinates.
const bendDragState = ref(null)

function nodePos(id) {
  const n = iconNodes.value.find((k) => k.id === id)
  return n ? { x: n.x, y: n.y } : null
}

const bendEditLink = computed(() => {
  if (!props.editMode || selectedEdges.value.length !== 1) return null
  const link = props.mapData.links?.find((l) => l.id === selectedEdges.value[0])
  if (!link || link.from == null || link.to == null) return null
  return link
})

const bendEditGeom = computed(() => {
  const link = bendEditLink.value
  if (!link) return null
  const src = nodePos(link.from)
  const tgt = nodePos(link.to)
  if (!src || !tgt) return null
  const drag = bendDragState.value
  const points = drag && drag.edgeId === link.id ? drag.points : (link.bendPoints ?? [])
  return { id: link.id, src, tgt, points }
})

/** Midpoints of each segment: the "+" handles that insert a point. */
const bendAddHandles = computed(() => {
  const g = bendEditGeom.value
  if (!g) return []
  const chain = [g.src, ...g.points, g.tgt]
  const mids = []
  for (let i = 0; i < chain.length - 1; i++) {
    mids.push({
      segIndex: i,
      x: (chain[i].x + chain[i + 1].x) / 2,
      y: (chain[i].y + chain[i + 1].y) / 2,
    })
  }
  return mids
})

function commitBendPoints(edgeId, points) {
  emit('link-updated', {
    id: edgeId,
    bendPoints: points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
  })
}

function onBendPointMousedown(event, index) {
  const g = bendEditGeom.value
  if (!g) return
  if (event.altKey || event.button === 2) {
    commitBendPoints(
      g.id,
      g.points.filter((_, i) => i !== index),
    )
    return
  }
  if (event.button !== 0) return
  bendDragState.value = {
    edgeId: g.id,
    index,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startPoints: g.points.map((p) => ({ ...p })),
    points: g.points.map((p) => ({ ...p })),
  }
  window.addEventListener('mousemove', onBendPointMove)
  window.addEventListener('mouseup', onBendPointUp)
}

function onBendPointMove(event) {
  const s = bendDragState.value
  if (!s) return
  const gDx = (event.clientX - s.startClientX) / zoomLevel.value
  const gDy = (event.clientY - s.startClientY) / zoomLevel.value
  const base = s.startPoints[s.index]
  const points = s.points.map((p) => ({ ...p }))
  points[s.index] = { x: base.x + gDx, y: base.y + gDy }
  bendDragState.value = { ...s, points }
  const edge = cy?.getElementById(s.edgeId)
  if (edge?.length) {
    edge.data('bendPoints', points)
    cy.style().update()
    scheduleLabelLayout('warm')
  }
}

function onBendPointUp() {
  const s = bendDragState.value
  window.removeEventListener('mousemove', onBendPointMove)
  window.removeEventListener('mouseup', onBendPointUp)
  bendDragState.value = null
  if (s) commitBendPoints(s.edgeId, s.points)
}

function onBendAddPoint(segIndex, x, y) {
  const g = bendEditGeom.value
  if (!g) return
  const points = g.points.map((p) => ({ ...p }))
  points.splice(segIndex, 0, { x, y })
  commitBendPoints(g.id, points)
}

const isBoxSelectMode = ref(false)

// Style values are recomputed only when the style is dirtied, so mid-drag the bends move
// relative to the endpoints; dragfree re-dirties the style to put them back.
function edgeSegments(ele) {
  const geometry = bendPointsToSegments(
    ele.data('bendPoints'),
    ele.source().position(),
    ele.target().position(),
  )
  if (!geometry) return null
  return {
    weights: geometry.weights.map((w) => w.toFixed(4)).join(' '),
    dists: geometry.distances.map((d) => d.toFixed(2)).join(' '),
  }
}

/** Border included (cytoscape's outerWidth). */
function nodeOutline(ele) {
  return {
    kind: ele.data('nodeShape') === 'round-rectangle' ? 'rectangle' : 'ellipse',
    halfW: (ele.data('nodeW') ?? NODE_RADIUS * 2) / 2 + NODE_BORDER_WIDTH / 2,
    halfH: (ele.data('nodeH') ?? NODE_RADIUS * 2) / 2 + NODE_BORDER_WIDTH / 2,
  }
}

// A fanned parallel link ends where its offset line leaves the node outline, so the lines
// stay parallel.
function edgeEndpoint(ele, end) {
  const offset = ele.data('fanOffset')
  if (!offset) return 'outside-to-node'
  const node = end === 'source' ? ele.source() : ele.target()
  const source = ele.source().position()
  const target = ele.target().position()
  const p = fanEndpoint(source, target, offset, end, nodeOutline(node))
  return `${p.x}px ${p.y}px`
}

function edgeLineColor(ele) {
  if (flashingNodes.value.has(ele.source().id()) || flashingNodes.value.has(ele.target().id()))
    return '#ef4444'
  if (props.heatmapEnabled && ele.data('rawValue') !== undefined)
    return getHeatmapColor(ele.data('rawValue'), ele.data('maxValue'))
  return ele.data('lineColor') ?? getLinkColor(ele.data())
}

function buildCyStyle() {
  return [
    { selector: 'core', style: { 'active-bg-opacity': 0 } },
    { selector: 'node', style: { 'overlay-opacity': 0 } },
    { selector: 'edge', style: { 'overlay-opacity': 0 } },
    // Invisible: cytoscape keeps the geometry, the SVG overlay paints the node. The border
    // width stays because edges end on its outer edge.
    {
      selector: 'node.object',
      style: {
        shape: 'ellipse',
        width: (ele) => ele.data('nodeW') ?? NODE_RADIUS * 2,
        height: (ele) => ele.data('nodeH') ?? NODE_RADIUS * 2,
        'background-opacity': 0,
        'border-opacity': 0,
        'border-width': NODE_BORDER_WIDTH,
        label: '',
        'z-index': 2,
      },
    },
    // A class, not a data mapper: cytoscape documents several enum properties as non-mappable.
    {
      selector: 'node.object.shape-rect',
      style: { shape: 'round-rectangle' },
    },
    // Selected nodes paint on top (paintedNodes), so they must also win hit tests.
    {
      selector: 'node.object:selected',
      style: { 'z-index': 3 },
    },
    {
      selector: 'edge',
      style: {
        display: () => (props.hideLinks ? 'none' : 'element'),
        width: (ele) => {
          if (props.heatmapEnabled && ele.data('rawValue') !== undefined)
            return getHeatmapWidth(ele.data('rawValue'), ele.data('maxValue'))
          return ele.data('lineWidth') ?? getLinkWidth(ele.data())
        },
        'line-color': edgeLineColor,
        'line-style': (ele) => (edgeDash(ele) !== '0' ? 'dashed' : 'solid'),
        'line-dash-pattern': (ele) => {
          const dash = edgeDash(ele)
          return dash === '0' ? [1, 0] : dash.split(' ').map(Number)
        },
        'curve-style': (ele) => (edgeSegments(ele) ? 'segments' : 'straight'),
        // From node centers, matching edgeSegments(); the default would shift every bend.
        'edge-distances': 'node-position',
        'segment-weights': (ele) => edgeSegments(ele)?.weights ?? '0.5',
        'segment-distances': (ele) => edgeSegments(ele)?.dists ?? '0',
        'source-endpoint': (ele) => edgeEndpoint(ele, 'source'),
        'target-endpoint': (ele) => edgeEndpoint(ele, 'target'),
        // Legacy decorates the target end only.
        'target-arrow-shape': () => (renderOptions.value.showLinkDirection ? 'triangle' : 'none'),
        'target-arrow-color': edgeLineColor,
        'arrow-scale': 1.1,
        label: '',
        'z-index': 0,
      },
    },
    {
      selector: 'edge:selected',
      style: { 'line-color': '#60a5fa' },
    },
    {
      selector: 'edge.table-row-hot',
      style: { 'underlay-color': '#60a5fa', 'underlay-opacity': 0.35, 'underlay-padding': 5 },
    },
  ]
}

function edgeDash(ele) {
  return ele.data('lineDash') ?? getLinkDash(ele.data())
}

function buildCyElements(mapData) {
  const els = []
  const options = resolveMapRenderOptions(mapData)
  for (const elem of mapData.elements) {
    if (elem.type !== 'object') continue
    const name = elem.objectName ?? ''
    const displayName = computeDisplayName(name)
    // Shared with the SVG overlay so the two layers cannot drift apart.
    const visual = computeNodeVisual(elem, displayName, options, measureText)
    els.push({
      data: {
        id: elem.id,
        name,
        displayName,
        objectId: elem.objectId,
        objectClass: elem.objectClass ?? 'Node',
        objectStatus: elem.objectStatus ?? 5,
        nodeShape: visual.shape,
        nodeW: visual.width,
        nodeH: visual.height,
        statusFill: visual.statusFill,
        statusBorder: visual.statusBorder,
      },
      position: { x: elem.x ?? 0, y: elem.y ?? 0 },
      classes: visual.shape === 'round-rectangle' ? 'object shape-rect' : 'object',
      grabbable: props.draggable,
    })
  }
  // Dangling links stay in the data but cannot be drawn.
  const links = mapData.links.filter((link) => link.from && link.to)
  const drawnLinks = buildDrawnLinks(
    links,
    props.linkMergeThreshold,
    (link) => !!link.bendPoints?.length,
  )
  drawnLinksById = new Map(drawnLinks.map((drawn) => [drawn.id, drawn]))
  for (const drawn of drawnLinks) {
    els.push(drawn.kind === 'group' ? groupEdge(drawn, mapData) : linkEdge(drawn, mapData))
  }
  return els
}

function linkEdge({ link, fanOffset }, mapData) {
  // Demo links have no `raw` and fall back to type heuristics.
  const visual = link.raw ? resolveLinkVisual(link, mapData.rawContent) : null
  return {
    data: {
      id: link.id,
      source: link.from,
      target: link.to,
      type: link.type ?? 0,
      label: link.label,
      color: link.color,
      customColor: link.customColor,
      connector1: link.connectorName1 ?? '',
      connector2: link.connectorName2 ?? '',
      lineDash: visual?.dash ?? null,
      lineWidth: visual?.width ?? null,
      lineColor: visual?.color ?? null,
      bendPoints: link.bendPoints?.length ? link.bendPoints : null,
      fanOffset,
      rawValue: link.dciData?.rawValue,
      maxValue: link.dciData?.maxValue,
      dciValue: link.dciData?.value,
    },
    classes: fanOffset ? 'fanned' : '',
  }
}

// Drawn like its most critical member. No bend points: edit mode never merges.
function groupEdge(group, mapData) {
  const visual = groupLinkVisual(group.members, mapData.rawContent)
  return {
    data: {
      id: group.id,
      source: group.from,
      target: group.to,
      type: visual.member.type ?? 0,
      label: `${group.members.length} links`,
      color: visual.member.color,
      customColor: visual.member.customColor,
      connector1: '',
      connector2: '',
      lineDash: visual.dash,
      lineWidth: visual.width,
      lineColor: visual.color,
      bendPoints: null,
      fanOffset: group.fanOffset,
      isGroup: true,
      memberIds: group.members.map((member) => member.id),
    },
    classes: group.fanOffset ? 'fanned' : '',
  }
}

function setupCyEvents() {
  cy.on('viewport', () => {
    syncOverlay()
    emit('viewport-change')
  })
  // Icons follow the pointer at once; labels ease aside once per frame.
  cy.on('drag', 'node.object', () => {
    rebuildOverlayNodes()
    scheduleLabelLayout('warm')
  })
  cy.on('layoutstop', () => rebuildOverlay('settle'))
  // Style mappers only re-run when the style is dirtied, and fanned endpoints move with the node.
  cy.on('position', 'node.object', (evt) => {
    const fanned = evt.target.connectedEdges('.fanned')
    if (fanned.nonempty()) fanned.updateStyle()
  })

  cy.on('mouseover', 'node.object', (evt) => {
    hoveredNodeId.value = evt.target.id()
  })
  cy.on('mouseout', 'node.object', () => {
    hoveredNodeId.value = null
  })
  cy.on('mouseover', 'edge', (evt) => {
    hoveredEdgeId.value = evt.target.id()
  })
  cy.on('mouseout', 'edge', () => {
    hoveredEdgeId.value = null
  })
  // A drag can end with the pointer off the element, leaving hover stuck on.
  cy.on('dragfree', () => {
    hoveredNodeId.value = null
    hoveredEdgeId.value = null
  })

  cy.on('select unselect', 'node.object', () => {
    const nodes = cy.$('node.object:selected').map((n) => ({ id: n.id(), ...n.data() }))
    selectedNodes.value = nodes.map((n) => n.id)
    emit('node-select', nodes)
  })

  cy.on('select unselect', 'edge', () => {
    const edges = cy.$('edge:selected').map((e) => ({ id: e.id(), ...e.data() }))
    selectedEdges.value = edges.map((e) => e.id)
    emit('edge-select', edges)
  })

  cy.on('dblclick', 'node.object', (evt) => {
    emit('node-dblclick', { id: evt.target.id(), ...evt.target.data() }, evt.originalEvent)
  })

  cy.on('cxttap', 'node.object', (evt) => {
    // originalEvent is the mouseup, not the native contextmenu; that one is stopped by
    // stopNativeContextMenuBubble.
    evt.originalEvent?.preventDefault()
    cy.elements(':selected').unselect()
    evt.target.select()
    emit('node-contextmenu', evt.originalEvent, {
      id: evt.target.id(),
      ...evt.target.data(),
      isEditable: extraNodeIds.has(evt.target.id()),
    })
  })

  cy.on('cxttap', 'edge', (evt) => {
    evt.originalEvent?.preventDefault()
    cy.elements(':selected').unselect()
    evt.target.select()
    emit('edge-contextmenu', evt.originalEvent, { id: evt.target.id(), ...evt.target.data() })
  })

  // cxttap rather than a native contextmenu listener, so it cannot race the node handler.
  cy.on('cxttap', (evt) => {
    if (evt.target !== cy) return
    emit('canvas-contextmenu', evt.originalEvent)
  })

  cy.on('tap', (evt) => {
    if (evt.target !== cy) return
    if (Date.now() - lastZoneClickTime < 300) return
    if (selectedZoneId.value !== null) {
      selectedZoneId.value = null
      emit('zone-select', null)
    }
    if (selectedImageRegionId.value !== null) {
      selectedImageRegionId.value = null
      emit('image-region-select', null)
    }
    clearBaseElementSelection()
  })

  cy.on('dragfree', 'node.object', (evt) => {
    const node = evt.target
    if (props.snapToGrid) {
      node.position(snapPoint(node.position(), props.gridSize))
      // The overlay only tracks `drag`, so it would stay where the pointer left it.
      rebuildOverlayNodes()
    }
    // Every dragged node fires its own dragfree.
    scheduleLabelLayout('settle')
    const { x, y } = node.position()
    emit('node-moved', { id: node.id(), x, y })
    // Bend points are absolute, baked into cached segment styles.
    if (node.connectedEdges().some((e) => e.data('bendPoints')?.length)) cy.style().update()
  })

  cy.on('boxstart', () => {
    isBoxSelectMode.value = true
    emit('box-select-change', true)
  })
  cy.on('boxend', () => {
    isBoxSelectMode.value = false
    emit('box-select-change', false)
  })
}

// A canvas click moves focus nowhere, so F6 and `/` would answer for the previously focused
// pane. mousedown on the wrapper, not pointerdown: cytoscape's handlers on the inner container
// blur the active element on every press, and run before this one bubbles out. Bound in
// script, not `@mousedown`, to keep no-static-element-interactions quiet for a focus surface.
function focusCanvas() {
  canvasWrapRef.value?.focus({ preventScroll: true })
}

onMounted(() => {
  canvasWrapRef.value.addEventListener('mousedown', focusCanvas)
  canvasWrapRef.value.addEventListener('touchstart', focusCanvas, { passive: true })
  fontFamily = getComputedStyle(cyContainerRef.value).fontFamily
  textCtx = document.createElement('canvas').getContext('2d')
  textCtx.font = `${LABEL_FONT_SIZE}px ${fontFamily}`
  // Assigned after fontFamily is resolved, since assigning it re-runs the overlay computeds.
  boxMeasureCtx.value = document.createElement('canvas').getContext('2d')

  cy = cytoscape({
    container: cyContainerRef.value,
    elements: buildCyElements(props.mapData),
    style: buildCyStyle(),
    // The constructor's default 'grid' layout would discard persisted positions.
    layout: { name: 'preset' },
    minZoom: 0.15,
    maxZoom: 4,
    boxSelectionEnabled: true,
    selectionType: 'single',
    userZoomingEnabled: true,
    userPanningEnabled: true,
    // handleWheel zooms; userZoomingEnabled stays on for the native pinch gesture (Safari
    // trackpad), which ignores wheelSensitivity.
    wheelSensitivity: 0,
  })
  cyContainerRef.value.addEventListener('wheel', handleWheel, { passive: false })
  cyContainerRef.value.addEventListener('contextmenu', stopNativeContextMenuBubble)
  cyContainerRef.value.addEventListener('auxclick', handleContainerAuxClick)
  cyContainerRef.value.addEventListener('mousedown', suppressMiddleMouseDown)
  setupCyEvents()
  rebuildOverlay()
  syncOverlay()

  resizeObserver = new ResizeObserver(() => {
    if (!cy) return
    cy.resize()
    syncOverlay()
  })
  resizeObserver.observe(cyContainerRef.value)
})

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  if (labelFrame !== null) cancelAnimationFrame(labelFrame)
  if (flashingTimeoutId !== null) clearTimeout(flashingTimeoutId)
  canvasWrapRef.value?.removeEventListener('mousedown', focusCanvas)
  canvasWrapRef.value?.removeEventListener('touchstart', focusCanvas)
  resizeObserver?.disconnect()
  resizeObserver = null
  cyContainerRef.value?.removeEventListener('wheel', handleWheel)
  cyContainerRef.value?.removeEventListener('contextmenu', stopNativeContextMenuBubble)
  cyContainerRef.value?.removeEventListener('auxclick', handleContainerAuxClick)
  cyContainerRef.value?.removeEventListener('mousedown', suppressMiddleMouseDown)
  window.removeEventListener('mousemove', onWindowMousemove)
  window.removeEventListener('mouseup', onWindowMouseup)
  window.removeEventListener('mousemove', onImageWindowMousemove)
  window.removeEventListener('mouseup', onImageWindowMouseup)
  window.removeEventListener('mousemove', onDrawWindowMousemove)
  window.removeEventListener('mouseup', onDrawWindowMouseup)
  window.removeEventListener('mousemove', onBaseDragMove)
  window.removeEventListener('mouseup', onBaseDragUp)
  window.removeEventListener('mousemove', onGeoDragMove)
  window.removeEventListener('mouseup', onGeoDragUp)
  window.removeEventListener('mousemove', onTableDragMove)
  window.removeEventListener('mouseup', onTableDragEnd)
  cy?.destroy()
  cy = null
  textCtx = null
  boxMeasureCtx.value = null
})

watch(
  () => props.mapData,
  (newData, oldData) => {
    if (!cy) return
    // Settings-only previews reuse the element and link arrays; skipping the rebuild keeps
    // the selection during live edits. Link defaults are baked into edge data, so they rebuild.
    if (
      oldData &&
      newData.elements === oldData.elements &&
      newData.links === oldData.links &&
      !linkDefaultsChanged(newData, oldData)
    )
      return
    rebuildElements()
  },
)

// The merge threshold decides which edges exist, so restyling is not enough.
watch(
  () => props.linkMergeThreshold,
  () => {
    if (cy) rebuildElements()
  },
)

function rebuildElements() {
  const zoom = cy.zoom()
  const pan = cy.pan()
  cy.elements().remove()
  extraNodeIds.clear()
  cy.add(buildCyElements(props.mapData))
  cy.viewport({ zoom, pan })
  rebuildOverlay()
}

watch([() => props.dciValues, () => props.hideLinkLabels, () => props.hideLinks], () =>
  rebuildOverlayEdgeLabels(),
)
watch([() => props.overflowTables, activeTableOffsets], () => rebuildOverlayEdgeLabels('settle'))
// hideLinks also drives the edge `display` style mapper.
watch(
  () => props.hideLinks,
  () => cy?.style().update(),
)

watch(
  () => props.heatmapEnabled,
  () => cy?.style().update(),
)
watch(
  () => props.draggable,
  (val) => cy?.$('node.object')[val ? 'grabify' : 'ungrabify'](),
)
watch(flashingNodes, () => cy?.style().update())
watch(isDark, () => {
  if (!cy) return
  cy.style().update()
  rebuildOverlayNodes()
})

// Updated in place rather than rebuilt, so the selection survives.
watch(renderOptions, () => {
  if (!cy) return
  const options = renderOptions.value
  const elementsById = new Map(props.mapData.elements.map((e) => [e.id, e]))
  for (const n of cy.nodes('.object')) {
    const visual = computeNodeVisual(
      elementsById.get(n.id()),
      n.data('displayName'),
      options,
      measureText,
    )
    n.data({
      nodeShape: visual.shape,
      nodeW: visual.width,
      nodeH: visual.height,
      statusFill: visual.statusFill,
      statusBorder: visual.statusBorder,
    })
    n.toggleClass('shape-rect', visual.shape === 'round-rectangle')
  }
  cy.style().update()
  rebuildOverlay()
})

watch(
  () => props.searchTerm,
  () => {
    if (!cy) return
    rebuildOverlayNodes()
  },
)

watch(
  [
    zoneDragState,
    imageDragState,
    drawMode,
    baseDragState,
    baseResizeState,
    bendDragState,
    floorPlanResizeState,
    geoDragState,
  ],
  () => {
    if (!cy) return
    cy.userPanningEnabled(
      zoneDragState.value === null &&
        imageDragState.value === null &&
        drawMode.value === null &&
        baseDragState.value === null &&
        baseResizeState.value === null &&
        bendDragState.value === null &&
        floorPlanResizeState.value === null &&
        geoDragState.value === null,
    )
  },
)

function fitContent() {
  cy?.fit(cy.$('node'), 80)
}

function zoomIn() {
  if (!cy) return
  const center = {
    x: cyContainerRef.value.clientWidth / 2,
    y: cyContainerRef.value.clientHeight / 2,
  }
  cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: center })
}

function zoomOut() {
  if (!cy) return
  const center = {
    x: cyContainerRef.value.clientWidth / 2,
    y: cyContainerRef.value.clientHeight / 2,
  }
  cy.zoom({ level: cy.zoom() / 1.2, renderedPosition: center })
}

// Only used for placing new elements, which must land on the grid.
function placementPoint(point) {
  return props.snapToGrid ? snapPoint(point, props.gridSize) : point
}

function screenToGraphCoords(clientX, clientY) {
  if (!cy) return { x: 400, y: 300 }
  return placementPoint(clientToGraph(clientX, clientY))
}

function getGraphCenter() {
  if (!cy || !cyContainerRef.value) return { x: 400, y: 300 }
  const r = cyContainerRef.value.getBoundingClientRect()
  return placementPoint(clientToGraph(r.left + r.width / 2, r.top + r.height / 2))
}

function selectElement(id) {
  selectedElementId.value = null
  selectBaseElement(id)
}

function selectEdge(id) {
  if (!cy) return
  cy.elements(':selected').unselect()
  cy.getElementById(String(id)).select()
}

let demoCounter = 0

function addNode(config) {
  const id = `demo-${++demoCounter}`
  extraNodeIds.add(id)
  const name = config.name ?? `node-${demoCounter}`
  cy?.add({
    data: {
      id,
      name,
      displayName: computeDisplayName(name),
      objectId: null,
      objectClass: config.objectClass ?? 'Node',
      objectStatus: config.objectStatus ?? 0,
    },
    position: config.position ?? { x: 400, y: 300 },
    classes: 'object',
    grabbable: props.draggable,
  })
  rebuildOverlayNodes()
  return id
}

function removeNode(nodeId) {
  if (!extraNodeIds.has(nodeId)) return
  cy?.$(`#${nodeId}`).remove()
  extraNodeIds.delete(nodeId)
  rebuildOverlayNodes()
}

function addEdge(sourceId, targetId, config = {}) {
  const id = `demo-edge-${++demoCounter}`
  cy?.add({
    data: {
      id,
      source: sourceId,
      target: targetId,
      type: config.type ?? 0,
      label: config.label ?? null,
      color: config.color ?? 'default',
      customColor: config.customColor,
      rawValue: undefined,
      maxValue: undefined,
      dciValue: undefined,
    },
  })
  return id
}

function removeEdge(edgeId) {
  cy?.$(`#${edgeId}`).remove()
}

function updateEdge(edgeId, updates) {
  const edge = cy?.$(`#${edgeId}`)
  if (!edge?.length) return
  edge.data({ ...edge.data(), ...updates })
  cy.style().update()
}

function removeSelected() {
  cy?.$('node.object:selected').forEach((n) => {
    if (extraNodeIds.has(n.id())) {
      n.remove()
      extraNodeIds.delete(n.id())
    }
  })
  cy?.$('edge:selected').remove()
  rebuildOverlayNodes()
}

function getSelectedNodeIds() {
  return cy?.$('node.object:selected').map((n) => n.id()) ?? []
}

function addZone(position = null) {
  const id = `zone-${++zoneCounter}`
  const x = position?.x ?? 80 + (zoneCounter - 1) * 20
  const y = position?.y ?? 80 + (zoneCounter - 1) * 20
  const newZone = {
    id,
    type: 'decoration',
    decorationType: 'group-box',
    label: 'New Zone',
    x,
    y,
    width: 240,
    height: 180,
    style: { color: '#3b82f6', opacity: 0.1 },
  }
  extraZones.value = [...extraZones.value, newZone]
  selectedZoneId.value = id
  emit('zone-select', { ...newZone, isEditable: true })
  return id
}

function removeSelectedZone() {
  if (!selectedZoneId.value) return
  extraZones.value = extraZones.value.filter((z) => z.id !== selectedZoneId.value)
  selectedZoneId.value = null
  emit('zone-select', null)
}

function updateZone(id, updates) {
  extraZones.value = extraZones.value.map((z) =>
    z.id !== id
      ? z
      : { ...z, ...updates, style: updates.style ? { ...z.style, ...updates.style } : z.style },
  )
}

function updateImageRegion(id, updates) {
  extraImageRegions.value = extraImageRegions.value.map((r) =>
    r.id !== id ? r : { ...r, ...updates },
  )
}

function removeSelectedImageRegion() {
  if (!selectedImageRegionId.value) return
  extraImageRegions.value = extraImageRegions.value.filter(
    (r) => r.id !== selectedImageRegionId.value,
  )
  selectedImageRegionId.value = null
  emit('image-region-select', null)
}

function triggerStatusPropagation(nodeIds) {
  if (!nodeIds?.length) return
  if (flashingTimeoutId !== null) {
    clearTimeout(flashingTimeoutId)
    flashingTimeoutId = null
  }

  const ts = Date.now()
  activeRipples.value = [
    ...activeRipples.value,
    ...nodeIds.map((nodeId, i) => {
      const node = cy?.$(`#${nodeId}`)
      const pos = node?.length ? { ...node.position() } : { x: 0, y: 0 }
      return {
        id: `ripple-${ts}-${i}`,
        nodeId,
        x: pos.x,
        y: pos.y,
        radius: 28,
        opacity: 0.7,
        color: '#ef4444',
      }
    }),
  ]
  if (rafId === null) {
    rafLastTs = null
    rafId = requestAnimationFrame(tickRipples)
  }

  flashingNodes.value = new Set(nodeIds)
  flashingTimeoutId = setTimeout(() => {
    flashingNodes.value = new Set()
    flashingTimeoutId = null
  }, 2500)
}

function toggleBoxSelect() {
  isBoxSelectMode.value = !isBoxSelectMode.value
  emit('box-select-change', isBoxSelectMode.value)
}

async function applyLayout(type) {
  const runner = LAYOUT_RUNNERS[type]
  if (!runner || !cy) return
  const positions = await runner(cy)
  cy.$('node.object').forEach((node) => {
    const pos = positions[node.id()]
    if (pos) node.animate({ position: pos, duration: 300 })
  })
  emit('layout-applied', positions)
}

function resetDemo() {
  for (const id of extraNodeIds) cy?.$(`#${id}`).remove()
  extraNodeIds.clear()
  cy?.$('edge')
    .filter((e) => e.id().startsWith('demo-edge-'))
    .remove()
  extraZones.value = []
  extraImageRegions.value = []
  selectedZoneId.value = null
  selectedImageRegionId.value = null
  demoCounter = 0
  zoneCounter = 0
  imageCounter = 0
  drawMode.value = null
  drawRect.value = null
  activeRipples.value = []
  flashingNodes.value = new Set()
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
    rafLastTs = null
  }
  if (flashingTimeoutId !== null) {
    clearTimeout(flashingTimeoutId)
    flashingTimeoutId = null
  }
  emit('zone-select', null)
  emit('image-region-select', null)
  emit('draw-mode-change', false)
}

defineExpose({
  fitContent,
  zoomIn,
  zoomOut,
  addNode,
  removeNode,
  addEdge,
  removeEdge,
  updateEdge,
  removeSelected,
  getSelectedNodeIds,
  addZone,
  removeSelectedZone,
  updateZone,
  screenToGraphCoords,
  getGraphCenter,
  selectElement,
  selectEdge,
  toggleDrawImageRegion,
  updateImageRegion,
  removeSelectedImageRegion,
  resetDemo,
  toggleBoxSelect,
  triggerStatusPropagation,
  applyLayout,
})
</script>

<template>
  <div ref="canvasWrapRef" class="network-map-canvas-wrap" tabindex="-1" :style="wrapStyle">
    <svg class="network-map-backdrop" xmlns="http://www.w3.org/2000/svg">
      <g ref="backdropGroupRef">
        <!-- Keeps edge tiles from spilling past the dashed page boundary. -->
        <defs v-if="backdropBoundary">
          <clipPath :id="backdropClipId">
            <rect x="0" y="0" :width="backdropBoundary.w" :height="backdropBoundary.h" />
          </clipPath>
        </defs>
        <g :clip-path="backdropBoundary ? `url(#${backdropClipId})` : null">
          <image
            v-if="backdropImage"
            :href="backdropImage.url"
            :x="backdropImage.x"
            :y="backdropImage.y"
            :width="backdropImage.width"
            :height="backdropImage.height"
            :preserveAspectRatio="backdropImage.preserve"
          />
          <image
            v-for="tile in backdropTiles"
            :key="tile.key"
            :href="tile.href"
            :x="tile.x"
            :y="tile.y"
            :width="TILE_SIZE"
            :height="TILE_SIZE"
          />
        </g>
        <!-- Boundary outline drawn outside the clip so its stroke stays crisp. -->
        <rect
          v-if="backdropBoundary"
          class="network-map-page-boundary"
          x="0"
          y="0"
          :width="backdropBoundary.w"
          :height="backdropBoundary.h"
        />
      </g>
    </svg>

    <svg v-if="gridVisible" class="network-map-grid" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern
          :id="gridPatternId"
          :width="gridPitch"
          :height="gridPitch"
          :x="panOffset.x"
          :y="panOffset.y"
          patternUnits="userSpaceOnUse"
        >
          <path :d="`M ${gridPitch} 0 L 0 0 0 ${gridPitch}`" fill="none" stroke-width="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" :fill="`url(#${gridPatternId})`" />
    </svg>

    <!-- Label leaders sit beneath the graph, so nodes paint over them. -->
    <svg class="network-map-leaders" xmlns="http://www.w3.org/2000/svg">
      <g ref="leaderGroupRef">
        <NetworkMapLabelLeaders :boxes="edgeLabels" :tables="placedTables" />
      </g>
    </svg>

    <div ref="cyContainerRef" class="network-map-graph" />

    <!-- A drag-only drawing surface, not controls: keyboard editing lives at view level
         (NetworkMapsView's handleEditorKeydown). -->
    <!-- eslint-disable vuejs-accessibility/no-static-element-interactions -->
    <svg class="network-map-overlay" xmlns="http://www.w3.org/2000/svg">
      <MapIconMasks :icons="glyphIconMasks" :prefix="iconMaskPrefix" />
      <g ref="overlayGroupRef">
        <circle
          v-for="ripple in activeRipples"
          :key="ripple.id"
          :cx="ripple.x"
          :cy="ripple.y"
          :r="ripple.radius"
          fill="none"
          :stroke="ripple.color"
          :stroke-width="2 / zoomLevel"
          :stroke-opacity="ripple.opacity"
          style="pointer-events: none"
        />

        <!-- Image regions — rendered behind zones -->
        <g
          v-for="region in allImageRegions"
          :key="region.id"
          :style="{
            cursor: isExtraImageRegion(region.id)
              ? imageDragState?.regionId === region.id
                ? 'grabbing'
                : 'grab'
              : 'default',
            pointerEvents: 'auto',
          }"
          @mousedown.stop="onImageRegionMousedown($event, region)"
          @pointerdown.stop
          @click.stop
        >
          <rect
            v-if="!region.imageUrl"
            :x="region.x"
            :y="region.y"
            :width="region.width"
            :height="region.height"
            fill="rgba(99, 102, 241, 0.05)"
            stroke="#6366f1"
            :stroke-width="1.5 / zoomLevel"
            stroke-dasharray="6 3"
            rx="4"
          />
          <image
            v-else
            :href="region.imageUrl"
            :x="region.x"
            :y="region.y"
            :width="region.width"
            :height="region.height"
            :opacity="region.opacity"
            preserveAspectRatio="xMidYMid meet"
          />
          <rect
            v-if="selectedImageRegionId === region.id"
            :x="region.x"
            :y="region.y"
            :width="region.width"
            :height="region.height"
            fill="none"
            stroke="#60a5fa"
            :stroke-width="2 / zoomLevel"
            rx="4"
            style="pointer-events: none"
          />
          <text
            v-if="region.label"
            :x="region.x + 8"
            :y="region.y + region.height - 8"
            font-family="inherit"
            font-size="10"
            font-weight="500"
            fill="#6366f1"
            fill-opacity="0.85"
            style="pointer-events: none; user-select: none"
          >
            {{ region.label }}
          </text>
          <template v-if="selectedImageRegionId === region.id && isExtraImageRegion(region.id)">
            <rect
              v-for="handle in getImageRegionHandles(region)"
              :key="handle.type"
              :x="handle.x - 5 / zoomLevel"
              :y="handle.y - 5 / zoomLevel"
              :width="10 / zoomLevel"
              :height="10 / zoomLevel"
              fill="#ffffff"
              stroke="#60a5fa"
              :stroke-width="1.5 / zoomLevel"
              rx="1"
              :style="{
                cursor:
                  handle.type === 'resize-nw' || handle.type === 'resize-se'
                    ? 'nwse-resize'
                    : 'nesw-resize',
                pointerEvents: 'auto',
              }"
              @mousedown.stop="onImageHandleMousedown($event, region, handle.type)"
            />
          </template>
        </g>

        <g
          v-for="img in baseImageDecorations"
          :key="img.id"
          :style="{
            cursor: editMode ? (baseDragState?.id === img.id ? 'grabbing' : 'grab') : 'default',
            pointerEvents: editMode ? 'auto' : 'none',
          }"
          @mousedown.stop="editMode && startBaseDrag($event, img.id, img.pos.x, img.pos.y)"
          @pointerdown.stop
          @click.stop
          @contextmenu.stop.prevent="editMode && onBaseElementContextMenu($event, img.id)"
        >
          <image
            v-if="img.url"
            :href="img.url"
            :x="img.pos.x"
            :y="img.pos.y"
            :width="img.width"
            :height="img.height"
            preserveAspectRatio="xMidYMid meet"
          />
          <template v-else>
            <rect
              :x="img.pos.x"
              :y="img.pos.y"
              :width="img.width"
              :height="img.height"
              fill="rgba(148, 163, 184, 0.08)"
              stroke="#94a3b8"
              :stroke-width="1 / zoomLevel"
              stroke-dasharray="6 3"
              rx="4"
            />
            <text
              :x="img.pos.x + img.width / 2"
              :y="img.pos.y + img.height / 2"
              font-family="inherit"
              font-size="11"
              text-anchor="middle"
              dominant-baseline="central"
              fill="#94a3b8"
              style="pointer-events: none; user-select: none"
            >
              image
            </text>
          </template>
          <rect
            v-if="selectedElementId === img.id"
            :x="img.pos.x"
            :y="img.pos.y"
            :width="img.width"
            :height="img.height"
            fill="none"
            stroke="#60a5fa"
            :stroke-width="2 / zoomLevel"
            rx="4"
            style="pointer-events: none"
          />
          <template v-if="editMode && selectedElementId === img.id">
            <rect
              v-for="handle in getBaseHandles({
                x: img.pos.x,
                y: img.pos.y,
                width: img.width,
                height: img.height,
              })"
              :key="handle.type"
              :x="handle.x - 5 / zoomLevel"
              :y="handle.y - 5 / zoomLevel"
              :width="10 / zoomLevel"
              :height="10 / zoomLevel"
              fill="#ffffff"
              stroke="#60a5fa"
              :stroke-width="1.5 / zoomLevel"
              rx="1"
              :style="{
                cursor:
                  handle.type === 'resize-nw' || handle.type === 'resize-se'
                    ? 'nwse-resize'
                    : 'nesw-resize',
                pointerEvents: 'auto',
              }"
              @mousedown.stop="
                onBaseResizeMousedown(
                  $event,
                  img.id,
                  { x: img.pos.x, y: img.pos.y, width: img.width, height: img.height },
                  handle.type,
                )
              "
            />
          </template>
        </g>

        <!-- Zone group-boxes — fill is pointer-events:none so nodes inside remain clickable -->
        <g v-for="zone in allZones" :key="zone.id" style="pointer-events: none">
          <!-- Visual fill (pass-through to Cytoscape nodes underneath) -->
          <rect
            :x="zone.x"
            :y="zone.y"
            :width="zone.width"
            :height="zone.height"
            :fill="zone.style.color"
            :fill-opacity="zone.style.opacity"
            stroke="none"
            pointer-events="none"
            rx="6"
          />
          <rect
            :x="zone.x"
            :y="zone.y"
            :width="zone.width"
            :height="zone.height"
            fill="none"
            :stroke="isZoneSelected(zone) ? '#60a5fa' : zone.style.color"
            :stroke-opacity="isZoneSelected(zone) ? 0.9 : 0.25"
            :stroke-width="isZoneSelected(zone) ? 2 / zoomLevel : 1"
            pointer-events="none"
            rx="6"
          />
          <!-- Header bar: drag handle and selection / context-menu target -->
          <rect
            :x="zone.x"
            :y="zone.y"
            :width="zone.width"
            :height="24"
            fill="transparent"
            :style="{
              pointerEvents: 'auto',
              cursor: isZoneDraggable(zone.id)
                ? zoneDragState?.zoneId === zone.id || baseDragState?.id === zone.id
                  ? 'grabbing'
                  : 'grab'
                : 'default',
            }"
            rx="6"
            @mousedown.stop="onZoneMousedown($event, zone)"
            @pointerdown.stop
            @click.stop
            @contextmenu.stop.prevent="onZoneContextMenu($event, zone)"
          />
          <text
            :x="zone.x + 10"
            :y="zone.y + 18"
            font-family="inherit"
            font-size="11"
            font-weight="600"
            :fill="zone.style.color"
            fill-opacity="0.85"
            style="pointer-events: none; user-select: none"
          >
            {{ zone.label }}
          </text>
          <template v-if="selectedZoneId === zone.id && isExtraZone(zone.id)">
            <rect
              v-for="handle in getZoneHandles(zone)"
              :key="handle.type"
              :x="handle.x - 5 / zoomLevel"
              :y="handle.y - 5 / zoomLevel"
              :width="10 / zoomLevel"
              :height="10 / zoomLevel"
              fill="#ffffff"
              stroke="#60a5fa"
              :stroke-width="1.5 / zoomLevel"
              rx="1"
              :style="{
                cursor:
                  handle.type === 'resize-nw' || handle.type === 'resize-se'
                    ? 'nwse-resize'
                    : 'nesw-resize',
                pointerEvents: 'auto',
              }"
              @mousedown.stop="onHandleMousedown($event, zone, handle.type)"
            />
          </template>
          <!-- Resize handles for persisted (base) group boxes in edit mode. -->
          <template v-if="editMode && !isExtraZone(zone.id) && selectedElementId === zone.id">
            <rect
              v-for="handle in getBaseHandles(zone)"
              :key="`base-${handle.type}`"
              :x="handle.x - 5 / zoomLevel"
              :y="handle.y - 5 / zoomLevel"
              :width="10 / zoomLevel"
              :height="10 / zoomLevel"
              fill="#ffffff"
              stroke="#60a5fa"
              :stroke-width="1.5 / zoomLevel"
              rx="1"
              :style="{
                cursor:
                  handle.type === 'resize-nw' || handle.type === 'resize-se'
                    ? 'nwse-resize'
                    : 'nesw-resize',
                pointerEvents: 'auto',
              }"
              @mousedown.stop="
                onBaseResizeMousedown(
                  $event,
                  zone.id,
                  { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
                  handle.type,
                )
              "
            />
          </template>
        </g>

        <!-- Drawn before the nodes so node names win any overlap; promoted labels come last. -->
        <NetworkMapLinkLabel
          v-for="box in baseEdgeLabels"
          :key="box.id"
          :box="box"
          :font-size="LABEL_FONT_SIZE"
          :translucent="renderOptions.translucentLabelBackground"
        />

        <!-- Faded as one layer, so overlapping nodes do not show through each other. -->
        <g :opacity="labelPlateOpacity">
          <MapNodeFigure
            v-for="node in paintedNodes"
            :key="node.id"
            :node="node"
            :mask-prefix="iconMaskPrefix"
          />
        </g>

        <!-- Above the nodes, beneath the editing handles and the promoted labels. -->
        <NetworkMapOverflowTable
          v-for="table in placedTables"
          :key="table.id"
          :table="table"
          :font-size="LABEL_FONT_SIZE"
          :hot-row="hoveredTableRow?.key ?? null"
          :hot-edges="hotTableEdges"
          @drag-start="onTableDragStart($event, table)"
          @reset="onTableReset(table)"
          @row-enter="onTableRowEnter"
          @row-leave="onTableRowLeave"
        />

        <!-- Floor-plan resize: a single bottom-right handle, as in legacy. -->
        <g v-if="floorPlanResizeTarget">
          <rect
            v-if="floorPlanResizeState"
            :x="floorPlanResizeTarget.x - floorPlanResizeTarget.w / 2"
            :y="floorPlanResizeTarget.y - floorPlanResizeTarget.h / 2"
            :width="floorPlanResizeTarget.w"
            :height="floorPlanResizeTarget.h"
            rx="8"
            fill="none"
            stroke="#60a5fa"
            :stroke-width="1.5 / zoomLevel"
            stroke-dasharray="4 3"
            style="pointer-events: none"
          />
          <rect
            :x="floorPlanResizeTarget.x + floorPlanResizeTarget.w / 2 - 5 / zoomLevel"
            :y="floorPlanResizeTarget.y + floorPlanResizeTarget.h / 2 - 5 / zoomLevel"
            :width="10 / zoomLevel"
            :height="10 / zoomLevel"
            fill="#ffffff"
            stroke="#60a5fa"
            :stroke-width="1.5 / zoomLevel"
            rx="1"
            style="cursor: nwse-resize; pointer-events: auto"
            @mousedown.stop="onFloorPlanResizeMousedown($event, floorPlanResizeTarget)"
          />
        </g>

        <g
          v-for="tb in baseTextBoxes"
          :key="tb.id"
          :style="{
            cursor: editMode ? (baseDragState?.id === tb.id ? 'grabbing' : 'grab') : 'default',
            pointerEvents: editMode ? 'auto' : 'none',
          }"
          @mousedown.stop="editMode && startBaseDrag($event, tb.id, tb.pos.x, tb.pos.y)"
          @pointerdown.stop
          @click.stop
          @contextmenu.stop.prevent="editMode && onBaseElementContextMenu($event, tb.id)"
        >
          <rect
            :x="tb.pos.x"
            :y="tb.pos.y"
            :width="tb.boxW"
            :height="tb.boxH"
            :fill="tb.bg"
            :stroke="tb.border || 'none'"
            :stroke-width="tb.border ? 1 : 0"
            rx="3"
          />
          <text
            v-for="(line, i) in tb.lines"
            :key="i"
            :x="tb.pos.x + tb.padH"
            :y="tb.pos.y + tb.padV + tb.lineH * (i + 0.5)"
            font-family="inherit"
            :font-size="tb.fontSize"
            dominant-baseline="central"
            :fill="tb.fg"
            style="user-select: none; white-space: pre"
          >
            {{ line }}
          </text>
          <rect
            v-if="selectedElementId === tb.id"
            :x="tb.pos.x"
            :y="tb.pos.y"
            :width="tb.boxW"
            :height="tb.boxH"
            fill="none"
            stroke="#60a5fa"
            :stroke-width="2 / zoomLevel"
            rx="3"
            style="pointer-events: none"
          />
        </g>

        <g
          v-for="dc in baseDciContainers"
          :key="dc.id"
          :style="{
            cursor: editMode ? (baseDragState?.id === dc.id ? 'grabbing' : 'grab') : 'default',
            pointerEvents: editMode ? 'auto' : 'none',
          }"
          @mousedown.stop="editMode && startBaseDrag($event, dc.id, dc.pos.x, dc.pos.y)"
          @pointerdown.stop
          @click.stop
          @contextmenu.stop.prevent="editMode && onBaseElementContextMenu($event, dc.id)"
        >
          <rect
            :x="dc.pos.x"
            :y="dc.pos.y"
            :width="dc.width"
            :height="dc.height"
            :fill="dc.bg"
            :stroke="dc.border || 'none'"
            :stroke-width="dc.border ? 1 : 0"
            rx="4"
          />
          <text
            v-for="(line, i) in dc.lines"
            :key="i"
            :x="dc.pos.x + dc.width / 2"
            :y="dc.pos.y + dc.height / 2 + (i - (dc.lines.length - 1) / 2) * dc.lineH"
            font-family="inherit"
            :font-size="dc.fontSize"
            font-weight="600"
            text-anchor="middle"
            dominant-baseline="central"
            :fill="dc.fg"
            style="user-select: none"
          >
            {{ line }}
          </text>
          <rect
            v-if="selectedElementId === dc.id"
            :x="dc.pos.x"
            :y="dc.pos.y"
            :width="dc.width"
            :height="dc.height"
            fill="none"
            stroke="#60a5fa"
            :stroke-width="2 / zoomLevel"
            rx="4"
            style="pointer-events: none"
          />
          <template v-if="editMode && selectedElementId === dc.id">
            <rect
              v-for="handle in getBaseHandles({
                x: dc.pos.x,
                y: dc.pos.y,
                width: dc.width,
                height: dc.height,
              })"
              :key="handle.type"
              :x="handle.x - 5 / zoomLevel"
              :y="handle.y - 5 / zoomLevel"
              :width="10 / zoomLevel"
              :height="10 / zoomLevel"
              fill="#ffffff"
              stroke="#60a5fa"
              :stroke-width="1.5 / zoomLevel"
              rx="1"
              :style="{
                cursor:
                  handle.type === 'resize-nw' || handle.type === 'resize-se'
                    ? 'nwse-resize'
                    : 'nesw-resize',
                pointerEvents: 'auto',
              }"
              @mousedown.stop="
                onBaseResizeMousedown(
                  $event,
                  dc.id,
                  { x: dc.pos.x, y: dc.pos.y, width: dc.width, height: dc.height },
                  handle.type,
                )
              "
            />
          </template>
        </g>

        <g
          v-for="di in baseDciImages"
          :key="di.id"
          :style="{
            cursor: editMode ? (baseDragState?.id === di.id ? 'grabbing' : 'grab') : 'default',
            pointerEvents: editMode ? 'auto' : 'none',
          }"
          @mousedown.stop.prevent="editMode && startBaseDrag($event, di.id, di.pos.x, di.pos.y)"
          @pointerdown.stop
          @click.stop
          @contextmenu.stop.prevent="editMode && onBaseElementContextMenu($event, di.id)"
        >
          <image
            v-if="di.url"
            :href="di.url"
            :x="di.pos.x"
            :y="di.pos.y"
            :width="di.width"
            :height="di.height"
            preserveAspectRatio="xMidYMid meet"
          />
          <template v-else>
            <rect
              :x="di.pos.x"
              :y="di.pos.y"
              :width="di.width"
              :height="di.height"
              fill="rgba(148, 163, 184, 0.08)"
              stroke="#94a3b8"
              :stroke-width="1 / zoomLevel"
              stroke-dasharray="6 3"
              rx="4"
            />
            <text
              :x="di.pos.x + di.width / 2"
              :y="di.pos.y + di.height / 2"
              font-family="inherit"
              font-size="10"
              text-anchor="middle"
              dominant-baseline="central"
              fill="#94a3b8"
              style="pointer-events: none; user-select: none"
            >
              DCI image
            </text>
          </template>
          <rect
            v-if="selectedElementId === di.id"
            :x="di.pos.x"
            :y="di.pos.y"
            :width="di.width"
            :height="di.height"
            fill="none"
            stroke="#60a5fa"
            :stroke-width="2 / zoomLevel"
            rx="4"
            style="pointer-events: none"
          />
          <template v-if="editMode && selectedElementId === di.id">
            <rect
              v-for="handle in getBaseHandles({
                x: di.pos.x,
                y: di.pos.y,
                width: di.width,
                height: di.height,
              })"
              :key="handle.type"
              :x="handle.x - 5 / zoomLevel"
              :y="handle.y - 5 / zoomLevel"
              :width="10 / zoomLevel"
              :height="10 / zoomLevel"
              fill="#ffffff"
              stroke="#60a5fa"
              :stroke-width="1.5 / zoomLevel"
              rx="1"
              :style="{
                cursor:
                  handle.type === 'resize-nw' || handle.type === 'resize-se'
                    ? 'nwse-resize'
                    : 'nesw-resize',
                pointerEvents: 'auto',
              }"
              @mousedown.stop="
                onBaseResizeMousedown(
                  $event,
                  di.id,
                  { x: di.pos.x, y: di.pos.y, width: di.width, height: di.height },
                  handle.type,
                )
              "
            />
          </template>
        </g>

        <rect
          v-if="drawRect"
          :x="Math.min(drawRect.startX, drawRect.currentX)"
          :y="Math.min(drawRect.startY, drawRect.currentY)"
          :width="Math.abs(drawRect.currentX - drawRect.startX)"
          :height="Math.abs(drawRect.currentY - drawRect.startY)"
          fill="rgba(99, 102, 241, 0.1)"
          stroke="#6366f1"
          :stroke-width="1.5 / zoomLevel"
          stroke-dasharray="6 3"
          rx="4"
          style="pointer-events: none"
        />

        <!-- Draw surface: captures pointer events in draw mode -->
        <rect
          v-if="drawMode === 'image-region'"
          x="-50000"
          y="-50000"
          width="100000"
          height="100000"
          fill="transparent"
          style="cursor: crosshair; pointer-events: auto"
          @mousedown.stop="onDrawSurfaceMousedown"
          @pointerdown.stop
          @click.stop
        />

        <!-- Geo pick surface: dragging repositions the map center -->
        <rect
          v-if="geoPickActive"
          x="0"
          y="0"
          :width="mapBackdrop.page.w"
          :height="mapBackdrop.page.h"
          fill="transparent"
          :style="{ cursor: geoDragState ? 'grabbing' : 'grab', pointerEvents: 'auto' }"
          @mousedown.stop="onGeoDragMousedown"
          @pointerdown.stop
          @click.stop
          @contextmenu.stop.prevent
        />

        <!-- Link bend-point editing: "+" midpoint handles + draggable point handles -->
        <template v-if="bendEditGeom">
          <circle
            v-for="mid in bendAddHandles"
            :key="`bend-add-${mid.segIndex}`"
            :cx="mid.x"
            :cy="mid.y"
            :r="4 / zoomLevel"
            fill="#ffffff"
            stroke="#60a5fa"
            :stroke-width="1.25 / zoomLevel"
            style="cursor: copy; pointer-events: auto"
            @mousedown.stop.prevent="onBendAddPoint(mid.segIndex, mid.x, mid.y)"
            @click.stop
          />
          <rect
            v-for="(pt, i) in bendEditGeom.points"
            :key="`bend-pt-${i}`"
            :x="pt.x - 5 / zoomLevel"
            :y="pt.y - 5 / zoomLevel"
            :width="10 / zoomLevel"
            :height="10 / zoomLevel"
            fill="#60a5fa"
            stroke="#ffffff"
            :stroke-width="1.5 / zoomLevel"
            rx="2"
            style="cursor: move; pointer-events: auto"
            @mousedown.stop="onBendPointMousedown($event, i)"
            @contextmenu.stop.prevent
            @click.stop
          >
            <title>Drag to move, Alt or right-click to remove</title>
          </rect>
        </template>

        <!-- Promoted link labels, drawn last -->
        <NetworkMapLinkLabel
          v-for="box in promotedEdgeLabels"
          :key="box.id"
          :box="box"
          :font-size="LABEL_FONT_SIZE"
          :translucent="renderOptions.translucentLabelBackground"
          promoted
        />
      </g>
    </svg>
    <!-- eslint-enable vuejs-accessibility/no-static-element-interactions -->
  </div>
</template>

<style scoped>
.network-map-canvas-wrap {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}

/* Focused on click only to track the active pane; a ring would mark nothing actionable. */
.network-map-canvas-wrap:focus {
  outline: none;
}

.network-map-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.network-map-page-boundary {
  fill: none;
  stroke: var(--p-primary-color);
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
  opacity: 0.55;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.network-map-graph {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
}

.network-map-grid {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.network-map-grid path {
  stroke: var(--p-surface-border);
}

.network-map-leaders {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}

.network-map-overlay {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
</style>
