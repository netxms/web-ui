<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import ProgressSpinner from 'primevue/progressspinner'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import SidebarHeader from '@/components/layout/SidebarHeader.vue'
import SidebarFilter from '@/components/layout/SidebarFilter.vue'
import ObjectSidebarTree from '@/components/objects/ObjectSidebarTree.vue'
import DashboardCanvas from '@/components/dashboards/DashboardCanvas.vue'
import DashboardGroupDetailView from '@/components/dashboards/DashboardGroupDetailView.vue'
import DashboardsRootDetailView from '@/components/dashboards/DashboardsRootDetailView.vue'
import DemoNoticeBanner from '@/components/common/DemoNoticeBanner.vue'
import EntityDetailHeader from '@/components/layout/EntityDetailHeader.vue'
import PropertiesView from '@/views/objects/subviews/PropertiesView.vue'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'
import StatusExplanationDialog from '@/components/objects/StatusExplanationDialog.vue'
import CreateObjectDialog from '@/components/objects/CreateObjectDialog.vue'
import ObjectToolsPanel from '@/components/common/ObjectToolsPanel.vue'
import ObjectPickerField from '@/components/objects/ObjectPickerField.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useQueryClient } from '@tanstack/vue-query'
import { useContextMenu } from '@/composables/useContextMenu'
import { useDashboardTree, useDashboard, useSaveDashboard } from '@/queries/useDashboardQueries'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useObjects, useObject } from '@/queries/useObjectQueries'
import { isDemoDashboardId } from '@/api/demoDashboardStorage'
import { buildCreateMenuItems } from '@/utils/createMenuItems'
import { dashboardTarget } from '@/utils/routeTargets'
import { useObjectDeletionNavigation } from '@/composables/useObjectDeletionNavigation'
import { useWorkingState } from '@/composables/useWorkingState'
import { findNodeByPath } from '@/utils/objectTreeNavigation'
import { filterObjectTree } from '@/utils/objectTreeSort'

const DEFAULT_ROOT_ID = 7

const route = useRoute()
const router = useRouter()
const dashboardStore = useDashboardStore()

// Root, shown as an expandable/selectable row above the tree
const { data: allRootObjects } = useObjects()
const rootId = computed(
  () =>
    (allRootObjects.value ?? []).find((o) => o.class === 'DashboardRoot')?.id ?? DEFAULT_ROOT_ID,
)
const { data: rootObject } = useObject(rootId)

const filterState = ref({ text: '', tokens: [] })

useWorkingState('tree', { view: { filterState } })
const expandedIds = ref(new Set())
const rootSelected = ref(false)

const {
  data: treeData,
  isLoading: loadingTree,
  isError: treeIsError,
  error: treeError,
  refetch: refetchTree,
} = useDashboardTree()
const dashboardTree = computed(() => treeData.value ?? [])

watch(
  dashboardTree,
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

const filteredTree = computed(() => filterObjectTree(dashboardTree.value, filterState.value.text))

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
    ? findPathInTree(dashboardTree.value, selectedDashboardId.value)
    : String(rootId.value),
)

const dashboardIdFromRoute = computed(() => {
  const id = route.params.dashboardId
  return id ? Number(id) : null
})

watch(
  dashboardIdFromRoute,
  (id) => {
    dashboardStore.selectDashboard(id ?? null)
  },
  { immediate: true },
)

const selectedDashboardId = computed(() => dashboardStore.selectedDashboardId)

// Tells dashboards from groups; the whole tree is loaded up front.
const selectedTreeNode = computed(() => {
  if (rootSelected.value || selectedDashboardId.value == null) return null
  return findNodeInTree(dashboardTree.value, selectedDashboardId.value)
})
const isGroupSelected = computed(() => selectedTreeNode.value?.class === 'DashboardGroup')
const isDashboardSelected = computed(() => selectedTreeNode.value?.class === 'Dashboard')
const hasRouteSelection = computed(() => !rootSelected.value && selectedDashboardId.value != null)

// Avoids a bogus detail request for a group id.
const dashboardQueryId = computed(() =>
  isDashboardSelected.value ? selectedDashboardId.value : null,
)

