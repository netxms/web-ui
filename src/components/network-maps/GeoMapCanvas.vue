<script setup>
/**
 * Geographical map canvas: objects drawn as pins at their geolocation on a Leaflet tile map.
 * Elements without a geolocation, and non-object elements, are not drawn (as in the legacy
 * client); the host view reports the hidden count.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import cytoscape from 'cytoscape'
import L from 'leaflet'
import cytoscapeLeaflet from 'cytoscape-leaflet'
import 'leaflet/dist/leaflet.css'
import { getStatusHexColor, getStatusSoftBgHexColor } from '@/utils/objectUtils'
import { useTileUrl } from '@/composables/useTileUrl'
import { useTheme } from '@/composables/useTheme'
import {
  getLinkColor,
  getLinkDash,
  getLinkWidth,
  resolveLinkVisual,
  linkDefaultsChanged,
  resolveMapRenderOptions,
  bendPointsToSegments,
  MAP_INITIAL_VIEW_ZOOM_AND_CENTER,
} from '@/utils/networkMapUtils'
import { linkLabelBoxes, groupLabelBoxes } from '@/utils/networkMapLinkLabels'
import {
  createTableLayoutState,
  layoutLabelsWithTables,
  lineDegrees,
  lineSegments,
  nodeOverflowTable,
} from '@/utils/networkMapOverflowTables'
import { computeDisplayName } from '@/utils/topologyUtils'
import {
  buildDrawnLinks,
  fanEndpoint,
  groupLinkVisual,
  offsetEndpoints,
} from '@/utils/networkMapParallelLinks'
import { NODE_RADIUS, LABEL_FONT_SIZE } from '@/utils/networkMapNodeVisual'
import NetworkMapLinkLabel from './NetworkMapLinkLabel.vue'
import NetworkMapLabelLeaders from './NetworkMapLabelLeaders.vue'
import NetworkMapOverflowTable from './NetworkMapOverflowTable.vue'

cytoscape.use(cytoscapeLeaflet)

const props = defineProps({
  mapData: { type: Object, required: true },
  /** Keyed "nodeId:dciId". */
  dciValues: { type: Map, default: () => new Map() },
  hideLinks: { type: Boolean, default: false },
  hideLinkLabels: { type: Boolean, default: false },
  /** More than this many NORMAL links between two pins draw as one group line; 0 never merges. */
  linkMergeThreshold: { type: Number, default: 0 },
  overflowTables: { type: Boolean, default: true },
  /**
   * By node element id: table centre minus pin centre, container pixels. Null keeps them in
   * this canvas only.
   */
  tableOffsets: { type: Object, default: null },
  /** One-shot opening view from mapInitialView(), applied once the container has a size. */
  initialView: { type: Object, default: null },
})

const emit = defineEmits([
  'node-select',
  'node-dblclick',
  'node-middleclick',
  'node-contextmenu',
  'update:tableOffsets',
])

function nodePayload(node) {
  const d = node.data()
  return {
    id: node.id(),
    name: d.name,
    objectClass: d.objectClass,
    objectStatus: d.objectStatus,
    objectId: d.objectId,
  }
}

// Cytoscape never reports the middle button, so "open in a new tab" is picked up on the
// container and resolved through the node the pointer is already over.
let hoveredNodeId = null

function handleContainerAuxClick(e) {
  if (e.button !== 1 || !hoveredNodeId) return
  const node = cy?.getElementById(hoveredNodeId)
  if (!node?.length) return
  e.preventDefault()
  emit('node-middleclick', nodePayload(node))
}

function suppressMiddleMouseDown(e) {
  if (e.button === 1) e.preventDefault()
}

const { tileUrl } = useTileUrl()
const { isDark } = useTheme()

const containerRef = ref(null)
const overlayRef = ref(null)
const leaderRef = ref(null)
let cy = null
let mapHandler = null
let tileLayerRef = null
let cytoscapePanel = null
let textCtx = null
let fontFamily = 'inherit'
// Lets maps without bend points skip the per-move style refresh.
let hasGeoBendPoints = false
let drawnLinksById = new Map()
let initialViewApplied = false
// The "nothing placed" fallback centres the map once, so it cannot fight the user's panning.
let fallbackViewApplied = false

