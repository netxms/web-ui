<script setup>
import { ref, computed, inject, watch, onMounted, onUnmounted } from 'vue'
import AppTable from '@/components/common/AppTable.vue'
import { useObject, useObjectChildren } from '@/queries/useObjectQueries'
import { getStatusInfo, formatSpeed } from '@/utils/objectUtils'

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object?.id ?? null)

// Full node details (capabilities, port numbering, vlans); a cache hit, as ObjectsView loads it.
const { data: nodeDetails, isLoading: nodeLoading, refetch: refetchNode } = useObject(objectId)

const isBridge = computed(() => !!nodeDetails.value?.capabilities?.isBridge)
const portRowCount = computed(() => nodeDetails.value?.portRowCount || 2)
const portNumberingScheme = computed(() => nodeDetails.value?.portNumberingScheme ?? 0)

const {
  data: allInterfaces,
  isLoading: interfacesLoading,
  refetch: refetchInterfaces,
} = useObjectChildren(objectId, ['Interface'])

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal)
  watch(refreshSignal, () => {
    refetchNode()
    refetchInterfaces()
  })

const interfacesById = computed(() => new Map((allInterfaces.value ?? []).map((i) => [i.id, i])))

// Physical ports only, sorted chassis → module → pic → port
const physicalPorts = computed(() => {
  const ports = (allInterfaces.value ?? []).filter((i) => i.isPhysicalPort)
  return ports.sort((a, b) => {
    const la = a.physicalLocation
    const lb = b.physicalLocation
    return la.chassis - lb.chassis || la.module - lb.module || la.pic - lb.pic || la.port - lb.port
  })
})

const portsBySlot = computed(() => {
  const slots = new Map()
  for (const port of physicalPorts.value) {
    const key = `${port.physicalLocation.chassis}:${port.physicalLocation.module}`
    if (!slots.has(key)) slots.set(key, [])
    slots.get(key).push(port)
  }
  return slots
})

// NDD_PN_* in nddrv.h. 0 (UNKNOWN) and 1 (CUSTOM) fall back to UD_LR.
const PN_LR_UD = 2 // row-major, top-to-bottom:    1 2 3 4 / 5 6 7 8
const PN_LR_DU = 3 // row-major, bottom-to-top:    5 6 7 8 / 1 2 3 4
const PN_UD_LR = 4 // column-major, top-to-bottom: 1 3 5 7 / 2 4 6 8
const PN_DU_LR = 5 // column-major, bottom-to-top: 2 4 6 8 / 1 3 5 7

function buildPortGrid(slotPorts, rows, scheme) {
  if (!slotPorts.length) return []
  const maxPortNum = Math.max(...slotPorts.map((p) => p.physicalLocation.port || 0))

  if (maxPortNum === 0) {
    // No physical location data — sequential fallback
    const colCount = Math.ceil(slotPorts.length / rows)
    const grid = Array.from({ length: rows }, () => Array(colCount).fill(null))
    slotPorts.forEach((port, i) => {
      grid[Math.floor(i / colCount)][i % colCount] = port
    })
    return grid
  }

  const colCount = Math.ceil(maxPortNum / rows)
  const grid = Array.from({ length: rows }, () => Array(colCount).fill(null))

  for (const port of slotPorts) {
    const p = port.physicalLocation.port
    if (!p) continue
    let row, col
    switch (scheme) {
      case PN_LR_UD:
        row = Math.floor((p - 1) / colCount)
        col = (p - 1) % colCount
        break
      case PN_LR_DU:
        row = rows - 1 - Math.floor((p - 1) / colCount)
        col = (p - 1) % colCount
        break
      case PN_DU_LR:
        col = Math.floor((p - 1) / rows)
        row = rows - 1 - ((p - 1) % rows)
        break
      case PN_UD_LR:
      default: // UNKNOWN and CUSTOM: UD_LR, the Java client default
        col = Math.floor((p - 1) / rows)
        row = (p - 1) % rows
        break
    }
    if (row >= 0 && row < rows && col >= 0 && col < colCount) {
      grid[row][col] = port
    }
  }

  return grid
}

