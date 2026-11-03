<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppLink from '@/components/common/AppLink.vue'
import AppTable from '@/components/common/AppTable.vue'
import ColumnChooser from '@/components/common/ColumnChooser.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import SectionHeader from '@/components/layout/SectionHeader.vue'
import AllObjectsPickerDialog from '@/components/objects/AllObjectsPickerDialog.vue'
import CreateNodeDialog from '@/components/objects/CreateNodeDialog.vue'
import { useAgentTunnelBinding } from '@/composables/useAgentTunnelBinding'
import { useWorkingState } from '@/composables/useWorkingState'
import { useAgentTunnels, useUnbindAgentTunnels } from '@/queries/useAgentTunnelQueries'
import { useObjects, useObjectsByIds, useZoneNames } from '@/queries/useObjectQueries'
import { useAgentTunnelTableStore } from '@/stores/agentTunnelTableStore'
import { bindBlockedReason, hasProxyFunction, tunnelFilterFields } from '@/utils/agentTunnels'
import { toCsv, downloadCsv } from '@/utils/csvExport'
import { ipSortKey } from '@/utils/objectUtils'
import { objectTarget } from '@/utils/routeTargets'
import { formatDateTime } from '@/utils/timeFormat'

/**
 * Beyond legacy: unbind asks first, and Bind and Create node are disabled with a reason for an
 * agent whose externally provisioned certificate the server will not rebind. The list is
 * polled; legacy is pushed.
 */

const router = useRouter()
const confirm = useConfirm()
const toast = useToast()
const store = useAgentTunnelTableStore()

const { data: tunnelsData, isLoading, isFetching, isError, error, refetch } = useAgentTunnels()
const tunnels = computed(() => tunnelsData.value ?? [])

const nodeIds = computed(() => [
  ...new Set(tunnels.value.filter((t) => t.bound).map((t) => t.nodeId)),
])
const { objectsById } = useObjectsByIds(nodeIds)
const zoneNames = useZoneNames()

const { pending, bindToNode, bindNewNode } = useAgentTunnelBinding()

const plural = (count, word = 'tunnel') => `${count} ${word}${count === 1 ? '' : 's'}`
const yesNo = (flag) => (flag ? 'Yes' : 'No')

/**
 * `field` is the text shown (and exported); `sortField` is what it sorts by where the two
 * differ. Legacy sorting: state puts unbound first, addresses numerically, times by time.
 */
const rows = computed(() =>
  tunnels.value.map((tunnel) => {
    const node = tunnel.bound ? objectsById.value.get(tunnel.nodeId) : null
    return {
      ...tunnel,
      node,
      nodeName: tunnel.bound ? (node?.name ?? `[${tunnel.nodeId}]`) : '',
      stateLabel: tunnel.bound ? 'Bound' : 'Unbound',
      boundSort: tunnel.bound ? 1 : 0,
      addressSort: ipSortKey(tunnel.addressObject),
      channels: tunnel.bound ? tunnel.activeChannelCount : null,
      channelsText: tunnel.bound ? String(tunnel.activeChannelCount) : '',
      agentProxyText: yesNo(tunnel.agentProxy),
      snmpProxyText: yesNo(tunnel.snmpProxy),
      snmpTrapProxyText: yesNo(tunnel.snmpTrapProxy),
      syslogProxyText: yesNo(tunnel.syslogProxy),
      userAgentText: yesNo(tunnel.userAgentInstalled),
      // UIN 0 without a zone object: zoning is off.
      zoneName:
        zoneNames.value.get(tunnel.zoneUIN) ?? (tunnel.zoneUIN ? `[${tunnel.zoneUIN}]` : ''),
      certificateExpirationText: tunnel.certificateExpirationTime
        ? formatDateTime(tunnel.certificateExpirationTime)
        : '',
      connectionTimeText: tunnel.connectionTime ? formatDateTime(tunnel.connectionTime) : '',
      directionLabel: tunnel.inbound ? 'Inbound' : 'Outbound',
      bindBlocked: bindBlockedReason(tunnel),
    }
  }),
)

const unboundCount = computed(() => tunnels.value.filter((t) => !t.bound).length)

const filterState = ref({ text: '', tokens: [] })
const onlyProxies = ref(false)
const onlyUserAgent = ref(false)