const renderOptions = computed(() => resolveMapRenderOptions(props.mapData))

function edgeDash(ele) {
  return ele.data('lineDash') ?? getLinkDash(ele.data())
}

function edgeLineColor(ele) {
  return ele.data('lineColor') ?? getLinkColor(ele.data())
}

/** Container pixels; projected on demand since they change with every pan and zoom. */
function projectedBendPoints(ele) {
  const geo = ele.data('geoBendPoints')
  if (!geo?.length || !mapHandler) return []
  return geo.map((g) => {
    const p = mapHandler.map.latLngToContainerPoint(L.latLng(g.lat, g.lng))
    return { x: p.x, y: p.y }
  })
}

function edgeSegments(ele) {
  const points = projectedBendPoints(ele)
  if (!points.length) return null
  const geometry = bendPointsToSegments(points, ele.source().position(), ele.target().position())
  if (!geometry) return null
  return {
    weights: geometry.weights.map((w) => w.toFixed(4)).join(' '),
    dists: geometry.distances.map((d) => d.toFixed(2)).join(' '),
  }
}

const PIN_BORDER_WIDTH = 2.5

const PIN_NAME_FONT_SIZE = 12
const PIN_NAME_MARGIN = 6
const PIN_NAME_PADDING = 2

const PIN_OUTLINE = {
  kind: 'ellipse',
  halfW: NODE_RADIUS + PIN_BORDER_WIDTH / 2,
  halfH: NODE_RADIUS + PIN_BORDER_WIDTH / 2,
}

/** A fanned-out parallel link ends where its offset line leaves the pin, so lines stay parallel. */
function edgeEndpoint(ele, end) {
  const offset = ele.data('fanOffset')
  if (!offset) return 'outside-to-node'
  const source = ele.source().position()
  const target = ele.target().position()
  const p = fanEndpoint(source, target, offset, end, PIN_OUTLINE)
  return `${p.x}px ${p.y}px`
}

function buildStyle() {
  return [
    {
      selector: 'core',
      style: {
        'active-bg-opacity': 0,
        'active-bg-size': 0,
        'selection-box-opacity': 0,
        'selection-box-border-width': 0,
      },
    },
    {
      selector: 'node',
      style: {
        shape: 'ellipse',
        width: NODE_RADIUS * 2,
        height: NODE_RADIUS * 2,
        'background-color': (ele) => getStatusSoftBgHexColor(ele.data('objectStatus') ?? 5),
        'border-color': (ele) => getStatusHexColor(ele.data('objectStatus') ?? 5),
        'border-width': PIN_BORDER_WIDTH,
        label: 'data(name)',
        'text-valign': 'bottom',
        'text-margin-y': PIN_NAME_MARGIN,
        'font-size': PIN_NAME_FONT_SIZE,
        color: () => (isDark.value ? '#e2e8f0' : '#1e293b'),
        'text-background-color': () => (isDark.value ? '#0f172a' : '#ffffff'),
        'text-background-opacity': 0.75,
        'text-background-padding': `${PIN_NAME_PADDING}px`,
      },
    },
    {
      selector: 'node:selected',
      style: { 'border-width': 3.5, 'border-color': '#60a5fa' },
    },
    {
      selector: 'node:active',
      style: { 'overlay-opacity': 0 },
    },
    {
      selector: 'edge',
      style: {
        display: () => (props.hideLinks ? 'none' : 'element'),
        width: (ele) => ele.data('lineWidth') ?? getLinkWidth(ele.data()),
        'line-color': edgeLineColor,
        'line-style': (ele) => (edgeDash(ele) !== '0' ? 'dashed' : 'solid'),
        'line-dash-pattern': (ele) => {
          const dash = edgeDash(ele)
          return dash === '0' ? [1, 0] : dash.split(' ').map(Number)
        },
        'curve-style': (ele) => (edgeSegments(ele) ? 'segments' : 'straight'),
        'edge-distances': 'node-position',
        'segment-weights': (ele) => edgeSegments(ele)?.weights ?? '0.5',
        'segment-distances': (ele) => edgeSegments(ele)?.dists ?? '0',
        'source-endpoint': (ele) => edgeEndpoint(ele, 'source'),
        'target-endpoint': (ele) => edgeEndpoint(ele, 'target'),
        // Legacy decorates the target end only.
        'target-arrow-shape': () => (renderOptions.value.showLinkDirection ? 'triangle' : 'none'),
        'target-arrow-color': edgeLineColor,
        'arrow-scale': 1.1,
        // Drawn in the SVG overlay: a link can need more boxes than cytoscape has label slots.
        label: '',
      },
    },
    {
      selector: 'edge:active',
      style: { 'overlay-opacity': 0 },
    },
    {
      selector: 'edge.table-row-hot',
      style: { 'underlay-color': '#60a5fa', 'underlay-opacity': 0.35, 'underlay-padding': 5 },
    },
  ]
}

