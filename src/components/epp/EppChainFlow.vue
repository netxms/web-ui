<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import cytoscape from 'cytoscape'
import Button from 'primevue/button'
import Message from 'primevue/message'
import AppLink from '@/components/common/AppLink.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useTheme } from '@/composables/useTheme'
import {
  buildCallEdges,
  canEditChain,
  chainLabel,
  findCycleEdges,
  findUnreachableChains,
  isMainChain,
  MAIN_CHAIN_ID,
} from '@/utils/eppChains'
import { eppChainTarget } from '@/utils/routeTargets'

/**
 * Read-only map of chains (nodes) and the calls between them (edges). dagre rather than a force
 * layout: calls run one way, so a layered drawing says something true about the order.
 */
defineOptions({ name: 'EppChainFlow' })

const props = defineProps({
  chains: { type: Array, default: () => [] },
  chainsWithRules: { type: Array, default: () => [] },
  /** `chain id → called chain ids`. */
  callGraph: { type: Map, default: () => new Map() },
  loading: { type: Boolean, default: false },
  activeChainId: { type: Number, default: MAIN_CHAIN_ID },
  /** Marked so the map agrees with the tab strip. */
  dirtyChainIds: { type: Set, default: () => new Set() },
})

const emit = defineEmits(['select-chain'])

const { isDark } = useTheme()

