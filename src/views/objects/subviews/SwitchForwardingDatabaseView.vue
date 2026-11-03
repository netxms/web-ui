<script setup>
/**
 * Port and VLAN come back as 0 when the device does not report them (legacy renders blank).
 * LAG members are reported under the parent's name by the server.
 */
import { computed, inject, watch } from 'vue'
import AppLink from '@/components/common/AppLink.vue'
import NodeTableView from '@/components/objects/NodeTableView.vue'
import { useSwitchForwardingDatabase } from '@/queries/useTopologyQueries'
import { objectTarget } from '@/utils/routeTargets'

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)

const { data, isLoading, isFetching, isError, error, refetch } =
  useSwitchForwardingDatabase(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const rows = computed(() =>
  (data.value?.entries ?? []).map((entry, index) => ({
    id: index,
    mac: entry.macAddress ?? null,
    vendor: entry.vendor ?? null,
    port: entry.bridgePort || null,
    interfaceLabel:
      entry.interfaceName ?? (entry.interfaceIndex ? `[${entry.interfaceIndex}]` : null),
    vlan: entry.vlanId || null,
    nodeId: entry.nodeId || null,
    nodeName: entry.nodeName ?? null,
    typeText: entry.typeText ?? null,
  })),
)

const COLUMNS = [
  { id: 'mac', field: 'mac', label: 'MAC', sortable: true, width: 160 },
  { id: 'vendor', field: 'vendor', label: 'NIC Vendor', sortable: true, width: 200 },
  { id: 'port', field: 'port', label: 'Port', sortable: true, width: 80 },
  { id: 'interface', field: 'interfaceLabel', label: 'Interface', sortable: true, width: 180 },
  { id: 'vlan', field: 'vlan', label: 'VLAN', sortable: true, width: 80 },
  { id: 'node', field: 'nodeName', label: 'Node', sortable: true, width: 240 },
  { id: 'type', field: 'typeText', label: 'Type', sortable: true, width: 110 },
]

const FILTER_FIELDS = ['mac', 'vendor', 'port', 'interfaceLabel', 'vlan', 'nodeName', 'typeText']
const COPY_FIELDS = ['mac', 'vendor', 'port', 'interfaceLabel', 'vlan', 'nodeName', 'typeText']
</script>

<template>
  <NodeTableView
    storage-key="switch-fdb"
    :columns="COLUMNS"
    :rows="rows"
    :loading="isLoading"
    :is-fetching="isFetching"
    :error="isError ? error : null"
    sort-field="mac"
    :sort-order="1"
    :filter-fields="FILTER_FIELDS"
    filter-placeholder="Filter forwarding database..."
    :collected="data?.timestamp != null"
    not-collected-message="No forwarding database collected for this node yet. It is read during a topology poll."
    empty-message="Forwarding database is empty."
    :copy-fields="COPY_FIELDS"
    mac-field="mac"
    @retry="refetch()"
  >
    <template #cell="{ col, row }">
      <AppLink
        v-if="col.id === 'node' && row.nodeId"
        :to="objectTarget({ id: row.nodeId, class: 'Node' })"
        class="cell-link"
        >{{ row.nodeName ?? `[${row.nodeId}]` }}</AppLink
      >
      <span v-else-if="col.id === 'mac'" class="cell-mac">{{ row.mac ?? '--' }}</span>
      <span v-else>{{ row[col.field] ?? '--' }}</span>
    </template>
  </NodeTableView>
</template>

<style scoped>
.cell-link {
  color: var(--p-primary-color);
  text-decoration: none;
}

.cell-link:hover {
  text-decoration: underline;
}

.cell-mac {
  font-family: var(--font-mono);
}
</style>