function buildElements() {
  const placed = new Set()
  const nodes = []
  for (const el of props.mapData.elements ?? []) {
    if (el.type !== 'object' || !el.geolocation) continue
    placed.add(el.id)
    nodes.push({
      data: {
        id: el.id,
        name: el.objectName ?? '',
        objectClass: el.objectClass ?? 'Node',
        objectStatus: el.objectStatus ?? 5,
        objectId: el.objectId ?? null,
        geolocation: el.geolocation,
      },
    })
  }

  const links = (props.mapData.links ?? []).filter(
    (link) => placed.has(link.from) && placed.has(link.to),
  )
  hasGeoBendPoints = links.some((link) => link.geoBendPoints?.length)
  const drawnLinks = buildDrawnLinks(
    links,
    props.linkMergeThreshold,
    (link) => !!link.geoBendPoints?.length,
  )
  drawnLinksById = new Map(drawnLinks.map((drawn) => [drawn.id, drawn]))
  const edges = drawnLinks.map((drawn) =>
    drawn.kind === 'group' ? groupEdge(drawn) : linkEdge(drawn),
  )

  return [...nodes, ...edges]
}

function linkEdge({ link, fanOffset }) {
  // Demo links have no raw config and fall back to type heuristics.
  const visual = link.raw ? resolveLinkVisual(link, props.mapData.rawContent) : null
  return {
    data: {
      id: link.id,
      source: link.from,
      target: link.to,
      type: link.type ?? 0,
      label: link.label,
      color: link.color,
      customColor: link.customColor,
      lineDash: visual?.dash ?? null,
      lineWidth: visual?.width ?? null,
      lineColor: visual?.color ?? null,
      geoBendPoints: link.geoBendPoints?.length ? link.geoBendPoints : null,
      fanOffset,
    },
    classes: fanOffset ? 'fanned' : '',
  }
}

function groupEdge(group) {
  const visual = groupLinkVisual(group.members, props.mapData.rawContent)
  return {
    data: {
      id: group.id,
      source: group.from,
      target: group.to,
      type: visual.member.type ?? 0,
      label: `${group.members.length} links`,
      color: visual.member.color,
      customColor: visual.member.customColor,
      lineDash: visual.dash,
      lineWidth: visual.width,
      lineColor: visual.color,
      geoBendPoints: null,
      fanOffset: group.fanOffset,
    },
    classes: group.fanOffset ? 'fanned' : '',
  }
}

// The label overlay is in container pixels, so it needs no viewport transform of its own.
const edgeLabels = ref([])

const placedTables = ref([])

// Warm-start state for layoutLabelsWithTables, per canvas instance.
const labelLayoutState = createTableLayoutState()

// The hovered link, or the link of the hovered table row.
const hotEdgeId = ref(null)
const baseEdgeLabels = computed(() => edgeLabels.value.filter((b) => b.edgeId !== hotEdgeId.value))
const hotEdgeLabels = computed(() => edgeLabels.value.filter((b) => b.edgeId === hotEdgeId.value))
const hotTableEdges = computed(() => (hotEdgeId.value ? [hotEdgeId.value] : []))

// Pin positions at the last layout, to tell a pan from a change that needs a new layout.
let labelledPins = new Map()

function measureText(text, fontSize = LABEL_FONT_SIZE, fontWeight = 400) {
  if (!textCtx) return text.length * fontSize * 0.6
  textCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  return textCtx.measureText(text).width
}

/**
 * Per pin: the pin and the name cytoscape draws under it. Container pixels.
 * @returns {Map<string, { x: number, y: number, w: number, h: number }[]>}
 */
