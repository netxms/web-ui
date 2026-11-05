<script setup>
import {
  ref,
  reactive,
  computed,
  watch,
  nextTick,
  onMounted,
  onUnmounted,
  defineAsyncComponent,
} from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import ProgressSpinner from 'primevue/progressspinner'
import SidebarHeader from '@/components/layout/SidebarHeader.vue'
import SidebarFilter from '@/components/layout/SidebarFilter.vue'
import ObjectSidebarTree from '@/components/objects/ObjectSidebarTree.vue'
import NetworkMapCanvas from '@/components/network-maps/NetworkMapCanvas.vue'
import NetworkMapToolbar from '@/components/network-maps/NetworkMapToolbar.vue'
import NetworkMapEditControls from '@/components/network-maps/NetworkMapEditControls.vue'
import NetworkMapSideToolbar from '@/components/network-maps/NetworkMapSideToolbar.vue'
import ObjectToolsPanel from '@/components/common/ObjectToolsPanel.vue'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'
import StatusExplanationDialog from '@/components/objects/StatusExplanationDialog.vue'
import CreateObjectDialog from '@/components/objects/CreateObjectDialog.vue'
import CreateNetworkMapDialog from '@/components/objects/CreateNetworkMapDialog.vue'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import NetworkMapElementPropertiesDialog from '@/components/network-maps/NetworkMapElementPropertiesDialog.vue'
import NetworkMapLinkPropertiesDialog from '@/components/network-maps/NetworkMapLinkPropertiesDialog.vue'
import NetworkMapDciContainerPropertiesDialog from '@/components/network-maps/NetworkMapDciContainerPropertiesDialog.vue'
import NetworkMapDciImagePropertiesDialog from '@/components/network-maps/NetworkMapDciImagePropertiesDialog.vue'
import NetworkMapPropertiesView from '@/components/network-maps/NetworkMapPropertiesView.vue'
import NetworkMapGroupDetailView from '@/components/network-maps/NetworkMapGroupDetailView.vue'
import NetworkMapsRootDetailView from '@/components/network-maps/NetworkMapsRootDetailView.vue'
import DemoNoticeBanner from '@/components/common/DemoNoticeBanner.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { DEMO_CONTENT_ENABLED } from '@/config/buildFlags'

// Leaflet is only needed for the geographic backdrop, so it stays out of the chunk.
const GeoMapCanvas = defineAsyncComponent(
  () => import('@/components/network-maps/GeoMapCanvas.vue'),
)
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useContextMenu } from '@/composables/useContextMenu'
import {
  useNetworkMapTree,
  useNetworkMap,
  useSaveNetworkMap,
  useMapDciValues,
} from '@/queries/useNetworkMapQueries'
import { useNetworkMapEditor } from '@/composables/useNetworkMapEditor'
import { useImagesByGuid } from '@/queries/useImageLibraryQueries'
import { useNetworkMapStore } from '@/stores/networkMapStore'
import { useViewStore } from '@/stores/viewStore'
import { mapTarget, objectTarget } from '@/utils/routeTargets'
import { openInNewTab, shouldOpenInNewTab } from '@/utils/navigation'
import { useObjects, useObject } from '@/queries/useObjectQueries'
import { getStatusHexColor } from '@/utils/objectUtils'
import {
  MOCK_MAP_IDS,
  GRID_SIZE,
  snapPoint,
  resolveMapBackdrop,
  isGeographicalCanvas,
  mapInitialView,
  countUnplacedObjects,
} from '@/utils/networkMapUtils'
import { safeBgrIntToHex } from '@/utils/networkMapAdapters'
import { activeMergeThreshold, configuredMergeThreshold } from '@/utils/networkMapParallelLinks'
import { buildCreateMenuItems } from '@/utils/createMenuItems'
import { useObjectDeletionNavigation } from '@/composables/useObjectDeletionNavigation'
import { useWorkingState } from '@/composables/useWorkingState'
import { findNodeByPath } from '@/utils/objectTreeNavigation'
import { filterObjectTree } from '@/utils/objectTreeSort'

const DEFAULT_ROOT_ID = 6

const route = useRoute()
const router = useRouter()
const networkMapStore = useNetworkMapStore()
const viewStore = useViewStore()

// Declared before the map-change/reset watchers that reference it.
const editor = useNetworkMapEditor()
const layoutEditMode = editor.editMode
const layoutDirty = editor.dirty
const canUndo = editor.canUndo
const canRedo = editor.canRedo
// Selected persisted element while editing; drives the inline editor bar.
const selectedElement = ref(null)

// Root, shown as an expandable/selectable row above the tree
const { data: allRootObjects } = useObjects()
const rootId = computed(
  () =>
    (allRootObjects.value ?? []).find((o) => o.class === 'NetworkMapRoot')?.id ?? DEFAULT_ROOT_ID,
)
const { data: rootObject } = useObject(rootId)

const filterState = ref({ text: '', tokens: [] })

useWorkingState('tree', { view: { filterState } })
const expandedIds = ref(new Set())
const rootSelected = ref(false)
const searchTerm = ref('')

const {
  data: treeData,
  isLoading: loadingTree,
  isError: treeIsError,
  error: treeError,
  refetch: refetchTree,
} = useNetworkMapTree()
const mapTree = computed(() => treeData.value ?? [])

watch(
  mapTree,
  (tree) => {
    if (tree.length > 0 && expandedIds.value.size === 0) {
      expandedIds.value = new Set(tree.map((n) => String(n.id)))
    }
  },
  { immediate: true },
)

watch(
  rootId,
  (id) => {
    if (!expandedIds.value.has(String(id))) {
      expandedIds.value = new Set([...expandedIds.value, String(id)])
    }
  },
  { immediate: true },
)

const filteredTree = computed(() => filterObjectTree(mapTree.value, filterState.value.text))