const slotGrids = computed(() => {
  const result = []
  for (const [key, ports] of portsBySlot.value) {
    const [chassis, module] = key.split(':').map(Number)
    result.push({
      key,
      label: portsBySlot.value.size === 1 ? 'Main' : `Chassis ${chassis} / Module ${module}`,
      grid: buildPortGrid(ports, portRowCount.value, portNumberingScheme.value),
    })
  }
  return result
})

function formatIpList(list) {
  if (!list?.length) return ''
  return list.map((a) => (typeof a === 'string' ? a : (a.address ?? JSON.stringify(a)))).join(', ')
}

const selectedPort = ref(null)

function selectPort(port) {
  selectedPort.value = selectedPort.value?.id === port.id ? null : port
}

function clearSelection() {
  selectedPort.value = null
}

const isInitialLoading = computed(
  () => nodeLoading.value || (isBridge.value && interfacesLoading.value),
)

const hasNoPhysicalPorts = computed(
  () => !isInitialLoading.value && isBridge.value && physicalPorts.value.length === 0,
)

const skeletonCount = computed(() => props.object?.children?.length ?? 0)

const showPortSkeleton = computed(() => isInitialLoading.value && skeletonCount.value > 0)

const skeletonGrid = computed(() => {
  const count = skeletonCount.value
  const rows = portRowCount.value
  if (!count) return []
  const cols = Math.ceil(count / rows)
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => r * cols + c + 1),
  )
})

const operLabel = (state) => {
  const labels = { 0: 'Unknown', 1: 'Up', 2: 'Down', 3: 'Testing', 4: 'Dormant', 5: 'N/P' }
  return labels[state] ?? '?'
}

function operStateStyle(operState) {
  if (operState === 1) return { bg: 'var(--p-green-100)', color: 'var(--p-green-700)' }
  if (operState === 2) return { bg: 'var(--p-red-100)', color: 'var(--p-red-600)' }
  return { bg: 'var(--p-surface-200)', color: 'var(--p-text-muted-color)' }
}

const adminLabel = (state) => {
  const labels = { 0: 'Unknown', 1: 'Up', 2: 'Down', 3: 'Testing' }
  return labels[state] ?? '?'
}

// Each vlan.ports entry is { ifIndex, objectId, physicalLocation }, not an interface object.
const vlanRows = computed(() => {
  const vlans = nodeDetails.value?.vlans ?? []
  return [...vlans].sort((a, b) => a.id - b.id)
})

const selectedVlan = ref(null)
const hoveredVlan = ref(null)
const vlanTableEl = ref(null)

onMounted(() => document.addEventListener('mousedown', onDocMouseDown))
onUnmounted(() => document.removeEventListener('mousedown', onDocMouseDown))

function onDocMouseDown(e) {
  if (selectedVlan.value && vlanTableEl.value && !vlanTableEl.value.contains(e.target)) {
    selectedVlan.value = null
  }
}

// port.vlans on an interface is number[] (VLAN IDs only)
const highlightedVlanIds = computed(() => {
  if (!selectedPort.value) return new Set()
  return new Set(selectedPort.value.vlans ?? [])
})

// Hover takes precedence over selection.
const highlightedPortIds = computed(() => {
  const vlan = hoveredVlan.value ?? selectedVlan.value
  if (!vlan) return new Set()
  return new Set(vlan.ports.map((p) => p.objectId))
})

function selectVlan(row) {
  selectedVlan.value = selectedVlan.value?.id === row.id ? null : row
}

const VLAN_COLUMNS = [
  { id: 'id', label: 'ID', field: 'id', sortable: true, width: 5 },
  { id: 'name', label: 'Name', field: 'name', sortable: true, width: 10 },
  { id: 'ports', label: 'Ports', width: 15 },
  { id: 'interfaces', label: 'Interfaces', width: 70 },
]