// Reveals the target of a deep link even if its ancestor groups were collapsed.
watch(
  [selectedDashboardId, dashboardTree],
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

watch(selectedDashboardId, (id) => {
  if (id != null) rootSelected.value = false
})

const treeRef = ref(null)

const treeRoots = computed(() => [
  {
    object: rootObject.value,
    label: 'Dashboards',
    fallbackClass: 'DashboardRoot',
    nodes: filteredTree.value,
    emptyText: 'No dashboards found',
  },
])

/** The perspective with no id. */
function rootRowTarget() {
  return { name: 'dashboards', params: {} }
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
  return dashboardTarget(node.id)
}

function handleSelectNode(node) {
  router.push(treeNodeTarget(node))
}

function handleSelectRoot() {
  rootSelected.value = true
  if (selectedDashboardId.value != null) {
    router.push({ name: 'dashboards', params: { dashboardId: undefined } })
  }
}

/**
 * Deleting the open object selects its neighbour in the tree as displayed instead of dropping
 * the user on the home page.
 */
useObjectDeletionNavigation({
  currentId: dashboardIdFromRoute,
  trees: () => [
    { nodes: filteredTree, onSelect: handleSelectNode, onSelectRoot: handleSelectRoot },
  ],
})

const {
  data: dashboardData,
  isLoading: loadingDashboard,
  isError: dashboardIsError,
  error: dashboardError,
  refetch: refetchDashboard,
} = useDashboard(dashboardQueryId)

/** A dashboard made from a template always renders for its forced context object. */
const forcedContextId = computed(() => dashboardData.value?.forcedContextObjectId || 0)

const hasContextSelector = computed(
  () => !forcedContextId.value && dashboardData.value?.showContextSelector === true,
)

// In the route query, so a link reproduces the view; selecting another dashboard drops it.
const selectedContextId = computed(() => {
  const id = Number(route.query.context)
  return Number.isInteger(id) && id > 0 ? id : 0
})

function selectContextObject(id) {
  const query = { ...route.query }
  if (id) query.context = String(id)
  else delete query.context
  router.replace({ name: route.name, params: route.params, query })
}

/** Null renders the dashboard on its own. */
const dashboardContextId = computed(() => {
  if (forcedContextId.value) return forcedContextId.value
  if (hasContextSelector.value) return selectedContextId.value || null
  return null
})

const queryClient = useQueryClient()

/**
 * Invalidates by liveness rather than by key list: widgets own their queries, and a list would
 * silently miss any widget added later. Inactive entries refetch on mount.
 */
function handleRefresh() {
  queryClient.invalidateQueries({ type: 'active' })
}

const sidebarTreeContextMenu = useContextMenu({ domains: ['object'] })
const sidebarTreeMenuRef = ref(null)

function handleSidebarTreeContextMenu(event, node, { selection } = {}) {
  sidebarTreeContextMenu.contextRef.value = {
    object: node,
    viewContext: 'dashboardTree',
    // Outside a range the range has already collapsed, so this is undefined there.
    selection,
  }
  sidebarTreeMenuRef.value?.show(event)
}

function handleShowDashboardPropertiesEvent(event) {
  const node = event.detail.object
  if (node?.id !== selectedDashboardId.value) {
    router.push({ name: 'dashboards', params: { dashboardId: node.id } })
  }
  showProperties.value = true
}

const explainStatusTarget = ref(null)
const explainStatusVisible = ref(false)

function handleExplainStatusEvent(event) {
  explainStatusTarget.value = event.detail.object
  explainStatusVisible.value = true
}

const createObjectVisible = ref(false)
const createObjectParent = ref(null)
const createObjectClass = ref(null)

function handleObjectCreate(event) {
  createObjectParent.value = event.detail?.parent ?? null
  createObjectClass.value = event.detail?.objectClass ?? null
  createObjectVisible.value = true
}

function handleOverviewCreateDashboard(parent) {
  createObjectParent.value = parent ?? null
  createObjectClass.value = 'Dashboard'
  createObjectVisible.value = true
}

function handleOverviewCreateGroup(parent) {
  createObjectParent.value = parent ?? null
  createObjectClass.value = 'DashboardGroup'
  createObjectVisible.value = true
}

onMounted(() => {
  document.addEventListener('object:showDashboardProperties', handleShowDashboardPropertiesEvent)
  document.addEventListener('object:explainStatus', handleExplainStatusEvent)
  document.addEventListener('object:create', handleObjectCreate)
})
onUnmounted(() => {
  document.removeEventListener('object:showDashboardProperties', handleShowDashboardPropertiesEvent)
  document.removeEventListener('object:explainStatus', handleExplainStatusEvent)
  document.removeEventListener('object:create', handleObjectCreate)
})

// The sidebar button creates under DashboardRoot; nested groups go through the context menu.
const createObjectMenuRef = ref(null)
const createObjectMenuItems = computed(() => buildCreateMenuItems(rootObject.value))

function toggleCreateObjectMenu(event) {
  createObjectMenuRef.value?.toggle(event)
}

const toolsPanelOpen = ref(false)
const activeToolsTab = ref('polls')

const showProperties = ref(false)

watch(selectedDashboardId, () => {
  showProperties.value = false
})

const isEditMode = computed({
  get: () => dashboardStore.isEditMode,
  set: (val) => {
    if (val && dashboardData.value) {
      dashboardStore.enterEditMode(dashboardData.value.widgets)
    } else if (!val) {
      dashboardStore.discardChanges()
    }
  },
})

const { mutate: saveDashboard } = useSaveDashboard()
const toast = useToast()

function handleSave(updatedWidgets) {
  if (!selectedDashboardId.value) return
  saveDashboard(
    {
      id: selectedDashboardId.value,
      data: { ...dashboardData.value, widgets: updatedWidgets },
    },
    {
      onSuccess: () => {
        dashboardStore.commitSave()
        toast.add({ severity: 'success', summary: 'Dashboard saved', life: 2000 })
      },
      onError: () => {
        toast.add({ severity: 'error', summary: 'Failed to save dashboard', life: 3000 })
      },
    },
  )
}

function handleDiscard() {
  dashboardStore.discardChanges()
}
</script>

<template>
  <Teleport defer to="#sidebar-content">
    <div class="dashboards-sidebar">
      <SidebarHeader title="Dashboards">
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
        </template>
      </SidebarHeader>
      <SidebarFilter v-model="filterState" placeholder="Filter dashboards..." />

      <ObjectSidebarTree
        ref="treeRef"
        data-tour="object-tree"
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

  <div class="dashboards-content">
    <!-- Nothing selected, or root selected -->
    <DashboardsRootDetailView
      v-if="!hasRouteSelection"
      :tree="dashboardTree"
      :root-id="rootId"
      @create-dashboard="handleOverviewCreateDashboard"
      @create-group="handleOverviewCreateGroup"
    />

    <div v-else-if="loadingTree" class="dash-loading">
      <ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="3" />
      <span>Loading...</span>
    </div>

    <div v-else-if="treeIsError" class="dash-placeholder">
      <QueryErrorState :error="treeError" @retry="refetchTree" />
    </div>

    <DashboardGroupDetailView
      v-else-if="isGroupSelected"
      :node="selectedTreeNode"
      @create-dashboard="handleOverviewCreateDashboard"
      @create-group="handleOverviewCreateGroup"
    />

    <div v-else-if="loadingDashboard" class="dash-loading">
      <ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="3" />
      <span>Loading dashboard...</span>
    </div>

    <div v-else-if="dashboardData && showProperties" class="dash-properties-pane">
      <EntityDetailHeader
        :title="dashboardData.name"
        subtitle="Dashboard Properties"
        @back="showProperties = false"
      />
      <PropertiesView :object="{ id: selectedDashboardId, class: 'Dashboard' }" />
    </div>

    <template v-else-if="dashboardData">
      <div v-if="hasContextSelector" class="dash-context-bar">
        <span class="dash-context-bar__label">Context object</span>
        <ObjectPickerField
          :model-value="selectedContextId"
          empty-label="Select context object"
          dialog-title="Select Context Object"
          @update:model-value="selectContextObject"
        />
      </div>
      <DashboardCanvas
        :key="selectedDashboardId"
        :dashboard="dashboardData"
        :context-object-id="dashboardContextId"
        :edit-mode="isEditMode"
        @update:edit-mode="isEditMode = $event"
        @save="handleSave"
        @discard="handleDiscard"
        @refresh="handleRefresh"
        @open-properties="showProperties = true"
        @open-tools-panel="
          (tab) => {
            activeToolsTab = tab
            toolsPanelOpen = true
          }
        "
      />
      <DemoNoticeBanner
        v-if="isDemoDashboardId(selectedDashboardId)"
        message="This is a demo dashboard; edits are saved locally in your browser only."
      />
    </template>

    <div v-else class="dash-placeholder">
      <QueryErrorState v-if="dashboardIsError" :error="dashboardError" @retry="refetchDashboard" />
      <template v-else>
        <i class="pi pi-exclamation-circle" />
        <h3>Dashboard not available</h3>
        <p>The selected dashboard could not be loaded.</p>
      </template>
    </div>
  </div>

  <ActionContextMenu ref="sidebarTreeMenuRef" :items="sidebarTreeContextMenu.menuItems.value" />
  <StatusExplanationDialog
    v-if="explainStatusVisible"
    visible
    @update:visible="explainStatusVisible = $event"
    :object="explainStatusTarget"
  />

  <ObjectToolsPanel
    v-model="toolsPanelOpen"
    v-model:active-tab="activeToolsTab"
    :object-id="selectedDashboardId"
    title="Dashboard Tools"
    title-icon="pi pi-wrench"
    object-label="Dashboard"
    :polls="[{ id: 'automaticBinding', label: 'Automatic Binding', icon: 'pi pi-link' }]"
  />

  <!-- Triggered via the object:create DOM event -->
  <CreateObjectDialog
    v-model:visible="createObjectVisible"
    :parent-object="createObjectParent"
    :object-class="createObjectClass"
    @created="
      (created) => {
        if (created.class === 'Dashboard')
          router.push({ name: 'dashboards', params: { dashboardId: created.id } })
      }
    "
  />
</template>

<style scoped>
.dashboards-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: -0.75rem;
}

.dashboards-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* Context object bar */
.dash-context-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  flex-shrink: 0;
}

.dash-context-bar__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  flex-shrink: 0;
}

.dash-properties-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.dash-placeholder,
.dash-loading {
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

.dash-placeholder i {
  font-size: 3rem;
  opacity: 0.25;
}

.dash-placeholder h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.dash-placeholder p {
  margin: 0;
  font-size: 0.875rem;
  max-width: 320px;
  line-height: 1.5;
}

.dash-loading {
  gap: 1rem;
  font-size: 0.875rem;
}
</style>