function labelObstacles() {
  const byNode = new Map()
  const outline = NODE_RADIUS + PIN_BORDER_WIDTH / 2
  for (const node of cy.nodes()) {
    const { x, y } = node.position()
    const boxes = [{ x, y, w: outline * 2, h: outline * 2 }]
    const name = node.data('name')
    if (name) {
      const h = PIN_NAME_FONT_SIZE * 1.2 + PIN_NAME_PADDING * 2
      boxes.push({
        x,
        y: y + outline + PIN_NAME_MARGIN + h / 2,
        w: measureText(name, PIN_NAME_FONT_SIZE) + PIN_NAME_PADDING * 2,
        h,
      })
    }
    byNode.set(node.id(), boxes)
  }
  return byNode
}

function pinPositions() {
  const positions = new Map()
  for (const node of cy.nodes()) positions.set(node.id(), { ...node.position() })
  return positions
}

function pinInfo(id) {
  const node = cy?.getElementById(id)
  if (!node?.length) return undefined
  return {
    name: computeDisplayName(node.data('name') ?? ''),
    statusColor: getStatusHexColor(node.data('objectStatus') ?? 5),
  }
}

/**
 * @param {'warm' | 'settle'} [pass] - 'warm' for a value refresh or mid-gesture, 'settle' after
 *   a zoom or a rebuild
 */