function vlanRowClass(row) {
  return {
    'vlan-row--highlighted': highlightedVlanIds.value.has(row.id),
    'vlan-row--selected': selectedVlan.value?.id === row.id,
  }
}

function formatPortRanges(ports) {
  const groups = new Map()
  for (const port of ports) {
    const { chassis, module, pic, port: portNum } = port.physicalLocation
    const prefix = `${chassis}/${module}/${pic}`
    if (!groups.has(prefix)) groups.set(prefix, [])
    groups.get(prefix).push(portNum)
  }
  const parts = []
  for (const [prefix, nums] of groups) {
    nums.sort((a, b) => a - b)
    let start = nums[0]
    let prev = nums[0]
    for (let i = 1; i <= nums.length; i++) {
      if (i === nums.length || nums[i] !== prev + 1) {
        parts.push(start === prev ? `${prefix}/${start}` : `${prefix}/${start} - ${prefix}/${prev}`)
        start = nums[i]
        prev = nums[i]
      } else {
        prev = nums[i]
      }
    }
  }
  return parts.join(', ')
}
</script>

<template>
  <div class="ports-view">
    <!-- Visible during all loading phases -->
    <template v-if="showPortSkeleton">
      <div class="ports-skeleton">
        <div class="port-slot__label">Loading…</div>
        <div class="port-slot__body">
          <div v-for="(row, i) in skeletonGrid" :key="i" class="port-row">
            <div v-for="n in row" :key="n" class="port-box port-box--skeleton" />
          </div>
        </div>
      </div>
    </template>

    <div v-else-if="hasNoPhysicalPorts" class="ports-empty">
      <i class="pi pi-th-large ports-empty__icon" />
      <span>No physical port data available for this switch.</span>
    </div>

    <div v-else-if="isBridge" class="ports-body">
      <div class="ports-left">
        <div class="ports-panel">
          <div v-for="slot in slotGrids" :key="slot.key" class="port-slot">
            <div class="port-slot__label">{{ slot.label }}</div>
            <div class="port-slot__body">
              <div v-for="(row, rowIdx) in slot.grid" :key="rowIdx" class="port-row">
                <button
                  v-for="(port, colIdx) in row"
                  :key="colIdx"
                  class="port-box"
                  :class="{
                    'port-box--empty': !port,
                    'port-box--selected': port && selectedPort?.id === port.id,
                    'port-box--admin-down': port && port.adminState === 2,
                    'port-box--vlan-highlight': port && highlightedPortIds.has(port.id),
                  }"
                  :style="
                    port
                      ? {
                          '--port-status-color': getStatusInfo(port.status).color,
                          '--port-status-bg': getStatusInfo(port.status).bgColor,
                          '--port-state-bg': operStateStyle(port.operState).bg,
                          '--port-state-color': operStateStyle(port.operState).color,
                        }
                      : {}
                  "
                  :disabled="!port"
                  :title="port ? port.name : undefined"
                  @click="port && selectPort(port)"
                >
                  <template v-if="port">
                    <div class="port-box__top">
                      <span class="port-box__state-label">{{ operLabel(port.operState) }}</span>
                    </div>
                    <div class="port-box__mid">
                      <span class="port-box__num">{{
                        port.physicalLocation.port || port.bridgePortNumber || '-'
                      }}</span>
                    </div>
                    <div class="port-box__bot">
                      <span class="port-box__status-label">{{
                        getStatusInfo(port.status).label
                      }}</span>
                    </div>
                  </template>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="vlanRows.length > 0" class="separator"></div>

        <div v-if="vlanRows.length > 0" ref="vlanTableEl" class="ports-vlans">
          <div class="ports-vlans__header">VLANs</div>
          <AppTable
            :columns="VLAN_COLUMNS"
            :rows="vlanRows"
            :page-size="50"
            storage-key="vlans"
            resizeFit
            :row-class="vlanRowClass"
            @row-click="selectVlan"
            @row-mouseenter="(row) => (hoveredVlan = row)"
            @row-mouseleave="() => (hoveredVlan = null)"
          >
            <template #cell="{ col, row }">
              <template v-if="col.id === 'ports'">{{ formatPortRanges(row.ports) }}</template>
              <template v-else-if="col.id === 'interfaces'">{{
                row.ports
                  .map((p) => interfacesById.get(p.objectId)?.name ?? `ifIndex:${p.ifIndex}`)
                  .join(', ')
              }}</template>
              <template v-else>{{ row[col.field] }}</template>
            </template>
            <template #empty>
              <span class="ports-vlans__empty"
                >VLAN data is not yet available for this switch.</span
              >
            </template>
          </AppTable>
        </div>
      </div>

      <!-- Detail panel, always present -->
      <div class="ports-right">
        <div v-if="selectedPort" class="ports-detail">
          <div class="ports-detail__header">
            <span class="ports-detail__name">{{ selectedPort.name }}</span>
            <button class="ports-detail__close" @click="clearSelection">
              <i class="pi pi-times" />
            </button>
          </div>
          <dl class="ports-detail__list">
            <template v-if="selectedPort.description">
              <dt>Description</dt>
              <dd>{{ selectedPort.description }}</dd>
            </template>
            <dt>Admin State</dt>
            <dd>{{ adminLabel(selectedPort.adminState) }}</dd>
            <dt>Oper State</dt>
            <dd>{{ operLabel(selectedPort.operState) }}</dd>
            <dt>STP State</dt>
            <dd>{{ selectedPort.stpPortStateText || '-' }}</dd>
            <template v-if="selectedPort.speed">
              <dt>Speed</dt>
              <dd>{{ formatSpeed(selectedPort.speed) }}</dd>
            </template>
            <template v-if="selectedPort.maxSpeed && selectedPort.maxSpeed !== selectedPort.speed">
              <dt>Max Speed</dt>
              <dd>{{ formatSpeed(selectedPort.maxSpeed) }}</dd>
            </template>
            <template v-if="selectedPort.macAddress">
              <dt>MAC Address</dt>
              <dd class="ports-detail__mono">{{ selectedPort.macAddress }}</dd>
            </template>
            <template v-if="selectedPort.ipAddressList?.length">
              <dt>IP Addresses</dt>
              <dd>{{ formatIpList(selectedPort.ipAddressList) }}</dd>
            </template>
            <template v-if="selectedPort.bridgePortNumber">
              <dt>Bridge Port #</dt>
              <dd>{{ selectedPort.bridgePortNumber }}</dd>
            </template>
            <template v-if="selectedPort.peerNodeId">
              <dt>Peer Node ID</dt>
              <dd>{{ selectedPort.peerNodeId }}</dd>
            </template>
            <template v-if="selectedPort.peerDiscoveryProtocolText">
              <dt>Discovered via</dt>
              <dd>{{ selectedPort.peerDiscoveryProtocolText }}</dd>
            </template>
          </dl>
        </div>
        <div v-else class="ports-detail-placeholder">
          <i class="pi pi-hand-pointer ports-detail-placeholder__icon" />
          <span>Select a port to view details</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ports-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
  padding: 1rem;
}

