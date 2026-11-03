<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import cytoscape from 'cytoscape'
import { useTheme } from '@/composables/useTheme'
import { getStatusHexColor, getStatusSoftBgHexColor } from '@/utils/objectUtils'
import {
  getClassIconCodepoint,
  getTopoLinkColor,
  getTopoLinkDash,
  getTopoLinkWidth,
} from '@/utils/topologyUtils'

const props = defineProps({
  /** { nodes: Record<string,object>, edges: Record<string,object> } */
  topologyData: { type: Object, required: true },
  /** Layout positions: { nodes: Record<string, {x,y}> } */
  layouts: { type: Object, required: true },
  draggable: { type: Boolean, default: true },
  /** Highlight nodes whose name matches this string; '' = no filter */
  searchTerm: { type: String, default: '' },
  /** Object ID of the root/focus node — rendered with a distinct ring */
  rootObjectId: { type: Number, default: null },
})

const emit = defineEmits(['node-click', 'node-contextmenu', 'viewport-change'])

const canvasWrapRef = ref(null)
const cyContainerRef = ref(null)
const overlayGroupRef = ref(null)

const { isDark } = useTheme()

let cy = null
let textCtx = null // canvas context for accurate label width measurement

const NODE_RADIUS = 26
const LABEL_PAD_H = 5
const LABEL_PAD_V = 2
const LABEL_FONT_SIZE = 11
const LABEL_MARGIN = 4
const LABEL_HEIGHT = LABEL_FONT_SIZE + LABEL_PAD_V * 2

const zoomLevel = ref(1)
const iconNodes = ref([])
const rootRingPos = ref(null)

// Own wheel zoom: cytoscape's "inaccurate scroll device" auto-calibration permanently changes its
// zoom step after the first few events. This deltaMode-aware formula is adapted from d3-zoom.
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

function measureText(text) {
  return textCtx ? textCtx.measureText(text).width : text.length * 6.5
}

function syncOverlay() {
  if (!cy || !overlayGroupRef.value) return
  const pan = cy.pan()
  const zoom = cy.zoom()
  overlayGroupRef.value.setAttribute('transform', `translate(${pan.x} ${pan.y}) scale(${zoom})`)
  zoomLevel.value = zoom
}

function rebuildOverlayNodes() {
  if (!cy) return
  const term = props.searchTerm?.toLowerCase()
  iconNodes.value = cy.nodes('.object').map((n) => {
    const displayName = n.data('displayName')
    return {
      id: n.id(),
      x: n.position().x,
      y: n.position().y,
      codepoint: getClassIconCodepoint(n.data('objectClass')),
      statusColor: getStatusHexColor(n.data('objectStatus') ?? 5),
      name: n.data('name'),
      displayName,
      labelW: measureText(displayName) + LABEL_PAD_H * 2,
      dimmed: term ? !n.data('name')?.toLowerCase().includes(term) : false,
    }
  })

  if (props.rootObjectId != null) {
    const match = cy.nodes('.object').filter((n) => n.data('objectId') === props.rootObjectId)
    rootRingPos.value = match.length > 0 ? { ...match.first().position() } : null
  } else {
    rootRingPos.value = null
  }
}

function buildCyStyle() {
  return [
    { selector: 'core', style: { 'active-bg-opacity': 0 } },
    { selector: 'node', style: { 'overlay-opacity': 0 } },
    { selector: 'edge', style: { 'overlay-opacity': 0 } },
    {
      selector: 'node.object',
      style: {
        shape: 'ellipse',
        width: NODE_RADIUS * 2,
        height: NODE_RADIUS * 2,
        'background-color': (ele) => getStatusSoftBgHexColor(ele.data('objectStatus') ?? 5),
        'border-color': (ele) => getStatusHexColor(ele.data('objectStatus') ?? 5),
        'border-width': 2.5,
        label: '', // labels rendered in SVG overlay for correct z-ordering
        'z-index': 1,
      },
    },
    {
      selector: 'node.object:selected',
      style: { 'border-width': 3.5, 'border-color': '#60a5fa' },
    },
    {
      selector: 'node.object:active',
      style: { 'overlay-opacity': 0 },
    },
    {
      selector: 'node.object.dimmed',
      style: { opacity: 0.15 },
    },
    {
      selector: 'edge',
      style: {
        width: (ele) => getTopoLinkWidth(ele.data()),
        'line-color': (ele) => getTopoLinkColor(ele.data()),
        'line-style': (ele) => (getTopoLinkDash(ele.data()) !== '0' ? 'dashed' : 'solid'),
        'line-dash-pattern': (ele) => {
          const dash = getTopoLinkDash(ele.data())
          return dash === '0' ? [1, 0] : dash.split(' ').map(Number)
        },
        'curve-style': 'straight',
        'target-arrow-shape': 'none',
        label: (ele) => ele.data('label') ?? '',
        'text-rotation': 'autorotate',
        'font-size': 11,
        'font-family': 'inherit',
        color: '#ffffff',
        'text-background-color': '#404040',
        'text-background-opacity': 1,
        'text-background-padding': '3px',
        'text-background-shape': 'roundrectangle',
        'z-index': 0,
      },
    },
  ]
}

