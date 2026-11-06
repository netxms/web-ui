<script setup>
import { ref, computed, defineAsyncComponent, watch, provide, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import SidebarHeader from '@/components/layout/SidebarHeader.vue'
import SidebarFilter from '@/components/layout/SidebarFilter.vue'
import ObjectHeader from '@/components/layout/ObjectHeader.vue'
import ViewTabBar from '@/components/views/ViewTabBar.vue'
import ViewAddMenu from '@/components/views/ViewAddMenu.vue'
import ViewContainer from '@/components/views/ViewContainer.vue'
import ToolResultView from './subviews/ToolResultView.vue'
import ContextDashboardView from './subviews/ContextDashboardView.vue'
import ContextMapView from './subviews/ContextMapView.vue'
import ObjectSidebarTree from '@/components/objects/ObjectSidebarTree.vue'
import RestrictedState from '@/components/common/RestrictedState.vue'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'
import ToolInputDialog from '@/components/tools/ToolInputDialog.vue'
import CreateRackDialog from '@/components/rack/CreateRackDialog.vue'
import CreateObjectDialog from '@/components/objects/CreateObjectDialog.vue'
import CreateNodeDialog from '@/components/objects/CreateNodeDialog.vue'
import CreateInterfaceDialog from '@/components/objects/CreateInterfaceDialog.vue'
import CreateNetworkServiceDialog from '@/components/objects/CreateNetworkServiceDialog.vue'
import CreateAssetDialog from '@/components/objects/CreateAssetDialog.vue'
import CreateChassisDialog from '@/components/objects/CreateChassisDialog.vue'
import CreateSensorDialog from '@/components/objects/CreateSensorDialog.vue'
import CreateMobileDeviceDialog from '@/components/objects/CreateMobileDeviceDialog.vue'
import CreateCloudDomainDialog from '@/components/objects/CreateCloudDomainDialog.vue'
import CreateSubnetDialog from '@/components/objects/CreateSubnetDialog.vue'
import Menu from 'primevue/menu'
import ContainerPickerDialog from '@/components/objects/ContainerPickerDialog.vue'
import BindableObjectPickerDialog from '@/components/objects/BindableObjectPickerDialog.vue'
import ObjectPickerDialog from '@/components/objects/ObjectPickerDialog.vue'
import AppliedTemplatePickerDialog from '@/components/objects/AppliedTemplatePickerDialog.vue'
import UnbindFromContainerDialog from '@/components/objects/UnbindFromContainerDialog.vue'
import UnbindChildrenFromContainerDialog from '@/components/objects/UnbindChildrenFromContainerDialog.vue'
import MaintenanceDialog from '@/components/objects/MaintenanceDialog.vue'
import StatusExplanationDialog from '@/components/objects/StatusExplanationDialog.vue'
import { useContextMenu } from '@/composables/useContextMenu'
import { useActions, extractPrimaryActions } from '@/composables/useActions'
import { useTemplateBinding } from '@/composables/useTemplateBinding'
import { useActionShortcuts } from '@/composables/useActionShortcuts'
import { useObjectDeletionNavigation } from '@/composables/useObjectDeletionNavigation'
import { useToolExecution } from '@/composables/useToolExecution'
import { usePageTitle } from '@/composables/usePageTitle'
import { useSelectionStore } from '@/stores/selectionStore'
import { useViewStore } from '@/stores/viewStore'
import { useToolExecutionStore } from '@/stores/toolExecutionStore'
import { useSshTerminalStore } from '@/stores/sshTerminalStore'
import { storeToRefs } from 'pinia'
import { useObjectTreeStore } from '@/stores/objectTreeStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useToast } from 'primevue/usetoast'
import {
  useObjects,
  useObjectTree,
  useObject,
  useObjectsByIds,
  useBindObjectChild,
} from '@/queries/useObjectQueries'
import { useObjectToolIcons, useObjectToolsForObject } from '@/queries/useObjectToolQueries'
import { useObjectIcons } from '@/composables/useObjectIcons'
import { useWorkingState } from '@/composables/useWorkingState'
import { buildToolsContent, getToolTypeIcon, injectToolsIntoMenu } from '@/utils/toolMenuUtils'
import { objectTreeFilterDefs } from '@/filterDefs/objectTreeFilterDefs'
import { buildCreateMenuItems, dispatchCreateObject } from '@/utils/createMenuItems'
import { configTarget, objectTarget } from '@/utils/routeTargets'
import { parseSshViewId } from '@/utils/sshTerminalProtocol'
import { chartTabLabel, parseFromQuery } from '@/utils/dciChartModel'
import {
  getObjectViewGroups,
  getViewDefinition,
  ALL_OBJECT_VIEWS,
  isViewCompatible,
  isViewConfirmedCompatible,
  isAdHocViewId,
  getContextViews,
  parseContextViewId,
} from '@/config/objectViews'
import { GROUP_OVERVIEW_CLASSES } from '@/config/overviewCards'
import { moduleRegistry } from '@/modules'
import EmptyState from '@/components/common/EmptyState.vue'
import DciChartView from '@/components/objects/chart/DciChartView.vue'
import { findNodeByPath } from '@/utils/objectTreeNavigation'
import { sortObjectTree, sortTreeLevel } from '@/utils/objectTreeSort'

const PERSPECTIVE_ID = 'infrastructure'

// The ServiceRoot ID may differ per server; 2 is the conventional default while loading.
const { data: allRootObjects } = useObjects()
const serviceRootId = computed(
  () => (allRootObjects.value ?? []).find((o) => o.class === 'ServiceRoot')?.id ?? 2,
)
const networkRootId = computed(
  () => (allRootObjects.value ?? []).find((o) => o.class === 'Network')?.id ?? 1,
)

const refreshSignal = ref(0)
provide('viewRefreshSignal', refreshSignal)

const route = useRoute()
const router = useRouter()
const selectionStore = useSelectionStore()
const viewStore = useViewStore()
const toolExecutionStore = useToolExecutionStore()
const sshTerminalStore = useSshTerminalStore()
const { executeTool } = useToolExecution()

// Several open infrastructure tabs stay tellable apart.
usePageTitle(() => selectionStore.primaryObject?.name)

// Tools for the header action bar "..." menu
const selectedObjectId = computed(() => selectionStore.primaryObject?.id ?? null)
const { data: selectedObjectToolsData, isLoading: selectedToolsLoading } =
  useObjectToolsForObject(selectedObjectId)
const { iconByToolId: selectedToolIcons } = useObjectToolIcons(selectedObjectToolsData)

/** "Create a tool..." in an empty Tools slot opens the object tools configuration. */
function openToolConfiguration() {
  router.push(configTarget('object-tools'))
}

const createRackVisible = ref(false)
const createRackParent = ref(null)

function handleRackCreate(event) {
  createRackParent.value = event.detail?.parent ?? null
  createRackVisible.value = true
}

onMounted(() => document.addEventListener('rack:create', handleRackCreate))
onUnmounted(() => document.removeEventListener('rack:create', handleRackCreate))

const { applyTemplate, removeTemplate } = useTemplateBinding()

const applyTemplateVisible = ref(false)
const removeTemplateVisible = ref(false)
const templateActionTargets = ref([])
const templateActionPending = ref(false)

/** Rooted at TemplateRoot, resolved by class like BindableObjectPickerDialog. */
const templatePerspectives = computed(() => {
  const root = (allRootObjects.value ?? []).find((object) => object.class === 'TemplateRoot')
  return root ? [{ id: 'templates', label: 'Templates', rootId: root.id }] : []
})

function handleApplyTemplateEvent(event) {
  templateActionTargets.value = event.detail?.objects ?? []
  applyTemplateVisible.value = true
}

function handleRemoveTemplateEvent(event) {
  templateActionTargets.value = event.detail?.objects ?? []
  removeTemplateVisible.value = true
}

onMounted(() => document.addEventListener('object:applyTemplate', handleApplyTemplateEvent))
onUnmounted(() => document.removeEventListener('object:applyTemplate', handleApplyTemplateEvent))
onMounted(() => document.addEventListener('object:removeTemplate', handleRemoveTemplateEvent))
onUnmounted(() => document.removeEventListener('object:removeTemplate', handleRemoveTemplateEvent))

async function onTemplateSelected(template) {
  applyTemplateVisible.value = false
  const targets = templateActionTargets.value
  if (!template || !targets.length) return

  const { applied, failed } = await applyTemplate(template.id, targets)
  if (applied > 0) {
    toast.add({
      severity: 'success',
      summary: applied === 1 ? 'Template applied' : `Template applied to ${applied} objects`,
      life: 2500,
    })
  }
  if (failed > 0) {
    toast.add({ severity: 'error', summary: 'Apply failed for one or more objects', life: 3000 })
  }
}

async function onTemplateRemovalConfirmed({ templateIds, removeDci }) {
  const targets = templateActionTargets.value
  if (!templateIds.length || !targets.length) return

  templateActionPending.value = true
  try {
    const { removed, failed } = await removeTemplate(templateIds, targets, { removeDci })
    if (removed > 0) {
      toast.add({
        severity: 'success',
        summary: removed === 1 ? 'Template removed' : `Removed ${removed} template assignments`,
        life: 2500,
      })
      removeTemplateVisible.value = false
    }
    if (failed > 0) {
      toast.add({ severity: 'error', summary: 'Remove failed for one or more objects', life: 3000 })
    }
  } finally {
    templateActionPending.value = false
  }
}

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

const createNodeVisible = ref(false)
const createNodeParent = ref(null)

function handleNodeCreate(event) {
  createNodeParent.value = event.detail?.parent ?? null
  createNodeVisible.value = true
}

onMounted(() => document.addEventListener('node:create', handleNodeCreate))
onUnmounted(() => document.removeEventListener('node:create', handleNodeCreate))

const createInterfaceVisible = ref(false)
const createInterfaceParent = ref(null)

function handleInterfaceCreate(event) {
  createInterfaceParent.value = event.detail?.parent ?? null
  createInterfaceVisible.value = true
}

onMounted(() => document.addEventListener('interface:create', handleInterfaceCreate))
onUnmounted(() => document.removeEventListener('interface:create', handleInterfaceCreate))

const createNetworkServiceVisible = ref(false)
const createNetworkServiceParent = ref(null)

function handleNetworkServiceCreate(event) {
  createNetworkServiceParent.value = event.detail?.parent ?? null
  createNetworkServiceVisible.value = true
}

onMounted(() => document.addEventListener('networkService:create', handleNetworkServiceCreate))
onUnmounted(() => document.removeEventListener('networkService:create', handleNetworkServiceCreate))

const createAssetVisible = ref(false)
const createAssetParent = ref(null)

function handleAssetCreate(event) {
  createAssetParent.value = event.detail?.parent ?? null
  createAssetVisible.value = true
}

onMounted(() => document.addEventListener('asset:create', handleAssetCreate))
onUnmounted(() => document.removeEventListener('asset:create', handleAssetCreate))

const createChassisVisible = ref(false)
const createChassisParent = ref(null)

function handleChassisCreate(event) {
  createChassisParent.value = event.detail?.parent ?? null
  createChassisVisible.value = true
}

onMounted(() => document.addEventListener('chassis:create', handleChassisCreate))
onUnmounted(() => document.removeEventListener('chassis:create', handleChassisCreate))

const createSensorVisible = ref(false)
const createSensorParent = ref(null)

function handleSensorCreate(event) {
  createSensorParent.value = event.detail?.parent ?? null
  createSensorVisible.value = true
}

onMounted(() => document.addEventListener('sensor:create', handleSensorCreate))
onUnmounted(() => document.removeEventListener('sensor:create', handleSensorCreate))

const createMobileDeviceVisible = ref(false)
const createMobileDeviceParent = ref(null)

function handleMobileDeviceCreate(event) {
  createMobileDeviceParent.value = event.detail?.parent ?? null
  createMobileDeviceVisible.value = true
}

onMounted(() => document.addEventListener('mobileDevice:create', handleMobileDeviceCreate))
onUnmounted(() => document.removeEventListener('mobileDevice:create', handleMobileDeviceCreate))

const createCloudDomainVisible = ref(false)
const createCloudDomainParent = ref(null)

function handleCloudDomainCreate(event) {
  createCloudDomainParent.value = event.detail?.parent ?? null
  createCloudDomainVisible.value = true
}

onMounted(() => document.addEventListener('cloudDomain:create', handleCloudDomainCreate))
onUnmounted(() => document.removeEventListener('cloudDomain:create', handleCloudDomainCreate))

const createSubnetVisible = ref(false)
const createSubnetParent = ref(null)

function handleSubnetCreate(event) {
  createSubnetParent.value = event.detail?.parent ?? null
  createSubnetVisible.value = true
}

onMounted(() => document.addEventListener('subnet:create', handleSubnetCreate))
onUnmounted(() => document.removeEventListener('subnet:create', handleSubnetCreate))

// The sidebar "Create object" button picks a class for the selected (or root) object.
const createObjectMenuRef = ref(null)
const createObjectMenuTarget = computed(
  () => selectionStore.primaryObject ?? rootTreeObject.value ?? null,
)
const createObjectMenuItems = computed(() => buildCreateMenuItems(createObjectMenuTarget.value))

function toggleCreateObjectMenu(event) {
  createObjectMenuRef.value?.toggle(event)
}

const sidebarStore = useSidebarStore()
const settingsMenuRef = ref(null)
const settingsMenuItems = computed(() => [
  {
    label: 'Show aliases',
    icon: sidebarStore.showAliases ? 'pi pi-check' : 'pi pi-fw',
    command: () => sidebarStore.toggleAliases(),
  },
])

function toggleSettingsMenu(event) {
  settingsMenuRef.value?.toggle(event)
}

const toast = useToast()
const { mutateAsync: bindChildAsync } = useBindObjectChild()

const bindToContainerTargets = ref([])
const bindToContainerVisible = ref(false)

const bindObjectIntoTarget = ref(null)
const bindObjectIntoVisible = ref(false)

const unbindFromContainerTarget = ref(null)
const unbindFromContainerVisible = ref(false)

const unbindChildrenFromContainerTarget = ref(null)
const unbindChildrenFromContainerVisible = ref(false)

const startMaintenanceTargets = ref([])
const startMaintenanceVisible = ref(false)

function handleStartMaintenanceEvent(event) {
  startMaintenanceTargets.value = event.detail.objects
  startMaintenanceVisible.value = true
}

const explainStatusTarget = ref(null)
const explainStatusVisible = ref(false)

function handleExplainStatusEvent(event) {
  explainStatusTarget.value = event.detail.object
  explainStatusVisible.value = true
}

function handleBindToContainerEvent(event) {
  bindToContainerTargets.value = event.detail.objects
  bindToContainerVisible.value = true
}

function handleBindObjectIntoEvent(event) {
  bindObjectIntoTarget.value = event.detail.object
  bindObjectIntoVisible.value = true
}

function handleUnbindFromContainerEvent(event) {
  unbindFromContainerTarget.value = event.detail.object
  unbindFromContainerVisible.value = true
}

function handleUnbindChildrenFromContainerEvent(event) {
  unbindChildrenFromContainerTarget.value = event.detail.object
  unbindChildrenFromContainerVisible.value = true
}

function bindSummary(childCount, containerCount) {
  if (childCount === 1 && containerCount === 1) return 'Object bound'
  if (containerCount === 1) return `${childCount} objects bound`
  if (childCount === 1) return `Bound to ${containerCount} containers`
  return `${childCount} objects bound to ${containerCount} containers`
}

/**
 * Every selected object into every selected container, as the legacy `bindToContainer()`
 * does: the selection is bound, not just the row the menu was opened on.
 */
async function onContainerSelected(containers) {
  const children = bindToContainerTargets.value ?? []
  if (children.length === 0) return
  try {
    await Promise.all(
      containers.flatMap((c) =>
        children.map((child) => bindChildAsync({ parentId: c.id, childId: child.id })),
      ),
    )
    toast.add({
      severity: 'success',
      summary: bindSummary(children.length, containers.length),
      life: 2500,
    })
  } catch {
    toast.add({ severity: 'error', summary: 'Bind failed', life: 3000 })
  }
}

async function onBindableObjectSelected(children) {
  const parentId = bindObjectIntoTarget.value?.id
  if (!parentId) return
  try {
    await Promise.all(children.map((c) => bindChildAsync({ parentId, childId: c.id })))
    toast.add({
      severity: 'success',
      summary: bindSummary(children.length, 1),
      life: 2500,
    })
  } catch {
    toast.add({ severity: 'error', summary: 'Bind failed', life: 3000 })
  }
}

onMounted(() => {
  document.addEventListener('object:bindToContainer', handleBindToContainerEvent)
  document.addEventListener('object:bindObjectInto', handleBindObjectIntoEvent)
  document.addEventListener('object:unbindFromContainer', handleUnbindFromContainerEvent)
  document.addEventListener(
    'object:unbindChildrenFromContainer',
    handleUnbindChildrenFromContainerEvent,
  )
  document.addEventListener('object:startMaintenance', handleStartMaintenanceEvent)
  document.addEventListener('object:explainStatus', handleExplainStatusEvent)
})
onUnmounted(() => {
  document.removeEventListener('object:bindToContainer', handleBindToContainerEvent)
  document.removeEventListener('object:bindObjectInto', handleBindObjectIntoEvent)
  document.removeEventListener('object:unbindFromContainer', handleUnbindFromContainerEvent)
  document.removeEventListener(
    'object:unbindChildrenFromContainer',
    handleUnbindChildrenFromContainerEvent,
  )
  document.removeEventListener('object:startMaintenance', handleStartMaintenanceEvent)
  document.removeEventListener('object:explainStatus', handleExplainStatusEvent)
})

const toolInputVisible = ref(false)
const pendingTool = ref(null)
const pendingToolObject = ref(null)

async function handleExecuteTool(tool) {
  const object = selectionStore.primaryObject
  if (!object) return
  handleExecuteToolForObject(object, tool)
}

async function handleExecuteToolForObject(object, tool) {
  if (tool.inputFields?.length > 0) {
    pendingTool.value = tool
    pendingToolObject.value = object
    toolInputVisible.value = true
    return
  }

  await executeTool(object, tool)
}

/** A tool picked in a view's own object menu; the input dialog and the result tab live here. */
function handleExecuteToolEvent(event) {
  const { object, tool } = event.detail ?? {}
  if (object && tool) handleExecuteToolForObject(object, tool)
}

onMounted(() => document.addEventListener('object:executeTool', handleExecuteToolEvent))
onUnmounted(() => document.removeEventListener('object:executeTool', handleExecuteToolEvent))

async function handleToolInputSubmit(inputValues) {
  if (!pendingTool.value || !pendingToolObject.value) return
  const tool = pendingTool.value
  const object = pendingToolObject.value
  pendingTool.value = null
  pendingToolObject.value = null
  await executeTool(object, tool, inputValues)
}

function handleToolInputCancel() {
  pendingTool.value = null
  pendingToolObject.value = null
}

const objectIdFromRoute = computed(() => route.params.objectId)
const viewIdFromRoute = computed(() => route.params.viewId)

// For capability-based tab filtering
const { data: currentObjectDetails } = useObject(objectIdFromRoute)

// A document left over from the previous object must never decide this one's capability tabs.
const resolvedObjectDetails = computed(() => {
  const details = currentObjectDetails.value
  if (!details) return null
  return String(details.id) === String(objectIdFromRoute.value) ? details : null
})

// The chart's configuration lives in the route query, so this is derived, never stored.
const isChartTab = computed(() => viewIdFromRoute.value === 'chart')

const chartModel = computed(() =>
  parseFromQuery(route.query, objectIdFromRoute.value ? Number(objectIdFromRoute.value) : null),
)

// Definitions live in @/config/objectViews so the "Open" submenu and the tab bar stay in sync.
const viewGroups = computed(() => getObjectViewGroups())

/**
 * The chart tab exists only while a chart is open and never appears in "Manage views".
 * Modelled as a view so it reuses the tab bar's select/close/drag behaviour.
 */
const chartView = computed(() =>
  isChartTab.value
    ? {
        id: 'chart',
        label: chartTabLabel(chartModel.value),
        icon: 'pi pi-chart-line',
        lockable: false,
      }
    : null,
)

// Associated dashboards and maps flagged "show as object view" appear as tabs rendered for this
// object (legacy updateContextDashboardsAndMaps). Derived, never stored.
const associatedIds = computed(() => resolvedObjectDetails.value?.dashboards ?? [])
const { objectsById: associatedById, isFetching: associatedFetching } =
  useObjectsByIds(associatedIds)

const contextViews = computed(() =>
  getContextViews(resolvedObjectDetails.value, [...associatedById.value.values()]),
)

/**
 * Plus, while the object or its documents are loading, a provisional tab for a context view
 * named in the route, so a deep link opens straight on it. Once loaded, an id that is not a
 * context view drops out and the ordinary fallback picks a real view.
 */
const shownContextViews = computed(() => {
  const views = contextViews.value
  const viewId = viewIdFromRoute.value
  const parsed = parseContextViewId(viewId)
  const loading = !resolvedObjectDetails.value || associatedFetching.value
  if (!parsed || !loading || views.some((v) => v.id === viewId)) return views
  return [
    ...views,
    {
      id: viewId,
      label: 'Loading...',
      icon: 'pi pi-spin pi-spinner',
      kind: parsed.kind,
      targetId: parsed.id,
      closable: false,
    },
  ]
})

const allViews = computed(() => [
  ...ALL_OBJECT_VIEWS,
  ...shownContextViews.value,
  ...(chartView.value ? [chartView.value] : []),
])

// User additions and removals are stored against these defaults, so a view added here reaches
// everyone who has not removed it. Module views opt in with `defaultVisible`.
const DEFAULT_VISIBLE_VIEW_IDS = [
  'status',
  'statusMap',
  'alarms',
  'dcis',
  'performance',
  'interfaces',
  ...ALL_OBJECT_VIEWS.filter((v) => v.defaultVisible).map((v) => v.id),
]

// When no user preference is stored
const DEFAULT_VIEW_BY_CLASS = {
  Rack: 'rack',
  Chassis: 'chassis',
}

const visibleViewIds = computed(() =>
  viewStore.getVisibleViewIds(PERSPECTIVE_ID, DEFAULT_VISIBLE_VIEW_IDS),
)

const lockedViewIds = computed(() => viewStore.getLockedViewIds(PERSPECTIVE_ID))

// Optimistic: an unevaluable capability filter counts as compatible, so a pending detail fetch
// never redirects the user away.
function isViewCompatibleWith(viewId, objectClass) {
  return isViewCompatible(viewId, objectClass, resolvedObjectDetails.value)
}

// Pessimistic: used for the tab bar, so capability tabs appear once confirmed rather than
// disappear.
function isViewConfirmedFor(viewId, objectClass) {
  return isViewConfirmedCompatible(viewId, objectClass, resolvedObjectDetails.value)
}

// Fallback chain: class-specific preference if visible and compatible, the preferred view if
// compatible, the first compatible visible view, then 'status'.
function findBestViewForClass(preferredViewId, objectClass) {
  const classPreferred = viewStore.getActiveViewForClass(PERSPECTIVE_ID, objectClass)
  if (classPreferred && isViewCompatibleWith(classPreferred, objectClass)) {
    const compatibleIds = visibleViewIds.value.filter((id) => isViewCompatibleWith(id, objectClass))
    if (compatibleIds.includes(classPreferred)) return classPreferred
  }

  if (isViewCompatibleWith(preferredViewId, objectClass)) return preferredViewId

  const classDefault = DEFAULT_VIEW_BY_CLASS[objectClass]
  if (classDefault && isViewCompatibleWith(classDefault, objectClass)) return classDefault

  const firstCompatible = visibleViewIds.value.find((id) => isViewCompatibleWith(id, objectClass))
  if (firstCompatible) return firstCompatible

  return 'status'
}

const currentObjectClass = computed(() => selectionStore.primaryObject?.class ?? null)

const isToolTab = computed(() => {
  const viewId = viewIdFromRoute.value
  return !!viewId && viewId.startsWith('tool:')
})

// From the URL (stable, shareable)
const activeToolId = computed(() => {
  if (!isToolTab.value) return null
  return viewIdFromRoute.value.replace('tool:', '')
})

// One execution slot per tool per object
const activeExecutionId = computed(() => {
  if (!activeToolId.value || !objectIdFromRoute.value) return null
  return `${objectIdFromRoute.value}-${activeToolId.value}`
})

const activeToolExecution = computed(() => {
  if (!activeExecutionId.value) return null
  return toolExecutionStore.getExecution(activeExecutionId.value)
})

const isSshTab = computed(() => !!viewIdFromRoute.value?.startsWith('ssh:'))

const activeSshSession = computed(() => {
  if (!isSshTab.value || !objectIdFromRoute.value) return null
  return sshTerminalStore.getSession(
    sshTerminalStore.sessionKey(Number(objectIdFromRoute.value), viewIdFromRoute.value),
  )
})

const SSH_TAB_STATUS = { connecting: 'running', reconnecting: 'running' }

// Keyed by tool API ID for stable URLs; a terminal by its view id, which carries its own prefix.
const toolTabs = computed(() => {
  const objectId = objectIdFromRoute.value ? Number(objectIdFromRoute.value) : null
  if (!objectId) return []
  const toolResults = toolExecutionStore.getExecutionsForObject(objectId).map((exec) => ({
    id: String(exec.toolId),
    label: `${exec.toolName} [${exec.objectName}]`,
    icon: getToolTypeIcon(exec.toolType),
    status: exec.status,
  }))
  const terminals = sshTerminalStore.sessionsForObject(objectId).map((session) => ({
    id: session.viewId,
    label: session.label,
    icon: 'pi pi-desktop',
    status: SSH_TAB_STATUS[session.phase] ?? (session.message?.severity === 'error' ? 'error' : ''),
    closeTitle: 'Close terminal (Delete)',
  }))
  return [...toolResults, ...terminals]
})

const activeView = computed(() => {
  const viewId = viewIdFromRoute.value

  if (isToolTab.value || isSshTab.value) return null

  const allViewIds = allViews.value.map((v) => v.id)

  if (viewId && allViewIds.includes(viewId)) {
    return viewId
  }

  const stored = viewStore.getActiveView(PERSPECTIVE_ID)
  const fallback =
    stored && visibleViewIds.value.includes(stored) ? stored : visibleViewIds.value[0] || 'status'

  // A link naming only the object carries the last view over, as a tree click does.
  const cls = currentObjectClass.value
  return cls ? findBestViewForClass(fallback, cls) : fallback
})

// The bar only ever gains tabs: capability and module tabs wait for `GET /v1/objects/{id}`
// (module tabs also for server-info). The active view is always kept so it cannot blink out.
const compatibleVisibleViewIds = computed(() => {
  const cls = currentObjectClass.value
  const base = cls
    ? visibleViewIds.value.filter((id) => isViewConfirmedFor(id, cls) || id === activeView.value)
    : visibleViewIds.value
  // Context views and the chart tab are not in the stored preference, so they are appended.
  const contextIds = shownContextViews.value.map((v) => v.id)
  return [
    ...base.filter((id) => id !== 'chart' && !contextIds.includes(id)),
    ...contextIds,
    ...(chartView.value ? ['chart'] : []),
  ]
})

// Only confirmed views, so ticking one always puts a tab on the bar.
const applicableViewGroups = computed(() => {
  const cls = currentObjectClass.value
  if (!cls) return {}
  const groups = {}
  for (const [groupId, group] of Object.entries(viewGroups.value)) {
    const views = group.views.filter((view) => isViewConfirmedFor(view.id, cls))
    if (views.length > 0) groups[groupId] = { ...group, views }
  }
  return groups
})

// The add button shows the count, so a view not on the bar is still visibly there.
const addableViewCount = computed(
  () =>
    Object.values(applicableViewGroups.value)
      .flatMap((group) => group.views)
      .filter((view) => !visibleViewIds.value.includes(view.id)).length,
)

const activeContextView = computed(
  () => shownContextViews.value.find((v) => v.id === activeView.value) ?? null,
)

const treeContextMenu = useContextMenu({ domains: ['object'] })
const treeMenuRef = ref(null)
const filterState = ref({ text: '', tokens: [] })

useWorkingState('tree', { view: { filterState } })
const objectTreeStore = useObjectTreeStore()
const connectionStore = useConnectionStore()
const { expandedIds } = storeToRefs(objectTreeStore)
const filterExpandedIds = ref(new Set())

// Fetched separately: the sub-tree response only returns children, not the root.
const { data: rootTreeObject } = useObject(serviceRootId)

// Entire Network, for the same reason.
const { data: networkRootObject } = useObject(networkRootId)

const {
  data: subTreeData,
  isLoading: loadingSubTree,
  error: subTreeError,
} = useObjectTree(serviceRootId)

const objectTree = computed(() => subTreeData.value ?? [])

const {
  data: networkSubTreeData,
  isLoading: loadingNetworkSubTree,
  error: networkSubTreeError,
} = useObjectTree(networkRootId)

const networkObjectTree = computed(() => networkSubTreeData.value ?? [])

/**
 * A failed tree fetch is not evidence the object is gone: the "may have been deleted" state
 * would send the operator looking for a change nobody made.
 */
const objectUnresolvable = computed(
  () =>
    connectionStore.isReconnecting ||
    subTreeError.value != null ||
    networkSubTreeError.value != null,
)

// Returns { node, path } or null
function findObjectInTree(nodes, targetId, path = []) {
  for (const node of nodes) {
    if (node.id === targetId) {
      return { node, path: [...path, node] }
    }
    if (node.children) {
      const result = findObjectInTree(node.children, targetId, [...path, node])
      if (result) return result
    }
  }
  return null
}

// path = array of nodes root→target. The root's row lives outside the subtree and is expanded
// separately.
function expandPathToNode(path, rootId) {
  expandedIds.value.add(String(rootId))
  path.slice(0, -1).forEach((_, index) => {
    expandedIds.value.add(
      path
        .slice(0, index + 1)
        .map((n) => n.id)
        .join('-'),
    )
  })
}

// e.g. [2, 15, 42, 123] → "2-15-42-123"
function pathString(path) {
  return path.map((n) => n.id).join('-')
}

function matchTreeToken(node, token) {
  const val = (token.value ?? '').toLowerCase()
  switch (token.key) {
    case 'id':
      return String(node.id) === val
    case 'ip':
      return (node.ipAddress?.address ?? '').toLowerCase().includes(val)
    case 'exactip':
      return (node.ipAddress?.address ?? '').toLowerCase() === val
    case 'comment':
      return (node.comments ?? node.comment ?? '').toLowerCase().includes(val)
    case 'zone':
      return String(node.zoneUIN ?? '').includes(val)
    default:
      return false
  }
}

// expandedSet receives the paths force-expanded by filter matches; each tree passes its own.
function filterTreeNodes(nodes, state, parentPath = '', expandedSet = filterExpandedIds.value) {
  if (parentPath === '') expandedSet.clear()
  const hasText = (state.text ?? '').length > 0
  const hasTokens = (state.tokens ?? []).length > 0
  const hasPending = !!state.pendingToken
  if (!hasText && !hasTokens && !hasPending) return sortObjectTree(nodes)

  const lowerText = (state.text ?? '').toLowerCase()

  return sortTreeLevel(
    nodes
      .map((node) => {
        const nodePath = parentPath ? `${parentPath}-${node.id}` : String(node.id)
        const children = node.children
          ? filterTreeNodes(node.children, state, nodePath, expandedSet)
          : []

        const nameMatches =
          hasText &&
          (node.name.toLowerCase().includes(lowerText) ||
            String(node.ipAddress?.address ?? '')
              .toLowerCase()
              .includes(lowerText))
        const tokenMatches = hasTokens && state.tokens.every((t) => matchTreeToken(node, t))
        const pendingMatches = hasPending ? matchTreeToken(node, state.pendingToken) : true

        // Shown if it matches directly (text AND tokens AND pending) or has matching children
        const directMatch =
          (hasText ? nameMatches : true) && (hasTokens ? tokenMatches : true) && pendingMatches

        if (directMatch || children.length > 0) {
          if (children.length > 0) expandedSet.add(nodePath)
          return {
            ...node,
            children: directMatch ? sortObjectTree(node.children ?? []) : children,
          }
        }
        return null
      })
      .filter(Boolean),
  )
}

const filteredTree = computed(() => filterTreeNodes(objectTree.value, filterState.value))

const networkFilterExpandedIds = ref(new Set())
const networkFilteredTree = computed(() =>
  filterTreeNodes(networkObjectTree.value, filterState.value, '', networkFilterExpandedIds.value),
)

const effectiveExpandedIds = computed(() => {
  if (filterExpandedIds.value.size === 0 && networkFilterExpandedIds.value.size === 0)
    return expandedIds.value
  return new Set([
    ...expandedIds.value,
    ...filterExpandedIds.value,
    ...networkFilterExpandedIds.value,
  ])
})

const selectedPath = ref(null)

/** Ctrl/middle click opens a new tab on the same object and the view a plain click lands on. */
function treeNodeTarget(node) {
  return objectTarget(node, findBestViewForClass(currentTreeViewId(), node.class), {
    query: route.query,
    perspective: 'infrastructure',
  })
}

/** Never a tool tab. */
function currentTreeViewId() {
  const viewId = viewIdFromRoute.value || activeView.value || 'status'
  return isAdHocViewId(viewId) ? viewStore.getActiveView(PERSPECTIVE_ID) || 'status' : viewId
}

function selectTreeNode(node, clickedPath = null) {
  // Captured now so the route watcher doesn't override it.
  if (clickedPath) selectedPath.value = clickedPath
  // Keep the keyboard in the tree. A programmatic selection (the successor after a delete) has
  // nothing focused yet, so the container is the landing spot until the row renders.
  if (!treeContainerRef.value?.contains(document.activeElement)) {
    treeRef.value?.focus()
  }
  // Watchers sync state. A tool tab is not carried to a different object.
  router.push(treeNodeTarget(node))
}

/**
 * Deleting the open object selects its neighbour in whichever tree held it, as displayed,
 * instead of dropping the user on the home page.
 */
useObjectDeletionNavigation({
  currentId: objectIdFromRoute,
  trees: () => [
    {
      nodes: filteredTree,
      onSelect: selectTreeNode,
      onSelectRoot: () =>
        rootTreeObject.value && selectTreeNode(rootTreeObject.value, String(serviceRootId.value)),
    },
    {
      nodes: networkFilteredTree,
      onSelect: selectTreeNode,
      onSelectRoot: () =>
        networkRootObject.value &&
        selectTreeNode(networkRootObject.value, String(networkRootId.value)),
    },
  ],
})

function handleTreeContextMenu(event, node, { selection, path } = {}) {
  contextMenuTargetObject.value = node
  menuRowPath = path
  // A right click outside a multi-selection has already collapsed the range, so the tree
  // reports no selection.
  treeContextMenu.contextRef.value = {
    object: node,
    viewContext: 'objectTree',
    selection,
  }
  treeMenuRef.value?.show(event)
}

const contextMenuTargetObject = ref(null)
let menuRowPath = null

function handleToggleExpand(path) {
  if (expandedIds.value.has(path)) {
    expandedIds.value.delete(path)
  } else {
    expandedIds.value.add(path)
  }
}

// Tools for the context menu target object
const contextMenuObjectId = computed(() => contextMenuTargetObject.value?.id ?? null)
const { data: contextMenuToolsData, isLoading: contextMenuToolsLoading } =
  useObjectToolsForObject(contextMenuObjectId)
const { iconByToolId: contextMenuToolIcons } = useObjectToolIcons(contextMenuToolsData)

// Preloaded with the tool list, as legacy does, so menu icons do not change under the pointer.
useObjectIcons()?.want(() => [
  ...selectedToolIcons.value.values(),
  ...contextMenuToolIcons.value.values(),
])

const treeContextMenuItems = computed(() => {
  const items = [...treeContextMenu.menuItems.value]
  if (!contextMenuObjectId.value) return items
  // Server-defined tools belong to one object; a range keeps only the static children.
  if (treeContextMenu.contextRef.value?.selection?.length > 1) return items
  const toolsContent = buildToolsContent(contextMenuToolsData.value, {
    loading: contextMenuToolsLoading.value,
    onExecute: (tool) => {
      const object = contextMenuTargetObject.value
      if (!object) return
      handleExecuteToolForObject(object, tool)
    },
    iconByToolId: contextMenuToolIcons.value,
    onCreateTool: openToolConfiguration,
  })
  return injectToolsIntoMenu(items, toolsContent)
})

const { menuItems: staticMenuItems } = useActions(
  computed(() => selectionStore.primaryContext),
  { domains: ['object'] },
)

// F2 renames the object the view shows, from anywhere in the perspective; Del and Enter act on
// the tree row and stay confined to the tree, or Del in a DCI table would delete the object.
const treeRef = ref(null)
// Lets the row-scoped shortcuts tell whether the keyboard is in the tree.
const treeContainerRef = computed(() => treeRef.value?.containerRef ?? null)
const perspectiveRootRef = ref(null)
useActionShortcuts(staticMenuItems, {
  containerRef: treeContainerRef,
  outerRef: perspectiveRootRef,
  rowScopedShortcuts: ['Del', 'Enter'],
})

/**
 * Both trees hang off one `role="tree"` container, so a range can span either. Entire Network
 * carries its own loading and permission state.
 */
const treeRoots = computed(() => [
  {
    object: rootTreeObject.value,
    label: 'Infrastructure Services',
    fallbackClass: 'ServiceRoot',
    nodes: filteredTree.value,
  },
  {
    object: networkRootObject.value,
    label: 'Entire Network',
    fallbackClass: 'Network',
    nodes: networkFilteredTree.value,
    loading: loadingNetworkSubTree.value,
    error: networkSubTreeError.value,
  },
])

/** A range marks rows for a bulk action without opening any; `primaryObject` is left alone. */
function handleTreeSelectionChange(objects) {
  if (objects.length) {
    selectionStore.setPrimarySelection(objects)
    return
  }
  const object = selectionStore.primaryObject
  selectionStore.setPrimarySelection(object ? [object] : [])
}

/** A range can span either tree. */
function resolveTreePath(path) {
  if (path === String(serviceRootId.value)) return rootTreeObject.value
  if (path === String(networkRootId.value)) return networkRootObject.value
  return findNodeByPath(filteredTree.value, path) ?? findNodeByPath(networkFilteredTree.value, path)
}

// API tools are injected into the static object.tools submenu (objectActions.js).
const toolsMenuItems = computed(() => {
  const items = [...staticMenuItems.value]
  if (!selectedObjectId.value) return items
  const toolsContent = buildToolsContent(selectedObjectToolsData.value, {
    loading: selectedToolsLoading.value,
    onExecute: handleExecuteTool,
    iconByToolId: selectedToolIcons.value,
    onCreateTool: openToolConfiguration,
  })
  return injectToolsIntoMenu(items, toolsContent)
})

// From the merged list, so the header's Tools button carries the server-defined tools.
const primaryActions = computed(() => extractPrimaryActions(toolsMenuItems.value, 2))

const addMenuRef = ref(null)

/** Ctrl/middle click opens that view in a new tab. */
function viewTabTarget(viewId) {
  return { name: 'infrastructure', params: { objectId: objectIdFromRoute.value, viewId } }
}

/** Tool tab URLs re-run the tool on load, so they are meaningful in a fresh tab. */
function toolTabTarget(toolId) {
  return viewTabTarget(parseSshViewId(toolId) ? toolId : `tool:${toolId}`)
}

function handleViewSelect(viewId) {
  router.push(viewTabTarget(viewId))
}

// Route view ids, most recently used first, so closing the active tab returns to the one before.
let recentTabIds = []

function isTabOpen(routeViewId) {
  if (routeViewId.startsWith('tool:')) {
    const toolId = routeViewId.slice('tool:'.length)
    return toolTabs.value.some((tab) => tab.id === toolId)
  }
  if (parseSshViewId(routeViewId)) return toolTabs.value.some((tab) => tab.id === routeViewId)
  return compatibleVisibleViewIds.value.includes(routeViewId)
}

/** The most recently used tab still open, else the first one; null when none is left. */
function tabAfterClosing(closingId) {
  const isCandidate = (id) => id !== closingId && isTabOpen(id)
  return recentTabIds.find(isCandidate) ?? compatibleVisibleViewIds.value.find(isCandidate) ?? null
}

function handleViewClose(viewId) {
  // The chart tab has no stored preference. A locked tab only gets here through Save & Close,
  // and stays on the bar.
  if (viewId !== 'chart' && !lockedViewIds.value.includes(viewId)) {
    viewStore.removeView(PERSPECTIVE_ID, viewId, DEFAULT_VISIBLE_VIEW_IDS)
  }
  if (activeView.value !== viewId) return
  // The chart tab exists only on its own route, so closing it always leaves.
  const next = tabAfterClosing(viewId) ?? (viewId === 'chart' ? 'status' : null)
  if (next) router.push(viewTabTarget(next))
}

const activeViewProps = computed(() =>
  activeView.value === 'properties'
    ? {
        object: selectionStore.primaryObject,
        closable: true,
        onClose: () => handleViewClose('properties'),
      }
    : { object: selectionStore.primaryObject },
)

function handleViewToggle(viewId) {
  viewStore.toggleView(PERSPECTIVE_ID, viewId, DEFAULT_VISIBLE_VIEW_IDS)
}

function handleViewLockToggle(viewId) {
  viewStore.toggleViewLock(PERSPECTIVE_ID, viewId)
}

function handleViewReorder(reorderedCompatible) {
  // Merge the reordered subset back with the hidden IDs of the full preference list. Derived
  // tabs (context views, the chart) are never part of the stored preference.
  const hiddenIds = visibleViewIds.value.filter(
    (id) => !compatibleVisibleViewIds.value.includes(id),
  )
  const registered = reorderedCompatible.filter((id) => !isAdHocViewId(id))
  viewStore.setViewOrder(PERSPECTIVE_ID, [...registered, ...hiddenIds])
}

function handleAddView(event) {
  addMenuRef.value?.show(event)
}

function handleToolTabSelect(toolId) {
  router.push(toolTabTarget(toolId))
}

function handleToolTabClose(toolId) {
  const isSsh = !!parseSshViewId(toolId)
  const routeViewId = isSsh ? toolId : `tool:${toolId}`
  const next =
    viewIdFromRoute.value === routeViewId ? (tabAfterClosing(routeViewId) ?? 'status') : null

  if (isSsh) {
    sshTerminalStore.closeSession(
      sshTerminalStore.sessionKey(Number(objectIdFromRoute.value), toolId),
    )
  } else {
    toolExecutionStore.removeExecution(`${objectIdFromRoute.value}-${toolId}`)
  }
  if (next) router.push(viewTabTarget(next))
}

function handleRefresh() {
  refreshSignal.value++
}

const SshTerminalView = defineAsyncComponent(() => import('./subviews/SshTerminalView.vue'))

const viewComponents = {
  status: () => import('./subviews/StatusView.vue'),
  properties: () => import('./subviews/PropertiesView.vue'),
  comments: () => import('./subviews/CommentsView.vue'),
  alarms: () => import('./subviews/AlarmsView.vue'),
  dcis: () => import('./subviews/DCIsView.vue'),
  thresholds: () => import('./subviews/ThresholdsView.vue'),
  performance: () => import('./subviews/PerformanceView.vue'),
  interfaces: () => import('./subviews/InterfacesView.vue'),
  radios: () => import('./subviews/RadiosView.vue'),
  wirelessStations: () => import('./subviews/WirelessStationsView.vue'),
  ports: () => import('./subviews/PortsView.vue'),
  topology: () => import('./subviews/TopologyView.vue'),
  arpCache: () => import('./subviews/ArpCacheView.vue'),
  routingTable: () => import('./subviews/RoutingTableView.vue'),
  fdb: () => import('./subviews/SwitchForwardingDatabaseView.vue'),
  policies: () => import('./subviews/AgentPoliciesView.vue'),
  configBackup: () => import('./subviews/DeviceConfigBackupView.vue'),
  templates: () => import('./subviews/TemplatesView.vue'),
  script: () => import('./subviews/ScriptView.vue'),
  polls: () => import('./subviews/PollsView.vue'),
  statusMap: () => import('./subviews/StatusMapView.vue'),
  summaryTables: () => import('./subviews/SummaryTablesView.vue'),
  logs: () => import('./subviews/ObjectLogsView.vue'),
  rack: () => import('./subviews/RackView.vue'),
  chassis: () => import('./subviews/ChassisView.vue'),
}

const activeViewComponent = computed(() => {
  if (activeView.value === 'status' && GROUP_OVERVIEW_CLASSES.includes(currentObjectClass.value)) {
    return () => import('./subviews/ContainerOverviewView.vue')
  }
  return viewComponents[activeView.value] || getViewDefinition(activeView.value)?.component || null
})

watch(
  objectIdFromRoute,
  (objectId) => {
    if (!objectId) {
      selectedPath.value = null
      selectionStore.clearSelection()
      return
    }

    const numericId = Number(objectId)
    if (Number.isNaN(numericId)) {
      router.replace({ name: 'infrastructure' })
      return
    }

    // Root objects live outside the subtree.
    if (numericId === serviceRootId.value) {
      selectedPath.value = String(serviceRootId.value)
      if (rootTreeObject.value) selectionStore.selectPrimary(rootTreeObject.value)
      return
    }
    if (numericId === networkRootId.value) {
      selectedPath.value = String(networkRootId.value)
      if (networkRootObject.value) selectionStore.selectPrimary(networkRootObject.value)
      return
    }

    // An action from a row's menu opens the object at that row, not at its first branch.
    if (
      selectedPath.value?.split('-').at(-1) !== String(numericId) &&
      menuRowPath?.split('-').at(-1) === String(numericId)
    ) {
      selectedPath.value = menuRowPath
    }
    menuRowPath = null

    // A click has already set selectedPath for that location.
    if (selectedPath.value?.split('-').at(-1) === String(numericId)) {
      const infraResult = findObjectInTree(objectTree.value, numericId)
      if (infraResult) {
        selectionStore.selectPrimary(infraResult.node)
        return
      }
      const netResult = findObjectInTree(networkObjectTree.value, numericId)
      if (netResult) {
        selectionStore.selectPrimary(netResult.node)
        return
      }
      return
    }

    // Direct link or back/forward: infra tree first, then network
    const infraResult = findObjectInTree(objectTree.value, numericId)
    if (infraResult) {
      const { node, path } = infraResult
      expandPathToNode(path, serviceRootId.value)
      selectedPath.value = pathString(path)
      selectionStore.selectPrimary(node)
      return
    }
    const netResult = findObjectInTree(networkObjectTree.value, numericId)
    if (netResult) {
      const { node, path } = netResult
      expandPathToNode(path, networkRootId.value)
      selectedPath.value = pathString(path)
      selectionStore.selectPrimary(node)
    } else {
      selectedPath.value = null
      selectionStore.clearSelection()
    }
  },
  { immediate: true },
)

// With no object in the URL, select Infrastructure Services once loaded (its class picks the
// landing view). router.replace keeps Back from bouncing. A present-but-unresolved id is left
// to the not-found state.
watch(
  [objectIdFromRoute, rootTreeObject],
  ([objectId, root]) => {
    if (objectId || !root) return
    router.replace({
      name: 'infrastructure',
      params: {
        objectId: String(serviceRootId.value),
        viewId: findBestViewForClass('status', root.class),
      },
    })
  },
  { immediate: true },
)

// The root may load after the route watcher fires.
watch(rootTreeObject, (obj) => {
  if (!obj) return
  if (Number(objectIdFromRoute.value) === serviceRootId.value) {
    selectionStore.selectPrimary(obj)
  }
})

// Stops watching so a manual collapse is respected.
const stopRootAutoExpand = watch(rootTreeObject, (obj) => {
  if (!obj) return
  expandedIds.value.add(String(serviceRootId.value))
  stopRootAutoExpand()
})

watch(subTreeData, () => {
  const objectId = objectIdFromRoute.value
  if (!objectId) return
  const numericId = Number(objectId)
  if (Number.isNaN(numericId) || numericId === serviceRootId.value) return

  // Keeps the user's chosen branch.
  if (selectedPath.value?.split('-').at(-1) === String(numericId)) {
    const result = findObjectInTree(objectTree.value, numericId)
    if (result) selectionStore.selectPrimary(result.node)
    return
  }

  const result = findObjectInTree(objectTree.value, numericId)
  if (result) {
    const { node, path } = result
    expandPathToNode(path, serviceRootId.value)
    selectedPath.value = pathString(path)
    selectionStore.selectPrimary(node)
  }
})

// The network root may load after the route watcher fires.
watch(networkRootObject, (obj) => {
  if (!obj) return
  if (Number(objectIdFromRoute.value) === networkRootId.value) {
    selectionStore.selectPrimary(obj)
  }
})

watch(networkSubTreeData, () => {
  const objectId = objectIdFromRoute.value
  if (!objectId) return
  const numericId = Number(objectId)
  if (Number.isNaN(numericId) || numericId === networkRootId.value) return

  if (selectedPath.value?.split('-').at(-1) === String(numericId)) {
    const result = findObjectInTree(networkObjectTree.value, numericId)
    if (result) selectionStore.selectPrimary(result.node)
    return
  }

  const result = findObjectInTree(networkObjectTree.value, numericId)
  if (result) {
    const { node, path } = result
    expandPathToNode(path, networkRootId.value)
    selectedPath.value = pathString(path)
    selectionStore.selectPrimary(node)
  }
})

watch(
  viewIdFromRoute,
  (viewId) => {
    if (viewId) recentTabIds = [viewId, ...recentTabIds.filter((id) => id !== viewId)]
    if (!viewId || !objectIdFromRoute.value) return

    // Ad-hoc tabs are not registered views: tool tabs run via the auto-exec watch, chart tabs
    // via their route query.
    if (isAdHocViewId(viewId)) return

    const allViewIds = allViews.value.map((v) => v.id)
    if (!allViewIds.includes(viewId)) {
      router.replace({
        name: 'infrastructure',
        params: { objectId: objectIdFromRoute.value, viewId: 'status' },
      })
      return
    }

    // Best-effort: primaryObject may not be resolved yet on a cold load.
    const objectClass = selectionStore.primaryObject?.class
    if (objectClass && !isViewCompatibleWith(viewId, objectClass)) {
      const fallback = findBestViewForClass(viewId, objectClass)
      router.replace({
        name: 'infrastructure',
        params: { objectId: objectIdFromRoute.value, viewId: fallback },
      })
      return
    }

    if (!visibleViewIds.value.includes(viewId)) {
      viewStore.addView(PERSPECTIVE_ID, viewId, DEFAULT_VISIBLE_VIEW_IDS)
    }

    viewStore.setActiveView(PERSPECTIVE_ID, viewId)
    if (objectClass) {
      viewStore.setActiveViewForClass(PERSPECTIVE_ID, objectClass, viewId)
    }
  },
  { immediate: true },
)

// Null for a core view. A module view is UNKNOWN until server-info answers, and is checked again
// then.
const routeViewModuleState = computed(() => {
  const moduleId = getViewDefinition(viewIdFromRoute.value)?.moduleId
  return moduleId ? moduleRegistry.getModuleState(moduleId) : null
})

// Flips to false when a "not known yet" filter settles on no.
const routeViewFits = computed(() => {
  const cls = resolvedObjectDetails.value?.class ?? currentObjectClass.value
  const viewId = viewIdFromRoute.value
  if (!cls || !viewId || isAdHocViewId(viewId)) return true
  return isViewCompatibleWith(viewId, cls)
})

// Re-checked when the details land, the module state settles, or the filter does: the first
// check was optimistic (a non-bridge Node on Ports, a module view deep-linked before
// server-info).
watch([() => resolvedObjectDetails.value, routeViewModuleState, routeViewFits], ([obj]) => {
  // Without the document, the tree's class still rules out a module the server lacks.
  const objectClass = obj?.class ?? currentObjectClass.value
  if (!objectClass || !viewIdFromRoute.value || isAdHocViewId(viewIdFromRoute.value)) return
  const viewId = viewIdFromRoute.value
  if (!isViewCompatibleWith(viewId, objectClass)) {
    router.replace({
      name: 'infrastructure',
      params: {
        objectId: objectIdFromRoute.value,
        viewId: findBestViewForClass(viewId, objectClass),
      },
    })
  }
})

// A terminal URL names a tab, not a live shell: a reload or a link lands on its connect form.
watch(
  [viewIdFromRoute, objectIdFromRoute, () => selectionStore.primaryObject],
  ([viewId, objectIdStr, object]) => {
    if (!viewId?.startsWith('ssh:') || !objectIdStr || String(object?.id) !== String(objectIdStr)) {
      return
    }
    if (object.class !== 'Node' || !parseSshViewId(viewId)) {
      router.replace(viewTabTarget('status'))
      return
    }
    sshTerminalStore.ensureSession(object, viewId)
  },
  { immediate: true },
)

// Tool URLs are shareable: revisiting tool:42 re-runs the tool if no execution exists yet.
watch(
  [viewIdFromRoute, objectIdFromRoute, selectedObjectToolsData, () => selectionStore.primaryObject],
  ([viewId, objectIdStr, tools, object]) => {
    if (!viewId?.startsWith('tool:') || !objectIdStr || !tools || !object) return

    const toolId = Number(viewId.replace('tool:', ''))
    const executionId = `${objectIdStr}-${toolId}`
    if (toolExecutionStore.hasExecution(executionId)) return

    const tool = tools.find((t) => t.id === toolId)
    if (!tool) {
      // Bad URL or tool removed
      router.replace({
        name: 'infrastructure',
        params: { objectId: objectIdStr, viewId: 'status' },
      })
      return
    }

    handleExecuteToolForObject(object, tool)
  },
  { immediate: true },
)

// `?create=<Class>` opens that class's creation dialog once the parent resolves; in the URL so a
// ctrl-clicked getting-started card still lands on it. Consumed once. Must be declared after
// rootTreeObject: `immediate` reads createObjectMenuTarget, which needs it.
watch(
  [() => route.query.create, createObjectMenuTarget],
  ([requestedClass, target]) => {
    if (!requestedClass || !target) return
    if (!dispatchCreateObject(target, requestedClass)) return

    const query = { ...route.query }
    delete query.create
    router.replace({ name: route.name, params: route.params, query })
  },
  { immediate: true },
)
</script>

<template>
  <Teleport defer to="#sidebar-content">
    <div class="objects-sidebar">
      <SidebarHeader title="Infrastructure">
        <template #actions>
          <Button
            v-tooltip.bottom="'Create object'"
            aria-label="Create object"
            data-tour="create-object"
            icon="pi pi-plus"
            text
            severity="secondary"
            size="small"
            :disabled="createObjectMenuItems.length === 0"
            @click="toggleCreateObjectMenu"
          />
          <Menu ref="createObjectMenuRef" :model="createObjectMenuItems" :popup="true" />
          <Button
            v-tooltip.bottom="'Sidebar settings'"
            aria-label="Sidebar settings"
            icon="pi pi-ellipsis-v"
            text
            severity="secondary"
            size="small"
            @click="toggleSettingsMenu"
          />
          <Menu ref="settingsMenuRef" :model="settingsMenuItems" :popup="true" />
        </template>
      </SidebarHeader>

      <SidebarFilter
        v-model="filterState"
        :filter-defs="objectTreeFilterDefs"
        placeholder="Filter objects..."
      />

      <div v-if="loadingSubTree" class="tree-loading">
        <i class="pi pi-spin pi-spinner" /> Loading...
      </div>
      <!-- A permission boundary, not a load failure. -->
      <RestrictedState v-else-if="subTreeError?.status === 403" compact />
      <div v-else-if="subTreeError" class="tree-error">
        <i class="pi pi-exclamation-triangle" /> {{ subTreeError.message }}
      </div>
      <ObjectSidebarTree
        v-else
        ref="treeRef"
        data-tour="object-tree"
        :roots="treeRoots"
        :expanded-ids="effectiveExpandedIds"
        :selected-path="selectedPath"
        :target-for="treeNodeTarget"
        :root-target-for="treeNodeTarget"
        :resolve-path="resolveTreePath"
        @select="selectTreeNode"
        @contextmenu="handleTreeContextMenu"
        @toggle="handleToggleExpand"
        @selection-change="handleTreeSelectionChange"
      />
    </div>
  </Teleport>

  <div ref="perspectiveRootRef" class="objects-view">
    <ObjectHeader
      :object="selectionStore.primaryObject"
      :actions="primaryActions"
      :tools-menu-items="toolsMenuItems"
    />

    <ViewTabBar
      v-if="selectionStore.primaryObject"
      :views="allViews"
      :visible-view-ids="compatibleVisibleViewIds"
      :locked-view-ids="lockedViewIds"
      :active-view="activeView"
      :addable-count="addableViewCount"
      :tool-tabs="toolTabs"
      :active-tool-tab="activeToolId ?? activeSshSession?.viewId ?? null"
      :target-for="viewTabTarget"
      :tool-target-for="toolTabTarget"
      @select="handleViewSelect"
      @close="handleViewClose"
      @add="handleAddView"
      @refresh="handleRefresh"
      @reorder="handleViewReorder"
      @select-tool-tab="handleToolTabSelect"
      @close-tool-tab="handleToolTabClose"
      @toggle-lock="handleViewLockToggle"
    />

    <ToolResultView
      v-if="selectionStore.primaryObject && isToolTab && activeToolExecution"
      :execution="activeToolExecution"
    />
    <SshTerminalView
      v-else-if="selectionStore.primaryObject && activeSshSession"
      :key="activeSshSession.key"
      :object="selectionStore.primaryObject"
      :session-key="activeSshSession.key"
    />
    <DciChartView
      v-else-if="selectionStore.primaryObject && isChartTab"
      :object="selectionStore.primaryObject"
    />
    <ContextDashboardView
      v-else-if="selectionStore.primaryObject && activeContextView?.kind === 'dashboard'"
      :key="activeContextView.id"
      :object="selectionStore.primaryObject"
      :dashboard-id="activeContextView.targetId"
    />
    <ContextMapView
      v-else-if="selectionStore.primaryObject && activeContextView?.kind === 'map'"
      :key="activeContextView.id"
      :object="selectionStore.primaryObject"
      :map-id="activeContextView.targetId"
    />
    <ViewContainer
      v-else-if="selectionStore.primaryObject"
      :component="activeViewComponent"
      :key="activeView"
      :state-key="activeView"
      :view-props="activeViewProps"
    />
    <EmptyState
      v-else-if="objectIdFromRoute && objectUnresolvable"
      icon="pi pi-exclamation-triangle"
      title="Server unavailable"
      message="The server cannot be reached, so this object could not be loaded. The connection is being retried automatically; your session stays open."
    />
    <EmptyState
      v-else-if="objectIdFromRoute && !loadingSubTree"
      icon="pi pi-objects-column"
      title="Object not found"
      message="This object may have been deleted or is no longer accessible. Select another object from the tree."
    />
  </div>

  <ViewAddMenu
    ref="addMenuRef"
    :groups="applicableViewGroups"
    :visible-view-ids="visibleViewIds"
    :locked-view-ids="lockedViewIds"
    :active-view="activeView"
    @toggle="handleViewToggle"
    @select="handleViewSelect"
  />

  <ActionContextMenu
    ref="treeMenuRef"
    :items="treeContextMenuItems"
    @hide="treeRef?.clearMenuRow()"
  />

  <ToolInputDialog
    v-model:visible="toolInputVisible"
    :tool-name="pendingTool?.commandShortName || pendingTool?.name"
    :input-fields="pendingTool?.inputFields || []"
    @submit="handleToolInputSubmit"
    @cancel="handleToolInputCancel"
  />

  <!-- The create dialogs open on DOM events from objectActions (rack:create, ...). -->
  <CreateRackDialog v-model:visible="createRackVisible" :parent-object="createRackParent" />

  <CreateObjectDialog
    v-model:visible="createObjectVisible"
    :parent-object="createObjectParent"
    :object-class="createObjectClass"
    @created="
      (created) => router.push({ name: 'infrastructure', params: { objectId: created.id } })
    "
  />

  <CreateNodeDialog v-model:visible="createNodeVisible" :parent-object="createNodeParent" />

  <CreateInterfaceDialog
    v-model:visible="createInterfaceVisible"
    :parent-object="createInterfaceParent"
  />

  <CreateNetworkServiceDialog
    v-model:visible="createNetworkServiceVisible"
    :parent-object="createNetworkServiceParent"
  />

  <CreateAssetDialog v-model:visible="createAssetVisible" :parent-object="createAssetParent" />

  <CreateChassisDialog
    v-model:visible="createChassisVisible"
    :parent-object="createChassisParent"
  />

  <CreateSensorDialog v-model:visible="createSensorVisible" :parent-object="createSensorParent" />

  <CreateMobileDeviceDialog
    v-model:visible="createMobileDeviceVisible"
    :parent-object="createMobileDeviceParent"
  />

  <CreateCloudDomainDialog
    v-model:visible="createCloudDomainVisible"
    :parent-object="createCloudDomainParent"
  />

  <CreateSubnetDialog
    v-model:visible="createSubnetVisible"
    :parent-object="createSubnetParent"
    @created="
      (created) => router.push({ name: 'infrastructure', params: { objectId: created.id } })
    "
  />

  <!-- v-if unmounts when closed, dropping background query subscriptions. -->
  <ContainerPickerDialog
    v-if="bindToContainerVisible"
    visible
    @update:visible="bindToContainerVisible = $event"
    @select="onContainerSelected"
  />
  <BindableObjectPickerDialog
    v-if="bindObjectIntoVisible"
    visible
    @update:visible="bindObjectIntoVisible = $event"
    @select="onBindableObjectSelected"
  />
  <ObjectPickerDialog
    v-if="applyTemplateVisible"
    visible
    title="Select Template"
    :perspectives="templatePerspectives"
    :selectable="(node) => node.class === 'Template'"
    @update:visible="applyTemplateVisible = $event"
    @select="onTemplateSelected"
  />
  <AppliedTemplatePickerDialog
    v-if="removeTemplateVisible"
    visible
    :targets="templateActionTargets"
    :is-pending="templateActionPending"
    @update:visible="removeTemplateVisible = $event"
    @confirm="onTemplateRemovalConfirmed"
  />
  <UnbindFromContainerDialog
    v-if="unbindFromContainerVisible"
    visible
    @update:visible="unbindFromContainerVisible = $event"
    :object="unbindFromContainerTarget"
  />
  <UnbindChildrenFromContainerDialog
    v-if="unbindChildrenFromContainerVisible"
    visible
    @update:visible="unbindChildrenFromContainerVisible = $event"
    :object="unbindChildrenFromContainerTarget"
  />
  <MaintenanceDialog
    v-if="startMaintenanceVisible"
    visible
    @update:visible="startMaintenanceVisible = $event"
    :objects="startMaintenanceTargets"
  />
  <StatusExplanationDialog
    v-if="explainStatusVisible"
    visible
    @update:visible="explainStatusVisible = $event"
    :object="explainStatusTarget"
  />
</template>

<style scoped>
.objects-view {
  display: flex;
  flex-direction: column;
  height: calc(100% + 1rem);
  margin: -1rem;
}

.objects-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: -0.75rem;
}

.tree-loading,
.tree-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.tree-error {
  color: var(--p-red-500);
}
</style>