/** Legacy `TunnelManagerFilter`: the toggles, then the text over its fields. */
const filteredRows = computed(() => {
  const search = filterState.value.text.toLowerCase()
  return rows.value.filter((row) => {
    if (onlyUserAgent.value && !row.userAgentInstalled) return false
    if (onlyProxies.value && !hasProxyFunction(row)) return false
    if (!search) return true
    return tunnelFilterFields(row, row.nodeName).some((text) => text.toLowerCase().includes(search))
  })
})

/** "5 tunnels · 2 unbound"; the unbound count is over every tunnel, not the filtered ones. */
const countText = computed(() => {
  const shown = plural(filteredRows.value.length)
  return unboundCount.value ? `${shown} · ${unboundCount.value} unbound` : shown
})

const selectedIds = ref(new Set())

useWorkingState('agent-tunnels', {
  view: { filterState, onlyProxies, onlyUserAgent },
  object: { selectedIds },
})

const selectedRows = computed(() => filteredRows.value.filter((r) => selectedIds.value.has(r.id)))
const selectedBound = computed(() => selectedRows.value.filter((r) => r.bound))

// A bulk action must not reach rows the filter has hidden, or tunnels that have gone away.
watch(filteredRows, (visibleRows) => {
  if (selectedIds.value.size === 0) return
  const visible = new Set(visibleRows.map((r) => r.id))
  const next = new Set([...selectedIds.value].filter((id) => visible.has(id)))
  if (next.size !== selectedIds.value.size) selectedIds.value = next
})

function clearSelection() {
  selectedIds.value = new Set()
}

const bindTarget = ref(null)
const bindPickerVisible = ref(false)

function openBind(row) {
  if (row.bindBlocked || pending.value.has(row.id)) return
  bindTarget.value = row
  bindPickerVisible.value = true
}

function isNode(object) {
  return object.class === 'Node'
}

function onBindNodePicked(node) {
  const tunnel = bindTarget.value
  bindTarget.value = null
  if (!tunnel || !node) return
  bindToNode(tunnel, { id: node.id, name: node.name })
}

const { data: rootObjects } = useObjects()
/** Legacy creates these nodes under Infrastructure Services (parent 2). */
const infrastructureRoot = computed(
  () => (rootObjects.value ?? []).find((o) => o.class === 'ServiceRoot') ?? { id: 2 },
)

const createTarget = ref(null)
const createDialogVisible = ref(false)

const createPrefill = computed(() =>
  createTarget.value
    ? {
        name: createTarget.value.systemName || createTarget.value.hostname,
        zoneUin: createTarget.value.zoneUIN,
      }
    : null,
)

function openCreateNode(row) {
  if (row.bindBlocked || pending.value.has(row.id)) return
  createTarget.value = row
  createDialogVisible.value = true
}

function onNodeCreated({ node, unmanaged }) {
  const tunnel = createTarget.value
  if (!tunnel) return
  bindNewNode(tunnel, node, { manage: !unmanaged })
}

const { mutateAsync: unbindAsync } = useUnbindAgentTunnels()

function confirmUnbind(targets) {
  const bound = targets.filter((t) => t.bound)
  if (bound.length === 0) return
  const message =
    bound.length === 1
      ? `Unbind the tunnel of "${bound[0].nodeName}"? The node's agent certificate is revoked and the tunnel is closed.`
      : `Unbind ${plural(bound.length)}? Each node's agent certificate is revoked and its tunnel is closed.`

  confirm.require({
    message,
    header: 'Confirm Unbind',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Unbind',
    acceptClass: 'p-button-danger',
    accept: async () => {
      clearSelection()
      const failed = await unbindAsync(bound.map((t) => t.nodeId))
      if (failed.length === 0) {
        toast.add({
          severity: 'success',
          summary: bound.length === 1 ? 'Tunnel unbound' : `${plural(bound.length)} unbound`,
          life: 3000,
        })
        return
      }
      const names = failed.map(({ nodeId }) => bound.find((t) => t.nodeId === nodeId)?.nodeName)
      toast.add({
        severity: 'error',
        summary: `Cannot unbind ${plural(failed.length)}`,
        detail: `${names.join(', ')}: ${failed[0].error?.message ?? 'request failed'}`,
        life: 6000,
      })
    },
  })
}

