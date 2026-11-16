<script setup>
/**
 * Scopes over leases, as the legacy DHCP view. Both are read live from the node's agent.
 * Selecting a scope asks the server for that scope's leases only; with none selected the server
 * returns every lease. Node is 0 on the wire when the server found no match or the user cannot
 * read it; it renders as '--'.
 */
import { computed, inject, ref, watch } from 'vue'
import Button from 'primevue/button'
import Chip from 'primevue/chip'
import ProgressBar from 'primevue/progressbar'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import AppLink from '@/components/common/AppLink.vue'
import AppTable from '@/components/common/AppTable.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import NodeTableView from '@/components/objects/NodeTableView.vue'
import { useWorkingState } from '@/composables/useWorkingState'
import { useDhcpLeases, useDhcpScopes } from '@/queries/useTopologyQueries'
import { downloadCsv, safeFilename, toCsv } from '@/utils/csvExport'
import { toLeaseRow, toScopeRow } from '@/utils/dhcpDisplay'
import { objectTarget } from '@/utils/routeTargets'

const props = defineProps({
  object: { type: Object, required: true },
})

const toast = useToast()

const objectId = computed(() => props.object.id)
const selectedScopeId = ref(null)

useWorkingState('dhcp', { object: { selectedScopeId } })

const {
  data: scopesData,
  isLoading: scopesLoading,
  isFetching: scopesFetching,
  error: scopesError,
  refetch: refetchScopes,
} = useDhcpScopes(objectId)
const {
  data: leasesData,
  isLoading: leasesLoading,
  isFetching: leasesFetching,
  error: leasesError,
  refetch: refetchLeases,
} = useDhcpLeases(objectId, selectedScopeId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) {
  watch(refreshSignal, () => {
    refetchScopes()
    refetchLeases()
  })
}

const scopeRows = computed(() => (scopesData.value?.entries ?? []).map(toScopeRow))
const scopeLabels = computed(() => new Map(scopeRows.value.map((row) => [row.id, row.network])))
const selectedScope = computed(
  () => scopeRows.value.find((row) => row.id === selectedScopeId.value) ?? null,
)

// A scope removed on the server since it was selected: back to every lease, as legacy does.
watch(scopesData, (data) => {
  if (data && selectedScopeId.value && !selectedScope.value) selectedScopeId.value = null
})
watch(leasesError, (error) => {
  if (error?.status === 404 && selectedScopeId.value) selectedScopeId.value = null
})

const leasesUnsupported = computed(() => leasesError.value?.status === 501)

const leaseRows = computed(() =>
  (leasesData.value?.entries ?? []).map((entry, index) =>
    toLeaseRow(entry, index, scopeLabels.value),
  ),
)

function toggleScope(row) {
  selectedScopeId.value = selectedScopeId.value === row.id ? null : row.id
}

function scopeRowClass(row) {
  return {
    'scope-row--selected': row.id === selectedScopeId.value,
    'scope-row--disabled': !row.enabled,
  }
}

const SCOPE_COLUMNS = [
  {
    id: 'network',
    field: 'network',
    sortField: 'networkSort',
    label: 'Network',
    sortable: true,
    width: 150,
  },
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 180 },
  { id: 'ranges', field: 'ranges', label: 'Ranges', sortable: true, width: 220 },
  { id: 'total', field: 'total', label: 'Total', sortable: true, width: 80 },
  { id: 'used', field: 'used', label: 'Used', sortable: true, width: 80 },
  { id: 'declined', field: 'declined', label: 'Declined', sortable: true, width: 90 },
  { id: 'free', field: 'free', label: 'Free', sortable: true, width: 80 },
  {
    id: 'utilization',
    field: 'utilizationText',
    sortField: 'utilization',
    label: 'Utilization',
    sortable: true,
    width: 150,
  },
]

const scopeTable = ref(null)

function exportScopes() {
  const rows = scopeTable.value?.sortedRows ?? scopeRows.value
  downloadCsv(safeFilename(`dhcp-scopes-${props.object.name}`), toCsv(rows, SCOPE_COLUMNS))
}

