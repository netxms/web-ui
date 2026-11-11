<script setup>
import {
  computed,
  markRaw,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import Button from 'primevue/button'
import SidebarHeader from '@/components/layout/SidebarHeader.vue'
import SidebarFilter from '@/components/layout/SidebarFilter.vue'
import ObjectSidebarTree from '@/components/objects/ObjectSidebarTree.vue'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'
import ObjectHeader from '@/components/layout/ObjectHeader.vue'
import ViewTabBar from '@/components/views/ViewTabBar.vue'
import ViewContainer from '@/components/views/ViewContainer.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useContextMenu } from '@/composables/useContextMenu'
import { useActions } from '@/composables/useActions'
import { useWorkingState } from '@/composables/useWorkingState'
import { useObjects, useObjectTree, objectKeys } from '@/queries/useObjectQueries'
import { dataCenterKeys } from '@/queries/useDataCenterQueries'
import { getDemoFacilityTrees, isDemoDataCenterId } from '@/api/dataCenterApi'
import { adaptBaseObject } from '@/api/objectAdapters'
import { useSelectionStore } from '@/stores/selectionStore'
import { useViewStore } from '@/stores/viewStore'
import {
  DATA_CENTER_CLASSES,
  dataCenterChildren,
  findFacilities,
  indexNodes,
} from '@/utils/dataCenter'
import { findNodeByPath } from '@/utils/objectTreeNavigation'
import { filterObjectTree } from '@/utils/objectTreeSort'
import { provideDataCenterTarget } from '@/composables/useDataCenterTarget'
import { floorPlanEditTarget } from '@/utils/routeTargets'
import { DATA_CENTER_ROUTE, dataCenterTarget } from './dataCenterRoute'

const PERSPECTIVE_ID = DATA_CENTER_ROUTE
const DEFAULT_SERVICE_ROOT_ID = 2

const route = useRoute()
const router = useRouter()
const selectionStore = useSelectionStore()
const viewStore = useViewStore()
const queryClient = useQueryClient()

const refreshSignal = ref(0)
provide('viewRefreshSignal', refreshSignal)
provideDataCenterTarget(dataCenterTarget)

function handleRefresh() {
  queryClient.invalidateQueries({ queryKey: ['objects', 'subTree'] })
  queryClient.invalidateQueries({ queryKey: dataCenterKeys.all() })
  const selectedId = selectionStore.primaryObject?.id
  if (selectedId) queryClient.invalidateQueries({ queryKey: objectKeys.detail(selectedId) })
  refreshSignal.value++
}

// Facilities sit anywhere under Infrastructure; its sub-tree is the one that perspective caches.
const { data: rootObjects } = useObjects()
const serviceRootId = computed(
  () =>
    (rootObjects.value ?? []).find((o) => o.class === 'ServiceRoot')?.id ?? DEFAULT_SERVICE_ROOT_ID,
)
const {
  data: infrastructure,
  isLoading: loadingTree,
  error: treeError,
} = useObjectTree(serviceRootId)

// The name carries the marker: tree root rows and the header show the object's own name.
const demoFacilities = getDemoFacilityTrees()
  .map(adaptBaseObject)
  .map((facility) => ({ ...facility, name: `${facility.name} (demo)` }))
const facilities = computed(() => [
  ...findFacilities(infrastructure.value ?? []),
  ...demoFacilities,
])

/** Full nodes, racks included, by id; the sidebar shows the data center classes only. */
const nodesById = computed(() => indexNodes(facilities.value))

const facilityOf = computed(() => {
  const map = new Map()
  for (const facility of facilities.value) {
    for (const id of indexNodes([facility]).keys()) if (!map.has(id)) map.set(id, facility)
  }
  return map
})

const noFacilities = computed(
  () => !loadingTree.value && !treeError.value && !facilities.value.length,
)

const filterState = ref({ text: '', tokens: [] })
useWorkingState('tree', { view: { filterState } })

const treeRoots = computed(() =>
  facilities.value.map((facility) => ({
    object: facility,
    label: facility.name,
    fallbackClass: 'Facility',
    nodes: filterObjectTree(dataCenterChildren(facility), filterState.value.text),
    emptyText: 'Nothing below this facility yet',
  })),
)

const expandedIds = ref(new Set())
watch(
  facilities,
  (list) => {
    const next = new Set(expandedIds.value)
    let changed = false
    for (const facility of list) {
      if (next.has(String(facility.id))) continue
      next.add(String(facility.id))
      for (const child of dataCenterChildren(facility)) next.add(String(child.id))
      changed = true
    }
    if (changed) expandedIds.value = next
  },
  { immediate: true },
)

function handleToggle(path) {
  const next = new Set(expandedIds.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expandedIds.value = next
}

function resolveTreePath(path) {
  for (const root of treeRoots.value) {
    if (path === String(root.object.id)) return root.object
    const node = findNodeByPath(root.nodes, path)
    if (node) return node
  }
  return null
}

function findPath(nodes, id, parentPath = '') {
  for (const node of nodes) {
    const path = parentPath ? `${parentPath}-${node.id}` : String(node.id)
    if (node.id === id) return path
    const below = findPath(node.children ?? [], id, path)
    if (below) return below
  }
  return null
}

const views = [
  { id: 'overview', label: 'Overview', icon: 'pi pi-gauge', objectClasses: ['Facility'] },
  { id: 'floorPlan', label: 'Floor Plan', icon: 'pi pi-th-large', objectClasses: ['Room'] },
  { id: 'power', label: 'Power', icon: 'pi pi-bolt', objectClasses: ['Facility', 'PowerDomain'] },
  {
    id: 'cooling',
    label: 'Cooling',
    icon: 'pi pi-cloud',
    objectClasses: ['Facility', 'CoolingZone'],
  },
  { id: 'status', label: 'Status', icon: 'pi pi-info-circle', serverOnly: true },
  { id: 'alarms', label: 'Alarms', icon: 'pi pi-bell', serverOnly: true },
  { id: 'dcis', label: 'Data Collection', icon: 'pi pi-chart-bar', serverOnly: true },
  { id: 'properties', label: 'Properties', icon: 'pi pi-cog', serverOnly: true },
]

const viewComponents = {
  overview: () => import('./subviews/FacilityOverviewView.vue'),
  floorPlan: () => import('./subviews/FloorPlanView.vue'),
  power: () => import('./subviews/PowerChainView.vue'),
  cooling: () => import('./subviews/CoolingView.vue'),
  status: () => import('@/views/objects/subviews/StatusView.vue'),
  alarms: () => import('@/views/objects/subviews/AlarmsView.vue'),
  dcis: () => import('@/views/objects/subviews/DCIsView.vue'),
  properties: () => import('@/views/objects/subviews/PropertiesView.vue'),
}

const objectIdFromRoute = computed(() => route.params.objectId)
const viewIdFromRoute = computed(() => route.params.viewId)
const selectedPath = ref(null)

const current = computed(() => selectionStore.primaryObject)
const currentIsDemo = computed(() => !!current.value && isDemoDataCenterId(current.value.id))

/** Demo objects exist only in the seed: views that read the server cannot show them. */
function isViewCompatible(viewId, object) {
  const view = views.find((v) => v.id === viewId)
  if (!view || !object) return false
  if (view.objectClasses && !view.objectClasses.includes(object.class)) return false
  if (view.serverOnly && isDemoDataCenterId(object.id)) return false
  return true
}

const compatibleViewIds = computed(() =>
  views.map((v) => v.id).filter((id) => isViewCompatible(id, current.value)),
)

function findBestView(preferred, object) {
  const classPreferred = viewStore.getActiveViewForClass(PERSPECTIVE_ID, object.class)
  if (classPreferred && isViewCompatible(classPreferred, object)) return classPreferred
  if (preferred && isViewCompatible(preferred, object)) return preferred
  return views.find((v) => isViewCompatible(v.id, object))?.id ?? null
}

const activeView = computed(() => {
  const viewId = viewIdFromRoute.value
  if (viewId && compatibleViewIds.value.includes(viewId)) return viewId
  return current.value ? findBestView(null, current.value) : null
})

const activeViewComponent = computed(() => viewComponents[activeView.value] ?? null)
/** Power and cooling look across the facility: partners, the outdoor temperature. */
const FACILITY_VIEWS = new Set(['power', 'cooling'])
const activeViewProps = computed(() =>
  FACILITY_VIEWS.has(activeView.value)
    ? { object: current.value, facility: facilityOf.value.get(current.value?.id) ?? null }
    : { object: current.value },
)

function viewTabTarget(viewId) {
  return { name: PERSPECTIVE_ID, params: { objectId: objectIdFromRoute.value, viewId } }
}

function handleViewSelect(viewId) {
  router.push(viewTabTarget(viewId))
}

function treeNodeTarget(node) {
  return dataCenterTarget(node, findBestView(activeView.value, node) ?? undefined)
}

function handleSelectNode(node, path) {
  selectedPath.value = path
  router.push(treeNodeTarget(node))
}

function handleSelectionChange(objects) {
  selectionStore.setPrimarySelection(
    objects.length
      ? objects.map((o) => nodesById.value.get(o.id) ?? o)
      : [current.value].filter(Boolean),
  )
}

watch(
  [objectIdFromRoute, facilities],
  ([objectId]) => {
    const id = Number(objectId)
    const node = Number.isInteger(id) ? nodesById.value.get(id) : null
    if (!node) {
      selectedPath.value = null
      if (!loadingTree.value) selectionStore.clearSelection()
      return
    }
    selectionStore.selectPrimary(node)
    let path = null
    for (const root of treeRoots.value) {
      if (root.object.id === id) path = String(id)
      else path = findPath(root.nodes, id)
      if (path) break
    }
    selectedPath.value = path
    if (path?.includes('-')) {
      const next = new Set(expandedIds.value)
      const segments = path.split('-')
      for (let i = 1; i < segments.length; i++) next.add(segments.slice(0, i).join('-'))
      expandedIds.value = next
    }
  },
  { immediate: true },
)

// Immediate: the demo facility is there on mount, so `current` may never change after it.
watch(
  [viewIdFromRoute, current],
  ([viewId, object]) => {
    if (!object || !objectIdFromRoute.value) return
    if (viewId && isViewCompatible(viewId, object)) {
      viewStore.setActiveViewForClass(PERSPECTIVE_ID, object.class, viewId)
      return
    }
    const fallback = findBestView(viewId, object)
    if (fallback && fallback !== viewId) router.replace(viewTabTarget(fallback))
  },
  { immediate: true },
)

const treeContextMenu = useContextMenu({ domains: ['object'] })
const treeMenuRef = ref(null)
const treeRef = ref(null)

const hasTreeMenu = (node) => !isDemoDataCenterId(node.id)

function handleTreeContextMenu(event, node, { selection } = {}) {
  treeContextMenu.contextRef.value = { object: node, viewContext: 'objectTree', selection }
  treeMenuRef.value?.show(event)
}

const headerContext = computed(() =>
  current.value && !currentIsDemo.value
    ? { object: current.value, viewContext: 'objectTree' }
    : null,
)
const { primaryActions: headerPrimaryActions, menuItems: headerMenuItems } = useActions(
  headerContext,
  { domains: ['object'] },
)

// The Create items of the object menu. Rack, node, chassis and sensor dialogs open the new
// object in Infrastructure themselves; the other two say what they created.
const CREATE_DIALOG_LOADERS = {
  'dataCenterObject:create': () =>
    import('@/components/data-center/CreateDataCenterObjectDialog.vue'),
  'object:create': () => import('@/components/objects/CreateObjectDialog.vue'),
  'rack:create': () => import('@/components/rack/CreateRackDialog.vue'),
  'node:create': () => import('@/components/objects/CreateNodeDialog.vue'),
  'chassis:create': () => import('@/components/objects/CreateChassisDialog.vue'),
  'sensor:create': () => import('@/components/objects/CreateSensorDialog.vue'),
}
const CREATE_EVENTS = Object.keys(CREATE_DIALOG_LOADERS)
const CLASS_CREATE_EVENTS = new Set(['dataCenterObject:create', 'object:create'])

/** Loaded on first use and mounted closed before opening: the dialogs reset their form on open. */
const createDialogs = shallowRef({})
const createRequest = ref({ event: null, parent: null, objectClass: null })

async function handleCreateEvent(event) {
  const name = event.type
  const detail = event.detail
  if (!createDialogs.value[name]) {
    const { default: component } = await CREATE_DIALOG_LOADERS[name]()
    createDialogs.value = { ...createDialogs.value, [name]: markRaw(component) }
    await nextTick()
  }
  createRequest.value = {
    event: name,
    parent: detail?.parent ?? null,
    objectClass: detail?.objectClass ?? null,
  }
}

function createDialogProps(eventName) {
  return CLASS_CREATE_EVENTS.has(eventName)
    ? { objectClass: createRequest.value.objectClass, onCreated: handleCreated }
    : {}
}

function handleCreateVisible(visible) {
  if (!visible) createRequest.value = { ...createRequest.value, event: null }
}

/**
 * Only the four classes have a place in this tree; a container or cluster opens in
 * Infrastructure. A new room opens on its floor plan in edit mode, to get its shape.
 */
function handleCreated(created) {
  if (created.class === 'Room') {
    router.push(floorPlanEditTarget(created, { perspective: PERSPECTIVE_ID }))
    return
  }
  router.push(
    DATA_CENTER_CLASSES.includes(created.class)
      ? dataCenterTarget(created)
      : { name: 'infrastructure', params: { objectId: created.id } },
  )
}

function createFacility() {
  handleCreateEvent({
    type: 'dataCenterObject:create',
    detail: { parent: { id: serviceRootId.value, class: 'ServiceRoot' }, objectClass: 'Facility' },
  })
}

onMounted(() => {
  for (const name of CREATE_EVENTS) document.addEventListener(name, handleCreateEvent)
})
onUnmounted(() => {
  for (const name of CREATE_EVENTS) document.removeEventListener(name, handleCreateEvent)
})
</script>

<template>
  <Teleport defer to="#sidebar-content">
    <div class="data-center-sidebar">
      <SidebarHeader title="Data Center" />
      <SidebarFilter v-model="filterState" placeholder="Filter rooms and domains..." />
      <EmptyState
        v-if="noFacilities"
        icon="pi pi-building"
        title="No facilities"
        message="Facilities created on the server appear here with their rooms, power domains and cooling zones."
      >
        <template #actions>
          <Button
            label="Create Facility"
            icon="pi pi-plus"
            size="small"
            outlined
            @click="createFacility"
          />
        </template>
      </EmptyState>
      <ObjectSidebarTree
        v-else
        ref="treeRef"
        :roots="treeRoots"
        :expanded-ids="expandedIds"
        :selected-path="selectedPath"
        :loading="loadingTree"
        :error="treeError"
        :target-for="treeNodeTarget"
        :root-target-for="treeNodeTarget"
        :resolve-path="resolveTreePath"
        :has-menu="hasTreeMenu"
        @select="handleSelectNode"
        @contextmenu="handleTreeContextMenu"
        @toggle="handleToggle"
        @selection-change="handleSelectionChange"
      />
    </div>
  </Teleport>

  <ActionContextMenu
    ref="treeMenuRef"
    :items="treeContextMenu.menuItems.value"
    @hide="treeRef?.clearMenuRow()"
  />

  <component
    :is="dialog"
    v-for="(dialog, eventName) in createDialogs"
    :key="eventName"
    :visible="createRequest.event === eventName"
    :parent-object="createRequest.parent"
    v-bind="createDialogProps(eventName)"
    @update:visible="handleCreateVisible"
  />

  <div class="data-center-view">
    <ObjectHeader
      :object="current"
      :actions="currentIsDemo ? [] : headerPrimaryActions"
      :tools-menu-items="currentIsDemo ? [] : headerMenuItems"
    />

    <template v-if="current">
      <ViewTabBar
        v-if="compatibleViewIds.length"
        :views="views"
        :visible-view-ids="compatibleViewIds"
        :active-view="activeView"
        :allow-add-remove="false"
        :target-for="viewTabTarget"
        @select="handleViewSelect"
        @refresh="handleRefresh"
      />
      <ViewContainer
        v-if="activeViewComponent"
        :key="`${activeView}-${current.id}`"
        :component="activeViewComponent"
        :state-key="activeView"
        :view-props="activeViewProps"
      />
      <EmptyState
        v-else
        icon="pi pi-objects-column"
        title="No view for this object"
        message="Select a facility, room, power domain or cooling zone."
      />
    </template>

    <div v-else class="data-center-placeholder">
      <i class="pi pi-building" />
      <template v-if="noFacilities">
        <h3>No facilities on the server yet</h3>
        <p>The floor plan and power views need a facility with rooms or power domains below it.</p>
      </template>
      <template v-else>
        <h3>No room or domain selected</h3>
        <p>Select a facility, room, power domain or cooling zone on the left.</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.data-center-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: -0.75rem;
}

.data-center-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: -1rem;
  height: calc(100% + 1rem);
}

.data-center-placeholder {
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

.data-center-placeholder i {
  font-size: 3rem;
  opacity: 0.25;
}

.data-center-placeholder h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.data-center-placeholder p {
  margin: 0;
  font-size: 0.875rem;
  max-width: 320px;
  line-height: 1.5;
}
</style>
