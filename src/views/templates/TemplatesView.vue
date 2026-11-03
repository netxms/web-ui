<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import SidebarHeader from '@/components/layout/SidebarHeader.vue'
import SidebarFilter from '@/components/layout/SidebarFilter.vue'
import ObjectSidebarTree from '@/components/objects/ObjectSidebarTree.vue'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'
import StatusExplanationDialog from '@/components/objects/StatusExplanationDialog.vue'
import CreateObjectDialog from '@/components/objects/CreateObjectDialog.vue'
import TemplateGroupPickerDialog from '@/components/objects/TemplateGroupPickerDialog.vue'
import ObjectHeader from '@/components/layout/ObjectHeader.vue'
import ViewTabBar from '@/components/views/ViewTabBar.vue'
import ViewContainer from '@/components/views/ViewContainer.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useToast } from 'primevue/usetoast'
import {
  useObjects,
  useObjectTree,
  useObject,
  useBindObjectChild,
  useUnbindObjectChild,
  objectKeys,
} from '@/queries/useObjectQueries'
import { getObject } from '@/api/objectsApi'
import { queryClient } from '@/queries/config'
import { useContextMenu } from '@/composables/useContextMenu'
import { useActions } from '@/composables/useActions'
import { useSelectionStore } from '@/stores/selectionStore'
import { useViewStore } from '@/stores/viewStore'
import { objectTarget } from '@/utils/routeTargets'
import { buildCreateMenuItems } from '@/utils/createMenuItems'
import { useObjectDeletionNavigation } from '@/composables/useObjectDeletionNavigation'
import { useWorkingState } from '@/composables/useWorkingState'
import { findNodeByPath } from '@/utils/objectTreeNavigation'
import { filterObjectTree } from '@/utils/objectTreeSort'
import { moveObjectsToGroup } from '@/utils/moveToGroup'

const PERSPECTIVE_ID = 'templates'
const DEFAULT_ROOT_ID = 3

const route = useRoute()
const router = useRouter()
const selectionStore = useSelectionStore()
const viewStore = useViewStore()

const treeContextMenu = useContextMenu({ domains: ['template'] })
const treeMenuRef = ref(null)
const contextMenuTargetObject = ref(null)

function handleTreeContextMenu(event, node, { selection } = {}) {
  contextMenuTargetObject.value = node
  treeContextMenu.contextRef.value = {
    object: node,
    viewContext: 'templateTree',
    // Outside a range the range has already collapsed, so this is undefined there.
    selection,
  }
  treeMenuRef.value?.show(event)
}

// Header actions use the tree context menu's registry.
const headerContext = computed(() =>
  selectionStore.primaryObject
    ? { object: selectionStore.primaryObject, viewContext: 'templateTree' }
    : null,
)
const { primaryActions: headerPrimaryActions, menuItems: headerMenuItems } = useActions(
  headerContext,
  { domains: ['template'] },
)

const explainStatusTarget = ref(null)
const explainStatusVisible = ref(false)

function handleExplainStatusEvent(event) {
  explainStatusTarget.value = event.detail.object
  explainStatusVisible.value = true
}

function handleExpandAllChildren(event) {
  const { object } = event.detail
  const next = new Set(expandedIds.value)

  function expandDescendants(nodes, parentPath) {
    for (const node of nodes) {
      const path = parentPath ? `${parentPath}-${node.id}` : String(node.id)
      if (node.children?.length) {
        next.add(path)
        expandDescendants(node.children, path)
      }
    }
  }

  if (object.id === rootId.value) {
    next.add(String(rootId.value))
    expandDescendants(objectTree.value, String(rootId.value))
  } else {
    const result = findNodeAndPath(objectTree.value, object.id)
    if (result?.node.children?.length) {
      next.add(result.path)
      expandDescendants(result.node.children, result.path)
    }
  }
  expandedIds.value = next
}

const createObjectVisible = ref(false)
const createObjectParent = ref(null)
const createObjectClass = ref(null)

