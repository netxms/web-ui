<script setup>
/**
 * Takes over from the Ctrl+K palette when a prefix search matches more than it can show.
 * `?mac=` is the state, and shares the palette's cache entry (same query key).
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import AppLink from '@/components/common/AppLink.vue'
import AppTable from '@/components/common/AppTable.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import MacTypeBadge from '@/components/search/MacTypeBadge.vue'
import { useMacAddressSearch } from '@/queries/useFindQueries'
import { describeMacHit } from '@/utils/macSearch'
import { parseMacQuery } from '@/utils/macAddress'
import { objectTarget, macSearchTarget } from '@/utils/routeTargets'

/** Mirrors the API default in findApi.js. */
const SEARCH_LIMIT = 100

const route = useRoute()
const router = useRouter()
const toast = useToast()

/** Everything downstream reads this, not the input box. */
const activeMac = computed(() => (typeof route.query.mac === 'string' ? route.query.mac : ''))

const searchText = ref(activeMac.value)
watch(activeMac, (value) => {
  searchText.value = value
})

const parsed = computed(() => parseMacQuery(searchText.value))

function submit() {
  const text = searchText.value.trim()
  if (!text) return
  // Normalized like the palette does, so both share one cache entry.
  const mac = parsed.value.isMac ? parsed.value.normalized : text
  if (mac === activeMac.value) return
  router.replace(macSearchTarget(mac))
}

const { data: hits, isFetching, error, refetch } = useMacAddressSearch(activeMac)

const rows = computed(() =>
  (hits.value ?? []).map((hit, index) => ({
    id: index,
    seq: index + 1,
    ...describeMacHit(hit),
  })),
)

/** The server caps at SEARCH_LIMIT with no offset param, so a full page may be truncated. */
const isTruncated = computed(() => rows.value.length >= SEARCH_LIMIT)

const columns = [
  { id: 'seq', field: 'seq', label: 'Seq.', sortable: true, width: 60 },
  { id: 'node', field: 'ownerName', label: 'Node', sortable: true, width: 220 },
  { id: 'interface', field: 'ifaceName', label: 'Interface', sortable: true, width: 110 },
  { id: 'mac', field: 'mac', label: 'MAC', sortable: true, width: 150 },
  { id: 'ip', field: 'ip', label: 'IP', sortable: true, width: 120 },
  { id: 'switch', field: 'switchName', label: 'Switch', sortable: true, width: 220 },
  { id: 'switchIp', field: 'switchIp', label: 'Switch IP', sortable: true, width: 120 },
  { id: 'port', field: 'portName', label: 'Port', sortable: true, width: 110 },
  { id: 'ifIndex', field: 'ifIndex', label: 'Index', sortable: true, width: 70 },
  { id: 'type', field: 'type', label: 'Type', sortable: true, width: 90 },
]

/** Null when there is nothing readable to link to. */
function cellTarget(object) {
  return object ? objectTarget(object) : null
}

const contextMenu = ref(null)

const COPY_FIELDS = [
  'seq',
  'ownerName',
  'ifaceName',
  'mac',
  'ip',
  'switchName',
  'switchIp',
  'portName',
  'ifIndex',
  'type',
]

function copy(text, what) {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    toast.add({ severity: 'success', summary: `${what} copied`, life: 2000 })
  })
}

const contextMenuItems = computed(() => {
  const row = contextMenu.value?.contextData
  return [
    {
      label: 'Copy row',
      icon: 'pi pi-copy',
      command: () => copy(COPY_FIELDS.map((f) => row?.[f] ?? '').join('\t'), 'Row'),
    },
    {
      label: 'Copy MAC address',
      icon: 'pi pi-copy',
      disabled: !row?.mac,
      command: () => copy(row?.mac, 'MAC address'),
    },
    {
      label: 'Copy IP address',
      icon: 'pi pi-copy',
      disabled: !row?.ip,
      command: () => copy(row?.ip, 'IP address'),
    },
  ]
})

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}
</script>

<template>
  <div class="mac-search-view">
    <div class="section-toolbar">
      <label for="mac-search-input" class="search-label">Search string</label>
      <InputText
        id="mac-search-input"
        v-model="searchText"
        placeholder="MAC address or its first part, e.g. 00:50:56"
        class="search-input"
        autocomplete="off"
        @keydown.enter="submit"
      />
      <Button
        label="Search"
        icon="pi pi-search"
        size="small"
        :loading="isFetching"
        @click="submit"
      />
      <div class="toolbar-actions">
        <span v-if="activeMac && !isFetching" class="item-count">
          {{ $plural(rows.length, 'match', 'matches') }}
          <template v-if="isTruncated"> (server limit)</template>
        </span>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          :disabled="!activeMac"
          @click="refetch()"
        />
      </div>
    </div>

    <EmptyState
      v-if="!activeMac"
      icon="pi pi-search"
      title="Search the network for a MAC address"
      message="Enter a full address or its first part to find which switch port a device is connected to."
      class="mac-search-prompt"
    />

    <AppTable
      v-else
      :columns="columns"
      :rows="rows"
      :loading="isFetching && rows.length === 0"
      :error="error"
      sort-field="seq"
      :sort-order="1"
      :page-size="50"
      storage-key="mac-search"
      auto-width
      striped
      size="small"
      class="mac-search-table"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch()"
    >
      <template #cell="{ col, row }">
        <AppLink
          v-if="col.id === 'node' && cellTarget(row.ownerObject)"
          :to="cellTarget(row.ownerObject)"
          class="cell-link"
          >{{ row.ownerName }}</AppLink
        >
        <AppLink
          v-else-if="col.id === 'switch' && cellTarget(row.switchObject)"
          :to="cellTarget(row.switchObject)"
          class="cell-link"
          >{{ row.switchName }}</AppLink
        >
        <AppLink
          v-else-if="col.id === 'port' && cellTarget(row.portObject)"
          :to="cellTarget(row.portObject)"
          class="cell-link"
          >{{ row.portName }}</AppLink
        >
        <span v-else-if="col.id === 'mac'" class="cell-mac">{{ row.mac ?? 'n/a' }}</span>
        <MacTypeBadge v-else-if="col.id === 'type'" :type="row.type" />
        <span v-else>{{ row[col.field] ?? 'n/a' }}</span>
      </template>

      <template #empty>No devices found with that MAC address.</template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
  </div>
</template>

<style scoped>
.mac-search-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  margin: -1rem;
}

.section-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.search-label {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.search-input {
  width: 340px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.item-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.mac-search-table {
  flex: 1;
  min-height: 0;
}

.mac-search-prompt {
  flex: 1;
}

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