function nodeTarget(row) {
  if (!row.bound) return null
  return objectTarget(row.node ?? { id: row.nodeId, class: 'Node' })
}

const ALL_COLUMNS = [
  { id: 'id', field: 'id', label: 'ID', sortable: true, width: 70 },
  {
    id: 'state',
    field: 'stateLabel',
    sortField: 'boundSort',
    label: 'State',
    sortable: true,
    width: 120,
    mandatory: true,
  },
  { id: 'node', field: 'nodeName', label: 'Node', sortable: true, width: 200 },
  {
    id: 'address',
    field: 'address',
    sortField: 'addressSort',
    label: 'IP Address',
    sortable: true,
    width: 150,
  },
  {
    id: 'channels',
    field: 'channelsText',
    sortField: 'channels',
    label: 'Channels',
    sortable: true,
    width: 90,
  },
  { id: 'systemName', field: 'systemName', label: 'System Name', sortable: true, width: 180 },
  { id: 'hostname', field: 'hostname', label: 'Hostname', sortable: true, width: 210 },
  { id: 'platform', field: 'platformName', label: 'Platform', sortable: true, width: 140 },
  {
    id: 'systemInformation',
    field: 'systemInformation',
    label: 'System Information',
    sortable: true,
    width: 300,
  },
  { id: 'hardwareId', field: 'hardwareId', label: 'Hardware ID', sortable: true, width: 220 },
  { id: 'serialNumber', field: 'serialNumber', label: 'Serial Number', sortable: true, width: 140 },
  { id: 'agentVersion', field: 'agentVersion', label: 'Agent Version', sortable: true, width: 120 },
  { id: 'agentId', field: 'agentId', label: 'Agent ID', sortable: true, width: 280 },
  { id: 'agentProxy', field: 'agentProxyText', label: 'Agent Proxy', sortable: true, width: 110 },
  { id: 'snmpProxy', field: 'snmpProxyText', label: 'SNMP Proxy', sortable: true, width: 110 },
  {
    id: 'snmpTrapProxy',
    field: 'snmpTrapProxyText',
    label: 'SNMP Trap Proxy',
    sortable: true,
    width: 130,
  },
  {
    id: 'syslogProxy',
    field: 'syslogProxyText',
    label: 'Syslog Proxy',
    sortable: true,
    width: 110,
  },
  { id: 'userAgent', field: 'userAgentText', label: 'User Agent', sortable: true, width: 110 },
  { id: 'zone', field: 'zoneName', label: 'Zone', sortable: true, width: 130 },
  {
    id: 'certificateExpiration',
    field: 'certificateExpirationText',
    sortField: 'certificateExpirationTime',
    label: 'Certificate Expiration',
    sortable: true,
    width: 170,
  },
  {
    id: 'connectionTime',
    field: 'connectionTimeText',
    sortField: 'connectionTime',
    label: 'Connection Time',
    sortable: true,
    width: 170,
  },
  { id: 'direction', field: 'directionLabel', label: 'Direction', sortable: true, width: 100 },
]

const ACTIONS_COLUMN = { id: 'actions', field: null, label: '', width: 48, reorderable: false }

const visibleColumns = computed(() => store.shownColumns(ALL_COLUMNS))
const tableColumns = computed(() => [...visibleColumns.value, ACTIONS_COLUMN])

const MONO_COLUMNS = new Set(['address', 'hardwareId', 'agentId'])

// CSV export of the visible columns, as legacy's ExportToCsvAction
function exportCsv(targetRows, filename) {
  downloadCsv(filename, toCsv(targetRows, visibleColumns.value))
}

const contextMenu = ref()

/** Inside a multi-row selection acts on the selection, outside it on the row under the cursor. */
function contextTargets() {
  const row = contextMenu.value?.contextData
  if (!row) return []
  return selectedIds.value.has(row.id) && selectedRows.value.length > 1 ? selectedRows.value : [row]
}