function buildCyElements() {
  const els = []
  for (const [id, node] of Object.entries(props.topologyData.nodes)) {
    els.push({
      data: {
        id,
        name: node.name,
        displayName: node.displayName,
        objectId: node.objectId,
        objectClass: node.objectClass,
        objectStatus: node.objectStatus,
      },
      classes: 'object',
      grabbable: props.draggable,
    })
  }
  for (const [id, edge] of Object.entries(props.topologyData.edges)) {
    els.push({
      data: {
        id,
        source: edge.source,
        target: edge.target,
        type: edge.type ?? 0,
        label: edge.label ?? '',
      },
    })
  }
  return els
}

function applyLayout() {
  if (!cy || !props.layouts?.nodes) return
  const positions = props.layouts.nodes
  cy.layout({
    name: 'preset',
    fit: false,
    positions: (node) => positions[node.id()] ?? { x: 0, y: 0 },
  }).run()
  rebuildOverlayNodes()
  syncOverlay()
}

function initCy() {
  textCtx = document.createElement('canvas').getContext('2d')
  textCtx.font = `${LABEL_FONT_SIZE}px ${getComputedStyle(cyContainerRef.value).fontFamily}`

  cy = cytoscape({
    container: cyContainerRef.value,
    style: buildCyStyle(),
    userZoomingEnabled: true,
    userPanningEnabled: true,
    minZoom: 0.1,
    maxZoom: 4,
    // 0 rather than disabling userZoomingEnabled keeps native pinch zoom (Safari trackpad).
    wheelSensitivity: 0,
  })

  cyContainerRef.value.addEventListener('wheel', handleWheel, { passive: false })

  cy.on('viewport', () => {
    syncOverlay()
    emit('viewport-change')
  })
  cy.on('drag', 'node', rebuildOverlayNodes)
  cy.on('tap', 'node.object', (e) => emit('node-click', e.target.id()))
  cy.on('cxttap', 'node.object', (e) => {
    e.originalEvent?.preventDefault()
    cy.elements(':selected').unselect()
    e.target.select()
    emit('node-contextmenu', { node: e.target.id(), event: e.originalEvent })
  })

  cy.add(buildCyElements())
  applyLayout()
  cy.fit(undefined, 80)
  syncOverlay()
}

/**
 * Clicking the drawn graph moves focus nowhere, so F6 and the `/` shortcut would answer for the
 * pane focus was left in. `mousedown` on the wrapper, not `pointerdown` on the graph: cytoscape
 * blurs the active element on every press from the inner container, after `pointerdown`.
 */
function focusCanvas() {
  canvasWrapRef.value?.focus({ preventScroll: true })
}

onMounted(() => {
  canvasWrapRef.value.addEventListener('mousedown', focusCanvas)
  canvasWrapRef.value.addEventListener('touchstart', focusCanvas, { passive: true })
  initCy()
})

onUnmounted(() => {
  canvasWrapRef.value?.removeEventListener('mousedown', focusCanvas)
  canvasWrapRef.value?.removeEventListener('touchstart', focusCanvas)
  cyContainerRef.value?.removeEventListener('wheel', handleWheel)
  cy?.destroy()
  cy = null
  textCtx = null
})