.ports-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ports-empty {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
}

.ports-empty__icon {
  font-size: 1.25rem;
}

.ports-body {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.ports-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ports-right {
  width: 16rem;
  flex-shrink: 0;
  position: sticky;
  top: 1.5rem;
}

.ports-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.port-slot__label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
  margin-bottom: 0.5rem;
}

.port-slot__body {
  display: inline-flex;
  flex-direction: column;
  gap: 0.25rem;
  align-items: baseline;
  width: 100%;
  background: var(--p-surface-100);
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  padding: 0.5rem;
  overflow: auto;
}

.port-row {
  display: flex;
  gap: 0.25rem;
}

.port-box {
  position: relative;
  width: 5rem;
  height: 5.5rem;
  border-radius: 4px;
  border: 1.5px solid var(--port-status-color, var(--p-surface-300));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  cursor: pointer;
  padding: 0;
  transition:
    transform 0.1s,
    box-shadow 0.1s;
}

.port-box:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.port-box--selected {
  outline: 3px solid var(--p-primary-color);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--p-primary-color) 20%, transparent);
}

.port-box--empty {
  border-color: transparent;
  cursor: default;
}

.port-box--skeleton {
  border: 1.5px dashed var(--p-surface-300);
  background: var(--p-surface-50);
  cursor: default;
  pointer-events: none;
}