function handleToggle(path) {
  const next = new Set(expandedIds.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expandedIds.value = next
}

function findPathInTree(nodes, targetId, parentPath = '') {
  for (const node of nodes) {
    const nodePath = parentPath ? `${parentPath}-${node.id}` : String(node.id)
    if (node.id === targetId) return nodePath
    if (node.children?.length) {
      const result = findPathInTree(node.children, targetId, nodePath)
      if (result) return result
    }
  }
  return null
}

function findNodeInTree(nodes, targetId) {
  for (const node of nodes) {
    if (node.id === targetId) return node
    if (node.children?.length) {
      const found = findNodeInTree(node.children, targetId)
      if (found) return found
    }
  }
  return null
}

// Root is "selected" whenever there's no route selection, implicit initial state included.
const selectedPath = computed(() =>
  hasRouteSelection.value
    ? findPathInTree(mapTree.value, selectedMapId.value)
    : String(rootId.value),
)

const mapIdFromRoute = computed(() => {
  const id = route.params.mapId
  return id ? Number(id) : null
})

watch(
  mapIdFromRoute,
  (id) => {
    networkMapStore.selectMap(id ?? null)
  },
  { immediate: true },
)

const selectedMapId = computed(() => networkMapStore.selectedMapId)

// Tells maps from groups; the whole tree is loaded up front.
const selectedTreeNode = computed(() => {
  if (rootSelected.value || selectedMapId.value == null) return null
  return findNodeInTree(mapTree.value, selectedMapId.value)
})
const isGroupSelected = computed(() => selectedTreeNode.value?.class === 'NetworkMapGroup')
const isMapSelected = computed(() => selectedTreeNode.value?.class === 'NetworkMap')
const hasRouteSelection = computed(() => !rootSelected.value && selectedMapId.value != null)

// Avoids a bogus detail request for a group id.
const mapQueryId = computed(() => (isMapSelected.value ? selectedMapId.value : null))

// Reveals the target of a deep link even if its ancestor groups were collapsed.
watch(
  [selectedMapId, mapTree],
  ([id, tree]) => {
    if (id == null) return
    const path = findPathInTree(tree, id)
    if (!path) return
    const parts = path.split('-')
    if (parts.length < 2) return
    const next = new Set(expandedIds.value)
    for (let i = 1; i < parts.length; i++) {
      next.add(parts.slice(0, i).join('-'))
    }
    expandedIds.value = next
  },
  { immediate: true },
)

watch(selectedMapId, (id) => {
  if (id != null) rootSelected.value = false
})

watch(selectedMapId, () => {
  editor.exit()
  selectedElement.value = null
  linkPropertiesVisible.value = false
  linkPropertiesLink.value = null
  dciContainerDialogVisible.value = false
  dciImageDialogVisible.value = false
  // A "Properties" click on another map routes here first (handleShowNetworkMapPropertiesEvent);
  // this watcher runs on the resulting switch, so honor the pending open.
  mapPropertiesOpen.value = pendingMapPropertiesOpen
  pendingMapPropertiesOpen = false
  propertiesVisible.value = false
  selectedZone.value = null
  zoneEditLabel.value = ''
  selectedImageRegion.value = null
  imageUrlInput.value = ''
  imageOpacityInput.value = 0.85
  imageLabelInput.value = ''
  selectedNodeList.value = []
  selectedEdgeList.value = []
  edgeLabelInput.value = ''
  boxSelectActive.value = false
  drawModeActive.value = false
  addedCount = 0
  searchTerm.value = ''
  canvasTypeOverride.value = null
  mergeLinksOverride.value = null
})

const treeRef = ref(null)

const treeRoots = computed(() => [
  {
    object: rootObject.value,
    label: 'Network Maps',
    fallbackClass: 'NetworkMapRoot',
    nodes: filteredTree.value,
    emptyText: 'No maps found',
  },
])

/** The perspective with no id. */
function rootRowTarget() {
  return { name: 'network-maps', params: {} }
}

function handleTreeSelect(node, path) {
  if (path === String(rootId.value)) handleSelectRoot()
  else handleSelectNode(node)
}

function resolveTreePath(path) {
  if (path === String(rootId.value)) return rootObject.value
  return findNodeByPath(filteredTree.value, path)
}

function treeNodeTarget(node) {
  return mapTarget(node.id)
}

function handleSelectNode(node) {
  router.push(treeNodeTarget(node))
}

function handleSelectRoot() {
  rootSelected.value = true
  if (selectedMapId.value != null) {
    router.push({ name: 'network-maps', params: { mapId: undefined } })
  }
}

/**
 * Deleting the open object selects its neighbour in the tree as displayed instead of dropping
 * the user on the home page.
 */
useObjectDeletionNavigation({
  currentId: mapIdFromRoute,
  trees: () => [
    { nodes: filteredTree, onSelect: handleSelectNode, onSelectRoot: handleSelectRoot },
  ],
})

const {
  data: mapData,
  isLoading: loadingMap,
  isFetching: fetchingMap,
  isError: mapIsError,
  error: mapError,
  refetch: refetchMap,
} = useNetworkMap(mapQueryId)

/**
 * Session-local canvas switch; null means the map's persisted canvasType. Reset on every map
 * change, like legacy canvasTypeOverride: Properties is where the change is made permanent.
 */
const canvasTypeOverride = ref(null)

/**
 * Session-local "Merge parallel links" switch; null follows the map (on while its threshold is
 * above 0). Reset on every map change and threshold change, as in legacy.
 */
const mergeLinksOverride = ref(null)

const toolsPanelOpen = ref(false)
const activeToolsTab = ref('polls')
const MAP_POLLS = [
  { id: 'automaticBinding', label: 'Automatic Binding', icon: 'pi pi-link' },
  { id: 'mapUpdate', label: 'Map Update', icon: 'pi pi-refresh' },
]

const canvasRef = ref(null)

function handleFit() {
  canvasRef.value?.fitContent()
}

function handleZoomIn() {
  canvasRef.value?.zoomIn()
}

function handleZoomOut() {
  canvasRef.value?.zoomOut()
}

// Layout edit mode persists via PUT /v1/objects/{id}/map. Real topology maps only: demo maps
// are view-only, geo maps position nodes by geolocation.
const isDemoMap = computed(() => MOCK_MAP_IDS.has(Number(selectedMapId.value)))
const layoutEditable = computed(() => !isDemoMap.value && !isGeoCanvas.value)

// Save serializes the working copy in one PUT.
const activeMapData = computed(() => (editor.editMode.value ? editor.working.value : mapData.value))

// Live preview of the property draft while the properties panel is open: `mapPreviewPatch`
// (a rawContent patch) is merged over the active map. The wash color is rebuilt into
// `.background` because the canvas reads that, not `rawContent.backgroundColor`.
const mapPreviewPatch = ref(null)
const canvasMapData = computed(() => {
  const base = activeMapData.value
  const patch = mapPropertiesOpen.value ? mapPreviewPatch.value : null
  if (!base || !patch) return base
  const hex = safeBgrIntToHex(patch.backgroundColor)
  return {
    ...base,
    rawContent: { ...base.rawContent, ...patch },
    background: hex ? { type: 'color', color: hex } : null,
  }
})

/** Resolved against canvasMapData so a "Canvas type" change previews before it is saved. */
const isGeoCanvas = computed(
  () => canvasTypeOverride.value ?? isGeographicalCanvas(canvasMapData.value),
)

/** Preview included (0 = never merge). */
const configuredLinkMergeThreshold = computed(() => configuredMergeThreshold(canvasMapData.value))

/** The toolbar override, else the map's setting. */
const mergeParallelLinks = computed(
  () => mergeLinksOverride.value ?? configuredLinkMergeThreshold.value > 0,
)

/** Edit mode shows every link on its own line, so each keeps its properties and bend points. */
const linkMergeThreshold = computed(() =>
  layoutEditMode.value
    ? 0
    : activeMergeThreshold(configuredLinkMergeThreshold.value, mergeParallelLinks.value),
)

/** Per map and per canvas, in the persisted view state (networkMapStore). */
const overflowTablesOn = computed(() => networkMapStore.overflowTablesEnabled(selectedMapId.value))
const tableCanvas = computed(() => (isGeoCanvas.value ? 'geo' : 'graph'))
const tableOffsets = computed(() =>
  networkMapStore.overflowTableOffsets(selectedMapId.value, tableCanvas.value),
)

function setOverflowTables(on) {
  networkMapStore.setOverflowTablesEnabled(selectedMapId.value, on)
}

function setTableOffsets(offsets) {
  networkMapStore.setOverflowTableOffsets(selectedMapId.value, tableCanvas.value, offsets)
}

/** Fit to pins, or stored centre/zoom. */
const geoInitialView = computed(() => mapInitialView(canvasMapData.value))

/** Shown in the geo bar, as legacy shows it in the message area. */
const unplacedObjectCount = computed(() =>
  isGeoCanvas.value ? countUnplacedObjects(canvasMapData.value) : 0,
)

const {
  mutate: saveMapContent,
  mutateAsync: saveMapContentAsync,
  isPending: savingLayout,
} = useSaveNetworkMap()
const toast = useToast()
const confirm = useConfirm()

function handleNodeMoved({ id, x, y }) {
  editor.setNodePosition(id, x, y)
}

/** Automatic layouts move every node, so all positions are recorded while editing. */
function handleLayoutApplied(positions) {
  editor.applyLayoutPositions(positions)
}

const mapViewState = computed(() => networkMapStore.viewState)

/**
 * The palette shares the bar slot with the geo and demo bars. A computed rather than v-else-if,
 * so the palette can sit inside a <Transition> that stays mounted and animates both ways.
 */
const showEditPalette = computed(
  () => layoutEditMode.value && !isGeoCanvas.value && !(isDemoMap.value && DEMO_CONTENT_ENABLED),
)

/** Link labels (skipped while links or labels are hidden) plus DCI container elements. */
const mapDciSources = computed(() => {
  const sources = []
  if (!mapViewState.value.hideLinks && !mapViewState.value.hideLinkLabels) {
    for (const link of activeMapData.value?.links ?? []) sources.push(...(link.dciList ?? []))
  }
  for (const el of activeMapData.value?.elements ?? []) {
    if (el.type === 'dci-container') sources.push(...(el.dciList ?? []))
  }
  return sources
})

/** Legacy 30s cadence. */
const { valuesByDci: mapDciValues } = useMapDciValues(mapDciSources, {
  // Through the map, so users with delegated read on its nodes still see the labels.
  delegate: computed(() => (isDemoMap.value ? 0 : Number(mapQueryId.value) || 0)),
})

/** True while anything the align action could act on is selected. */
const hasAlignSelection = computed(
  () => selectedNodeList.value.length > 0 || selectedElement.value !== null,
)

/**
 * One undoable step, on the selection or else every element (legacy alignToGrid moves every
 * figure, decorations included).
 */
function alignToGrid() {
  const selectedIds = new Set([
    ...selectedNodeList.value.map((n) => n.id),
    ...(selectedElement.value ? [selectedElement.value.id] : []),
  ])
  const positions = {}
  for (const elem of activeMapData.value?.elements ?? []) {
    if (typeof elem.x !== 'number' || typeof elem.y !== 'number') continue
    if (selectedIds.size && !selectedIds.has(elem.id)) continue
    positions[elem.id] = snapPoint({ x: elem.x, y: elem.y }, GRID_SIZE)
  }
  // rebuild: unlike a layout run, the canvas does not know these positions changed.
  if (Object.keys(positions).length) editor.applyLayoutPositions(positions, true)
}

/** Used when leaving or saving edit mode. */
function closeEditorDialogs() {
  linkPropertiesVisible.value = false
  linkPropertiesLink.value = null
  dciContainerDialogVisible.value = false
  dciImageDialogVisible.value = false
  mapPropertiesOpen.value = false
  mapGeoPickActive.value = false
  propertiesVisible.value = false
}

/** Resolves true when it's safe to proceed: not editing, nothing changed, or confirmed. */
function confirmDiscardDraft() {
  if (!editor.editMode.value || !layoutDirty.value) return Promise.resolve(true)
  return new Promise((resolve) => {
    confirm.require({
      header: 'Unsaved changes',
      message: 'This map has unsaved changes. Discard them?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Discard changes',
      rejectLabel: 'Keep editing',
      accept: () => resolve(true),
      reject: () => resolve(false),
      // Escape / close icon fire neither accept nor reject.
      onHide: () => resolve(false),
    })
  })
}

// Guards a dirty draft on sidebar map switches (same-route param change), leaving the
// perspective, and closing the tab.
onBeforeRouteUpdate(async (to, from) => {
  if (to.params.mapId === from.params.mapId) return true
  const ok = await confirmDiscardDraft()
  // A cancelled switch drops the pending "open properties after routing" request, or it would
  // fire on the next unrelated switch.
  if (!ok) pendingMapPropertiesOpen = false
  return ok
})

onBeforeRouteLeave(() => confirmDiscardDraft())

function handleBeforeUnload(e) {
  if (!layoutDirty.value) return
  e.preventDefault()
  // Required by some browsers for the native "leave site?" prompt to show.
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
onUnmounted(() => window.removeEventListener('beforeunload', handleBeforeUnload))

async function toggleLayoutEditMode() {
  if (editor.editMode.value) {
    if (!(await confirmDiscardDraft())) return
    editor.exit()
    selectedElement.value = null
    closeEditorDialogs()
  } else {
    editor.enter(mapData.value)
  }
}

function discardLayoutEdits() {
  editor.discard()
  selectedElement.value = null
  closeEditorDialogs()
}

/** After the concurrent-edit guard. */
function commitLayoutSave(map) {
  saveMapContent(
    { id: map.id, map },
    {
      onSuccess: () => {
        editor.exit()
        selectedElement.value = null
        closeEditorDialogs()
        toast.add({ severity: 'success', summary: 'Map saved', life: 2000 })
      },
      onError: (err) => {
        if (err?.status === 403) {
          toast.add({
            severity: 'error',
            summary: 'No modify rights',
            detail: 'You do not have modify rights on this map. Your changes were not saved.',
            life: 4000,
          })
          refetchMap()
        } else {
          toast.add({
            severity: 'error',
            summary: 'Failed to save map',
            detail: err?.message,
            life: 3000,
          })
        }
      },
    },
  )
}

async function saveLayoutEdits() {
  // Fold a pending property draft in first, so what the canvas previews is what gets written.
  // Before capturing `map`: updateMapSettings reassigns working.value.
  if (mapPropertiesOpen.value && mapPreviewPatch.value && mapPropertiesRef.value?.isDirty) {
    editor.updateMapSettings(mapPreviewPatch.value)
  }
  const map = editor.working.value
  if (!map || !layoutDirty.value) return
  // Warn rather than merge if the map changed since editing began: link ids are reassigned on
  // every PUT.
  let fresh = null
  try {
    const res = await refetchMap()
    fresh = res?.data ?? null
  } catch {
    // The save attempt surfaces the error.
  }
  if (fresh && editor.baselineDivergedFrom(fresh)) {
    confirm.require({
      header: 'Map changed on server',
      message:
        'This map was changed since you started editing. Saving will overwrite those changes. Continue?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Overwrite',
      rejectLabel: 'Cancel',
      accept: () => commitLayoutSave(map),
    })
    return
  }
  commitLayoutSave(map)
}

// Element palette: add object / group box / text box
const addObjectVisible = ref(false)
const addObjectAnchor = ref(null)
const NETWORK_ADD_PERSPECTIVES = [
  { id: 'infrastructure', label: 'Infrastructure', rootId: 2 },
  { id: 'network', label: 'Entire Network', rootId: 1 },
]

/**
 * The background menu's "Create" submenu is offered before editing starts, but every
 * add-element mutation needs editor.working.
 */
function ensureEditMode() {
  if (!editor.editMode.value) editor.enter(mapData.value)
}

function openAddObject(pos = null) {
  ensureEditMode()
  addObjectAnchor.value = pos
  addObjectVisible.value = true
}

function handleAddObjectSelect(nodes) {
  const list = Array.isArray(nodes) ? nodes : [nodes]
  const anchor = addObjectAnchor.value ?? canvasRef.value?.getGraphCenter() ?? { x: 0, y: 0 }
  editor.addObjectElements(list, anchor)
  addObjectVisible.value = false
  addObjectAnchor.value = null
}

function addGroupBoxElement(pos = null) {
  ensureEditMode()
  const id = editor.addGroupBox(pos ?? canvasRef.value?.getGraphCenter() ?? {})
  nextTick(() => canvasRef.value?.selectElement(id))
}

function addTextBoxElement(pos = null) {
  ensureEditMode()
  const id = editor.addTextBox(pos ?? canvasRef.value?.getGraphCenter() ?? {})
  nextTick(() => canvasRef.value?.selectElement(id))
}

function addDciContainerElement(pos = null) {
  ensureEditMode()
  const id = editor.addDciContainer(pos ?? canvasRef.value?.getGraphCenter() ?? {})
  nextTick(() => canvasRef.value?.selectElement(id))
}

function addDciImageElement(pos = null) {
  ensureEditMode()
  const id = editor.addDciImage(pos ?? canvasRef.value?.getGraphCenter() ?? {})
  nextTick(() => canvasRef.value?.selectElement(id))
}

function handleElementSelect(el) {
  selectedElement.value = el
}

function refreshSelectedElement() {
  if (selectedElement.value) selectedElement.value = editor.getElement(selectedElement.value.id)
}

function handleElementUpdated(patch) {
  editor.updateElement(patch.id, patch)
  refreshSelectedElement()
}

// Bend points imply "Bend points" routing (index 3), as in the legacy editor.
const LINK_ROUTING_BEND_POINTS = 3
function handleLinkBendPoints({ id, bendPoints }) {
  const patch = { bendPoints }
  if (bendPoints.length) patch.routing = LINK_ROUTING_BEND_POINTS
  editor.updateLink(id, patch)
}

function updateSelectedElement(patch) {
  if (!selectedElement.value) return
  editor.updateElement(selectedElement.value.id, patch)
  refreshSelectedElement()
}

function removeSelectedElement() {
  if (!selectedElement.value) return
  editor.removeElements([selectedElement.value.id])
  selectedElement.value = null
}

const propertiesVisible = ref(false)
const propertiesElement = ref(null)
const dciContainerDialogVisible = ref(false)
const dciContainerElement = ref(null)
const dciImageDialogVisible = ref(false)
const dciImageElement = ref(null)

/** The one function that must branch on element kind. */
function openElementProperties(el = selectedElement.value) {
  if (!el) return
  if (el.type === 'dci-container') {
    dciContainerElement.value = el
    dciContainerDialogVisible.value = true
    return
  }
  if (el.type === 'dci-image') {
    dciImageElement.value = el
    dciImageDialogVisible.value = true
    return
  }
  propertiesElement.value = el
  propertiesVisible.value = true
}

function applyElementProperties(patch) {
  if (!propertiesElement.value) return
  editor.updateElement(propertiesElement.value.id, patch)
  refreshSelectedElement()
}

function applyDciContainerProperties(patch) {
  if (!dciContainerElement.value) return
  editor.updateElement(dciContainerElement.value.id, patch)
  refreshSelectedElement()
}

function applyDciImageProperties(patch) {
  if (!dciImageElement.value) return
  editor.updateElement(dciImageElement.value.id, patch)
  refreshSelectedElement()
}

const mapPropertiesOpen = ref(false)
const mapPropertiesRef = ref(null)
// Toggled from the properties Background section; unlocks the backdrop for drag-to-position.
const mapGeoPickActive = ref(false)

// A "Canvas type" edit must win over the toolbar override, or the canvas would not move and
// the edit would read as unsaved. Must be declared after mapPropertiesOpen: watch() evaluates its
// source immediately, and canvasMapData reads it.
watch(
  () => isGeographicalCanvas(canvasMapData.value),
  () => {
    canvasTypeOverride.value = null
  },
)

// Same for "Merge parallel links". Normalized, so the no-op patch emitted on open changes
// nothing.
watch(configuredLinkMergeThreshold, () => {
  mergeLinksOverride.value = null
})

function openMapProperties() {
  mapPropertiesOpen.value = true
}

function closeMapProperties() {
  // In edit mode a dirty draft folds into the working copy on close (flushed by Save).
  if (editor.editMode.value && mapPreviewPatch.value && mapPropertiesRef.value?.isDirty) {
    editor.updateMapSettings(mapPreviewPatch.value)
  }
  mapPropertiesOpen.value = false
  mapPreviewPatch.value = null
  mapGeoPickActive.value = false
}

function handleGeoCenterChange({ lat, lon }) {
  mapPropertiesRef.value?.setGeoCenter(lat, lon)
}

/**
 * Merges the settings patch (already rawContent-encoded) into the fetched map's rawContent via
 * the /objects/{id}/map PUT, keeping elements and links.
 */
async function persistMapSettings(patch) {
  const base = mapData.value
  if (!base) return
  // During a layout edit, fold the settings into the working copy and run the map's own Save,
  // so layout and settings go in one PUT and never race.
  if (editor.editMode.value) {
    editor.updateMapSettings(patch)
    await saveLayoutEdits()
    return
  }
  try {
    const patchedMap = { ...base, rawContent: { ...base.rawContent, ...patch } }
    await saveMapContentAsync({ id: base.id, map: patchedMap })
    toast.add({ severity: 'success', summary: 'Map properties saved', life: 2000 })
  } catch (err) {
    if (err?.status === 403) {
      toast.add({
        severity: 'error',
        summary: 'No modify rights',
        detail: 'You do not have modify rights on this map.',
        life: 4000,
      })
      refetchMap()
    } else {
      toast.add({
        severity: 'error',
        summary: 'Failed to save map properties',
        detail: err?.message,
        life: 3000,
      })
    }
    throw err
  }
}

const linkPropertiesVisible = ref(false)
const linkPropertiesLink = ref(null)

/** Legacy "Link selected objects". */
const canLinkSelection = computed(() => layoutEditMode.value && selectedNodeList.value.length === 2)

function linkSelectedObjects() {
  const [a, b] = selectedNodeList.value
  if (!a || !b) return
  const id = editor.addLink(a.id, b.id)
  // The structural change rebuilds the canvas, dropping cy selection.
  if (id) nextTick(() => canvasRef.value?.selectEdge(id))
}

function openLinkProperties(id = selectedEdge.value?.id) {
  const link = id != null ? editor.getLink(id) : null
  if (!link) return
  linkPropertiesLink.value = link
  linkPropertiesVisible.value = true
}

function applyLinkProperties(patch) {
  const id = linkPropertiesLink.value?.id
  if (id == null) return
  editor.updateLink(id, patch)
  nextTick(() => canvasRef.value?.selectEdge(id))
}

// Only the GUIDs this map references: image decorations' `imageGuid`, DCI images'
// `defaultImage`.
const mapImageGuids = computed(() => {
  const guids = new Set()
  // Geo backdrops use tile URLs. The preview-merged data shows a freshly picked image live.
  const backdrop = resolveMapBackdrop(canvasMapData.value)
  if (backdrop.type === 'image' && backdrop.guid) guids.add(backdrop.guid)
  for (const e of activeMapData.value?.elements ?? []) {
    if (e.type === 'decoration' && e.decorationType === 'image' && e.imageGuid) {
      guids.add(e.imageGuid)
    } else if (e.type === 'dci-image' && e.defaultImage) {
      guids.add(e.defaultImage)
    }
  }
  return [...guids]
})
const { data: mapImageUrls } = useImagesByGuid(mapImageGuids)

const demo = reactive({
  draggable: false,
  snapToGrid: false,
  showGrid: true,
})

const heatmapEnabled = ref(false)

// Status storm: track node statuses to detect worsening on refetch
const previousStatuses = ref({}) // { [elementId]: objectStatus }

watch(
  () => mapData.value,
  (newMap, oldMap) => {
    if (!newMap) return
    if (!oldMap || newMap.id !== oldMap.id) {
      previousStatuses.value = Object.fromEntries(
        newMap.elements.filter((e) => e.type === 'object').map((e) => [e.id, e.objectStatus]),
      )
      return
    }
    const worsened = newMap.elements
      .filter(
        (e) =>
          e.type === 'object' &&
          previousStatuses.value[e.id] !== undefined &&
          e.objectStatus > previousStatuses.value[e.id],
      )
      .map((e) => e.id)
    previousStatuses.value = Object.fromEntries(
      newMap.elements.filter((e) => e.type === 'object').map((e) => [e.id, e.objectStatus]),
    )
    if (worsened.length > 0 && !editor.editMode.value)
      canvasRef.value?.triggerStatusPropagation(worsened)
  },
)

function triggerDemoStorm() {
  if (!mapData.value || !canvasRef.value) return
  const nodes = mapData.value.elements.filter((e) => e.type === 'object')
  const elevated = nodes.filter((n) => n.objectStatus >= 2)
  const pool = elevated.length > 0 ? elevated : nodes
  canvasRef.value.triggerStatusPropagation(pool.map((n) => n.id))
}

const ZONE_COLORS = [
  '#f97316',
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#8b5cf6',
  '#eab308',
  '#06b6d4',
  '#64748b',
]

const selectedZone = ref(null)
const zoneEditLabel = ref('')

function handleZoneSelect(zoneData) {
  if (!zoneData) {
    selectedZone.value = null
    zoneEditLabel.value = ''
    return
  }
  if (!selectedZone.value || selectedZone.value.id !== zoneData.id) {
    zoneEditLabel.value = zoneData.label ?? ''
  }
  selectedZone.value = zoneData
}

function handleZoneLabelChange() {
  if (!selectedZone.value) return
  canvasRef.value?.updateZone(selectedZone.value.id, { label: zoneEditLabel.value })
}

function setZoneColor(color) {
  if (!selectedZone.value) return
  selectedZone.value = { ...selectedZone.value, style: { ...selectedZone.value.style, color } }
  canvasRef.value?.updateZone(selectedZone.value.id, { style: { color } })
}

function removeSelectedZone() {
  canvasRef.value?.removeSelectedZone()
  selectedZone.value = null
  zoneEditLabel.value = ''
}

function addDemoZone(graphPos = null) {
  canvasRef.value?.addZone(graphPos)
}

watch(
  () => demo.snapToGrid,
  (val) => {
    if (val) demo.draggable = true
  },
)

// Mirrors the canvas's internal draw mode, for button styling
const drawModeActive = ref(false)

function handleDrawModeChange(active) {
  drawModeActive.value = active
}

function toggleDrawImageRegion() {
  canvasRef.value?.toggleDrawImageRegion()
}

const selectedImageRegion = ref(null)
const imageUrlInput = ref('')
const imageOpacityInput = ref(0.85)
const imageLabelInput = ref('')

function handleImageRegionSelect(regionData) {
  if (!regionData) {
    selectedImageRegion.value = null
    imageUrlInput.value = ''
    imageOpacityInput.value = 0.85
    imageLabelInput.value = ''
    return
  }
  if (!selectedImageRegion.value || selectedImageRegion.value.id !== regionData.id) {
    imageUrlInput.value = regionData.imageUrl ?? ''
    imageOpacityInput.value = regionData.opacity ?? 0.85
    imageLabelInput.value = regionData.label ?? ''
  }
  selectedImageRegion.value = regionData
}

function handleImageUrlChange() {
  if (!selectedImageRegion.value) return
  canvasRef.value?.updateImageRegion(selectedImageRegion.value.id, {
    imageUrl: imageUrlInput.value,
  })
}

function handleImageOpacityChange() {
  if (!selectedImageRegion.value) return
  canvasRef.value?.updateImageRegion(selectedImageRegion.value.id, {
    opacity: Number(imageOpacityInput.value),
  })
}

function handleImageLabelChange() {
  if (!selectedImageRegion.value) return
  canvasRef.value?.updateImageRegion(selectedImageRegion.value.id, { label: imageLabelInput.value })
}

function removeSelectedImageRegion() {
  canvasRef.value?.removeSelectedImageRegion()
  selectedImageRegion.value = null
  imageUrlInput.value = ''
  imageOpacityInput.value = 0.85
  imageLabelInput.value = ''
}

const selectedNodeList = ref([])

const selectedNode = computed(() =>
  selectedNodeList.value.length === 1 ? selectedNodeList.value[0] : null,
)

const isNodeEditable = computed(() => selectedNode.value?.id?.startsWith('demo-') ?? false)

const nodeStatusColor = computed(() => {
  if (!selectedNode.value) return '#94a3b8'
  return getStatusHexColor(selectedNode.value.objectStatus ?? 5)
})

function handleNodeSelect(nodes) {
  selectedNodeList.value = nodes
}

const selectedEdgeList = ref([])
const edgeLabelInput = ref('')

const selectedEdge = computed(() =>
  selectedEdgeList.value.length === 1 ? selectedEdgeList.value[0] : null,
)

// Demo edges are edited on the canvas directly; persisted links go through the editor.
const isEdgeEditable = computed(
  () => layoutEditMode.value || (selectedEdge.value?.id?.startsWith('demo-edge-') ?? false),
)

function handleEdgeSelect(edges) {
  selectedEdgeList.value = edges
  edgeLabelInput.value = edges.length === 1 ? (edges[0].label ?? '') : ''
}

function handleEdgeLabelChange() {
  const edge = selectedEdgeList.value[0]
  if (!edge) return
  if (layoutEditMode.value) {
    editor.updateLink(edge.id, { label: edgeLabelInput.value })
    nextTick(() => canvasRef.value?.selectEdge(edge.id))
  } else {
    canvasRef.value?.updateEdge(edge.id, { label: edgeLabelInput.value || null })
  }
}

// Demo maps allow removing demo-created elements; real maps in edit mode any element/link.
const canRemoveNodes = computed(() => layoutEditMode.value || isNodeEditable.value)
const canRemoveEdges = computed(() => layoutEditMode.value || isEdgeEditable.value)

/** Editor for real maps, demo canvas otherwise. */
function removeSelection() {
  if (layoutEditMode.value) {
    const nodeIds = selectedNodeList.value.map((n) => n.id)
    const edgeIds = selectedEdgeList.value.map((e) => e.id)
    if (nodeIds.length) editor.removeElements(nodeIds)
    if (edgeIds.length) editor.removeLinks(edgeIds)
    selectedNodeList.value = []
    selectedEdgeList.value = []
  } else {
    canvasRef.value?.removeSelected()
  }
}

/** Re-syncs the inline overlay to the restored model. */
function undoEdit() {
  editor.undo()
  refreshSelectedElement()
}

function redoEdit() {
  editor.redo()
  refreshSelectedElement()
}

// All but Save are ignored inside text inputs, so native editing is preserved.
function handleEditorKeydown(e) {
  if (!layoutEditMode.value) return
  const key = e.key.toLowerCase()
  if ((e.ctrlKey || e.metaKey) && key === 's') {
    e.preventDefault()
    if (layoutDirty.value && !savingLayout.value) saveLayoutEdits()
    return
  }
  const t = e.target
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
  if ((e.ctrlKey || e.metaKey) && key === 'z') {
    if (e.shiftKey) redoEdit()
    else undoEdit()
    e.preventDefault()
    return
  }
  if ((e.ctrlKey || e.metaKey) && key === 'y') {
    redoEdit()
    e.preventDefault()
    return
  }
  if (e.key !== 'Delete' && e.key !== 'Backspace') return
  if (selectedElement.value) {
    removeSelectedElement()
    e.preventDefault()
  } else if (selectedNodeList.value.length || selectedEdgeList.value.length) {
    removeSelection()
    e.preventDefault()
  }
}
onMounted(() => window.addEventListener('keydown', handleEditorKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleEditorKeydown))

const boxSelectActive = ref(false)

function handleBoxSelectChange(active) {
  boxSelectActive.value = active
}

const NODE_TEMPLATES = [
  { label: 'Server', objectClass: 'Node', objectStatus: 0, namePrefix: 'server' },
  { label: 'Switch', objectClass: 'Node', objectStatus: 1, namePrefix: 'sw' },
  { label: 'AP', objectClass: 'AccessPoint', objectStatus: 0, namePrefix: 'ap' },
  { label: 'Sensor', objectClass: 'Sensor', objectStatus: 2, namePrefix: 'sensor' },
]

let addedCount = 0

function addDemoNode(template, graphPos = null) {
  if (!canvasRef.value) return
  const n = ++addedCount
  const position = graphPos
    ? { x: Math.round(graphPos.x), y: Math.round(graphPos.y) }
    : { x: Math.round(160 + Math.random() * 660), y: Math.round(120 + Math.random() * 420) }
  canvasRef.value.addNode({
    name: `${template.namePrefix}-${n}`,
    objectClass: template.objectClass,
    objectStatus: template.objectStatus,
    position,
  })
}

function addDemoLink() {
  if (!canvasRef.value) return
  const ids = canvasRef.value.getSelectedNodeIds()
  if (ids.length < 2) return
  canvasRef.value.addEdge(ids[0], ids[1])
}

function removeSelected() {
  canvasRef.value?.removeSelected()
}

function resetDemo() {
  canvasRef.value?.resetDemo()
  addedCount = 0
  selectedNodeList.value = []
  selectedEdgeList.value = []
  edgeLabelInput.value = ''
  boxSelectActive.value = false
  drawModeActive.value = false
  selectedImageRegion.value = null
  imageUrlInput.value = ''
  imageOpacityInput.value = 0.85
  imageLabelInput.value = ''
}

// Double click navigates to the object; a single click selects natively.
/** The object it represents, in Infrastructure. */
function canvasNodeTarget(nodeData) {
  if (!nodeData?.objectId) return null
  return objectTarget({ id: nodeData.objectId }, undefined, { perspective: 'infrastructure' })
}

function handleCanvasNodeDblClick(nodeData, event) {
  const target = canvasNodeTarget(nodeData)
  if (!target) return
  if (shouldOpenInNewTab(event)) {
    openInNewTab(target)
    return
  }
  router.push(target)
}

/** Forwarded by the canvas: cytoscape never reports button 1. */
function handleCanvasNodeMiddleClick(nodeData) {
  const target = canvasNodeTarget(nodeData)
  if (target) openInNewTab(target)
}

const mapContextMenuRef = ref(null)
const contextMenuTarget = ref(null) // null | { type: 'node' | 'zone', data: object }
const contextMenuScreenPos = ref(null) // { clientX, clientY } at menu open time

// The shared object action registry, so generic actions (Explain Status) appear for maps too.
const sidebarTreeContextMenu = useContextMenu({ domains: ['object'] })
const sidebarTreeMenuRef = ref(null)

function handleSidebarTreeContextMenu(event, node, { selection } = {}) {
  sidebarTreeContextMenu.contextRef.value = {
    object: node,
    viewContext: 'networkMapTree',
    // Outside a range the range has already collapsed, so this is undefined there.
    selection,
  }
  sidebarTreeMenuRef.value?.show(event)
}

const explainStatusTarget = ref(null)
const explainStatusVisible = ref(false)

function handleExplainStatusEvent(event) {
  explainStatusTarget.value = event.detail.object
  explainStatusVisible.value = true
}

onMounted(() => document.addEventListener('object:explainStatus', handleExplainStatusEvent))
onUnmounted(() => document.removeEventListener('object:explainStatus', handleExplainStatusEvent))

// "Properties" on a map other than the open one routes to it first; the map-switch watcher,
// which resets mapPropertiesOpen on every switch, picks up pendingMapPropertiesOpen.
let pendingMapPropertiesOpen = false

function handleShowNetworkMapPropertiesEvent(event) {
  const node = event.detail.object
  if (node?.id === selectedMapId.value) {
    mapPropertiesOpen.value = true
    return
  }
  pendingMapPropertiesOpen = true
  router.push({ name: 'network-maps', params: { mapId: node.id } })
}

onMounted(() =>
  document.addEventListener('networkMap:showProperties', handleShowNetworkMapPropertiesEvent),
)
onUnmounted(() =>
  document.removeEventListener('networkMap:showProperties', handleShowNetworkMapPropertiesEvent),
)

// Groups and the root show properties as a tab of their detail view; the ids must match
// PERSPECTIVE_ID in NetworkMapGroupDetailView / NetworkMapsRootDetailView.
function handleShowMapObjectPropertiesEvent(event) {
  const node = event.detail.object
  if (!node) return
  if (node.class === 'NetworkMapRoot') {
    viewStore.setActiveView('network-map-root', 'properties')
    handleSelectRoot()
  } else {
    viewStore.setActiveView('network-map-group', 'properties')
    if (node.id !== selectedMapId.value) {
      router.push({ name: 'network-maps', params: { mapId: node.id } })
    }
  }
}

onMounted(() =>
  document.addEventListener('networkMap:showObjectProperties', handleShowMapObjectPropertiesEvent),
)
onUnmounted(() =>
  document.removeEventListener(
    'networkMap:showObjectProperties',
    handleShowMapObjectPropertiesEvent,
  ),
)

const createObjectVisible = ref(false)
const createObjectParent = ref(null)
const createObjectClass = ref(null)

function handleObjectCreate(event) {
  createObjectParent.value = event.detail?.parent ?? null
  createObjectClass.value = event.detail?.objectClass ?? null
  createObjectVisible.value = true
}

onMounted(() => document.addEventListener('object:create', handleObjectCreate))
onUnmounted(() => document.removeEventListener('object:create', handleObjectCreate))

const createNetworkMapVisible = ref(false)
const createNetworkMapParent = ref(null)

function handleNetworkMapCreate(event) {
  createNetworkMapParent.value = event.detail?.parent ?? null
  createNetworkMapVisible.value = true
}

onMounted(() => document.addEventListener('networkMap:create', handleNetworkMapCreate))
onUnmounted(() => document.removeEventListener('networkMap:create', handleNetworkMapCreate))

function handleOverviewCreateMap(parent) {
  createNetworkMapParent.value = parent ?? null
  createNetworkMapVisible.value = true
}

function handleOverviewCreateGroup(parent) {
  createObjectParent.value = parent ?? null
  createObjectClass.value = 'NetworkMapGroup'
  createObjectVisible.value = true
}

// The sidebar button creates under NetworkMapRoot; nested groups go through the context menu.
const createObjectMenuRef = ref(null)
const createObjectMenuItems = computed(() => buildCreateMenuItems(rootObject.value))

function toggleCreateObjectMenu(event) {
  createObjectMenuRef.value?.toggle(event)
}

const NODE_TYPE_ICONS = {
  Server: 'pi pi-server',
  Switch: 'pi pi-sitemap',
  AP: 'pi pi-wifi',
  Sensor: 'pi pi-chart-line',
}

const mapContextMenuItems = computed(() => {
  const target = contextMenuTarget.value
  const screenPos = contextMenuScreenPos.value

  function getGraphPos() {
    if (!screenPos || !canvasRef.value) return null
    return canvasRef.value.screenToGraphCoords(screenPos.clientX, screenPos.clientY)
  }

  if (target?.type === 'node') {
    const { id, name, objectId, isEditable } = target.data
    const items = [{ label: name || 'Node', class: 'context-menu-header', disabled: true }]
    if (objectId) {
      items.push({ separator: true })
      items.push({
        label: 'Open',
        icon: 'pi pi-external-link',
        command: () => router.push({ name: 'infrastructure', params: { objectId } }),
      })
    }
    if (isEditable || layoutEditMode.value) {
      items.push({ separator: true })
      items.push({
        label: 'Remove',
        icon: 'pi pi-trash',
        command: () =>
          layoutEditMode.value ? editor.removeElements([id]) : canvasRef.value?.removeNode(id),
      })
    }
    return items
  }

  if (target?.type === 'zone') {
    const { label, isEditable } = target.data
    const items = [{ label: label || 'Zone', class: 'context-menu-header', disabled: true }]
    if (isEditable) {
      items.push({ separator: true })
      items.push({
        label: 'Remove',
        icon: 'pi pi-trash',
        command: () => canvasRef.value?.removeSelectedZone(),
      })
    }
    return items
  }

  if (target?.type === 'edge') {
    const edge = target.data
    return [
      { label: edge.label || 'Link', class: 'context-menu-header', disabled: true },
      { separator: true },
      {
        label: 'Properties...',
        icon: 'pi pi-cog',
        command: () => openLinkProperties(edge.id),
      },
      {
        label: 'Remove',
        icon: 'pi pi-trash',
        command: () => {
          editor.removeLinks([edge.id])
          selectedEdgeList.value = []
        },
      },
    ]
  }

  if (target?.type === 'element') {
    const el = target.data
    const typeLabel =
      el.type === 'text-box'
        ? 'Text Box'
        : el.type === 'dci-container'
          ? 'DCI Container'
          : el.type === 'dci-image'
            ? 'DCI Image'
            : el.decorationType === 'image'
              ? 'Image'
              : 'Group Box'
    return [
      { label: typeLabel, class: 'context-menu-header', disabled: true },
      { separator: true },
      { label: 'Properties...', icon: 'pi pi-cog', command: () => openElementProperties(el) },
      {
        label: 'Remove',
        icon: 'pi pi-trash',
        command: () => {
          editor.removeElements([el.id])
          if (selectedElement.value?.id === el.id) selectedElement.value = null
        },
      },
    ]
  }

  // Background menu, topology maps only
  if (isGeoCanvas.value) return []

  // Demo content is not persisted via the map API.
  if (isDemoMap.value) {
    return [
      {
        label: 'Add Node',
        icon: 'pi pi-plus',
        items: NODE_TEMPLATES.map((tmpl) => ({
          label: tmpl.label,
          icon: NODE_TYPE_ICONS[tmpl.label] ?? 'pi pi-circle',
          command: () => addDemoNode(tmpl, getGraphPos()),
        })),
      },
      {
        label: 'Add Zone',
        icon: 'pi pi-table',
        command: () => addDemoZone(getGraphPos()),
      },
    ]
  }

  // Create and Properties are always offered; Create enters edit mode on demand.
  return [
    {
      label: 'Create',
      icon: 'pi pi-plus',
      items: [
        { label: 'Object...', icon: 'pi pi-desktop', command: () => openAddObject(getGraphPos()) },
        {
          label: 'Group Box',
          icon: 'pi pi-table',
          command: () => addGroupBoxElement(getGraphPos()),
        },
        {
          label: 'Text Box',
          icon: 'pi pi-align-left',
          command: () => addTextBoxElement(getGraphPos()),
        },
        {
          label: 'DCI Container',
          icon: 'pi pi-server',
          command: () => addDciContainerElement(getGraphPos()),
        },
        {
          label: 'DCI Image',
          icon: 'pi pi-image',
          command: () => addDciImageElement(getGraphPos()),
        },
      ],
    },
    { separator: true },
    { label: 'Map Properties...', icon: 'pi pi-cog', command: () => openMapProperties() },
  ]
})

function handleCanvasContextMenu(event) {
  if (!selectedMapId.value) return
  contextMenuTarget.value = null
  contextMenuScreenPos.value = { clientX: event.clientX, clientY: event.clientY }
  mapContextMenuRef.value?.show(event)
}

function handleNodeContextMenu(event, nodeData) {
  contextMenuTarget.value = { type: 'node', data: nodeData }
  contextMenuScreenPos.value = null
  mapContextMenuRef.value?.show(event)
}

function handleZoneContextMenu(event, zoneData) {
  contextMenuTarget.value = { type: 'zone', data: zoneData }
  contextMenuScreenPos.value = null
  mapContextMenuRef.value?.show(event)
}

function handleElementContextMenu(event, elementData) {
  selectedElement.value = elementData
  contextMenuTarget.value = { type: 'element', data: elementData }
  contextMenuScreenPos.value = null
  mapContextMenuRef.value?.show(event)
}

function handleEdgeContextMenu(event, edgeData) {
  if (!layoutEditMode.value) return // links are read-only outside edit mode
  contextMenuTarget.value = { type: 'edge', data: edgeData }
  contextMenuScreenPos.value = null
  mapContextMenuRef.value?.show(event)
}
</script>

<template>
  <Teleport defer to="#sidebar-content">
    <div class="network-maps-sidebar">
      <SidebarHeader title="Network Maps">
        <template #actions>
          <Button
            v-tooltip.bottom="'Create object'"
            aria-label="Create object"
            icon="pi pi-plus"
            text
            severity="secondary"
            size="small"
            :disabled="createObjectMenuItems.length === 0"
            @click="toggleCreateObjectMenu"
          />
          <Menu ref="createObjectMenuRef" :model="createObjectMenuItems" :popup="true" />
        </template>
      </SidebarHeader>
      <SidebarFilter v-model="filterState" placeholder="Filter maps..." />

      <ObjectSidebarTree
        ref="treeRef"
        :roots="treeRoots"
        :expanded-ids="expandedIds"
        :selected-path="selectedPath"
        :loading="loadingTree"
        :error="treeIsError ? treeError : null"
        :target-for="treeNodeTarget"
        :root-target-for="rootRowTarget"
        :resolve-path="resolveTreePath"
        @select="handleTreeSelect"
        @contextmenu="handleSidebarTreeContextMenu"
        @toggle="handleToggle"
        @retry="refetchTree"
      />
    </div>
  </Teleport>

  <div
    class="network-maps-content"
    :class="{ 'properties-docked': mapPropertiesOpen && mapData }"
    :style="{ '--map-props-width': mapViewState.propertiesWidth + 'px' }"
  >
    <!-- Nothing selected, or root selected -->
    <NetworkMapsRootDetailView
      v-if="!hasRouteSelection"
      :tree="mapTree"
      :root-id="rootId"
      @create-map="handleOverviewCreateMap"
      @create-group="handleOverviewCreateGroup"
    />

    <div v-else-if="loadingTree" class="map-loading">
      <ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="3" />
      <span>Loading...</span>
    </div>

    <div v-else-if="treeIsError" class="map-placeholder">
      <QueryErrorState :error="treeError" @retry="refetchTree" />
    </div>

    <NetworkMapGroupDetailView
      v-else-if="isGroupSelected"
      :node="selectedTreeNode"
      @create-map="handleOverviewCreateMap"
      @create-group="handleOverviewCreateGroup"
    />

    <div v-else-if="loadingMap" class="map-loading">
      <ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="3" />
      <span>Loading map...</span>
    </div>

    <template v-else-if="mapData">
      <NetworkMapToolbar
        :map-data="mapData"
        :is-fetching="fetchingMap && !loadingMap"
        :search-term="searchTerm"
        :editable="!isDemoMap"
        :layout-tools="!isGeoCanvas"
        :edit-mode="layoutEditMode"
        @open-map-settings="openMapProperties"
        @update:search-term="searchTerm = $event"
        @refresh="refetchMap"
        @apply-layout="(type) => canvasRef?.applyLayout(type)"
        @open-tools-panel="
          (tab) => {
            activeToolsTab = tab
            toolsPanelOpen = true
          }
        "
      />

      <div v-if="isGeoCanvas" class="demo-bar">
        <span class="demo-label">
          <i class="pi pi-map" />
          Geo Map
        </span>
        <span class="overlay-bar-hint" style="margin-left: 0.5rem"
          >Pan and zoom the map to explore node locations.</span
        >
        <!-- Legacy shows the same count as an INFORMATION message. -->
        <span v-if="unplacedObjectCount > 0" class="geo-hidden-chip">
          <i class="pi pi-info-circle" />
          {{ unplacedObjectCount === 1 ? '1 node' : `${unplacedObjectCount} nodes` }} hidden (no
          location)
        </span>
      </div>

      <div v-else-if="isDemoMap && DEMO_CONTENT_ENABLED" class="demo-bar">
        <span class="demo-label">
          <i class="pi pi-play-circle" />
          Demo
        </span>

        <div class="demo-section">
          <span class="demo-section-title">Add node:</span>
          <Button
            v-for="tmpl in NODE_TEMPLATES"
            :key="tmpl.label"
            :label="tmpl.label"
            size="small"
            text
            severity="secondary"
            class="demo-add-btn"
            @click="addDemoNode(tmpl)"
          />
        </div>

        <div class="demo-sep" />

        <Button
          label="Link selected"
          icon="pi pi-share-alt"
          size="small"
          text
          severity="secondary"
          @click="addDemoLink"
        />
        <Button
          label="Remove selected"
          icon="pi pi-trash"
          size="small"
          text
          severity="danger"
          @click="removeSelected"
        />
        <Button
          label="Reset"
          icon="pi pi-refresh"
          size="small"
          text
          severity="secondary"
          @click="resetDemo"
        />

        <div class="demo-sep" />

        <Button
          label="Add Zone"
          icon="pi pi-table"
          size="small"
          text
          severity="secondary"
          @click="addDemoZone"
        />
        <button
          class="demo-toggle"
          :class="{ active: drawModeActive }"
          @click="toggleDrawImageRegion"
        >
          <i class="pi pi-image" />
          Image Region
        </button>

        <div class="demo-sep" />

        <div class="demo-toggles">
          <button
            class="demo-toggle"
            :class="{ active: demo.draggable }"
            @click="demo.draggable = !demo.draggable"
          >
            <i class="pi pi-arrows-alt" />
            Drag
          </button>
          <button
            class="demo-toggle"
            :class="{ active: demo.snapToGrid }"
            @click="demo.snapToGrid = !demo.snapToGrid"
          >
            <i class="pi pi-th-large" />
            Snap
          </button>
          <button
            class="demo-toggle"
            :class="{ active: demo.showGrid }"
            @click="demo.showGrid = !demo.showGrid"
          >
            <i class="pi pi-table" />
            Grid
          </button>
          <button
            class="demo-toggle"
            :class="{ active: boxSelectActive }"
            @click="canvasRef?.toggleBoxSelect()"
          >
            <i class="pi pi-expand" />
            Box Select
          </button>
          <button
            class="demo-toggle"
            :class="{ active: heatmapEnabled }"
            @click="heatmapEnabled = !heatmapEnabled"
          >
            <i class="pi pi-chart-bar" />
            Heatmap
          </button>
        </div>

        <div class="demo-sep" />
        <Button
          label="Trigger Storm"
          icon="pi pi-bolt"
          size="small"
          text
          severity="danger"
          @click="triggerDemoStorm"
        />
      </div>

      <Transition name="edit-bar">
        <div v-if="showEditPalette" class="demo-bar">
          <span class="demo-label">
            <i class="pi pi-pencil" />
            Add
          </span>
          <Button
            label="Object"
            icon="pi pi-plus"
            size="small"
            text
            severity="secondary"
            @click="openAddObject()"
          />
          <Button
            label="Group Box"
            icon="pi pi-table"
            size="small"
            text
            severity="secondary"
            @click="addGroupBoxElement()"
          />
          <Button
            label="Text Box"
            icon="pi pi-align-left"
            size="small"
            text
            severity="secondary"
            @click="addTextBoxElement()"
          />
          <Button
            label="DCI Container"
            icon="pi pi-server"
            size="small"
            text
            severity="secondary"
            @click="addDciContainerElement()"
          />
          <Button
            label="DCI Image"
            icon="pi pi-image"
            size="small"
            text
            severity="secondary"
            @click="addDciImageElement()"
          />
          <div class="demo-sep" />
          <Button
            v-tooltip.bottom="'Link two selected objects'"
            label="Link"
            icon="pi pi-share-alt"
            size="small"
            text
            severity="secondary"
            :disabled="!canLinkSelection"
            @click="linkSelectedObjects"
          />
          <span class="overlay-bar-hint" style="margin-left: 0.5rem">
            Drag elements to reposition. Right-click for more. Delete key removes the selection.
          </span>
        </div>
      </Transition>

      <!-- Only `contextmenu`, which the Menu key raises too; the canvas owns its keys. -->
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
      <div class="map-canvas-area" @contextmenu.prevent="handleCanvasContextMenu">
        <!-- One flex column, so the gap below the controls holds however tall they get. -->
        <div class="canvas-controls-stack">
          <NetworkMapEditControls
            v-if="layoutEditable"
            :edit-mode="layoutEditMode"
            :dirty="layoutDirty"
            :saving="savingLayout"
            :can-undo="canUndo"
            :can-redo="canRedo"
            @enter-edit="toggleLayoutEditMode"
            @exit-edit="toggleLayoutEditMode"
            @save="saveLayoutEdits"
            @discard="discardLayoutEdits"
            @undo="undoEdit"
            @redo="redoEdit"
          />

          <NetworkMapSideToolbar
            :edit-mode="layoutEditMode"
            v-model:hide-links="mapViewState.hideLinks"
            v-model:hide-link-labels="mapViewState.hideLinkLabels"
            :merge-parallel-links="mergeParallelLinks"
            @update:merge-parallel-links="mergeLinksOverride = $event"
            :overflow-tables="overflowTablesOn"
            @update:overflow-tables="setOverflowTables"
            v-model:show-grid="mapViewState.showGrid"
            v-model:snap-to-grid="mapViewState.snapToGrid"
            :has-selection="hasAlignSelection"
            :geo-canvas="isGeoCanvas"
            @update:geo-canvas="canvasTypeOverride = $event"
            @align-to-grid="alignToGrid"
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
            @click="handleFit"
          />
          <Button
            icon="pi pi-plus"
            size="small"
            severity="secondary"
            text
            v-tooltip.left="'Zoom in'"
            aria-label="Zoom in"
            @click="handleZoomIn"
          />
          <Button
            icon="pi pi-minus"
            size="small"
            severity="secondary"
            text
            v-tooltip.left="'Zoom out'"
            aria-label="Zoom out"
            @click="handleZoomOut"
          />
        </div>

        <div class="overlay-panels">
          <!-- Real element editor (group box / text box / image) -->
          <Transition name="overlay-panel">
            <div v-if="selectedElement" class="overlay-bar">
              <template v-if="selectedElement.type === 'text-box'">
                <i
                  class="pi pi-align-left overlay-bar-icon"
                  style="color: var(--p-primary-color)"
                />
                <input
                  class="overlay-text-input overlay-text-input--url"
                  placeholder="Text"
                  :value="selectedElement.text"
                  @change="updateSelectedElement({ text: $event.target.value })"
                  @keydown.enter.prevent="updateSelectedElement({ text: $event.target.value })"
                />
              </template>
              <template v-else-if="selectedElement.decorationType === 'image'">
                <i class="pi pi-image overlay-bar-icon" style="color: var(--p-primary-color)" />
                <span class="overlay-bar-name">Image</span>
              </template>
              <template v-else-if="selectedElement.type === 'dci-container'">
                <i class="pi pi-server overlay-bar-icon" style="color: var(--p-primary-color)" />
                <span class="overlay-bar-name">DCI Container</span>
              </template>
              <template v-else-if="selectedElement.type === 'dci-image'">
                <i class="pi pi-image overlay-bar-icon" style="color: var(--p-primary-color)" />
                <span class="overlay-bar-name">DCI Image</span>
              </template>
              <template v-else>
                <i class="pi pi-table overlay-bar-icon" style="color: var(--p-primary-color)" />
                <input
                  class="overlay-text-input"
                  placeholder="Group box title"
                  :value="selectedElement.label"
                  @change="updateSelectedElement({ label: $event.target.value })"
                  @keydown.enter.prevent="updateSelectedElement({ label: $event.target.value })"
                />
                <div class="zone-colors">
                  <button
                    v-for="color in ZONE_COLORS"
                    :key="color"
                    class="zone-color-swatch"
                    :class="{ active: selectedElement.style?.color === color }"
                    :style="{ background: color }"
                    :title="color"
                    @click="updateSelectedElement({ color })"
                  />
                </div>
              </template>
              <div class="demo-sep" />
              <Button
                label="Properties"
                icon="pi pi-cog"
                size="small"
                text
                severity="secondary"
                @click="openElementProperties()"
              />
              <Button
                label="Remove"
                icon="pi pi-trash"
                size="small"
                text
                severity="danger"
                @click="removeSelectedElement"
              />
            </div>
          </Transition>

          <Transition name="overlay-panel">
            <div v-if="selectedZone" class="overlay-bar">
              <i class="pi pi-table overlay-bar-icon" style="color: var(--p-primary-color)" />
              <template v-if="selectedZone.isEditable">
                <input
                  v-model="zoneEditLabel"
                  class="overlay-text-input"
                  placeholder="Zone label"
                  @change="handleZoneLabelChange"
                  @keydown.enter.prevent="handleZoneLabelChange"
                />
                <div class="zone-colors">
                  <button
                    v-for="color in ZONE_COLORS"
                    :key="color"
                    class="zone-color-swatch"
                    :class="{ active: selectedZone.style?.color === color }"
                    :style="{ background: color }"
                    :title="color"
                    @click="setZoneColor(color)"
                  />
                </div>
                <div class="demo-sep" />
                <Button
                  label="Remove zone"
                  icon="pi pi-trash"
                  size="small"
                  text
                  severity="danger"
                  @click="removeSelectedZone"
                />
              </template>
              <template v-else>
                <span class="overlay-bar-name">{{ selectedZone.label }}</span>
                <span class="overlay-bar-hint">Read-only</span>
              </template>
            </div>
          </Transition>

          <Transition name="overlay-panel">
            <div v-if="selectedNodeList.length > 0" class="overlay-bar">
              <i
                class="pi pi-circle-fill overlay-bar-status-dot"
                :style="{ color: nodeStatusColor }"
              />
              <template v-if="selectedNode">
                <span class="overlay-bar-name">{{ selectedNode.name }}</span>
                <span class="overlay-bar-meta">{{ selectedNode.objectClass }}</span>
                <template v-if="selectedNode.objectId">
                  <div class="demo-sep" />
                  <Button
                    label="Open"
                    icon="pi pi-arrow-right"
                    size="small"
                    text
                    severity="secondary"
                    @click="handleCanvasNodeDblClick(selectedNode)"
                  />
                </template>
                <template v-if="canRemoveNodes">
                  <div class="demo-sep" />
                  <Button
                    label="Remove"
                    icon="pi pi-trash"
                    size="small"
                    text
                    severity="danger"
                    @click="removeSelection"
                  />
                </template>
              </template>
              <template v-else>
                <span class="overlay-bar-name">{{ selectedNodeList.length }} nodes selected</span>
                <template v-if="canLinkSelection">
                  <div class="demo-sep" />
                  <Button
                    label="Link"
                    icon="pi pi-share-alt"
                    size="small"
                    text
                    severity="secondary"
                    @click="linkSelectedObjects"
                  />
                </template>
                <template v-if="canRemoveNodes">
                  <div class="demo-sep" />
                  <Button
                    label="Remove"
                    icon="pi pi-trash"
                    size="small"
                    text
                    severity="danger"
                    @click="removeSelection"
                  />
                </template>
              </template>
            </div>
          </Transition>

          <Transition name="overlay-panel">
            <div v-if="selectedImageRegion" class="overlay-bar">
              <i class="pi pi-image overlay-bar-icon" style="color: var(--p-primary-color)" />
              <template v-if="selectedImageRegion.isEditable">
                <input
                  v-model="imageUrlInput"
                  class="overlay-text-input overlay-text-input--url"
                  placeholder="Image URL"
                  @change="handleImageUrlChange"
                  @keydown.enter.prevent="handleImageUrlChange"
                />
                <div class="image-opacity-wrap">
                  <span class="overlay-bar-meta">Opacity</span>
                  <input
                    v-model="imageOpacityInput"
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    class="opacity-slider"
                    @input="handleImageOpacityChange"
                  />
                </div>
                <input
                  v-model="imageLabelInput"
                  class="overlay-text-input"
                  placeholder="Label (optional)"
                  @change="handleImageLabelChange"
                  @keydown.enter.prevent="handleImageLabelChange"
                />
                <div class="demo-sep" />
                <Button
                  label="Remove"
                  icon="pi pi-trash"
                  size="small"
                  text
                  severity="danger"
                  @click="removeSelectedImageRegion"
                />
              </template>
              <template v-else>
                <span class="overlay-bar-name">{{
                  selectedImageRegion.label || 'Image Region'
                }}</span>
                <span class="overlay-bar-hint">Read-only</span>
              </template>
            </div>
          </Transition>

          <Transition name="overlay-panel">
            <div v-if="selectedEdgeList.length > 0" class="overlay-bar">
              <i class="pi pi-minus overlay-bar-icon" />
              <template v-if="selectedEdge">
                <template v-if="isEdgeEditable">
                  <input
                    v-model="edgeLabelInput"
                    class="overlay-text-input"
                    placeholder="Link label"
                    @change="handleEdgeLabelChange"
                    @keydown.enter.prevent="handleEdgeLabelChange"
                  />
                </template>
                <template v-else>
                  <span class="overlay-bar-name">{{ selectedEdge.label ?? 'No label' }}</span>
                  <span v-if="!canRemoveEdges" class="overlay-bar-hint">Read-only</span>
                </template>
                <template v-if="layoutEditMode">
                  <div class="demo-sep" />
                  <Button
                    label="Properties"
                    icon="pi pi-cog"
                    size="small"
                    text
                    severity="secondary"
                    @click="openLinkProperties()"
                  />
                </template>
                <template v-if="canRemoveEdges">
                  <div class="demo-sep" />
                  <Button
                    label="Remove"
                    icon="pi pi-trash"
                    size="small"
                    text
                    severity="danger"
                    @click="removeSelection"
                  />
                </template>
              </template>
              <template v-else>
                <span class="overlay-bar-name">{{ selectedEdgeList.length }} links selected</span>
                <template v-if="canRemoveEdges">
                  <div class="demo-sep" />
                  <Button
                    label="Remove"
                    icon="pi pi-trash"
                    size="small"
                    text
                    severity="danger"
                    @click="removeSelection"
                  />
                </template>
              </template>
            </div>
          </Transition>
        </div>

        <!-- Heatmap legend -->
        <Transition name="overlay-panel">
          <div v-if="heatmapEnabled" class="heatmap-legend">
            <div class="heatmap-legend-title">Link Utilization</div>
            <div class="heatmap-legend-bar" />
            <div class="heatmap-legend-labels">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </Transition>

        <GeoMapCanvas
          v-if="isGeoCanvas"
          :key="`geo-${selectedMapId}`"
          ref="canvasRef"
          :map-data="canvasMapData"
          :dci-values="mapDciValues"
          :hide-links="mapViewState.hideLinks"
          :hide-link-labels="mapViewState.hideLinkLabels"
          :link-merge-threshold="linkMergeThreshold"
          :overflow-tables="overflowTablesOn"
          :table-offsets="tableOffsets"
          :initial-view="geoInitialView"
          @update:table-offsets="setTableOffsets"
          @node-select="handleNodeSelect"
          @node-dblclick="handleCanvasNodeDblClick"
          @node-middleclick="handleCanvasNodeMiddleClick"
          @node-contextmenu="handleNodeContextMenu"
        />
        <NetworkMapCanvas
          v-else
          :key="selectedMapId"
          ref="canvasRef"
          :map-data="canvasMapData"
          :draggable="demo.draggable || layoutEditMode"
          :snap-to-grid="mapViewState.snapToGrid || demo.snapToGrid"
          :show-grid="mapViewState.showGrid || demo.showGrid"
          :grid-size="GRID_SIZE"
          :hide-links="mapViewState.hideLinks"
          :hide-link-labels="mapViewState.hideLinkLabels"
          :link-merge-threshold="linkMergeThreshold"
          :overflow-tables="overflowTablesOn"
          :table-offsets="tableOffsets"
          :dci-values="mapDciValues"
          :heatmap-enabled="heatmapEnabled"
          @update:table-offsets="setTableOffsets"
          :search-term="searchTerm"
          :edit-mode="layoutEditMode"
          :geo-pick-mode="mapGeoPickActive"
          :image-urls="mapImageUrls ?? {}"
          @geo-center-change="handleGeoCenterChange"
          @node-moved="handleNodeMoved"
          @layout-applied="handleLayoutApplied"
          @node-dblclick="handleCanvasNodeDblClick"
          @node-middleclick="handleCanvasNodeMiddleClick"
          @node-contextmenu="handleNodeContextMenu"
          @zone-contextmenu="handleZoneContextMenu"
          @canvas-contextmenu="handleCanvasContextMenu"
          @zone-select="handleZoneSelect"
          @image-region-select="handleImageRegionSelect"
          @draw-mode-change="handleDrawModeChange"
          @node-select="handleNodeSelect"
          @edge-select="handleEdgeSelect"
          @edge-contextmenu="handleEdgeContextMenu"
          @box-select-change="handleBoxSelectChange"
          @element-select="handleElementSelect"
          @element-updated="handleElementUpdated"
          @link-updated="handleLinkBendPoints"
          @element-contextmenu="handleElementContextMenu"
          @viewport-change="mapContextMenuRef?.hide()"
        />
      </div>

      <DemoNoticeBanner
        v-if="isDemoMap && DEMO_CONTENT_ENABLED"
        message="Some map functions are for demonstration purposes only; edits are not saved to the server yet."
      />
    </template>

    <div v-else class="map-placeholder">
      <QueryErrorState v-if="mapIsError" :error="mapError" @retry="refetchMap" />
      <template v-else>
        <i class="pi pi-exclamation-circle" />
        <h3>Map not available</h3>
        <p>The selected map could not be loaded.</p>
      </template>
    </div>

    <!-- Docked as a resizable right column so the map stays visible and renders edits live;
         the canvas inset transition keeps the reflow continuous with the slide. -->
    <Transition name="slide-props">
      <NetworkMapPropertiesView
        v-if="mapPropertiesOpen && mapData"
        ref="mapPropertiesRef"
        class="map-properties-overlay"
        :map="activeMapData"
        :persist="persistMapSettings"
        :width="mapViewState.propertiesWidth"
        :edit-mode="layoutEditMode"
        @update:width="mapViewState.propertiesWidth = $event"
        @update:geo-active="mapGeoPickActive = $event"
        @preview="mapPreviewPatch = $event"
        @close="closeMapProperties"
      />
    </Transition>
  </div>

  <ActionContextMenu ref="mapContextMenuRef" :items="mapContextMenuItems" />
  <ActionContextMenu
    ref="sidebarTreeMenuRef"
    :items="sidebarTreeContextMenu.menuItems.value"
    @hide="treeRef?.clearMenuRow()"
  />
  <StatusExplanationDialog
    v-if="explainStatusVisible"
    visible
    @update:visible="explainStatusVisible = $event"
    :object="explainStatusTarget"
  />

  <ObjectToolsPanel
    v-model="toolsPanelOpen"
    v-model:active-tab="activeToolsTab"
    :object-id="selectedMapId"
    title="Map Tools"
    title-icon="pi pi-share-alt"
    object-label="Network Map"
    :polls="MAP_POLLS"
  />

  <!-- Triggered via the object:create DOM event (NetworkMapGroup) -->
  <CreateObjectDialog
    v-model:visible="createObjectVisible"
    :parent-object="createObjectParent"
    :object-class="createObjectClass"
  />

  <!-- Triggered via the networkMap:create DOM event -->
  <CreateNetworkMapDialog
    v-model:visible="createNetworkMapVisible"
    :parent-object="createNetworkMapParent"
  />

  <ObjectPickerDialog
    :visible="addObjectVisible"
    title="Add Object to Map"
    :perspectives="NETWORK_ADD_PERSPECTIVES"
    multi-select
    @update:visible="addObjectVisible = $event"
    @select="handleAddObjectSelect"
  />

  <NetworkMapElementPropertiesDialog
    v-if="propertiesVisible"
    :visible="propertiesVisible"
    :element="propertiesElement"
    @update:visible="propertiesVisible = $event"
    @apply="applyElementProperties"
  />

  <NetworkMapLinkPropertiesDialog
    v-if="linkPropertiesVisible"
    :visible="linkPropertiesVisible"
    :link="linkPropertiesLink"
    :map="editor.working.value"
    @update:visible="linkPropertiesVisible = $event"
    @apply="applyLinkProperties"
  />

  <NetworkMapDciContainerPropertiesDialog
    v-if="dciContainerDialogVisible"
    :visible="dciContainerDialogVisible"
    :element="dciContainerElement"
    @update:visible="dciContainerDialogVisible = $event"
    @apply="applyDciContainerProperties"
  />

  <NetworkMapDciImagePropertiesDialog
    v-if="dciImageDialogVisible"
    :visible="dciImageDialogVisible"
    :element="dciImageElement"
    @update:visible="dciImageDialogVisible = $event"
    @apply="applyDciImageProperties"
  />
</template>

<style scoped>
.network-maps-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: -0.75rem;
}

.network-maps-content {
  --map-props-width: 480px;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  position: relative;
  transition: padding-right 0.2s ease;
}

/* The canvas observes its own resize (see NetworkMapCanvas); --map-props-width is set inline
   from the persisted drawer width. */
.network-maps-content.properties-docked {
  padding-right: var(--map-props-width);
}

.map-properties-overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--map-props-width);
  z-index: 20;
  background: var(--p-surface-card);
  border-left: 1px solid var(--p-surface-border);
}