function handleObjectCreate(event) {
  createObjectParent.value = event.detail?.parent ?? null
  createObjectClass.value = event.detail?.objectClass ?? null
  createObjectVisible.value = true
}

const toast = useToast()
const { mutateAsync: bindChildAsync } = useBindObjectChild()
const { mutateAsync: unbindChildAsync } = useUnbindObjectChild()

const moveToGroupTargets = ref([])
const moveToGroupVisible = ref(false)

function handleMoveToGroup(event) {
  moveToGroupTargets.value = event.detail?.objects ?? []
  moveToGroupVisible.value = true
}

/**
 * Read through the query cache, so a row the tree already loaded costs nothing; the selection
 * has unknown length, so `useObject` cannot serve this.
 */
function fetchParents(objectId) {
  return queryClient.fetchQuery({
    queryKey: objectKeys.detail(objectId),
    queryFn: () => getObject(objectId),
  })
}

/**
 * Every selected object moves, not just the right-clicked one. The bind/unbind order lives in
 * moveObjectsToGroup().
 */
async function onMoveGroupSelected(group) {
  const objects = moveToGroupTargets.value ?? []
  if (!group || objects.length === 0) return

  const { succeeded, failed } = await moveObjectsToGroup({
    objects,
    group,
    fetchParents,
    bind: bindChildAsync,
    unbind: unbindChildAsync,
  })

  if (succeeded.length > 0) {
    toast.add({
      severity: 'success',
      summary:
        succeeded.length === 1
          ? `Moved to ${group.name}`
          : `${succeeded.length} objects moved to ${group.name}`,
      life: 2500,
    })
  }

  // 403 is already toasted by api/client.js; anything else needs saying here.
  const reportable = failed.filter((failure) => failure.status !== 403)
  if (reportable.length > 0) {
    toast.add({
      severity: 'error',
      summary:
        reportable.length === 1 ? 'Move failed' : `Could not move ${reportable.length} objects`,
      detail:
        reportable.length === 1
          ? (reportable[0].message ?? reportable[0].name)
          : reportable.map((failure) => failure.name).join(', '),
      life: 5000,
    })
  }
}

onMounted(() => {
  document.addEventListener('object:explainStatus', handleExplainStatusEvent)
  document.addEventListener('template:expandAllChildren', handleExpandAllChildren)
  document.addEventListener('object:create', handleObjectCreate)
  document.addEventListener('template:moveToGroup', handleMoveToGroup)
})

onUnmounted(() => {
  document.removeEventListener('object:explainStatus', handleExplainStatusEvent)
  document.removeEventListener('template:expandAllChildren', handleExpandAllChildren)
  document.removeEventListener('object:create', handleObjectCreate)
  document.removeEventListener('template:moveToGroup', handleMoveToGroup)
})

const createObjectMenuRef = ref(null)
const createObjectMenuTarget = computed(
  () => selectionStore.primaryObject ?? rootObject.value ?? null,
)
const createObjectMenuItems = computed(() => buildCreateMenuItems(createObjectMenuTarget.value))

function toggleCreateObjectMenu(event) {
  createObjectMenuRef.value?.toggle(event)
}

const { data: allRootObjects } = useObjects()
const rootId = computed(
  () => (allRootObjects.value ?? []).find((o) => o.class === 'TemplateRoot')?.id ?? DEFAULT_ROOT_ID,
)

const { data: rootObjectData } = useObject(rootId)

/**
 * `GET /v1/objects/{id}` never returns children, so actions like Expand all children would
 * read the root as empty; the tree is grafted on.
 */
const rootObject = computed(() =>
  rootObjectData.value ? { ...rootObjectData.value, children: objectTree.value } : null,
)

