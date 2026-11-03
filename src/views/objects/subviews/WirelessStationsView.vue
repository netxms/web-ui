<script setup>
/**
 * Columns lead in the legacy order. Node and Access Point are 0 on the wire when the server
 * found no match or the user cannot read the object; both render as '--'.
 */
import { computed, inject, watch } from 'vue'
import AppLink from '@/components/common/AppLink.vue'
import NodeTableView from '@/components/objects/NodeTableView.vue'
import { useWirelessStations } from '@/queries/useTopologyQueries'
import { objectTarget } from '@/utils/routeTargets'
import { toStationRow } from '@/utils/wirelessDisplay'

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)

const { data, isLoading, isFetching, isError, error, refetch } = useWirelessStations(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const rows = computed(() => (data.value?.entries ?? []).map(toStationRow))

const COLUMNS = [
  { id: 'mac', field: 'mac', label: 'MAC Address', sortable: true, width: 160 },
  { id: 'vendor', field: 'vendor', label: 'NIC Vendor', sortable: true, width: 200 },
  { id: 'ip', field: 'ip', sortField: 'ipSort', label: 'IP Address', sortable: true, width: 140 },
  { id: 'node', field: 'nodeName', label: 'Node', sortable: true, width: 200 },
  {
    id: 'accessPoint',
    field: 'accessPointName',
    label: 'Access Point',
    sortable: true,
    width: 200,
  },
  { id: 'radio', field: 'radio', label: 'Radio', sortable: true, width: 100 },
  { id: 'ssid', field: 'ssid', label: 'SSID', sortable: true, width: 140 },
  { id: 'rssi', field: 'rssi', label: 'RSSI (dBm)', sortable: true, width: 100 },
  { id: 'vlan', field: 'vlan', label: 'VLAN', sortable: true, width: 80 },
  {
    id: 'txRate',
    field: 'txRate',
    sortField: 'txRateSort',
    label: 'Tx Rate',
    sortable: true,
    width: 110,
  },
  {
    id: 'rxRate',
    field: 'rxRate',
    sortField: 'rxRateSort',
    label: 'Rx Rate',
    sortable: true,
    width: 110,
  },
]

const FILTER_FIELDS = [
  'mac',
  'vendor',
  'ip',
  'nodeName',
  'accessPointName',
  'radio',
  'ssid',
  'vlan',
]
const COPY_FIELDS = [
  'mac',
  'vendor',
  'ip',
  'nodeName',
  'accessPointName',
  'radio',
  'ssid',
  'rssi',
  'vlan',
  'txRate',
  'rxRate',
]
</script>

<template>
  <NodeTableView
    storage-key="wireless-stations"
    :columns="COLUMNS"
    :rows="rows"
    :loading="isLoading"
    :is-fetching="isFetching"
    :error="isError ? error : null"
    sort-field="mac"
    :sort-order="1"
    :filter-fields="FILTER_FIELDS"
    filter-placeholder="Filter wireless stations..."
    noun="station"
    noun-plural="stations"
    empty-message="No wireless stations reported. The list is read during a topology poll."
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
      <AppLink
        v-else-if="col.id === 'accessPoint' && row.accessPointId"
        :to="objectTarget({ id: row.accessPointId })"
        class="cell-link"
        >{{ row.accessPointName ?? `[${row.accessPointId}]` }}</AppLink
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
