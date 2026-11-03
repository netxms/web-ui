<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import { useObject, useObjectChildren } from '@/queries/useObjectQueries'
import { getStatusInfo } from '@/utils/objectUtils'
import { objectTarget } from '@/utils/routeTargets'
import { useNavTarget } from '@/composables/useNavTarget'
import { useEffectiveObjectId } from '@/composables/useDashboardContext'

const props = defineProps({
  widget: { type: Object, required: true },
})

const router = useRouter()
const { navBindings } = useNavTarget()
const effectiveObjectId = useEffectiveObjectId(() => props.widget.config?.objectId)
const objectId = computed(() => effectiveObjectId.value || null)

const {
  data: nodeDetails,
  isLoading: nodeLoading,
  isError: nodeIsError,
  error: nodeError,
  refetch: refetchNode,
} = useObject(objectId)
const portRowCount = computed(() => nodeDetails.value?.portRowCount || 2)

const {
  data: allInterfaces,
  isLoading: interfacesLoading,
  isError: interfacesIsError,
  refetch: refetchInterfaces,
} = useObjectChildren(objectId, ['Interface'])

const isLoading = computed(() => nodeLoading.value || interfacesLoading.value)
const isError = computed(() => nodeIsError.value || interfacesIsError.value)

const physicalPorts = computed(() => {
  const ports = (allInterfaces.value ?? []).filter((i) => i.isPhysicalPort)
  return ports.sort((a, b) => {
    const la = a.physicalLocation
    const lb = b.physicalLocation
    return la.chassis - lb.chassis || la.module - lb.module || la.pic - lb.pic || la.port - lb.port
  })
})

// A simple sequential grid; the numbering-scheme layout lives in PortsView.vue.
const portGrid = computed(() => {
  const ports = physicalPorts.value
  if (!ports.length) return []
  const rows = portRowCount.value
  const cols = Math.ceil(ports.length / rows)
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null))
  ports.forEach((port, i) => {
    grid[i % rows][Math.floor(i / rows)] = port
  })
  return grid
})

function refetch() {
  refetchNode()
  refetchInterfaces()
}

function portTarget(port) {
  return objectTarget({ id: port.id }, 'status', { perspective: 'infrastructure' })
}

function goToInterface(port) {
  router.push(portTarget(port))
}
</script>

<template>
  <div class="port-view-widget">
    <div v-if="!objectId" class="pvw-state">
      <i class="pi pi-sitemap" />
      <span>No object configured</span>
    </div>
    <div v-else-if="isLoading" class="pvw-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading&hellip;</span>
    </div>
    <div v-else-if="isError" class="pvw-state pvw-state--error">
      <QueryErrorState :error="nodeError" message="Failed to load ports" @retry="refetch" />
    </div>
    <div v-else-if="!physicalPorts.length" class="pvw-state">
      <i class="pi pi-th-large" />
      <span>No physical ports on this object</span>
    </div>
    <div v-else class="pvw-grid">
      <div v-for="(row, ri) in portGrid" :key="ri" class="pvw-row">
        <button
          v-for="(port, ci) in row"
          :key="ci"
          class="pvw-port"
          :class="{ 'pvw-port--empty': !port }"
          :style="port ? { '--port-color': getStatusInfo(port.status).color } : {}"
          :disabled="!port"
          :title="port ? port.name : undefined"
          v-bind="navBindings(port ? portTarget(port) : null, () => port && goToInterface(port))"
        >
          {{ port ? port.physicalLocation.port || port.bridgePortNumber || '-' : '' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.port-view-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
}

.pvw-grid {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.25rem;
}

.pvw-row {
  display: flex;
  gap: 0.2rem;
}

.pvw-port {
  flex: 1;
  min-width: 1.5rem;
  height: 1.5rem;
  border-radius: 3px;
  border: 1.5px solid var(--port-color, var(--p-surface-300));
  background: color-mix(in srgb, var(--port-color, var(--p-surface-300)) 15%, transparent);
  color: var(--p-text-color);
  font-size: 0.625rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.pvw-port:hover:not(:disabled) {
  filter: brightness(1.1);
}

.pvw-port--empty {
  border-color: transparent;
  background: transparent;
  cursor: default;
}

.pvw-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.pvw-state i {
  font-size: 1.5rem;
  opacity: 0.3;
}

.pvw-state--error {
  color: var(--p-red-400, #f87171);
}
</style>