function rebuildEdgeLabels(pass = 'warm') {
  if (labelFrame !== null) {
    cancelAnimationFrame(labelFrame)
    labelFrame = null
  }
  if (!cy || props.hideLinks || props.hideLinkLabels) {
    edgeLabels.value = []
    placedTables.value = []
    clearTableRowHover()
    return
  }
  // Before Leaflet has a size every pin projects to the same point and would poison the warm start.
  const size = mapHandler?.map.getSize()
  if (!size?.x || !size?.y) {
    edgeLabels.value = []
    placedTables.value = []
    return
  }
  const boxes = []
  const lines = []
  const segments = []
  for (const ele of cy.edges()) {
    const drawn = drawnLinksById.get(ele.id())
    if (!drawn) continue
    const { source, target } = offsetEndpoints(
      ele.source().position(),
      ele.target().position(),
      drawn.fanOffset,
    )
    const bendPoints = projectedBendPoints(ele)
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
  const { labels, tables } = layoutLabelsWithTables(boxes, {
    nodeBoxes: labelObstacles(),
    segments,
    degrees: lineDegrees(lines),
    state: labelLayoutState,
    enabled: props.overflowTables,
    buildTable: (nodeId) =>
      nodeOverflowTable(nodeId, lines, {
        nodeInfo: pinInfo,
        dciValues: props.dciValues,
        measureText,
      }),
    offsets: currentTableOffsets(),
    bounds: { left: 0, top: 0, right: size.x, bottom: size.y },
    pass,
  })
  edgeLabels.value = labels
  placedTables.value = tables
  labelledPins = pinPositions()
  // A table that went away under the pointer never reports the pointer leaving.
  const row = hoveredTableRow
  if (row && !tables.some((t) => t.rows.some((r) => r.key === row.key))) clearTableRowHover()
}

/** Shifts the placed labels when every pin moved by the same vector; returns whether it did. */
function panLabels() {
  if (!edgeLabels.value.length || labelledPins.size !== cy.nodes().length) return false
  let dx = null
  let dy = null
  for (const node of cy.nodes()) {
    const before = labelledPins.get(node.id())
    if (!before) return false
    const { x, y } = node.position()
    if (dx === null) {
      dx = x - before.x
      dy = y - before.y
    } else if (Math.abs(x - before.x - dx) > 0.01 || Math.abs(y - before.y - dy) > 0.01) {
      return false
    }
  }
  if (dx === null) return false
  if (dx || dy) {
    const shift = (item) => ({
      ...item,
      x: item.x + dx,
      y: item.y + dy,
      leader: item.leader && {
        x1: item.leader.x1 + dx,
        y1: item.leader.y1 + dy,
        x2: item.leader.x2 + dx,
        y2: item.leader.y2 + dy,
      },
    })
    edgeLabels.value = edgeLabels.value.map(shift)
    placedTables.value = placedTables.value.map(shift)
    labelledPins = pinPositions()
  }
  return true
}

const TABLE_DRAG_THRESHOLD = 3

// Used when the host does not bind tableOffsets.
const localTableOffsets = ref({})
const activeTableOffsets = computed(() => props.tableOffsets ?? localTableOffsets.value)

// `offset` stays null until the pointer passes TABLE_DRAG_THRESHOLD.
let tableDrag = null

let labelFrame = null

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
  if (!tableDrag) return
  const dx = event.clientX - tableDrag.startX
  const dy = event.clientY - tableDrag.startY
  // A layout on a plain click would get in the way of the double-click that resets a table.
  if (!tableDrag.offset && Math.hypot(dx, dy) < TABLE_DRAG_THRESHOLD) return
  tableDrag.offset = { x: tableDrag.base.x + dx, y: tableDrag.base.y + dy }
  if (labelFrame === null) {
    labelFrame = requestAnimationFrame(() => {
      labelFrame = null
      rebuildEdgeLabels('warm')
    })
  }
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

function onTableReset(table) {
  if (!activeTableOffsets.value[table.nodeId]) return
  const offsets = { ...activeTableOffsets.value }
  delete offsets[table.nodeId]
  commitTableOffsets(offsets)
}

let hoveredTableRow = null
const hotTableRow = ref(null)

function onTableRowEnter(row) {
  if (tableDrag || !cy) return
  clearTableRowHover()
  hoveredTableRow = { key: row.key, edgeId: row.edgeId }
  hotTableRow.value = row.key
  hotEdgeId.value = row.edgeId
  cy.getElementById(row.edgeId).addClass('table-row-hot')
}

function onTableRowLeave(row) {
  if (hoveredTableRow?.key === row.key) clearTableRowHover()
}

function clearTableRowHover() {
  const row = hoveredTableRow
  if (!row) return
  hoveredTableRow = null
  hotTableRow.value = null
  if (hotEdgeId.value === row.edgeId) hotEdgeId.value = null
  cy?.getElementById(row.edgeId).removeClass('table-row-hot')
}

/** @param {'warm' | 'settle'} [pass] */
function positionNodes(pass = 'warm') {
  if (!cy || !mapHandler) return
  cy.nodes().forEach((node) => {
    const geo = node.data('geolocation')
    if (!geo) return
    const point = mapHandler.map.latLngToContainerPoint(L.latLng(geo.lat, geo.lng))
    node.position({ x: point.x, y: point.y })
  })
  // Bend-point segments are relative to the endpoints, and fanned endpoints depend on the
  // direction between pins, which shifts with Leaflet's pixel rounding at each zoom level.
  if (hasGeoBendPoints) cy.style().update()
  else cy.edges('.fanned').updateStyle()
  if (pass === 'settle' || !panLabels()) rebuildEdgeLabels(pass)
}

function placedBounds() {
  const latLngs = []
  cy?.nodes().forEach((node) => {
    const geo = node.data('geolocation')
    if (geo) latLngs.push(L.latLng(geo.lat, geo.lng))
  })
  return latLngs.length ? L.latLngBounds(latLngs) : null
}

function fitToPlaced() {
  const bounds = placedBounds()
  if (!bounds || !mapHandler) return false
  // A zero-extent box would get Leaflet's maximum zoom; legacy uses a street-level zoom.
  const degenerate = bounds.getNorthEast().equals(bounds.getSouthWest())
  mapHandler.map.fitBounds(bounds, {
    padding: [40, 40],
    ...(degenerate ? { maxZoom: 12 } : {}),
  })
  return true
}

function applyInitialView() {
  if (initialViewApplied || !mapHandler) return
  const map = mapHandler.map
  const size = map.getSize()
  if (!size.x || !size.y) return // retried on resize
  const view = props.initialView

  if (view?.mode === MAP_INITIAL_VIEW_ZOOM_AND_CENTER) {
    initialViewApplied = true
    map.setView([view.lat, view.lon], view.zoom)
    return
  }

  // FIT_TO_SCREEN (the default): left unconsumed without content, so late elements get framed.
  if (fitToPlaced()) {
    initialViewApplied = true
    return
  }
  if (!fallbackViewApplied && view) {
    fallbackViewApplied = true
    map.setView([view.lat, view.lon], view.zoom)
  }
}

onMounted(() => {
  textCtx = document.createElement('canvas').getContext('2d')
  fontFamily = getComputedStyle(containerRef.value).fontFamily || 'inherit'

  cy = cytoscape({
    container: containerRef.value,
    elements: buildElements(),
    style: buildStyle(),
    boxSelectionEnabled: false,
  })

  tileLayerRef = L.tileLayer(tileUrl.value, {
    maxZoom: 18,
    attribution:
      '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  })

  mapHandler = cy.L(
    { layers: [tileLayerRef] },
    {
      getPosition: (node) => {
        const geo = node.data('geolocation')
        if (!geo) return null
        return L.latLng(geo.lat, geo.lng)
      },
    },
  )
  mapHandler.map.attributionControl.setPrefix('')
  // Top-left is where the embedding views put their own overlays.
  mapHandler.map.zoomControl?.setPosition('bottomright')
  // Contains Leaflet's internal z-indexes (1-7) so the cytoscape canvases paint on top.
  mapHandler.mapContainer.style.zIndex = '0'

  // A panel around Cytoscape's canvases takes the CSS transform during Leaflet zoom animations.
  cytoscapePanel = document.createElement('div')
  cytoscapePanel.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;'
  Array.from(containerRef.value.children).forEach((child) => {
    if (child !== mapHandler.mapContainer) cytoscapePanel.appendChild(child)
  })
  containerRef.value.appendChild(cytoscapePanel)
  // Labels above the canvases, leaders beneath them, both under the zoom-animation transform.
  cytoscapePanel.appendChild(overlayRef.value)
  cytoscapePanel.insertBefore(leaderRef.value, cytoscapePanel.firstChild)

  // Synchronous, unlike the plugin's own handler, which lags the tiles by one frame.
  mapHandler.map.on('move', () => positionNodes())

  // `move` does not fire during Leaflet's CSS zoom animation; scale the panel the same way.
  mapHandler.map.on('zoomanim', (e) => {
    const map = mapHandler.map
    const scale = map.getZoomScale(e.zoom)
    // Not getPixelOrigin(): after a pan Leaflet leaves a CSS offset on the map pane without
    // updating it. project(center) - latLngToContainerPoint(center) cancels that offset.
    const currentCenter = map.getCenter()
    const oldOrigin = map
      .project(currentCenter, map.getZoom())
      .subtract(map.latLngToContainerPoint(currentCenter))
    const newOrigin = map.project(e.center, e.zoom).subtract(map.getSize().divideBy(2))
    const focalX = (newOrigin.x - scale * oldOrigin.x) / (scale - 1)
    const focalY = (newOrigin.y - scale * oldOrigin.y) / (scale - 1)
    cytoscapePanel.style.transition = 'transform 0.25s cubic-bezier(0,0,0.25,1)'
    cytoscapePanel.style.transformOrigin = `${focalX}px ${focalY}px`
    cytoscapePanel.style.transform = `scale(${scale})`
  })

  // The rAF lets Cytoscape commit the new positions before the transform is removed.
  mapHandler.map.on('zoomend', () => {
    positionNodes('settle')
    requestAnimationFrame(() => {
      cytoscapePanel.style.transition = 'none'
      cytoscapePanel.style.transform = ''
      cytoscapePanel.style.transformOrigin = ''
    })
  })

  // The viewport may still be 0x0 on mount.
  mapHandler.map.on('resize', applyInitialView)

  cy.on('tap', 'node', (evt) => {
    emit('node-select', [nodePayload(evt.target)])
  })

  cy.on('dblclick', 'node', (evt) => {
    emit('node-dblclick', nodePayload(evt.target), evt.originalEvent)
  })

  cy.on('mouseover', 'node', (evt) => {
    hoveredNodeId = evt.target.id()
  })
  cy.on('mouseout', 'node', () => {
    hoveredNodeId = null
  })
  cy.on('mouseover', 'edge', (evt) => {
    hotEdgeId.value = evt.target.id()
  })
  cy.on('mouseout', 'edge', () => {
    hotEdgeId.value = null
  })

  cy.on('cxttap', 'node', (evt) => {
    evt.originalEvent?.preventDefault()
    emit('node-contextmenu', evt.originalEvent, nodePayload(evt.target))
  })

  containerRef.value.addEventListener('auxclick', handleContainerAuxClick)
  containerRef.value.addEventListener('mousedown', suppressMiddleMouseDown)

  applyInitialView()
  positionNodes()
})

// Settings-only preview changes reuse the element and link arrays, so they skip the rebuild
// and keep the selection.
watch(
  () => props.mapData,
  (newData, oldData) => {
    if (!cy) return
    if (
      oldData &&
      newData.elements === oldData.elements &&
      newData.links === oldData.links &&
      !linkDefaultsChanged(newData, oldData)
    )
      return
    rebuildElements()
    applyInitialView()
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
  cy.batch(() => {
    cy.elements().remove()
    cy.add(buildElements())
  })
  cy.style().update()
  positionNodes('settle')
}

watch([isDark, () => props.hideLinks, renderOptions], () => cy?.style().update())

watch([() => props.dciValues, () => props.hideLinkLabels, () => props.hideLinks], () =>
  rebuildEdgeLabels(),
)
watch([() => props.overflowTables, activeTableOffsets], () => rebuildEdgeLabels('settle'))

watch(tileUrl, (url) => {
  if (!mapHandler) return
  if (tileLayerRef) mapHandler.map.removeLayer(tileLayerRef)
  tileLayerRef = L.tileLayer(url, {
    maxZoom: 18,
    attribution:
      '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(mapHandler.map)
})

onUnmounted(() => {
  if (labelFrame !== null) cancelAnimationFrame(labelFrame)
  window.removeEventListener('mousemove', onTableDragMove)
  window.removeEventListener('mouseup', onTableDragEnd)
  containerRef.value?.removeEventListener('auxclick', handleContainerAuxClick)
  containerRef.value?.removeEventListener('mousedown', suppressMiddleMouseDown)
  mapHandler?.destroy()
  mapHandler = null
  cy?.destroy()
  cy = null
  cytoscapePanel = null
  textCtx = null
})

const fitContent = () => {
  if (!fitToPlaced()) mapHandler?.fit()
}
const zoomIn = () => mapHandler?.map.zoomIn()
const zoomOut = () => mapHandler?.map.zoomOut()
// Geo maps have no graph-space coords; callers fall back to a default position.
const screenToGraphCoords = () => null

defineExpose({ fitContent, zoomIn, zoomOut, screenToGraphCoords })
</script>

<template>
  <div ref="containerRef" class="geo-map-container">
    <!-- Link label leaders: moved under the cytoscape canvases on mount, so pins
         paint over a leader wherever they meet. -->
    <svg ref="leaderRef" class="geo-map-overlay" xmlns="http://www.w3.org/2000/svg">
      <NetworkMapLabelLeaders :boxes="edgeLabels" :tables="placedTables" />
    </svg>
    <svg ref="overlayRef" class="geo-map-overlay" xmlns="http://www.w3.org/2000/svg">
      <NetworkMapLinkLabel
        v-for="box in baseEdgeLabels"
        :key="box.id"
        :box="box"
        :font-size="LABEL_FONT_SIZE"
        :translucent="renderOptions.translucentLabelBackground"
      />
      <NetworkMapOverflowTable
        v-for="table in placedTables"
        :key="table.id"
        :table="table"
        :font-size="LABEL_FONT_SIZE"
        :hot-row="hotTableRow"
        :hot-edges="hotTableEdges"
        @drag-start="onTableDragStart($event, table)"
        @reset="onTableReset(table)"
        @row-enter="onTableRowEnter"
        @row-leave="onTableRowLeave"
      />
      <NetworkMapLinkLabel
        v-for="box in hotEdgeLabels"
        :key="box.id"
        :box="box"
        :font-size="LABEL_FONT_SIZE"
        :translucent="renderOptions.translucentLabelBackground"
        promoted
      />
    </svg>
  </div>
</template>

<style scoped>
.geo-map-container {
  width: 100%;
  height: 100%;
  position: relative;
}

/* Pointer events belong to the cytoscape canvas below. */
.geo-map-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
</style>
