<script setup>
/**
 * No NIC vendor column: the radios endpoint does not resolve the BSSID's vendor. On a wireless
 * domain the server returns the radios of all its controllers and access points, hence the
 * Owner column (it replaces the legacy controller view).
 */
import { computed, inject, watch } from 'vue'
import AppLink from '@/components/common/AppLink.vue'
import NodeTableView from '@/components/objects/NodeTableView.vue'
import { useWirelessRadios } from '@/queries/useTopologyQueries'
import { objectTarget } from '@/utils/routeTargets'
import { toRadioRow } from '@/utils/wirelessDisplay'

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)

const { data, isLoading, isFetching, isError, error, refetch } = useWirelessRadios(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const rows = computed(() => (data.value?.entries ?? []).map(toRadioRow))

const showOwner = computed(() => props.object.class === 'WirelessDomain')

const OWNER_COLUMN = { id: 'owner', field: 'ownerName', label: 'Owner', sortable: true, width: 220 }

const RADIO_COLUMNS = [
  { id: 'index', field: 'index', label: 'Index', sortable: true, width: 70 },
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 140 },
  { id: 'ssid', field: 'ssid', label: 'SSID', sortable: true, width: 160 },
  { id: 'bssid', field: 'bssid', label: 'BSSID', sortable: true, width: 160 },
  { id: 'band', field: 'band', sortField: 'bandSort', label: 'Band', sortable: true, width: 90 },
  { id: 'channel', field: 'channel', label: 'Channel', sortable: true, width: 80 },
  {
    id: 'frequency',
    field: 'frequency',
    sortField: 'frequencySort',
    label: 'Frequency',
    sortable: true,
    width: 100,
  },
  { id: 'powerDBm', field: 'powerDBm', label: 'Tx Power (dBm)', sortable: true, width: 120 },
  { id: 'powerMW', field: 'powerMW', label: 'Tx Power (mW)', sortable: true, width: 120 },
]

const RADIO_FIELDS = ['index', 'name', 'ssid', 'bssid', 'band', 'channel', 'frequency']
const POWER_FIELDS = ['powerDBm', 'powerMW']

const columns = computed(() => (showOwner.value ? [OWNER_COLUMN, ...RADIO_COLUMNS] : RADIO_COLUMNS))
const filterFields = computed(() =>
  showOwner.value ? ['ownerName', ...RADIO_FIELDS] : RADIO_FIELDS,
)
const copyFields = computed(() => [...filterFields.value, ...POWER_FIELDS])
</script>

<template>
  <NodeTableView
    storage-key="wireless-radios"
    :columns="columns"
    :rows="rows"
    :loading="isLoading"
    :is-fetching="isFetching"
    :error="isError ? error : null"
    sort-field="name"
    :sort-order="1"
    :filter-fields="filterFields"
    filter-placeholder="Filter radios..."
    noun="radio"
    noun-plural="radios"
    empty-message="No radio interfaces reported. They are read during a configuration poll."
    :copy-fields="copyFields"
    @retry="refetch()"
  >
    <template #cell="{ col, row }">
      <AppLink
        v-if="col.id === 'owner' && row.ownerId"
        :to="objectTarget({ id: row.ownerId })"
        class="cell-link"
        >{{ row.ownerName ?? `[${row.ownerId}]` }}</AppLink
      >
      <span v-else-if="col.id === 'bssid'" class="cell-mac">{{ row.bssid ?? '--' }}</span>
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
