<script setup>
import { ref, computed, inject, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ProgressSpinner from 'primevue/progressspinner'
import ContextMenu from 'primevue/contextmenu'
import TopologyCanvas from '@/components/topology/TopologyCanvas.vue'
import TopologyToolbar from '@/components/topology/TopologyToolbar.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useTopology } from '@/queries/useTopologyQueries'
import { objectTarget } from '@/utils/routeTargets'
import {
  TOPOLOGY_TYPES,
  applyLayout,
  topologyToNodes,
  topologyToEdges,
} from '@/utils/topologyUtils'

const props = defineProps({
  object: { type: Object, required: true },
})

const route = useRoute()
const router = useRouter()

const canvasRef = ref(null)
const nodeContextMenuRef = ref(null)
const nodeContextMenuItems = ref([])

const VALID_TYPES = new Set(Object.values(TOPOLOGY_TYPES))
const activeType = ref(VALID_TYPES.has(route.query.type) ? route.query.type : TOPOLOGY_TYPES.L2)
const activeLayout = ref('radial')
const searchTerm = ref('')

const objectId = computed(() => props.object?.id ?? null)
const rootObjectId = computed(() => props.object?.id ?? null)

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
})

const nodes = computed(() => (topologyData.value ? topologyToNodes(topologyData.value) : {}))
const edges = computed(() => (topologyData.value ? topologyToEdges(topologyData.value) : {}))

// Stable reference: an inline literal would make TopologyCanvas rebuild every cytoscape
// element on each re-render, wiping node selection.
const canvasTopologyData = computed(() => ({ nodes: nodes.value, edges: edges.value }))

const layouts = ref({ nodes: {} })

function recomputeLayout() {
  layouts.value = applyLayout(
    activeLayout.value,
    nodes.value,
    edges.value,
    rootObjectId.value !== null ? String(rootObjectId.value) : null,
  )
}

watch([nodes, edges, activeLayout], recomputeLayout, { immediate: true })

// Fit only after an object/type/layout switch, not on background refreshes, which keep the
// user's zoom/pan.
const pendingFit = ref(true)

watch([objectId, activeType, activeLayout], () => {
  pendingFit.value = true
})

watch(layouts, () => {
  if (!pendingFit.value) return
  pendingFit.value = false
  nextTick(() => canvasRef.value?.fitContent())
})

watch([objectId, activeType], () => {
  searchTerm.value = ''
})

function handleNodeContextMenu({ node, event }) {
  const nodeData = nodes.value[node]
  if (!nodeData) return
  nodeContextMenuItems.value = [
    { label: nodeData.name || 'Node', class: 'context-menu-header', disabled: true },
    { separator: true },
    {
      label: 'Open',
      icon: 'pi pi-external-link',
      // A context-menu command carries no modifier state, so a plain navigation.
      command: () => router.push(objectTarget({ id: nodeData.objectId })),
    },
  ]
  nodeContextMenuRef.value?.show(event)
}

function handleTypeChange(type) {
  activeType.value = type
  router.replace({ query: { ...route.query, type } })
}

function handleLayoutChange(layout) {
  activeLayout.value = layout
}

function handleRefresh() {
  refetch()
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
      :active-layout="activeLayout"
      :search-term="searchTerm"
      :is-fetching="isFetching && !isLoading"
      :disabled-types="disabledTypes"
      @type-change="handleTypeChange"
      @layout-change="handleLayoutChange"
      @update:search-term="searchTerm = $event"
      @fit="canvasRef?.fitContent()"
      @zoom-in="canvasRef?.zoomIn()"
      @zoom-out="canvasRef?.zoomOut()"
      @refresh="handleRefresh"
    />

    <div class="topology-body">
      <div v-if="isCapabilityBlocked" class="topology-overlay topology-empty">
        <i class="pi pi-info-circle" />
        <span>{{ capabilityRequired }}</span>
      </div>

      <!-- First fetch only -->
      <div v-else-if="isLoading" class="topology-overlay">
        <ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="3" />
      </div>

      <div v-else-if="errorMessage" class="topology-overlay topology-error">
        <QueryErrorState :message="errorMessage" :retrying="isFetching" @retry="refetch" />
      </div>

      <div
        v-else-if="!topologyData || Object.keys(nodes).length === 0"
        class="topology-overlay topology-empty"
      >
        <i class="pi pi-share-alt" />
        <span>No topology data available.</span>
      </div>

      <TopologyCanvas
        v-else
        ref="canvasRef"
        :topology-data="canvasTopologyData"
        :layouts="layouts"
        :search-term="searchTerm"
        :root-object-id="rootObjectId"
        @node-contextmenu="handleNodeContextMenu"
        @viewport-change="nodeContextMenuRef?.hide()"
      />
    </div>

    <ContextMenu ref="nodeContextMenuRef" :model="nodeContextMenuItems" />
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
</style>