const scopeMenu = ref(null)

const scopeMenuItems = computed(() => {
  const row = scopeMenu.value?.contextData
  return [
    {
      label: 'Copy row',
      icon: 'pi pi-copy',
      command: () => {
        const text = SCOPE_COLUMNS.map((col) => row?.[col.field] ?? '').join('\t')
        navigator.clipboard.writeText(text).then(() => {
          toast.add({ severity: 'success', summary: 'Row copied', life: 2000 })
        })
      },
    },
    { separator: true },
    { label: 'Export to CSV', icon: 'pi pi-file-export', command: exportScopes },
  ]
})

function onScopeContextMenu({ event, row }) {
  scopeMenu.value.show(event, row)
}

const LEASE_COLUMNS = [
  { id: 'ip', field: 'ip', sortField: 'ipSort', label: 'IP Address', sortable: true, width: 160 },
  { id: 'mac', field: 'mac', label: 'MAC Address', sortable: true, width: 160 },
  { id: 'vendor', field: 'vendor', label: 'NIC Vendor', sortable: true, width: 180 },
  { id: 'hostname', field: 'hostname', label: 'Host Name', sortable: true, width: 180 },
  { id: 'node', field: 'nodeName', label: 'Node', sortable: true, width: 180 },
  { id: 'clientId', field: 'clientId', label: 'Client ID', sortable: true, width: 200 },
  { id: 'scope', field: 'scope', label: 'Scope', sortable: true, width: 150 },
  { id: 'type', field: 'type', sortField: 'typeSort', label: 'Type', sortable: true, width: 110 },
  {
    id: 'state',
    field: 'state',
    sortField: 'stateSort',
    label: 'State',
    sortable: true,
    width: 100,
  },
  {
    id: 'lastTransaction',
    field: 'lastTransaction',
    sortField: 'lastTransactionSort',
    label: 'Last Transaction',
    sortable: true,
    width: 180,
  },
  {
    id: 'expiration',
    field: 'expiration',
    sortField: 'expirationSort',
    label: 'Expiration',
    sortable: true,
    width: 180,
  },
]

const LEASE_FILTER_FIELDS = [
  'ip',
  'mac',
  'vendor',
  'hostname',
  'nodeName',
  'clientId',
  'scope',
  'scopeId',
]
const LEASE_COPY_FIELDS = LEASE_COLUMNS.map((col) => col.field)
</script>

