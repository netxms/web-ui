<script setup>
import { computed, inject, watch } from 'vue'
import NodeTableView from '@/components/objects/NodeTableView.vue'
import { useRoutingTable } from '@/queries/useTopologyQueries'
import { ipSortKey } from '@/utils/objectUtils'

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)

const { data, isLoading, isFetching, isError, error, refetch } = useRoutingTable(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

/** Legacy renders the destination with its mask and the next hop without one. */
function formatDestination(ip) {
  if (!ip?.address) return null
  return ip.prefixLength != null ? `${ip.address}/${ip.prefixLength}` : ip.address
}

const rows = computed(() =>
  (data.value?.entries ?? []).map((entry, index) => ({
    id: index,
    destination: formatDestination(entry.destination),
    destinationSort: ipSortKey(entry.destination),
    nextHop: entry.nextHop?.address ?? null,
    interfaceLabel:
      entry.interfaceName ?? (entry.interfaceIndex ? `[${entry.interfaceIndex}]` : null),
    typeText: entry.typeText ?? null,
    metric: entry.metric ?? null,
    protocolText: entry.protocolText ?? null,
  })),
)

const COLUMNS = [
  {
    id: 'destination',
    field: 'destination',
    sortField: 'destinationSort',
    label: 'Destination',
    sortable: true,
    width: 170,
  },
  { id: 'nextHop', field: 'nextHop', label: 'Next Hop', sortable: true, width: 150 },
  { id: 'interface', field: 'interfaceLabel', label: 'Interface', sortable: true, width: 180 },
  { id: 'type', field: 'typeText', label: 'Type', sortable: true, width: 110 },
  { id: 'metric', field: 'metric', label: 'Metric', sortable: true, width: 90 },
  { id: 'protocol', field: 'protocolText', label: 'Protocol', sortable: true, width: 170 },
]

const FILTER_FIELDS = ['destination', 'nextHop', 'interfaceLabel', 'typeText', 'protocolText']
const COPY_FIELDS = [
  'destination',
  'nextHop',
  'interfaceLabel',
  'typeText',
  'metric',
  'protocolText',
]
</script>

<template>
  <NodeTableView
    storage-key="routing-table"
    :columns="COLUMNS"
    :rows="rows"
    :loading="isLoading"
    :is-fetching="isFetching"
    :error="isError ? error : null"
    sort-field="destinationSort"
    :sort-order="1"
    :filter-fields="FILTER_FIELDS"
    filter-placeholder="Filter routes..."
    noun="route"
    noun-plural="routes"
    :collected="data?.timestamp != null"
    not-collected-message="No routing table collected for this node yet. It is read during a routing poll."
    empty-message="Routing table is empty."
    :copy-fields="COPY_FIELDS"
    @retry="refetch()"
  >
    <template #cell="{ col, row }">
      <span>{{ row[col.field] ?? '--' }}</span>
    </template>
  </NodeTableView>
</template>