.slide-props-enter-active,
.slide-props-leave-active {
  transition: transform 0.2s ease;
}

.slide-props-enter-from,
.slide-props-leave-to {
  transform: translateX(100%);
}

.demo-bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  flex-shrink: 0;
  flex-wrap: wrap;
}

/* The bar is in normal flow, so max-height animates with the slide to keep the canvas push
   continuous. The bound is generous: the bar wraps on narrow viewports. */
.edit-bar-enter-active,
.edit-bar-leave-active {
  overflow: hidden;
  transition:
    max-height 140ms ease-out,
    padding-top 140ms ease-out,
    padding-bottom 140ms ease-out,
    border-bottom-width 140ms ease-out,
    opacity 80ms ease-out,
    transform 140ms ease-out;
}

/* Padding and border sit outside the content box; max-height alone leaves a stub. */
.edit-bar-enter-from,
.edit-bar-leave-to {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-bottom-width: 0;
  opacity: 0;
  transform: translateY(-0.5rem);
}

.edit-bar-enter-to,
.edit-bar-leave-from {
  max-height: 6rem;
  padding-top: 0.3rem;
  padding-bottom: 0.3rem;
  border-bottom-width: 1px;
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .edit-bar-enter-active,
  .edit-bar-leave-active {
    transition: none;
  }
}