<template>
  <div class="dhcp-view">
    <section class="dhcp-scopes" aria-label="DHCP scopes">
      <div class="dhcp-scopes-toolbar">
        <span class="dhcp-scopes-title">Scopes</span>
        <span v-if="!scopesLoading" class="dhcp-scopes-count">
          {{ $plural(scopeRows.length, 'scope', 'scopes') }}
        </span>
        <Button
          v-tooltip.bottom="'Export to CSV'"
          icon="pi pi-file-export"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Export scopes to CSV"
          class="dhcp-scopes-export"
          :disabled="scopesLoading || !scopeRows.length"
          @click="exportScopes"
        />
      </div>

      <AppTable
        ref="scopeTable"
        :columns="SCOPE_COLUMNS"
        :rows="scopeRows"
        :loading="scopesLoading"
        :error="scopesError"
        sort-field="networkSort"
        :sort-order="1"
        :row-class="scopeRowClass"
        storage-key="dhcp-scopes"
        auto-width
        striped
        size="small"
        class="dhcp-scopes-table"
        @row-click="toggleScope"
        @row-contextmenu="onScopeContextMenu"
        @retry="refetchScopes()"
      >
        <template #cell="{ col, row }">
          <span v-if="col.id === 'name'" class="scope-name">
            <span>{{ row.name ?? '--' }}</span>
            <Tag
              v-if="!row.enabled"
              value="Disabled"
              severity="secondary"
              outlined
              class="scope-disabled-tag"
            />
          </span>
          <span v-else-if="col.id === 'utilization'" class="scope-utilization">
            <ProgressBar
              v-if="row.utilization != null"
              :value="Math.min(row.utilization, 100)"
              :show-value="false"
              class="scope-utilization-bar"
            />
            <span>{{ row.utilizationText ?? '--' }}</span>
          </span>
          <span v-else>{{ row[col.field] ?? '--' }}</span>
        </template>
        <template #empty>
          <div class="empty-message">This DHCP server reports no scopes.</div>
        </template>
      </AppTable>

      <EntityContextMenu ref="scopeMenu" :items="scopeMenuItems" />
    </section>

    <div class="dhcp-leases">
      <NodeTableView
        storage-key="dhcp-leases"
        :export-name="`dhcp-leases-${object.name}`"
        :columns="LEASE_COLUMNS"
        :rows="leaseRows"
        :loading="leasesLoading"
        :is-fetching="leasesFetching || scopesFetching"
        :error="leasesUnsupported ? null : leasesError"
        sort-field="ipSort"
        :sort-order="1"
        :filter-fields="LEASE_FILTER_FIELDS"
        filter-placeholder="Filter leases..."
        noun="lease"
        noun-plural="leases"
        :collected="!leasesUnsupported"
        not-collected-message="Lease list is not available for this DHCP server."
        :empty-message="selectedScopeId ? 'No leases in this scope.' : 'No leases reported.'"
        :copy-fields="LEASE_COPY_FIELDS"
        mac-field="mac"
        @retry="refetchLeases()"
      >
        <template #toolbar>
          <Chip
            v-if="selectedScopeId"
            :label="`Scope: ${selectedScope?.network ?? selectedScopeId}`"
            removable
            class="scope-chip"
            @remove="selectedScopeId = null"
          />
        </template>
        <template #cell="{ col, row }">
          <AppLink
            v-if="col.id === 'node' && row.nodeId"
            :to="objectTarget({ id: row.nodeId, class: 'Node' })"
            class="cell-link"
            >{{ row.nodeName ?? `[${row.nodeId}]` }}</AppLink
          >
          <span v-else-if="col.id === 'mac'" class="cell-mono">{{ row.mac ?? '--' }}</span>
          <span v-else-if="col.id === 'clientId'" class="cell-mono">{{
            row.clientId ?? '--'
          }}</span>
          <span v-else>{{ row[col.field] ?? '--' }}</span>
        </template>
      </NodeTableView>
    </div>
  </div>
</template>

<style scoped>
.dhcp-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

/* Sized to its rows up to the cap; the table scrolls past it. */
.dhcp-scopes {
  flex: 0 1 auto;
  max-height: 40%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--p-surface-border);
}

.dhcp-scopes-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.dhcp-scopes-title {
  font-size: 0.875rem;
  font-weight: 600;
}

.dhcp-scopes-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.dhcp-scopes-export {
  margin-left: auto;
}

.dhcp-scopes-table {
  min-height: 0;
}

.dhcp-scopes :deep(.app-table > tbody > tr.scope-row--disabled > td) {
  color: var(--p-text-muted-color);
}

.dhcp-scopes :deep(.app-table > tbody > tr.scope-row--selected > td) {
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}

.dhcp-scopes :deep(.app-table > tbody > tr.scope-row--selected:hover > td) {
  background: color-mix(in srgb, var(--p-primary-color) 16%, transparent);
}

.scope-name {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.scope-disabled-tag {
  font-size: 0.6875rem;
  padding: 0 0.375rem;
  line-height: 1.125rem;
}

.scope-utilization {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.scope-utilization-bar {
  width: 64px;
  height: 6px;
  flex-shrink: 0;
}

.dhcp-leases {
  flex: 1 1 0;
  min-height: 0;
}

.scope-chip {
  font-size: 0.8125rem;
  padding-top: 0.125rem;
  padding-bottom: 0.125rem;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.cell-link {
  color: var(--p-primary-color);
  text-decoration: none;
}

.cell-link:hover {
  text-decoration: underline;
}

.cell-mono {
  font-family: var(--font-mono);
}
</style>