// Cytoscape styles are plain canvas values and cannot read CSS custom properties, so tokens
// are resolved here per theme. jsdom resolves nothing, hence the fallback.
function token(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

const palette = computed(() =>
  isDark.value
    ? {
        surface: '#1e293b',
        surfaceMuted: '#18222f',
        border: '#475569',
        ink: '#e2e8f0',
        muted: '#94a3b8',
        faint: '#6b7c91',
        main: '#2dd4bf',
        active: '#60a5fa',
        unsaved: '#fbbf24',
        locked: '#8295ab',
        edge: token('--p-primary-400', '#2dd4bf'),
        edgeText: '#cbd5e1',
        canvas: '#0f172a',
        cycle: '#fb923c',
      }
    : {
        surface: '#ffffff',
        surfaceMuted: '#f8fafc',
        border: '#cbd5e1',
        ink: '#1e293b',
        muted: '#64748b',
        faint: '#94a3b8',
        main: '#0d9488',
        active: '#2563eb',
        unsaved: '#d97706',
        locked: '#7c8ba1',
        edge: token('--p-primary-500', '#0d9488'),
        edgeText: '#475569',
        canvas: '#f8fafc',
        cycle: '#ea580c',
      },
)

const edges = computed(() => buildCallEdges(props.chainsWithRules))
const cycleEdges = computed(() => findCycleEdges(props.callGraph))
const unreachable = computed(() => findUnreachableChains(props.chains, props.callGraph))

const chainsById = computed(() => new Map(props.chains.map((chain) => [chain.id, chain])))

/** `RF_DISABLED` (`nxcldefs.h`) */
const RF_DISABLED = 0x10

// The registry only counts rules, so disabled counts need the loaded chains.
const disabledByChain = computed(() => {
  const counts = new Map()
  for (const chain of props.chainsWithRules ?? []) {
    if (!chain?.rules) continue
    counts.set(chain.id, chain.rules.filter((rule) => (rule.flags & RF_DISABLED) !== 0).length)
  }
  return counts
})

const NODE_HEIGHT = 66
const NODE_MIN_WIDTH = 158
const NODE_MAX_WIDTH = 250
const NODE_PADDING_X = 44
const BADGE_WIDTH = 26
const NAME_MAX_CHARS = 26

const FONT_NAME = '600 13.5px system-ui, -apple-system, "Segoe UI", sans-serif'
const FONT_META = '400 11.5px system-ui, -apple-system, "Segoe UI", sans-serif'

// Node size is computed here rather than with cytoscape's `width: 'label'`, which depends on the
// renderer having measured the label: a node laid out before that never paints.
// measureCtx: `undefined` = not tried yet, `null` = unavailable (do not ask again per label).
let measureCtx

function textWidth(text, font) {
  if (measureCtx === undefined) {
    measureCtx = document.createElement('canvas').getContext('2d') ?? null
  }
  let w
  if (measureCtx) {
    measureCtx.font = font
    w = measureCtx.measureText(text).width
  }
  // Zero or non-finite means the context could not measure.
  if (!Number.isFinite(w) || w <= 0) w = text.length * 6.8
  return w
}

/** Clipped rather than wrapped, so it cannot spill a fixed-height card. */
function displayName(chain) {
  const name = chainLabel(chain)
  return name.length > NAME_MAX_CHARS ? `${name.slice(0, NAME_MAX_CHARS - 1)}…` : name
}

function metaLine(chain) {
  const rules = chain.ruleCount ?? 0
  const parts = [`${rules} rule${rules === 1 ? '' : 's'}`]
  const disabled = disabledByChain.value.get(chain.id) ?? 0
  if (disabled) parts.push(`${disabled} disabled`)
  return parts.join(' · ')
}

/** At most one state, by priority. */
function chainState(chain) {
  if (props.dirtyChainIds.has(chain.id)) return 'unsaved'
  if (!canEditChain(chain)) return 'readonly'
  if (isMainChain(chain)) return 'main'
  if (unreachable.value.has(chain.id)) return 'unreachable'
  return null
}

function nodeWidth(chain) {
  const widest = Math.max(
    textWidth(displayName(chain), FONT_NAME),
    textWidth(metaLine(chain), FONT_META),
  )
  const badge = chainState(chain) ? BADGE_WIDTH : 0
  return Math.min(
    NODE_MAX_WIDTH,
    Math.max(NODE_MIN_WIDTH, Math.ceil(widest) + NODE_PADDING_X + badge),
  )
}

function escapeXml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

// Rasterize above zoom and device pixel ratio up front: at 1:1 cytoscape upscales the bitmap
// and the card blurs until the browser re-rasterizes.
function rasterScale() {
  const dpr = globalThis.devicePixelRatio || 1
  return Math.min(4, Math.max(2, Math.ceil(dpr * 2)))
}

// The whole card as one SVG background image: a cytoscape label has one size and colour, so
// name, count and badge cannot be told apart in it.
function nodeSvg(chain, p, w) {
  const h = NODE_HEIGHT
  const state = chainState(chain)
  const isActive = chain.id === props.activeChainId
  const isUnreachable = unreachable.value.has(chain.id)

  const fill = isUnreachable ? p.surfaceMuted : p.surface
  const stroke = isActive
    ? p.active
    : isMainChain(chain)
      ? p.main
      : isUnreachable
        ? p.faint
        : p.border
  const strokeWidth = isActive ? 2 : isMainChain(chain) ? 1.5 : 1
  const nameColor = isUnreachable ? p.muted : p.ink
  const metaColor = isUnreachable ? p.faint : p.muted
  const dash = isUnreachable ? ' stroke-dasharray="5 4"' : ''

  const ring = isActive
    ? `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="11" fill="none" stroke="${p.active}" stroke-opacity="0.28" stroke-width="4"/>`
    : ''

  const bx = w - 20
  let badge = ''
  if (state === 'unsaved') {
    badge = `<circle cx="${bx}" cy="21" r="4.5" fill="${p.unsaved}"/>`
  } else if (state === 'readonly') {
    badge =
      `<g transform="translate(${bx - 5},15)">` +
      `<rect x="0.75" y="4.75" width="8.5" height="6.5" rx="1.6" fill="${p.locked}"/>` +
      `<path d="M2.6 4.6V3.2a2.4 2.4 0 0 1 4.8 0v1.4" fill="none" stroke="${p.locked}" stroke-width="1.5"/></g>`
  } else if (state === 'main') {
    badge = `<circle cx="${bx}" cy="21" r="4.5" fill="${p.main}"/>`
  } else if (state === 'unreachable') {
    badge = `<circle cx="${bx}" cy="21" r="4.5" fill="none" stroke="${p.faint}" stroke-width="1.5" stroke-dasharray="2 2"/>`
  }

  const micro = isMainChain(chain) ? 'ENTRY POINT' : isUnreachable ? 'NEVER REACHED' : ''
  const microText = micro
    ? `<text x="14" y="58" font-family="ui-monospace, monospace" font-size="8.5" letter-spacing="1.1" fill="${isMainChain(chain) ? p.main : p.faint}">${micro}</text>`
    : ''

  const scale = rasterScale()
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}">` +
    ring +
    `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/>` +
    `<text x="14" y="${micro ? 26 : 29}" font-family="system-ui, -apple-system, sans-serif" font-size="13.5" font-weight="600" fill="${nameColor}">${escapeXml(displayName(chain))}</text>` +
    `<text x="14" y="${micro ? 41 : 44}" font-family="system-ui, -apple-system, sans-serif" font-size="11.5" fill="${metaColor}">${escapeXml(metaLine(chain))}</text>` +
    microText +
    badge +
    '</svg>'
  )
}