/* Dimmed overlay for admin-down ports */
.port-box--admin-down {
  opacity: 0.45;
}

/* Top half: oper state */
.port-box__top {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--port-state-bg, var(--p-surface-200));
}

.port-box__state-label {
  font-size: 0.55rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--port-state-color, var(--p-text-muted-color));
  white-space: nowrap;
  overflow: hidden;
}

/* Middle divider: port number */
.port-box__mid {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.1rem 0;
  background: var(--p-surface-card);
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

:global(.app-dark) .port-box__mid {
  border-top-color: rgba(255, 255, 255, 0.08);
  border-bottom-color: rgba(255, 255, 255, 0.08);
}

.port-box__num {
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1;
  color: var(--p-text-color);
}

/* Bottom half: NetXMS status */
.port-box__bot {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--port-status-bg, var(--p-surface-200));
}

.port-box__status-label {
  font-size: 0.55rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--port-status-color, var(--p-text-muted-color));
  white-space: nowrap;
  overflow: hidden;
}

.ports-detail {
  width: 16rem;
  flex-shrink: 0;
  background: var(--p-surface-card);
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  overflow: hidden;
}

.ports-detail__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-50);
}

.ports-detail__name {
  font-weight: 600;
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ports-detail__close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--p-text-muted-color);
  padding: 0.125rem;
  border-radius: 3px;
  line-height: 1;
}

.ports-detail__close:hover {
  color: var(--p-text-color);
}

.ports-detail__list {
  margin: 0;
  padding: 0.625rem 0.75rem;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 0.75rem;
  font-size: 0.8rem;
}

.ports-detail__list dt {
  color: var(--p-text-muted-color);
  white-space: nowrap;
  font-weight: 500;
}

.ports-detail__list dd {
  margin: 0;
  color: var(--p-text-color);
  overflow-wrap: break-word;
  min-width: 0;
}

.ports-detail__mono {
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.ports-detail-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.8rem;
  text-align: center;
  border: 1px dashed var(--p-surface-border);
  border-radius: 6px;
}

.ports-detail-placeholder__icon {
  font-size: 1.25rem;
}

.port-box--vlan-highlight {
  box-shadow: 0 0 10px 2px color-mix(in srgb, var(--p-orange-400) 55%, transparent);
}

.port-box--vlan-highlight::after {
  content: '';
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--p-orange-400) 28%, transparent);
  pointer-events: none;
  z-index: 1;
}

.separator {
  border-bottom: 1px solid var(--p-surface-border);
  width: 100%;
  margin: 1rem 0rem;
}

.ports-vlans {
  border: 1px solid var(--p-surface-border);
  border-radius: 6px;
  background: var(--p-surface-card);
  overflow: hidden;
}

.ports-vlans__header {
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-50);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
}

.ports-vlans__empty {
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

:deep(.ports-vlans .app-table-wrap tbody tr) {
  cursor: pointer;
}

:deep(.vlan-row--highlighted td) {
  background: var(--p-highlight-bg) !important;
}

:deep(.vlan-row--selected td) {
  background: var(--p-primary-50) !important;
  color: var(--p-primary-color);
  font-weight: 500;
}
</style>
