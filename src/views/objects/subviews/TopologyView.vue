<script setup>
import { ref, shallowRef, computed, inject, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import ContextMenu from 'primevue/contextmenu'
import NetworkMapCanvas from '@/components/network-maps/NetworkMapCanvas.vue'
import NetworkMapSideToolbar from '@/components/network-maps/NetworkMapSideToolbar.vue'
import TopologyToolbar from '@/components/topology/TopologyToolbar.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { adaptObject } from '@/api/objectAdapters'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import { useTopology } from '@/queries/useTopologyQueries'
import { userPrefs } from '@/utils/appStorage'
import { openInNewTab, shouldOpenInNewTab } from '@/utils/navigation'
import { adaptApiNetworkMap } from '@/utils/networkMapAdapters'
import { mapObjectEntries } from '@/utils/networkMapObjectList'
import { activeMergeThreshold } from '@/utils/networkMapParallelLinks'
import {
  DEFAULT_MAP_FLAGS,
  MAP_FLAGS,
  MAP_LINK_FLAGS,
  MAP_OBJECT_DISPLAY_FLAGS,
  MAP_OBJECT_DISPLAY_MODE_LABELS,
  hasMapFlag,
} from '@/utils/networkMapUtils'
import { objectTarget } from '@/utils/routeTargets'
import { layoutTopology, topologyInterfaceIds, topologyToMapDocument } from '@/utils/topologyMap'
import { LAYOUTS, TOPOLOGY_TYPES } from '@/utils/topologyUtils'

const props = defineProps({
  object: { type: Object, required: true },
})

const route = useRoute()
const router = useRouter()

const canvasRef = ref(null)
const nodeContextMenuRef = ref(null)
const nodeContextMenuItems = ref([])
const displayContextMenuRef = ref(null)

const VALID_TYPES = new Set(Object.values(TOPOLOGY_TYPES))
const activeType = ref(VALID_TYPES.has(route.query.type) ? route.query.type : TOPOLOGY_TYPES.L2)
const searchTerm = ref('')

const objectId = computed(() => props.object?.id ?? null)

/** What a saved map keeps in its properties; legacy ad-hoc maps offer these in the map menu. */
const DISPLAY_FLAG_PREFS = {
  [MAP_FLAGS.SHOW_STATUS_ICON]: 'statusIcon',
  [MAP_FLAGS.SHOW_STATUS_FRAME]: 'statusFrame',
  [MAP_FLAGS.SHOW_STATUS_BKGND]: 'statusBackground',
  [MAP_FLAGS.TRANSLUCENT_LABEL_BKGND]: 'translucentLabels',
  [MAP_FLAGS.SHOW_LINK_DIRECTION]: 'linkDirection',
}
const DISPLAY_FLAGS = [
  ...MAP_OBJECT_DISPLAY_FLAGS,
  ...MAP_LINK_FLAGS.filter((flag) => flag.bit === MAP_FLAGS.SHOW_LINK_DIRECTION),
].map((flag) => ({ ...flag, pref: DISPLAY_FLAG_PREFS[flag.bit] }))

// Floor plan is left out: ad-hoc elements have no size of their own.
const DISPLAY_MODE_LABELS = MAP_OBJECT_DISPLAY_MODE_LABELS.slice(0, 4)
const ICON_DISPLAY_MODE = 0

/** Follow the account (`userPrefs`, `topologyMap.<key>`), stored only while non-default. */
const PREF_DEFAULTS = {
  layout: LAYOUTS.SPRING,
  hideLinks: false,
  hideLinkLabels: false,
  mergeParallelLinks: false,
  overflowTables: true,
  showGrid: false,
  physicalLinks: false,
  displayMode: ICON_DISPLAY_MODE,
  ...Object.fromEntries(
    DISPLAY_FLAGS.map((flag) => [flag.pref, hasMapFlag(DEFAULT_MAP_FLAGS, flag.bit)]),
  ),
}
const VALID_LAYOUTS = new Set(Object.values(LAYOUTS))
const prefField = (key) => `topologyMap.${key}`

function loadPrefs() {
  const prefs = {}
  for (const [key, fallback] of Object.entries(PREF_DEFAULTS)) {
    const stored = userPrefs.get(prefField(key))
    prefs[key] = typeof stored === typeof fallback ? stored : fallback
  }
  if (!VALID_LAYOUTS.has(prefs.layout)) prefs.layout = PREF_DEFAULTS.layout
  if (!DISPLAY_MODE_LABELS[prefs.displayMode]) prefs.displayMode = PREF_DEFAULTS.displayMode
  return prefs
}

const prefs = ref(loadPrefs())

watch(
  prefs,
  (state) => {
    for (const [key, fallback] of Object.entries(PREF_DEFAULTS)) {
      if (state[key] === fallback) userPrefs.remove(prefField(key))
      else userPrefs.set(prefField(key), state[key])
    }
  },
  { deep: true },
)

watch(userPrefs.revision, () => Object.assign(prefs.value, loadPrefs()))

const CAPABILITY_REQUIREMENTS = {
  [TOPOLOGY_TYPES.OSPF]: (caps) => !!caps?.isOspf,
}

const CAPABILITY_MESSAGES = {
  [TOPOLOGY_TYPES.OSPF]: 'OSPF topology requires OSPF capability on this node.',
}

const disabledTypes = computed(() =>
  Object.keys(CAPABILITY_REQUIREMENTS).filter(
    (type) => !CAPABILITY_REQUIREMENTS[type](props.object?.capabilities),
  ),
)

const capabilityRequired = computed(() => CAPABILITY_MESSAGES[activeType.value] ?? null)

const isCapabilityBlocked = computed(
  () => capabilityRequired.value !== null && disabledTypes.value.includes(activeType.value),
)

const {
  data: topologyData,
  isLoading,
  isFetching,
  error,
  refetch,
} = useTopology(objectId, activeType, {
  enabled: computed(() => !isCapabilityBlocked.value),
  useL1Topology: computed(() => prefs.value.physicalLinks),
})

/**
 * The topology the positions were computed for. A refresh with the same objects keeps the
 * positions, dragged ones included; until a new layout lands the previous one stays on screen.
 */
const laidOut = shallowRef(null)
let layoutRun = 0
let pendingFit = true

const objectSetKey = (topology) =>
  (topology?.objects ?? [])
    .map((o) => o.id)
    .sort((a, b) => a - b)
    .join(',')

watch(
  [topologyData, () => prefs.value.layout],
  async ([topology, layout]) => {
    if (!topology) return
    const key = `${layout}|${objectSetKey(topology)}`
    const current = laidOut.value
    if (current?.key === key && current.type === activeType.value) {
      laidOut.value = { ...current, topology }
      return
    }
    const run = ++layoutRun
    const type = activeType.value
    const positions = await layoutTopology(layout, topology, objectId.value)
    if (run !== layoutRun) return
    if (!current || current.type !== type || current.layout !== layout) pendingFit = true
    laidOut.value = { key, type, layout, topology, positions }
  },
  { immediate: true },
)

watch([objectId, activeType], () => {
  pendingFit = true
  searchTerm.value = ''
})

const showMap = computed(
  () => !!laidOut.value && laidOut.value.type === activeType.value && !!topologyData.value,
)

const resolveIds = computed(() => {
  const topology = laidOut.value?.topology
  if (!topology) return []
  return [...(topology.objects ?? []).map((o) => o.id), ...topologyInterfaceIds(topology)]
})
const { objectsById: fetchedObjects } = useObjectsByIds(resolveIds)

/** Summaries from the response until the full objects (map image, capabilities) arrive. */
const objectsById = computed(() => {
  const merged = new Map()
  for (const summary of laidOut.value?.topology?.objects ?? []) {
    merged.set(summary.id, adaptObject(summary))
  }
  for (const [id, obj] of fetchedObjects.value) merged.set(id, obj)
  return merged
})

const displayFlags = computed(() =>
  DISPLAY_FLAGS.reduce((flags, flag) => (prefs.value[flag.pref] ? flags | flag.bit : flags), 0),
)

const mapData = computed(() => {
  if (!laidOut.value) return null
  const doc = topologyToMapDocument(laidOut.value.topology, laidOut.value.positions, {
    flags: displayFlags.value,
    objectDisplayMode: prefs.value.displayMode,
  })
  return adaptApiNetworkMap(doc, objectsById.value)
})

// `pi-fw` alone keeps unchecked labels aligned with checked ones.
const checkIcon = (on) => (on ? 'pi pi-check' : 'pi pi-fw')

const displayMenuItems = computed(() => [
  {
    label: 'Display objects as',
    items: DISPLAY_MODE_LABELS.map((label, mode) => ({
      label,
      icon: checkIcon(prefs.value.displayMode === mode),
      command: () => (prefs.value.displayMode = mode),
    })),
  },
  { separator: true },
  ...DISPLAY_FLAGS.map((flag) => ({
    label: flag.label,
    icon: checkIcon(prefs.value[flag.pref]),
    disabled: flag.iconOnly && prefs.value.displayMode !== ICON_DISPLAY_MODE,
    command: () => (prefs.value[flag.pref] = !prefs.value[flag.pref]),
  })),
])

function hideMenus() {
  nodeContextMenuRef.value?.hide()
  displayContextMenuRef.value?.hide()
}

const mapObjects = computed(() => mapObjectEntries(mapData.value))

// Fit after an object, type or layout switch only: a refresh keeps the user's zoom and pan.
watch(mapData, (map) => {
  if (!map || !pendingFit) return
  pendingFit = false
  nextTick(() => canvasRef.value?.fitContent())
})

const linkMergeThreshold = computed(() => activeMergeThreshold(0, prefs.value.mergeParallelLinks))

// The canvas also redraws from the `mapData` it already has (the merge toggle does), so the drop
// goes into that element as well as into the positions the next document is built from.
function handleNodeMoved({ id, x, y }) {
  const element = mapData.value?.elements.find((e) => e.id === id)
  if (!element) return
  element.x = x
  element.y = y
  if (laidOut.value) laidOut.value.positions[element.objectId] = { x, y }
}

function nodeTarget(nodeData) {
  if (!nodeData?.objectId) return null
  return objectTarget({ id: nodeData.objectId, class: nodeData.objectClass })
}

function handleNodeDblClick(nodeData, event) {
  const target = nodeTarget(nodeData)
  if (!target) return
  if (shouldOpenInNewTab(event)) openInNewTab(target)
  else router.push(target)
}

/** Forwarded by the canvas: cytoscape never reports button 1. */
function handleNodeMiddleClick(nodeData) {
  const target = nodeTarget(nodeData)
  if (target) openInNewTab(target)
}

function handleNodeContextMenu(event, nodeData) {
  const target = nodeTarget(nodeData)
  if (!target) return
  nodeContextMenuItems.value = [
    { label: nodeData.name || 'Node', class: 'context-menu-header', disabled: true },
    { separator: true },
    {
      label: 'Open',
      icon: 'pi pi-external-link',
      // A context-menu command carries no modifier state, so a plain navigation.
      command: () => router.push(target),
    },
  ]
  nodeContextMenuRef.value?.show(event)
}

function handleTypeChange(type) {
  activeType.value = type
  router.replace({ query: { ...route.query, type } })
}

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const errorMessage = computed(() => {
  if (!error.value) return null
  const status = error.value?.status
  if (status === 400) return 'Topology not available for this object type.'
  if (status === 404) return 'Object not found.'
  if (status === 403) return 'Access denied.'
  if (status === 500) return 'Server could not build the topology map.'
  return 'Failed to load topology.'
})
</script>

<template>
  <div class="topology-view">
    <TopologyToolbar
      :active-type="activeType"
      :active-layout="prefs.layout"
      :search-term="searchTerm"
      :objects="mapObjects"
      :physical-links="prefs.physicalLinks"
      :display-items="displayMenuItems"
      :is-fetching="isFetching && !isLoading"
      :disabled-types="disabledTypes"
      @type-change="handleTypeChange"
      @layout-change="prefs.layout = $event"
      @update:search-term="searchTerm = $event"
      @update:physical-links="prefs.physicalLinks = $event"
      @focus-object="(id) => canvasRef?.focusElement(id)"
      @refresh="refetch()"
    />

    <!-- Only `contextmenu`, which the Menu key raises too; the canvas owns its keys. -->
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
    <div class="topology-body" @contextmenu.prevent>
      <div v-if="isCapabilityBlocked" class="topology-overlay topology-empty">
        <i class="pi pi-info-circle" />
        <span>{{ capabilityRequired }}</span>
      </div>

      <div v-else-if="errorMessage" class="topology-overlay topology-error">
        <QueryErrorState :message="errorMessage" :retrying="isFetching" @retry="refetch" />
      </div>

      <div
        v-else-if="topologyData && !topologyData.objects?.length"
        class="topology-overlay topology-empty"
      >
        <i class="pi pi-share-alt" />
        <span>No topology data available.</span>
      </div>

      <!-- First fetch, or the first layout of this topology type -->
      <div v-else-if="!showMap" class="topology-overlay">
        <ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="3" />
      </div>

      <template v-else>
        <NetworkMapCanvas
          ref="canvasRef"
          :map-data="mapData"
          draggable
          :search-term="searchTerm"
          :show-grid="prefs.showGrid"
          :hide-links="prefs.hideLinks"
          :hide-link-labels="prefs.hideLinkLabels"
          :link-merge-threshold="linkMergeThreshold"
          :overflow-tables="prefs.overflowTables"
          @node-moved="handleNodeMoved"
          @node-dblclick="handleNodeDblClick"
          @node-middleclick="handleNodeMiddleClick"
          @node-contextmenu="handleNodeContextMenu"
          @canvas-contextmenu="(event) => displayContextMenuRef?.show(event)"
          @viewport-change="hideMenus"
        />

        <div class="canvas-controls">
          <NetworkMapSideToolbar
            v-model:hide-links="prefs.hideLinks"
            v-model:hide-link-labels="prefs.hideLinkLabels"
            v-model:merge-parallel-links="prefs.mergeParallelLinks"
            v-model:overflow-tables="prefs.overflowTables"
            v-model:show-grid="prefs.showGrid"
            :geo-toggle="false"
          />
        </div>

        <div class="zoom-controls">
          <Button
            icon="pi pi-expand"
            size="small"
            severity="secondary"
            text
            v-tooltip.left="'Fit to view'"
            aria-label="Fit to view"
            @click="canvasRef?.fitContent()"
          />
          <Button
            icon="pi pi-plus"
            size="small"
            severity="secondary"
            text
            v-tooltip.left="'Zoom in'"
            aria-label="Zoom in"
            @click="canvasRef?.zoomIn()"
          />
          <Button
            icon="pi pi-minus"
            size="small"
            severity="secondary"
            text
            v-tooltip.left="'Zoom out'"
            aria-label="Zoom out"
            @click="canvasRef?.zoomOut()"
          />
        </div>
      </template>
    </div>

    <ContextMenu ref="nodeContextMenuRef" :model="nodeContextMenuItems" />
    <ContextMenu ref="displayContextMenuRef" :model="displayMenuItems" />
  </div>
</template>

<style scoped>
.topology-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.topology-body {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: var(--p-surface-ground);
}

.topology-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.topology-error {
  color: var(--p-red-500, #ef4444);
}

.topology-error i,
.topology-empty i {
  font-size: 1.5rem;
  opacity: 0.6;
}

/* Placement and chrome as on the network map canvas. */
.canvas-controls {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  z-index: 11;
}

.zoom-controls {
  position: absolute;
  bottom: 1.25rem;
  right: 1.25rem;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.2rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 8px;
  background: var(--p-surface-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
</style>