// Base64: an unencoded SVG data URI is truncated by the `#` of a colour literal.
function svgDataUri(svg) {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

const elements = computed(() => {
  const p = palette.value
  return [
    ...props.chains.map((chain) => {
      const w = nodeWidth(chain)
      return {
        data: {
          id: String(chain.id),
          chainId: chain.id,
          // Not drawn (cytoscape draws `img`); kept so tests can describe the graph.
          name: displayName(chain),
          meta: metaLine(chain),
          label: '',
          img: svgDataUri(nodeSvg(chain, p, w)),
          w,
          h: NODE_HEIGHT,
        },
        classes: [
          isMainChain(chain) ? 'main' : 'sub',
          chain.id === props.activeChainId ? 'active' : '',
          unreachable.value.has(chain.id) ? 'unreachable' : '',
        ]
          .filter(Boolean)
          .join(' '),
      }
    }),
    // An edge to a deleted chain has no node to land on; the rule editor reports it.
    ...edges.value
      .filter((edge) => chainsById.value.has(edge.from) && chainsById.value.has(edge.to))
      .map((edge) => ({
        data: {
          id: edge.key,
          source: String(edge.from),
          target: String(edge.to),
          label: edge.rules.length > 1 ? `${edge.rules.length} rules` : '',
          w: Math.min(4, 1.4 + (edge.rules.length - 1) * 1.1),
        },
        classes: cycleEdges.value.has(edge.key) ? 'cycle' : '',
      })),
  ]
})

const edgeCount = computed(() => elements.value.filter((el) => el.data.source).length)

const containerRef = ref(null)
const cy = shallowRef(null)
let resizeObserver = null

/** Inspected here; distinct from `activeChainId`, which the rule editor has open. */
const pickedChainId = ref(null)

const selectedEdgeKey = ref(null)
const selectedEdge = computed(() => edges.value.find((edge) => edge.key === selectedEdgeKey.value))

const DOUBLE_TAP_MS = 350

function pickChain(chainId) {
  pickedChainId.value = chainId
  selectedEdgeKey.value = null
  if (!cy.value) return
  cy.value.edges().removeClass('selected-edge')
  cy.value.nodes().removeClass('picked')
  cy.value.getElementById(String(chainId)).addClass('picked')
}

function clearPick() {
  pickedChainId.value = null
  selectedEdgeKey.value = null
  if (!cy.value) return
  cy.value.nodes().removeClass('picked')
  cy.value.edges().removeClass('selected-edge')
}

function chainName(id) {
  return chainLabel(chainsById.value.get(id) ?? { id })
}

// The rail always shows something, so the graph has a fixed width to lay out into.
const summaryChain = computed(
  () => chainsById.value.get(pickedChainId.value ?? props.activeChainId) ?? null,
)

const summary = computed(() => {
  const chain = summaryChain.value
  if (!chain) return null
  const out = edges.value.filter((edge) => edge.from === chain.id)
  const outRules = out.reduce((total, edge) => total + edge.rules.length, 0)
  return {
    chain,
    name: chainLabel(chain),
    description: chain.description ?? '',
    rules: chain.ruleCount ?? 0,
    disabled: disabledByChain.value.get(chain.id) ?? 0,
    callsOut: out.length,
    callsOutRules: outRules,
    calledBy: chain.callerCount ?? 0,
    canEdit: canEditChain(chain),
    isMain: isMainChain(chain),
    isUnreachable: unreachable.value.has(chain.id),
    isDirty: props.dirtyChainIds.has(chain.id),
    isOpen: chain.id === props.activeChainId,
  }
})

const HOVER_FADE_MS = '180ms'

function buildStyle() {
  const p = palette.value
  return [
    {
      // Turns off cytoscape's built-in tap feedback, which fights the picked chain's halo.
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
        'overlay-opacity': 0,
        shape: 'round-rectangle',
        width: 'data(w)',
        height: 'data(h)',
        'background-opacity': 0,
        'background-image': 'data(img)',
        'background-fit': 'cover',
        'background-clip': 'none',
        'border-width': 0,
        label: '',
        'transition-property': 'opacity',
        'transition-duration': HOVER_FADE_MS,
        'transition-timing-function': 'ease-in-out',
      },
    },
    {
      selector: 'edge',
      style: {
        'overlay-opacity': 0,
        width: 'data(w)',
        'line-color': p.edge,
        'line-opacity': 0.75,
        'target-arrow-color': p.edge,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1,
        'curve-style': 'bezier',
        label: 'data(label)',
        color: p.edgeText,
        'font-size': 10,
        'text-background-color': p.canvas,
        'text-background-opacity': 1,
        'text-background-padding': 3,
        'text-background-shape': 'roundrectangle',
        'transition-property': 'opacity',
        'transition-duration': HOVER_FADE_MS,
        'transition-timing-function': 'ease-in-out',
      },
    },
    {
      selector: 'edge.cycle',
      style: {
        'line-color': p.cycle,
        'target-arrow-color': p.cycle,
        'line-style': 'dashed',
        'line-dash-pattern': [7, 5],
      },
    },
    {
      selector: 'edge.selected-edge',
      style: {
        width: 4,
        'line-style': 'solid',
        'line-color': p.active,
        'target-arrow-color': p.active,
      },
    },
    { selector: '.dimmed', style: { opacity: 0.4 } },
    // Underlay, so a selection does not wash out the card's text.
    {
      selector: 'node.picked',
      style: {
        'underlay-color': p.active,
        'underlay-opacity': 0.18,
        'underlay-padding': 7,
        'underlay-shape': 'round-rectangle',
      },
    },
  ]
}