const contextMenuItems = computed(() => {
  const row = contextMenu.value?.contextData
  const targets = contextTargets()
  const multiple = targets.length > 1
  const suffix = multiple ? ` (${targets.length})` : ''
  const busy = !!row && pending.value.has(row.id)

  const items = []
  if (!multiple && row && !row.bound) {
    items.push(
      {
        label: 'Bind to Node...',
        icon: 'pi pi-link',
        disabled: !!row.bindBlocked || busy,
        command: () => openBind(row),
      },
      {
        label: 'Create Node and Bind...',
        icon: 'pi pi-plus',
        disabled: !!row.bindBlocked || busy,
        command: () => openCreateNode(row),
      },
    )
  } else {
    if (!multiple) {
      items.push({
        label: 'Go to Object',
        icon: 'pi pi-external-link',
        disabled: !row?.bound,
        command: () => router.push(nodeTarget(row)),
      })
    }
    const bound = targets.filter((t) => t.bound)
    items.push({
      label: `Unbind${multiple ? ` (${bound.length})` : ''}`,
      icon: 'pi pi-times-circle',
      class: 'p-menuitem-danger',
      disabled: bound.length === 0,
      command: () => confirmUnbind(contextTargets()),
    })
  }

  items.push(
    { separator: true },
    {
      label: `Export selected to CSV${suffix}`,
      icon: 'pi pi-file-export',
      command: () => exportCsv(contextTargets(), 'agent-tunnels-selected'),
    },
    {
      label: 'Export all to CSV',
      icon: 'pi pi-file-export',
      command: () => exportCsv(filteredRows.value, 'agent-tunnels'),
    },
  )
  return items
})

function onRowContextMenu({ event, row }) {
  contextMenu.value.show(event, row)
}

function onActionsClick(event, row) {
  contextMenu.value.show(event, row)
}

const pendingEntries = computed(() =>
  [...pending.value.entries()].map(([tunnelId, entry]) => ({ tunnelId, ...entry })),
)

function pendingText(entry) {
  return entry.phase === 'waiting'
    ? `Waiting for the agent to reconnect through the tunnel bound to "${entry.nodeName}"...`
    : `Binding tunnel ${entry.tunnelId} to "${entry.nodeName}"...`
}
</script>

