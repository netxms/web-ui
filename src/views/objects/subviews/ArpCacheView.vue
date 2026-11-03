<script setup>
/** The NIC vendor is resolved server-side from the OUI database. */
import { computed, inject, watch } from 'vue'
import AppLink from '@/components/common/AppLink.vue'
import NodeTableView from '@/components/objects/NodeTableView.vue'
import { useArpCache } from '@/queries/useTopologyQueries'
import { ipSortKey } from '@/utils/objectUtils'
import { objectTarget } from '@/utils/routeTargets'

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)

const { data, isLoading, isFetching, isError, error, refetch } = useArpCache(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const rows = computed(() =>
  (data.value?.entries ?? []).map((entry, index) => ({
    id: index,
    ip: entry.ipAddress?.address ?? null,
    ipSort: ipSortKey(entry.ipAddress),
    mac: entry.macAddress ?? null,
    vendor: entry.vendor ?? null,
    // An index with no matching interface object still names the port.
    interfaceLabel:
      entry.interfaceName ?? (entry.interfaceIndex ? `[${entry.interfaceIndex}]` : null),
    nodeId: entry.nodeId || null,
    nodeName: entry.nodeName ?? null,
  })),
)

const COLUMNS = [
  { id: 'ip', field: 'ip', sortField: 'ipSort', label: 'IP Address', sortable: true, width: 160 },
  { id: 'mac', field: 'mac', label: 'MAC Address', sortable: true, width: 160 },
  { id: 'vendor', field: 'vendor', label: 'NIC Vendor', sortable: true, width: 200 },
  { id: 'interface', field: 'interfaceLabel', label: 'Interface', sortable: true, width: 180 },
  { id: 'node', field: 'nodeName', label: 'Node', sortable: true, width: 240 },
]

const FILTER_FIELDS = ['ip', 'mac', 'vendor', 'interfaceLabel', 'nodeName']
const COPY_FIELDS = ['ip', 'mac', 'vendor', 'interfaceLabel', 'nodeName']
</script>

<template>
  <NodeTableView
    storage-key="arp-cache"
    :columns="COLUMNS"
    :rows="rows"
    :loading="isLoading"
    :is-fetching="isFetching"
    :error="isError ? error : null"
    sort-field="ipSort"
    :sort-order="1"
    :filter-fields="FILTER_FIELDS"
    filter-placeholder="Filter ARP cache..."
    :collected="data?.timestamp != null"
    not-collected-message="No ARP cache collected for this node yet. It is read during a topology poll."
    empty-message="ARP cache is empty."
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