const {
  data: treeData,
  isLoading: loadingTree,
  isError: treeIsError,
  error: treeError,
  refetch: refetchTree,
} = useObjectTree(rootId)
const objectTree = computed(() => treeData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('tree', { view: { filterState } })
const expandedIds = ref(new Set(viewStore.getExpandedIds(PERSPECTIVE_ID)))

watch(expandedIds, (ids) => viewStore.setExpandedIds(PERSPECTIVE_ID, [...ids]))

watch(
  rootId,
  (id) => {
    if (!expandedIds.value.has(String(id))) {
      expandedIds.value = new Set([...expandedIds.value, String(id)])
    }
  },
  { immediate: true },
)

const filteredTree = computed(() => filterObjectTree(objectTree.value, filterState.value.text))

function handleToggle(path) {
  const next = new Set(expandedIds.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expandedIds.value = next
}

function findNodeAndPath(nodes, targetId, parentPath = '') {
  for (const node of nodes) {
    const nodePath = parentPath ? `${parentPath}-${node.id}` : String(node.id)
    if (node.id === targetId) return { node, path: nodePath }
    if (node.children?.length) {
      const result = findNodeAndPath(node.children, targetId, nodePath)
      if (result) return result
    }
  }
  return null
}

const objectIdFromRoute = computed(() => route.params.objectId)
const viewIdFromRoute = computed(() => route.params.viewId)

const selectedPath = ref(null)

const views = [
  { id: 'status', label: 'Status', icon: 'pi pi-info-circle' },
  { id: 'properties', label: 'Properties', icon: 'pi pi-cog' },
  { id: 'comments', label: 'Comments', icon: 'pi pi-comments' },
  {
    id: 'dataCollection',
    label: 'Data Collection',
    icon: 'pi pi-chart-bar',
    objectClasses: ['Template'],
  },
  {
    id: 'policies',
    label: 'Agent Policies',
    icon: 'pi pi-file-edit',
    objectClasses: ['Template'],
  },
  {
    id: 'targets',
    label: 'Targets',
    icon: 'pi pi-sitemap',
    objectClasses: ['Template'],
  },
  {
    id: 'polls',
    label: 'Polls',
    icon: 'pi pi-sync',
    objectClasses: ['TemplateGroup', 'TemplateRoot'],
  },
]

const viewComponents = {
  status: () => import('@/views/objects/subviews/StatusView.vue'),
  properties: () => import('@/views/objects/subviews/PropertiesView.vue'),
  comments: () => import('@/views/objects/subviews/CommentsView.vue'),
  dataCollection: () => import('@/views/objects/subviews/DCIsView.vue'),
  policies: () => import('@/views/objects/subviews/AgentPoliciesView.vue'),
  targets: () => import('@/views/objects/subviews/TargetsView.vue'),
  polls: () => import('@/views/objects/subviews/PollsView.vue'),
}

function isViewCompatibleWith(viewId, objectClass) {
  const view = views.find((v) => v.id === viewId)
  if (!view) return false
  if (view.objectClasses && !view.objectClasses.includes(objectClass)) return false
  return true
}

const currentObjectClass = computed(() => selectionStore.primaryObject?.class ?? null)

const DEFAULT_VIEW_IDS = views.map((v) => v.id)

const visibleViewIds = computed(() => viewStore.getVisibleViewIds(PERSPECTIVE_ID, DEFAULT_VIEW_IDS))

const compatibleViewIds = computed(() => {
  const cls = currentObjectClass.value
  if (!cls) return visibleViewIds.value
  return visibleViewIds.value.filter((id) => isViewCompatibleWith(id, cls))
})

function handleViewReorder(reorderedCompatible) {
  const cls = currentObjectClass.value
  const hiddenIds = cls ? visibleViewIds.value.filter((id) => !isViewCompatibleWith(id, cls)) : []
  viewStore.setViewOrder(PERSPECTIVE_ID, [...reorderedCompatible, ...hiddenIds])
}

function findBestView(preferredViewId, objectClass) {
  const classPreferred = viewStore.getActiveViewForClass(PERSPECTIVE_ID, objectClass)
  if (classPreferred && isViewCompatibleWith(classPreferred, objectClass)) return classPreferred
  if (preferredViewId && isViewCompatibleWith(preferredViewId, objectClass)) return preferredViewId
  return views.find((v) => isViewCompatibleWith(v.id, objectClass))?.id ?? 'status'
}

const activeView = computed(() => {
  const viewId = viewIdFromRoute.value
  if (viewId && views.some((v) => v.id === viewId)) return viewId
  const cls = currentObjectClass.value
  if (cls) {
    const classView = viewStore.getActiveViewForClass(PERSPECTIVE_ID, cls)
    if (classView && compatibleViewIds.value.includes(classView)) return classView
  }
  const stored = viewStore.getActiveView(PERSPECTIVE_ID)
  if (stored && compatibleViewIds.value.includes(stored)) return stored
  return compatibleViewIds.value[0] || 'status'
})

const activeViewComponent = computed(() => {
  if (
    activeView.value === 'status' &&
    ['TemplateGroup', 'TemplateRoot'].includes(currentObjectClass.value)
  ) {
    return () => import('@/views/objects/subviews/TemplateGroupOverviewView.vue')
  }
  return viewComponents[activeView.value] || null
})

const activeViewProps = computed(() => ({ object: selectionStore.primaryObject }))

/** Ctrl/middle click opens that view in a new tab. */
function viewTabTarget(viewId) {
  return { name: 'templates', params: { objectId: objectIdFromRoute.value, viewId } }
}

function handleViewSelect(viewId) {
  viewStore.setActiveView(PERSPECTIVE_ID, viewId)
  router.push(viewTabTarget(viewId))
}

const treeRef = ref(null)

const treeRoots = computed(() => [
  {
    object: rootObject.value,
    label: 'Templates',
    fallbackClass: 'TemplateRoot',
    nodes: filteredTree.value,
    emptyText: 'No templates found',
  },
])

function resolveTreePath(path) {
  if (path === String(rootId.value)) return rootObject.value
  return findNodeByPath(filteredTree.value, path)
}

function handleSelectionChange(objects) {
  selectionStore.setPrimarySelection(
    objects.length ? objects : [selectionStore.primaryObject].filter(Boolean),
  )
}

/** Includes the view a plain click would land on. */
function treeNodeTarget(node) {
  return objectTarget(node, findBestView(activeView.value, node.class), {
    perspective: 'templates',
  })
}

function handleSelectNode(node, nodePath) {
  selectedPath.value = nodePath
  router.push(treeNodeTarget(node))
}

/**
 * Deleting the open object selects its neighbour in the tree as displayed instead of dropping
 * the user on the home page.
 */
useObjectDeletionNavigation({
  currentId: objectIdFromRoute,
  trees: () => [
    {
      nodes: filteredTree,
      onSelect: handleSelectNode,
      onSelectRoot: () =>
        rootObject.value && handleSelectNode(rootObject.value, String(rootId.value)),
    },
  ],
})

watch(
  [objectIdFromRoute, objectTree],
  ([objectId]) => {
    if (!objectId) {
      selectedPath.value = null
      selectionStore.clearSelection()
      return
    }

    const numericId = Number(objectId)
    if (Number.isNaN(numericId)) return

    // The root object lives outside the subtree.
    if (numericId === rootId.value) {
      selectedPath.value = String(rootId.value)
      if (rootObject.value) selectionStore.selectPrimary(rootObject.value)
      return
    }

    const result = findNodeAndPath(objectTree.value, numericId)
    if (!result) {
      selectedPath.value = null
      selectionStore.clearSelection()
      return
    }

    selectedPath.value = result.path
    selectionStore.selectPrimary(result.node)

    const segments = result.path.split('-')
    if (segments.length > 1) {
      const next = new Set(expandedIds.value)
      let acc = ''
      for (const segment of segments.slice(0, -1)) {
        acc = acc ? `${acc}-${segment}` : segment
        next.add(acc)
      }
      expandedIds.value = next
    }
  },
  { immediate: true },
)

// With no object in the URL, select the Templates root once loaded. A present-but-unresolved
// id is left to the not-found state.
watch(
  [objectIdFromRoute, rootObject],
  ([objectId, root]) => {
    if (objectId || !root) return
    router.replace({
      name: 'templates',
      params: { objectId: String(rootId.value), viewId: findBestView('status', root.class) },
    })
  },
  { immediate: true },
)

// The root object may load after the route watcher fires.
watch(rootObject, (obj) => {
  if (!obj) return
  if (Number(objectIdFromRoute.value) === rootId.value) {
    selectionStore.selectPrimary(obj)
  }
})

watch([viewIdFromRoute, currentObjectClass], ([viewId, objectClass]) => {
  if (!objectClass || !objectIdFromRoute.value) return
  if (viewId && isViewCompatibleWith(viewId, objectClass)) {
    viewStore.setActiveViewForClass(PERSPECTIVE_ID, objectClass, viewId)
    return
  }

  const fallback = findBestView(viewId, objectClass)
  router.replace({
    name: 'templates',
    params: { objectId: objectIdFromRoute.value, viewId: fallback },
  })
})
</script>

<template>
  <Teleport defer to="#sidebar-content">
    <div class="templates-sidebar">
      <SidebarHeader title="Templates">
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
      <SidebarFilter v-model="filterState" placeholder="Filter templates..." />

      <ObjectSidebarTree
        ref="treeRef"
        :roots="treeRoots"
        :expanded-ids="expandedIds"
        :selected-path="selectedPath"
        :loading="loadingTree"
        :error="treeIsError ? treeError : null"
        :target-for="treeNodeTarget"
        :root-target-for="treeNodeTarget"
        :resolve-path="resolveTreePath"
        @select="handleSelectNode"
        @contextmenu="handleTreeContextMenu"
        @toggle="handleToggle"
        @selection-change="handleSelectionChange"
        @retry="refetchTree"
      />
    </div>
  </Teleport>

  <ActionContextMenu ref="treeMenuRef" :items="treeContextMenu.menuItems.value" />

  <!-- Triggered via the object:explainStatus DOM event -->
  <StatusExplanationDialog
    v-if="explainStatusVisible"
    visible
    @update:visible="explainStatusVisible = $event"
    :object="explainStatusTarget"
  />

  <!-- Triggered via the object:create DOM event -->
  <CreateObjectDialog
    v-model:visible="createObjectVisible"
    :parent-object="createObjectParent"
    :object-class="createObjectClass"
    @created="(created) => router.push({ name: 'templates', params: { objectId: created.id } })"
  />

  <!-- Triggered via the template:moveToGroup DOM event -->
  <TemplateGroupPickerDialog
    v-if="moveToGroupVisible"
    visible
    @update:visible="moveToGroupVisible = $event"
    @select="onMoveGroupSelected"
  />

  <div class="templates-view">
    <ObjectHeader
      :object="selectionStore.primaryObject"
      :actions="headerPrimaryActions"
      :tools-menu-items="headerMenuItems"
    />

    <ViewTabBar
      v-if="selectionStore.primaryObject"
      :views="views"
      :visible-view-ids="compatibleViewIds"
      :active-view="activeView"
      :allow-add-remove="false"
      :target-for="viewTabTarget"
      @select="handleViewSelect"
      @reorder="handleViewReorder"
    />

    <ViewContainer
      v-if="selectionStore.primaryObject"
      :component="activeViewComponent"
      :key="activeView"
      :state-key="activeView"
      :view-props="activeViewProps"
    />

    <EmptyState
      v-else-if="objectIdFromRoute && !loadingTree"
      icon="pi pi-objects-column"
      title="Template not found"
      message="This template may have been deleted or is no longer accessible. Select a template or group from the tree."
    />
  </div>
</template>

<style scoped>
.templates-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: -0.75rem;
}

.templates-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: -1rem;
  height: calc(100% + 1rem);
}
</style>