let dagreRegistered = null

/** Loaded on demand, so cytoscape-dagre stays out of the configuration route chunk. */
function ensureDagre() {
  dagreRegistered ??= import('cytoscape-dagre').then(({ default: dagre }) => {
    cytoscape.use(dagre)
  })
  return dagreRegistered
}

function containerHasSize() {
  const el = containerRef.value
  return !!el && el.clientWidth > 0 && el.clientHeight > 0
}

/** Laid out against a container that actually had a size. */
const laidOut = ref(false)

// Guards against overlapping rebuilds: `build` awaits the dagre import.
let buildToken = 0

async function runLayout(fit = true) {
  if (!cy.value) return
  const token = buildToken
  await ensureDagre()
  if (!cy.value || token !== buildToken || !containerHasSize()) return
  // A cytoscape built while the container was still being sized keeps the old viewport.
  cy.value.resize()
  cy.value.layout({ name: 'dagre', rankDir: 'TB', nodeSep: 40, rankSep: 70, animate: false }).run()
  if (fit) fitGraph()
  laidOut.value = true
}

/**
 * Cytoscape caches each element's first bitmap, rendered before layout and fit, and blits it
 * rescaled until an interaction invalidates it. Re-applying the identical stylesheet drops the
 * cache without moving anything. Twice: the second pass catches card images still decoding.
 */