<template>
  <div class="agent-tunnels-section">
    <SectionHeader title="Agent Tunnels" icon="pi pi-arrows-h">
      <template #actions>
        <Button
          v-tooltip.bottom="'Refresh'"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Refresh"
          @click="refetch"
        />
        <Button
          v-tooltip.bottom="'Export to CSV'"
          icon="pi pi-file-export"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Export to CSV"
          :disabled="isLoading || filteredRows.length === 0"
          @click="exportCsv(filteredRows, 'agent-tunnels')"
        />
      </template>
    </SectionHeader>

    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="section-toolbar">
      <SmartFilterInput
        v-model="filterState"
        placeholder="Filter by node, address, name, version..."
        class="filter-input"
      />
      <div class="toolbar-toggle">
        <Checkbox v-model="onlyProxies" input-id="tunnels-only-proxies" binary />
        <label for="tunnels-only-proxies">Proxies only</label>
      </div>
      <div class="toolbar-toggle">
        <Checkbox v-model="onlyUserAgent" input-id="tunnels-only-user-agent" binary />
        <label for="tunnels-only-user-agent">With user agent only</label>
      </div>
      <span v-if="!isLoading" class="item-count">{{ countText }}</span>
      <ColumnChooser
        v-model="store.visibleColumnIds"
        v-model:order="store.columnOrder"
        :columns="ALL_COLUMNS"
      />
    </div>

    <div v-for="entry in pendingEntries" :key="entry.tunnelId" class="activity-bar">
      <i class="pi pi-spin pi-spinner" aria-hidden="true" />
      <span>{{ pendingText(entry) }}</span>
    </div>

    <div v-if="selectedRows.length" class="selection-bar">
      <span class="selection-count">{{ plural(selectedRows.length) }} selected</span>
      <Button
        :label="selectedBound.length ? `Unbind (${selectedBound.length})` : 'Unbind'"
        icon="pi pi-times-circle"
        size="small"
        severity="danger"
        outlined
        :disabled="selectedBound.length === 0"
        @click="confirmUnbind(selectedRows)"
      />
      <Button
        label="Export"
        icon="pi pi-file-export"
        size="small"
        severity="secondary"
        outlined
        @click="exportCsv(selectedRows, 'agent-tunnels-selected')"
      />
      <Button label="Clear" size="small" text severity="secondary" @click="clearSelection" />
    </div>

    <div v-if="isLoading" class="section-loading">
      <Skeleton v-for="i in 12" :key="i" height="2rem" class="mb-2" />
    </div>

    <QueryErrorState v-else-if="isError" :error="error" class="section-error" @retry="refetch" />

    <AppTable
      v-else
      :columns="tableColumns"
      :rows="filteredRows"
      striped
      column-borders
      auto-width
      selectable
      :selected-ids="selectedIds"
      sort-field="boundSort"
      :sort-order="1"
      :page-size="50"
      storage-key="agent-tunnels"
      reorderable
      class="tunnels-table"
      @selection-change="selectedIds = $event"
      @column-move="store.moveColumn(ALL_COLUMNS, $event)"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <span v-if="col.id === 'state'" class="state-cell">
          <template v-if="pending.has(row.id)">
            <i class="pi pi-spin pi-spinner state-spinner" aria-hidden="true" />
            <span class="text-muted">Binding...</span>
          </template>
          <template v-else>
            <Tag
              :value="row.stateLabel"
              :severity="row.bound ? 'success' : 'warn'"
              outlined
              class="state-tag"
            />
            <i
              v-if="!row.bound && row.bindBlocked"
              v-tooltip.top="row.bindBlocked"
              class="pi pi-lock blocked-icon"
              aria-label="Cannot be bound"
            />
          </template>
        </span>
        <template v-else-if="col.id === 'node'">
          <AppLink v-if="row.bound" :to="nodeTarget(row)" class="cell-text" @click.stop>
            {{ row.nodeName }}
          </AppLink>
          <span v-else class="text-muted">-</span>
        </template>
        <Button
          v-else-if="col.id === 'actions'"
          icon="pi pi-ellipsis-v"
          text
          rounded
          severity="secondary"
          size="small"
          class="row-action-btn"
          aria-label="Actions"
          @click.stop="onActionsClick($event, row)"
        />
        <span
          v-else
          class="cell-text"
          :class="{ mono: MONO_COLUMNS.has(col.id), 'text-muted': !row[col.field] }"
          :title="row[col.field] || undefined"
        >
          {{ row[col.field] || '-' }}
        </span>
      </template>
      <template #empty>
        <div v-if="tunnels.length === 0" class="empty-message">
          No agent tunnels are connected. An agent opens one when its configuration names this
          server in <code>ServerConnection</code>.
        </div>
        <div v-else class="empty-message">No tunnels match the current filter.</div>
      </template>
    </AppTable>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />

    <AllObjectsPickerDialog
      v-model:visible="bindPickerVisible"
      title="Bind Tunnel to Node"
      :selectable="isNode"
      :perspective-classes="['ServiceRoot', 'Network']"
      @select="onBindNodePicked"
    />

    <CreateNodeDialog
      v-model:visible="createDialogVisible"
      header="Create Node and Bind Tunnel"
      :parent-object="infrastructureRoot"
      :prefill="createPrefill"
      hand-off
      force-unmanaged
      @created="onNodeCreated"
    >
      <template #intro>
        <p v-if="createTarget" class="create-intro">
          The node is created in Infrastructure Services, bound to tunnel {{ createTarget.id }} ({{
            createTarget.address || 'no address'
          }}), and set managed once its agent reconnects through the tunnel. Tick "Create as
          unmanaged object" under Advanced to leave it unmanaged. An agent reachable only through
          the tunnel needs no IP address.
        </p>
      </template>
    </CreateNodeDialog>
  </div>
</template>

<style scoped>
.agent-tunnels-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.section-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.filter-input {
  width: 340px;
}

.toolbar-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8125rem;
}

.toolbar-toggle label {
  cursor: pointer;
  user-select: none;
}

.item-count {
  margin-left: auto;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.activity-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  font-size: 0.8125rem;
  min-width: 0;
}

.activity-bar span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
}

.selection-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-right: 0.25rem;
}

.section-loading {
  padding: 1rem;
}

.section-error {
  justify-content: center;
  padding: 4rem 2rem;
}

.tunnels-table {
  flex: 1;
  min-height: 0;
}

.state-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.state-tag {
  font-size: 0.75rem;
}

.state-spinner {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.blocked-icon {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.cell-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono {
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.text-muted {
  color: var(--p-text-muted-color);
}

.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.create-intro {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--p-text-muted-color);
}
</style>