.demo-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding-right: 0.5rem;
}

.demo-section {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.demo-section-title {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  margin-right: 0.25rem;
  white-space: nowrap;
}

.demo-add-btn {
  font-size: 0.75rem !important;
  padding: 0.2rem 0.5rem !important;
}

.demo-sep {
  width: 1px;
  height: 1.25rem;
  background: var(--p-surface-border);
  margin: 0 0.25rem;
}

.demo-toggles {
  display: flex;
  gap: 0.25rem;
}

.demo-toggle {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.6rem;
  border-radius: 5px;
  border: 1px solid var(--p-surface-border);
  background: transparent;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.demo-toggle:hover {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}

.demo-toggle.active {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
  color: var(--p-primary-color);
  font-weight: 600;
}

.map-canvas-area {
  flex: 1;
  overflow: hidden;
  padding: 0.75rem;
  position: relative;
}

/* The column spans the widest card and both heights; the empty stretch beside the narrow
   palette lets the pointer through, and only the cards take it. */
.canvas-controls-stack {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  z-index: 11;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  pointer-events: none;
}

.canvas-controls-stack > * {
  pointer-events: auto;
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

.overlay-panels {
  position: absolute;
  top: 1.25rem;
  left: 1.25rem;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-width: calc(100% - 2.5rem);
  pointer-events: none;
}

.overlay-bar {
  pointer-events: all;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 7px;
  background: var(--p-surface-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  flex-wrap: wrap;
}

.overlay-panel-enter-active,
.overlay-panel-leave-active {
  transition:
    opacity 0.15s,
    transform 0.15s;
}

.overlay-panel-enter-from,
.overlay-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.overlay-bar-icon {
  font-size: 0.875rem;
  color: var(--p-text-muted-color);
  margin-right: 0.1rem;
}

.overlay-bar-status-dot {
  font-size: 0.55rem;
  flex-shrink: 0;
}

.overlay-bar-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.overlay-bar-meta {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.overlay-bar-hint {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

/* Informational, so a note rather than a warning. */
.geo-hidden-chip {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: auto;
  padding: 0.1rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--p-primary-color) 35%, var(--p-surface-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--p-primary-color) 8%, var(--p-surface-card));
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.geo-hidden-chip i {
  font-size: 0.75rem;
  color: var(--p-primary-color);
}

.overlay-text-input {
  height: 1.6rem;
  padding: 0 0.5rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 4px;
  background: var(--p-surface-card);
  color: var(--p-text-color);
  font-family: inherit;
  font-size: 0.8125rem;
  width: 140px;
  outline: none;
}

.overlay-text-input:focus {
  border-color: var(--p-primary-color);
}

.overlay-text-input--url {
  width: 200px;
}

.image-opacity-wrap {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.opacity-slider {
  width: 72px;
  cursor: pointer;
  accent-color: var(--p-primary-color);
}

.zone-colors {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.zone-color-swatch {
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    transform 0.1s,
    border-color 0.1s;
  flex-shrink: 0;
}

.zone-color-swatch:hover {
  transform: scale(1.2);
}

.zone-color-swatch.active {
  border-color: var(--p-text-color);
  transform: scale(1.15);
}

.map-placeholder,
.map-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  height: 100%;
  color: var(--p-text-muted-color);
  text-align: center;
  padding: 2rem;
}

.map-placeholder i {
  font-size: 3rem;
  opacity: 0.25;
}

.map-placeholder h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.map-placeholder p {
  margin: 0;
  font-size: 0.875rem;
  max-width: 320px;
  line-height: 1.5;
}

.map-loading {
  gap: 1rem;
  font-size: 0.875rem;
}

.heatmap-legend {
  position: absolute;
  bottom: 1.25rem;
  left: 1.25rem;
  z-index: 10;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 7px;
  background: var(--p-surface-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  pointer-events: none;
  min-width: 150px;
}

.heatmap-legend-title {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.35rem;
}

.heatmap-legend-bar {
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(to right, #22c55e 0%, #eab308 50%, #f97316 80%, #ef4444 100%);
}

.heatmap-legend-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.6875rem;
  color: var(--p-text-muted-color);
  margin-top: 0.2rem;
}

/* Context menu header items are styled globally in assets/styles/main.css. */
</style>