let repaintFrame = null
let repaintTimer = null

function resharpen() {
  const repaint = () => cy.value?.style(buildStyle())
  // A resize drag reframes on every step; only the final framing needs repainting.
  cancelAnimationFrame(repaintFrame)
  clearTimeout(repaintTimer)
  repaintFrame = requestAnimationFrame(repaint)
  repaintTimer = setTimeout(repaint, 250)
}

let fittedWidth = 0
let fittedHeight = 0

/** After a pan or zoom the viewer's framing is left alone. */
const viewerAdjusted = ref(false)

function markAdjusted() {
  viewerAdjusted.value = true
}

function setCursor(value) {
  if (containerRef.value) containerRef.value.style.cursor = value
}

// Hover dimming waits for the pointer to settle, and so does undimming, so moving between
// neighbouring cards swaps the lit set instead of flashing the whole graph.
const HOVER_DIM_DELAY_MS = 130
const HOVER_UNDIM_DELAY_MS = 110
let hoverTimer = null

function dimAround(node) {
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    if (!cy.value || node.removed()) return
    const lit = node.closedNeighborhood()
    lit.removeClass('dimmed')
    cy.value.elements().difference(lit).addClass('dimmed')
  }, HOVER_DIM_DELAY_MS)
}

function undim() {
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    cy.value?.elements().removeClass('dimmed')
  }, HOVER_UNDIM_DELAY_MS)
}

const MAX_FIT_ZOOM = 1.4

/** Capped so a handful of chains do not fill a wide screen. */
function fitGraph() {
  if (!cy.value || !containerHasSize()) return
  cy.value.resize()
  cy.value.fit(undefined, 40)
  if (cy.value.zoom() > MAX_FIT_ZOOM) {
    cy.value.zoom(MAX_FIT_ZOOM)
    cy.value.center()
  }
  fittedWidth = containerRef.value.clientWidth
  fittedHeight = containerRef.value.clientHeight
  viewerAdjusted.value = false
  resharpen()
}

async function build() {
  // Watchers run before Vue patches the DOM; measure the container as it is about to be.
  await nextTick()
  if (!containerRef.value) return
  const token = ++buildToken
  // Load dagre before creating cytoscape, so create, layout and fit run in one task. Otherwise
  // cytoscape caches textures of the unlaid-out graph and shows them blurred on arrival.
  await ensureDagre()
  if (token !== buildToken || !containerRef.value) return
  cy.value?.destroy()
  laidOut.value = false
  clearTimeout(hoverTimer)
  // The cursor lives on the container, which outlives the instance.
  setCursor('')
  cy.value = cytoscape({
    container: containerRef.value,
    elements: elements.value,
    style: buildStyle(),
    layout: { name: 'preset' },
    minZoom: 0.2,
    maxZoom: 2.5,
    // Dragging nodes is allowed but not persisted ("Re-run layout" resets). Selection stays off so
    // a grabbed node keeps its state colour.
    autounselectify: true,
    boxSelectionEnabled: false,
  })

  // One click inspects, two open. Measured here: cytoscape's `dbltap` does not fire for every
  // input path.
  let lastTap = { chainId: null, at: 0 }

  cy.value.on('tap', 'node', (event) => {
    const chainId = event.target.data('chainId')
    const now = Date.now()
    if (lastTap.chainId === chainId && now - lastTap.at < DOUBLE_TAP_MS) {
      lastTap = { chainId: null, at: 0 }
      emit('select-chain', chainId)
      return
    }
    lastTap = { chainId, at: now }
    pickChain(chainId)
  })
  cy.value.on('tap', 'edge', (event) => {
    lastTap = { chainId: null, at: 0 }
    pickedChainId.value = null
    cy.value.nodes().removeClass('picked')
    selectedEdgeKey.value = event.target.id()
    cy.value.edges().removeClass('selected-edge')
    event.target.addClass('selected-edge')
  })
  cy.value.on('tap', (event) => {
    if (event.target === cy.value) {
      lastTap = { chainId: null, at: 0 }
      clearPick()
    }
  })

  // After a pan, a resize no longer snaps back to fit. The wheel listener is bound on mount.
  cy.value.on('dragpan', markAdjusted)

  // Canvas: the container carries the cursor.
  cy.value.on('mouseover', 'node', (event) => {
    setCursor('grab')
    dimAround(event.target)
  })
  cy.value.on('mouseout', 'node', () => {
    setCursor('')
    undim()
  })
  cy.value.on('grab', 'node', () => setCursor('grabbing'))
  cy.value.on('free', 'node', () => setCursor('grab'))

  await runLayout()
  // Rebuilt elements; re-apply the picked chain's halo.
  if (pickedChainId.value != null) pickChain(pickedChainId.value)
}

