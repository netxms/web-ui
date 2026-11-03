<script setup>
import { computed, ref, watch, provide, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import SidebarHeader from '@/components/layout/SidebarHeader.vue'
import SidebarFilter from '@/components/layout/SidebarFilter.vue'
import ObjectSidebarTree from '@/components/objects/ObjectSidebarTree.vue'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'
import ObjectHeader from '@/components/layout/ObjectHeader.vue'
import ViewTabBar from '@/components/views/ViewTabBar.vue'
import ViewContainer from '@/components/views/ViewContainer.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import CreateObjectDialog from '@/components/objects/CreateObjectDialog.vue'
import CreateAssetDialog from '@/components/objects/CreateAssetDialog.vue'
import { useContextMenu } from '@/composables/useContextMenu'
import { useActions } from '@/composables/useActions'
import { useObjects, useObjectTree, useObject, objectKeys } from '@/queries/useObjectQueries'
import { useQueryClient } from '@tanstack/vue-query'
import { useSelectionStore } from '@/stores/selectionStore'
import { useViewStore } from '@/stores/viewStore'
import { objectTarget } from '@/utils/routeTargets'
import { buildCreateMenuItems } from '@/utils/createMenuItems'
import { useObjectDeletionNavigation } from '@/composables/useObjectDeletionNavigation'
import { useWorkingState } from '@/composables/useWorkingState'
import { findNodeByPath } from '@/utils/objectTreeNavigation'
import { filterObjectTree } from '@/utils/objectTreeSort'

const PERSPECTIVE_ID = 'assets'
const DEFAULT_ROOT_ID = 5

const route = useRoute()
const router = useRouter()
const selectionStore = useSelectionStore()
const viewStore = useViewStore()

const queryClient = useQueryClient()

const refreshSignal = ref(0)
provide('viewRefreshSignal', refreshSignal)

function handleRefresh() {
  queryClient.invalidateQueries({ queryKey: ['objects', 'subTree'] })
  queryClient.invalidateQueries({ queryKey: ['objects', 'list'] })
  const selectedId = selectionStore.primaryObject?.id
  if (selectedId) {
    queryClient.invalidateQueries({ queryKey: objectKeys.detail(selectedId) })
  }
  refreshSignal.value++
}

const treeContextMenu = useContextMenu({ domains: ['object'] })
const treeMenuRef = ref(null)

function handleTreeContextMenu(event, node, { selection } = {}) {
  // A right click outside a multi-selection has already collapsed it, so `selection` is
  // undefined there.
  treeContextMenu.contextRef.value = { object: node, viewContext: 'assetsTree', selection }
  treeMenuRef.value?.show(event)
}

// Header actions use the tree context menu's registry.
const headerContext = computed(() =>
  selectionStore.primaryObject
    ? { object: selectionStore.primaryObject, viewContext: 'assetsTree' }
    : null,
)
const { primaryActions: headerPrimaryActions, menuItems: headerMenuItems } = useActions(
  headerContext,
  { domains: ['object'] },
)

const createObjectVisible = ref(false)
const createObjectParent = ref(null)
const createObjectClass = ref(null)

function handleObjectCreate(event) {
  createObjectParent.value = event.detail?.parent ?? null
  createObjectClass.value = event.detail?.objectClass ?? null
  createObjectVisible.value = true
}

const createAssetVisible = ref(false)
const createAssetParent = ref(null)

function handleAssetCreate(event) {
  createAssetParent.value = event.detail?.parent ?? null
  createAssetVisible.value = true
}

onMounted(() => {
  document.addEventListener('object:create', handleObjectCreate)
  document.addEventListener('asset:create', handleAssetCreate)
})
onUnmounted(() => {
  document.removeEventListener('object:create', handleObjectCreate)
  document.removeEventListener('asset:create', handleAssetCreate)
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
  () => (allRootObjects.value ?? []).find((o) => o.class === 'AssetRoot')?.id ?? DEFAULT_ROOT_ID,
)

const { data: rootObject } = useObject(rootId)

const { data: treeData, isLoading: loadingTree } = useObjectTree(rootId)
const objectTree = computed(() => treeData.value ?? [])

const filterState = ref({ text: '', tokens: [] })

useWorkingState('tree', { view: { filterState } })
const expandedIds = ref(new Set())

watch(
  objectTree,
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
  {
    id: 'assets',
    label: 'Assets',
    icon: 'pi pi-table',
    objectClasses: ['AssetRoot', 'AssetGroup'],
  },
  {
    id: 'asset',
    label: 'Asset',
    icon: 'pi pi-list',
    objectClasses: ['Asset'],
  },
  { id: 'properties', label: 'Properties', icon: 'pi pi-cog' },
]

const viewComponents = {
  assets: () => import('@/views/assets/subviews/AssetsGroupView.vue'),
  asset: () => import('@/views/assets/subviews/AssetDetailView.vue'),
  properties: () => import('@/views/objects/subviews/PropertiesView.vue'),
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
  return views.find((v) => isViewCompatibleWith(v.id, objectClass))?.id ?? 'properties'
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
  return compatibleViewIds.value[0] || 'properties'
})

const activeViewComponent = computed(() => viewComponents[activeView.value] || null)

const activeViewProps = computed(() => ({ object: selectionStore.primaryObject }))

/** Ctrl/middle click opens that view in a new tab. */
function viewTabTarget(viewId) {
  return { name: 'assets', params: { objectId: objectIdFromRoute.value, viewId } }
}

function handleViewSelect(viewId) {
  viewStore.setActiveView(PERSPECTIVE_ID, viewId)
  router.push(viewTabTarget(viewId))
}

const treeRef = ref(null)

const treeRoots = computed(() => [
  {
    object: rootObject.value,
    label: 'Assets',
    fallbackClass: 'AssetRoot',
    nodes: filteredTree.value,
    emptyText: 'No assets found',
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
    perspective: 'assets',
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

// With no object in the URL, select the Assets root once loaded. A present-but-unresolved id
// is left to the not-found state.
watch(
  [objectIdFromRoute, rootObject],
  ([objectId, root]) => {
    if (objectId || !root) return
    router.replace({
      name: 'assets',
      params: { objectId: String(rootId.value), viewId: findBestView('assets', root.class) },
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
    name: 'assets',
    params: { objectId: objectIdFromRoute.value, viewId: fallback },
  })
})
</script>

<template>
  <Teleport defer to="#sidebar-content">
    <div class="assets-sidebar">
      <SidebarHeader title="Assets">
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
      <SidebarFilter v-model="filterState" placeholder="Filter assets..." />

      <ObjectSidebarTree
        ref="treeRef"
        :roots="treeRoots"
        :expanded-ids="expandedIds"
        :selected-path="selectedPath"
        :loading="loadingTree"
        :target-for="treeNodeTarget"
        :root-target-for="treeNodeTarget"
        :resolve-path="resolveTreePath"
        @select="handleSelectNode"
        @contextmenu="handleTreeContextMenu"
        @toggle="handleToggle"
        @selection-change="handleSelectionChange"
      />
    </div>
  </Teleport>

  <ActionContextMenu ref="treeMenuRef" :items="treeContextMenu.menuItems.value" />

  <!-- Triggered via the object:create DOM event (AssetGroup) -->
  <CreateObjectDialog
    v-model:visible="createObjectVisible"
    :parent-object="createObjectParent"
    :object-class="createObjectClass"
    @created="(created) => router.push({ name: 'assets', params: { objectId: created.id } })"
  />

  <!-- Triggered via the asset:create DOM event -->
  <CreateAssetDialog v-model:visible="createAssetVisible" :parent-object="createAssetParent" />

  <div class="assets-view">
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
      @refresh="handleRefresh"
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
      title="Asset not found"
      message="This asset may have been deleted or is no longer accessible. Select an asset or group from the tree."
    />
  </div>
</template>

<style scoped>
.assets-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: -0.75rem;
}

.assets-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: -1rem;
  height: calc(100% + 1rem);
}
</style>