watch(
  () => props.topologyData,
  () => {
    if (!cy) return
    cy.elements().remove()
    cy.add(buildCyElements())
    applyLayout()
  },
)

watch(
  () => props.layouts,
  () => applyLayout(),
)

// Cytoscape style callbacks and the overlay's cached icon colors do not follow dark mode.
watch(isDark, () => {
  if (!cy) return
  cy.style().update()
  rebuildOverlayNodes()
})

watch(
  () => props.searchTerm,
  (term) => {
    if (!cy) return
    const lower = term?.toLowerCase()
    cy.nodes('.object').forEach((n) => {
      const matched = !lower || n.data('name')?.toLowerCase().includes(lower)
      n.toggleClass('dimmed', !matched)
    })
    rebuildOverlayNodes()
  },
)

watch(() => props.rootObjectId, rebuildOverlayNodes)

watch(
  () => props.draggable,
  (val) => {
    if (!cy) return
    if (val) cy.nodes('.object').grabify()
    else cy.nodes('.object').ungrabify()
  },
)

function fitContent() {
  cy?.fit(undefined, 80)
}

function zoomIn() {
  if (!cy) return
  const center = {
    x: cyContainerRef.value.clientWidth / 2,
    y: cyContainerRef.value.clientHeight / 2,
  }
  cy.zoom({ level: cy.zoom() * 1.25, renderedPosition: center })
}

function zoomOut() {
  if (!cy) return
  const center = {
    x: cyContainerRef.value.clientWidth / 2,
    y: cyContainerRef.value.clientHeight / 2,
  }
  cy.zoom({ level: cy.zoom() / 1.25, renderedPosition: center })
}

defineExpose({ fitContent, zoomIn, zoomOut })
</script>

<template>
  <div ref="canvasWrapRef" class="topology-canvas-wrap" tabindex="-1">
    <div ref="cyContainerRef" class="topology-graph" />
    <svg class="topo-overlay" xmlns="http://www.w3.org/2000/svg">
      <g ref="overlayGroupRef">
        <!-- Root node focus ring (below icons) -->
        <circle
          v-if="rootRingPos"
          :cx="rootRingPos.x"
          :cy="rootRingPos.y"
          :r="NODE_RADIUS + 5"
          fill="none"
          stroke="#60a5fa"
          :stroke-width="2 / zoomLevel"
          stroke-dasharray="4 3"
          style="pointer-events: none"
        />
        <!-- Pass 1: PrimeIcons icon centered on each node -->
        <text
          v-for="node in iconNodes"
          :key="node.id"
          :x="node.x"
          :y="node.y"
          :font-size="NODE_RADIUS * 0.8"
          font-family="primeicons"
          text-anchor="middle"
          dominant-baseline="central"
          :fill="node.statusColor"
          :fill-opacity="node.dimmed ? 0.3 : 0.85"
          style="pointer-events: none; user-select: none"
        >
          <title v-if="node.name !== node.displayName">{{ node.name }}</title>
          {{ node.codepoint }}
        </text>
        <!-- Pass 2: Labels on top of icons -->
        <g
          v-for="node in iconNodes"
          :key="`label-${node.id}`"
          style="pointer-events: none; user-select: none"
        >
          <rect
            :x="node.x - node.labelW / 2"
            :y="node.y + NODE_RADIUS + LABEL_MARGIN"
            :width="node.labelW"
            :height="LABEL_HEIGHT"
            rx="4"
            ry="4"
            fill="rgba(248, 250, 252, 0.88)"
            stroke="#cbd5e1"
            stroke-width="0.5"
            :opacity="node.dimmed ? 0.2 : 1"
          />
          <text
            :x="node.x"
            :y="node.y + NODE_RADIUS + LABEL_MARGIN + LABEL_PAD_V"
            :font-size="LABEL_FONT_SIZE"
            font-family="inherit"
            text-anchor="middle"
            dominant-baseline="hanging"
            :fill="node.dimmed ? '#94a3b8' : '#475569'"
            :fill-opacity="node.dimmed ? 0.4 : 1"
          >
            {{ node.displayName }}
          </text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.topology-canvas-wrap {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.topology-canvas-wrap:focus {
  outline: none;
}

.topology-graph {
  width: 100%;
  height: 100%;
}

.topo-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
</style>