onMounted(async () => {
  containerRef.value?.addEventListener('wheel', markAdjusted, { passive: true })
  await build()
  resizeObserver = new ResizeObserver(() => {
    if (!cy.value) return
    cy.value.resize()
    // The first fit may have used a viewport that was still being sized; re-frame when it is stale,
    // unless the viewer has chosen their own framing.
    if (!laidOut.value) {
      runLayout()
      return
    }
    const el = containerRef.value
    const stale = el && (el.clientWidth !== fittedWidth || el.clientHeight !== fittedHeight)
    if (stale && !viewerAdjusted.value) fitGraph()
  })
  resizeObserver.observe(containerRef.value)
})

onUnmounted(() => {
  cancelAnimationFrame(repaintFrame)
  clearTimeout(repaintTimer)
  clearTimeout(hoverTimer)
  resizeObserver?.disconnect()
  containerRef.value?.removeEventListener('wheel', markAdjusted)
  cy.value?.destroy()
  cy.value = null
})

// `elements` is new on every query state change, even an identical refetch; rebuilding on it
// would discard pan and zoom. JSON, since chain names can contain any separator. The drawn card
// is not part of the signature: a theme change repaints in place.
const graphSignature = computed(() =>
  JSON.stringify(
    elements.value.map((el) => [
      el.data.id,
      el.data.name ?? el.data.label ?? '',
      el.data.meta ?? '',
      el.classes ?? '',
    ]),
  ),
)

watch(graphSignature, () => build())

// A theme change repaints the card images in place, keeping pan and zoom.
watch(isDark, () => {
  if (!cy.value) return
  cy.value.style(buildStyle())
  const p = palette.value
  cy.value.batch(() => {
    for (const chain of props.chains) {
      const node = cy.value.getElementById(String(chain.id))
      if (node.nonempty()) node.data('img', svgDataUri(nodeSvg(chain, p, nodeWidth(chain))))
    }
  })
})

function zoomBy(factor) {
  if (!cy.value) return
  cy.value.zoom({ level: cy.value.zoom() * factor, renderedPosition: centerOfViewport() })
  markAdjusted()
}

function centerOfViewport() {
  const el = containerRef.value
  return { x: (el?.clientWidth ?? 0) / 2, y: (el?.clientHeight ?? 0) / 2 }
}

function fit() {
  fitGraph()
}
</script>

<template>
  <div class="chain-flow">
    <div class="flow-toolbar">
      <!-- If the canvas disagrees with this line, the problem is the viewport, not the data. -->
      <span class="flow-summary">
        {{ $plural(chains.length, 'chain') }} · {{ $plural(edgeCount, 'call') }}
      </span>
      <div class="flow-legend">
        <span class="legend-item"
          ><span class="legend-swatch legend-swatch--main" />Main chain</span
        >
        <span class="legend-item"><span class="legend-swatch legend-swatch--sub" />Sub-chain</span>
        <span class="legend-item">
          <span class="legend-swatch legend-swatch--unreachable" />Never reached
        </span>
        <span class="legend-item"><span class="legend-line legend-line--cycle" />Loops back</span>
      </div>
      <div class="flow-actions">
        <Button
          v-tooltip.bottom="'Zoom out'"
          icon="pi pi-search-minus"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Zoom out"
          @click="zoomBy(1 / 1.2)"
        />
        <Button
          v-tooltip.bottom="'Zoom in'"
          icon="pi pi-search-plus"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Zoom in"
          @click="zoomBy(1.2)"
        />
        <Button
          v-tooltip.bottom="'Fit to view'"
          icon="pi pi-expand"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Fit to view"
          @click="fit"
        />
        <Button
          v-tooltip.bottom="'Re-run layout'"
          icon="pi pi-sitemap"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Re-run layout"
          @click="runLayout()"
        />
      </div>
    </div>

    <Message
      v-if="!loading && cycleEdges.size"
      severity="warn"
      :closable="false"
      class="flow-message"
    >
      {{ cycleEdges.size === 1 ? 'One call loops' : `${cycleEdges.size} calls loop` }} back into a
      chain that is already running. The server skips
      {{ cycleEdges.size === 1 ? 'it' : 'them' }} and reports a SYS_EPP_CHAIN_LOOP event.
    </Message>

    <div class="flow-body">
      <div class="flow-canvas-wrap">
        <!-- Covered, never hidden: cytoscape measures the container, and display:none
             has no size. -->
        <div ref="containerRef" class="flow-canvas" />
        <div v-if="loading" class="flow-loading">
          <LoadingState message="Loading every chain…" />
        </div>
      </div>

      <aside class="flow-detail">
        <template v-if="selectedEdge">
          <div class="detail-header">
            <span class="detail-title">
              {{ chainName(selectedEdge.from) }} → {{ chainName(selectedEdge.to) }}
            </span>
            <Button
              icon="pi pi-times"
              size="small"
              severity="secondary"
              text
              rounded
              aria-label="Close"
              @click="selectedEdgeKey = null"
            />
          </div>
          <p class="detail-lead">
            {{
              selectedEdge.rules.length === 1
                ? 'This rule makes the call:'
                : 'These rules make the call:'
            }}
          </p>
          <ul class="detail-rules">
            <li v-for="rule in selectedEdge.rules" :key="rule.guid">
              <AppLink
                :to="eppChainTarget(selectedEdge.from, { ruleGuid: rule.guid })"
                class="detail-rule"
              >
                <span class="detail-rule-number">#{{ rule.ruleNumber }}</span>
                <span class="detail-rule-name">{{ rule.comments || 'unnamed rule' }}</span>
              </AppLink>
            </li>
          </ul>
          <p v-if="cycleEdges.has(selectedEdge.key)" class="detail-warning">
            <i class="pi pi-exclamation-triangle" />
            This call loops back into a chain already running, so it is skipped at runtime.
          </p>
        </template>

        <template v-else-if="summary">
          <div class="detail-header">
            <span class="detail-title">{{ summary.name }}</span>
          </div>
          <p v-if="summary.description" class="detail-lead">{{ summary.description }}</p>

          <div class="detail-chips">
            <span v-if="summary.isMain" class="detail-chip detail-chip--main">Entry point</span>
            <span v-if="summary.isDirty" class="detail-chip detail-chip--unsaved">
              Unsaved changes
            </span>
            <span v-if="!summary.canEdit" class="detail-chip detail-chip--locked">
              <i class="pi pi-lock" />Read-only
            </span>
            <span v-if="summary.isUnreachable" class="detail-chip detail-chip--dead">
              Never reached
            </span>
          </div>

          <dl class="detail-facts">
            <div class="detail-fact">
              <dt>Rules</dt>
              <dd>{{ summary.rules }}</dd>
            </div>
            <div class="detail-fact">
              <dt>Disabled</dt>
              <dd :class="{ 'detail-none': !summary.disabled }">
                {{ summary.disabled || 'None' }}
              </dd>
            </div>
            <div class="detail-fact">
              <dt>Calls out</dt>
              <dd :class="{ 'detail-none': !summary.callsOut }">
                <template v-if="summary.callsOut">
                  {{ $plural(summary.callsOut, 'chain') }},
                  {{ $plural(summary.callsOutRules, 'rule') }}
                </template>
                <template v-else>None</template>
              </dd>
            </div>
            <div class="detail-fact">
              <dt>Called by</dt>
              <dd :class="{ 'detail-none': !summary.calledBy }">
                {{ summary.calledBy ? $plural(summary.calledBy, 'rule') : 'Nothing' }}
              </dd>
            </div>
          </dl>

          <AppLink :to="eppChainTarget(summary.chain.id)" class="detail-open">
            <i class="pi pi-arrow-right" />
            {{ summary.isOpen ? 'Back to its rules' : 'Open in rule editor' }}
          </AppLink>

          <p class="detail-hint">
            Click a call to see the rules behind it, or double-click a chain to open it.
          </p>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.chain-flow {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.flow-toolbar {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.flow-summary {
  font-size: 0.8125rem;
  color: var(--p-text-color);
  white-space: nowrap;
  flex-shrink: 0;
}

.flow-legend {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  flex: 1;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.legend-swatch {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 0.1875rem;
  border: 1px solid var(--p-surface-border);
}

.legend-swatch--main {
  background: var(--p-surface-card);
  border-color: var(--p-teal-600, #0d9488);
  border-width: 2px;
}

.legend-swatch--sub {
  background: var(--p-surface-card);
  border-color: var(--p-surface-border);
}

.legend-swatch--unreachable {
  background: var(--p-surface-ground);
  border-style: dashed;
}

.legend-line {
  width: 1rem;
  height: 0;
  border-top: 2px dashed var(--p-orange-500);
}

.flow-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
}

.flow-message {
  margin: 0.5rem 0.75rem 0;
}

.flow-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.flow-canvas-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.flow-canvas {
  position: absolute;
  inset: 0;
  background: var(--p-surface-ground);
}

.flow-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--p-surface-ground);
  z-index: 1;
}

.flow-detail {
  width: 20rem;
  flex-shrink: 0;
  border-left: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.detail-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.detail-lead {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.detail-rules {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.25rem;
}

.detail-rules li + li {
  border-top: 1px solid var(--p-surface-border);
}

.detail-rule {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  font-size: 0.8125rem;
}

.detail-rule:hover {
  background: var(--p-surface-hover);
}

.detail-rule-number {
  color: var(--p-text-muted-color);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.detail-rule-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-warning {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-orange-500);
  display: flex;
  gap: 0.375rem;
}

.detail-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.detail-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 0.0625rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--p-surface-border);
  color: var(--p-text-muted-color);
}

.detail-chip i {
  font-size: 0.625rem;
}

.detail-chip--main {
  color: var(--p-teal-600, #0d9488);
  border-color: var(--p-teal-600, #0d9488);
}

.detail-chip--unsaved {
  color: var(--p-orange-500);
  border-color: var(--p-orange-500);
}

.detail-chip--locked {
  color: var(--p-text-muted-color);
  background: var(--p-surface-ground);
}

.detail-chip--dead {
  border-style: dashed;
}

.detail-facts {
  margin: 0.25rem 0 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--p-surface-border);
}

.detail-fact {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.375rem 0;
  border-bottom: 1px solid var(--p-surface-border);
  font-size: 0.8125rem;
}

.detail-fact dt {
  margin: 0;
  color: var(--p-text-muted-color);
}

.detail-fact dd {
  margin: 0;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.detail-none {
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.detail-open {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  align-self: flex-start;
  font-size: 0.8125rem;
  font-weight: 500;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 0.25rem;
  text-decoration: none;
  color: var(--p-primary-color);
}

.detail-open:hover {
  background: var(--p-surface-hover);
}

.detail-open i {
  font-size: 0.6875rem;
}

.detail-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
