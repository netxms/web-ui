<script setup>
/**
 * Rows select rather than navigate; the right-click menu is the shared object menu for the
 * selection, followed by the table's own Copy and Export. Rows are mapped to display text once,
 * so sorting, filtering, copy and CSV export see what the cell shows.
 */
import { computed, inject, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import AppLink from '@/components/common/AppLink.vue'
import AppTable from '@/components/common/AppTable.vue'
import ColumnChooser from '@/components/common/ColumnChooser.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import ActionContextMenu from '@/components/actions/ActionContextMenu.vue'
import { useActions } from '@/composables/useActions'
import { useActionShortcuts } from '@/composables/useActionShortcuts'
import { useWorkingState } from '@/composables/useWorkingState'
import { useObjectChildren, useObjectsByIds } from '@/queries/useObjectQueries'
import { useObjectToolIcons, useObjectToolsForObject } from '@/queries/useObjectToolQueries'
import { useInterfaceTableStore } from '@/stores/interfaceTableStore'
import { downloadCsv, safeFilename, toCsv } from '@/utils/csvExport'
import {
  dot1xBackendStateText,
  dot1xPaeStateText,
  formatPhysicalLocation,
  formatUtilization,
  linesOf,
  ospfAreaText,
  ospfStateText,
  ospfTypeText,
  tabSeparatedRows,
} from '@/utils/interfaceDisplay'
import { notify, notifyAction } from '@/utils/notify'
import {
  formatIpAddress,
  formatSpeed,
  getInterfaceTypeName,
  getStatusInfo,
} from '@/utils/objectUtils'
import { configTarget, objectTarget } from '@/utils/routeTargets'
import { buildToolsContent, injectToolsIntoMenu } from '@/utils/toolMenuUtils'

const props = defineProps({
  object: { type: Object, required: true },
})

const router = useRouter()
const store = useInterfaceTableStore()

// `field` is the display text (see `rows`); `sortField` keeps numeric columns in numeric order.
// Legacy order, with its single Utilization column split in two for sorting.
const ALL_COLUMNS = [
  { id: 'id', label: 'ID', field: 'id', sortable: true },
  {
    id: 'name',
    label: 'Name',
    field: 'name',
    type: 'self-link',
    sortable: true,
    mandatory: true,
  },
  { id: 'alias', label: 'Alias', field: 'ifAlias', sortable: true },
  { id: 'index', label: 'Index', field: 'index', sortable: true },
  { id: 'description', label: 'Description', field: 'description', sortable: true },
  { id: 'ipAddresses', label: 'IP Addresses', field: 'ipText', sortable: false },
  { id: 'mac', label: 'MAC Address', field: 'macText', sortable: true },
  { id: 'vlans', label: 'VLANs', field: 'vlanText', sortable: false },
  { id: 'mtu', label: 'MTU', field: 'mtu', sortable: true },
  { id: 'speed', label: 'Speed', field: 'speedText', sortField: 'speed', sortable: true },
  {
    id: 'maxSpeed',
    label: 'Max Speed',
    field: 'maxSpeedText',
    sortField: 'maxSpeed',
    sortable: true,
  },
  {
    id: 'inUtil',
    label: 'In Utilization',
    field: 'inUtilText',
    sortField: 'inboundUtilization',
    sortable: true,
  },
  {
    id: 'outUtil',
    label: 'Out Utilization',
    field: 'outUtilText',
    sortField: 'outboundUtilization',
    sortable: true,
  },
  { id: 'type', label: 'Type', field: 'typeText', sortField: 'type', sortable: true },
  { id: 'location', label: 'Location', field: 'locationText', sortable: true },
  {
    id: 'adminState',
    label: 'Admin State',
    field: 'adminStateText',
    type: 'admin-state',
    sortable: true,
  },
  {
    id: 'operState',
    label: 'Oper State',
    field: 'operStateText',
    type: 'oper-state',
    sortable: true,
  },
  { id: 'expectedState', label: 'Expected State', field: 'expectedStateText', sortable: true },
  { id: 'stpState', label: 'STP State', field: 'stpPortStateText', sortable: true },
  {
    id: 'status',
    label: 'Status',
    field: 'statusText',
    sortField: 'status',
    type: 'status',
    sortable: true,
  },
  { id: 'ospfArea', label: 'OSPF Area', field: 'ospfAreaText', sortable: true },
  { id: 'ospfType', label: 'OSPF Type', field: 'ospfTypeText', sortable: true },
  { id: 'ospfState', label: 'OSPF State', field: 'ospfStateText', sortable: true },
  { id: 'dot1xPae', label: '802.1x PAE', field: 'dot1xPaeText', sortable: true },
  { id: 'dot1xBackend', label: '802.1x Backend', field: 'dot1xBackendText', sortable: true },
  { id: 'peerNode', label: 'Peer Node', field: 'peerNodeName', type: 'peer-node', sortable: true },
  {
    id: 'peerInterface',
    label: 'Peer Interface',
    field: 'peerInterfaceName',
    type: 'peer-interface',
    sortable: true,
  },
  { id: 'peerMac', label: 'Peer MAC', field: 'peerMac', sortable: true },
  { id: 'peerIp', label: 'Peer IP', field: 'peerIp', sortable: true },
  {
    id: 'peerProtocol',
    label: 'Peer Protocol',
    field: 'peerDiscoveryProtocolText',
    sortable: true,
  },
]

const visibleColumns = computed(() => store.shownColumns(ALL_COLUMNS))

const objectId = computed(() => props.object.id)

const {
  data: interfaceData,
  isLoading,
  isFetching,
  isError,
  error,
  refetch,
} = useObjectChildren(objectId, ['Interface'])

const interfaces = computed(() => interfaceData.value ?? [])

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

// The peer MAC and IP are not on the interface document (legacy reads the peer objects too).
const peerIds = computed(() => {
  const ids = new Set()
  for (const iface of interfaces.value) {
    if (iface.peerNodeId) ids.add(iface.peerNodeId)
    if (iface.peerInterfaceId) ids.add(iface.peerInterfaceId)
  }
  return [...ids]
})

const { objectsById: peerObjectsById } = useObjectsByIds(peerIds)

function peerName(id) {
  if (!id) return ''
  return peerObjectsById.value.get(id)?.name ?? `[${id}]`
}

const rows = computed(() =>
  interfaces.value.map((iface) => {
    const peerNode = peerObjectsById.value.get(iface.peerNodeId)
    const peerInterface = peerObjectsById.value.get(iface.peerInterfaceId)
    return {
      ...iface,
      ipText: iface.ipAddressList?.join(', ') ?? '',
      macText: iface.macAddress ?? '',
      statusText: getStatusInfo(iface.status).label,
      speedText: formatSpeed(iface.speed),
      maxSpeedText: formatSpeed(iface.maxSpeed),
      inUtilText: formatUtilization(iface.inboundUtilization),
      outUtilText: formatUtilization(iface.outboundUtilization),
      typeText: getInterfaceTypeName(iface.type),
      vlanText: iface.vlans?.join(', ') ?? '',
      locationText: formatPhysicalLocation(iface),
      ospfAreaText: ospfAreaText(iface),
      ospfTypeText: ospfTypeText(iface),
      ospfStateText: ospfStateText(iface),
      dot1xPaeText: dot1xPaeStateText(iface),
      dot1xBackendText: dot1xBackendStateText(iface),
      peerNodeName: peerName(iface.peerNodeId),
      peerInterfaceName: peerName(iface.peerInterfaceId),
      peerMac: peerInterface?.macAddress ?? '',
      peerIp: formatIpAddress(peerNode?.ipAddress) ?? '',
    }
  }),
)

const FILTER_FIELDS = ['name', 'macText', 'ipText', 'ifAlias', 'description']

const filterText = ref('')

const filteredRows = computed(() => {
  const q = filterText.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter((row) =>
    FILTER_FIELDS.some((field) =>
      String(row[field] ?? '')
        .toLowerCase()
        .includes(q),
    ),
  )
})

const selectedIds = ref(new Set())

useWorkingState('interfaces', { view: { filterText }, object: { selectedIds } })

/** A hidden row is never a silent target. */
const selectedRows = computed(() =>
  filteredRows.value.filter((row) => selectedIds.value.has(row.id)),
)

watch(filteredRows, (visible) => {
  const ids = new Set(visible.map((row) => row.id))
  if ([...selectedIds.value].some((id) => !ids.has(id))) {
    selectedIds.value = new Set([...selectedIds.value].filter((id) => ids.has(id)))
  }
})

const countText = computed(() => {
  const count = filteredRows.value.length
  const total = `${count} ${count === 1 ? 'interface' : 'interfaces'}`
  return selectedRows.value.length ? `${total}, ${selectedRows.value.length} selected` : total
})

function onRowClick(row) {
  selectedIds.value = new Set([row.id])
}

/** A range only with more than one row; `primary` is the row the menu was opened on. */
function contextFor(targets, primary = targets[0]) {
  if (!targets.length) return null
  return {
    object: primary,
    viewContext: 'interfaceTable',
    ...(targets.length > 1 ? { selection: targets } : {}),
  }
}

const menuRef = ref(null)
const menuContext = ref(null)
const { menuItems: objectMenuItems } = useActions(menuContext, { domains: ['object'] })

// Server-defined tools belong to one object, so a range gets only the static Tools items.
const menuToolsObjectId = computed(() =>
  menuContext.value && !menuContext.value.selection ? menuContext.value.object.id : null,
)
const { data: menuTools, isLoading: menuToolsLoading } = useObjectToolsForObject(menuToolsObjectId)
const { iconByToolId: menuToolIcons } = useObjectToolIcons(menuTools)

/** The input dialog and the result tab belong to ObjectsView. */
function executeTool(object, tool) {
  document.dispatchEvent(new CustomEvent('object:executeTool', { detail: { object, tool } }))
}

/** Inside the selection acts on all of it; outside, the clicked row becomes the selection. */
function onRowContextMenu({ event, row }) {
  if (!selectedIds.value.has(row.id)) selectedIds.value = new Set([row.id])
  menuContext.value = contextFor(selectedRows.value.length ? selectedRows.value : [row], row)
  menuRef.value?.show(event)
}

const menuItems = computed(() => {
  const ctx = menuContext.value
  if (!ctx) return []
  let items = objectMenuItems.value
  if (!ctx.selection) {
    const object = ctx.object
    items = injectToolsIntoMenu(
      items,
      buildToolsContent(menuTools.value, {
        loading: menuToolsLoading.value,
        onExecute: (tool) => executeTool(object, tool),
        iconByToolId: menuToolIcons.value,
        onCreateTool: () => router.push(configTarget('object-tools')),
      }),
    )
  }
  const targets = ctx.selection ?? [ctx.object]
  return [...items, { separator: true }, copyMenu(targets), exportItem(targets)]
})

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text)
    notifyAction(message, 'pi pi-copy')
  } catch {
    notify({ severity: 'error', summary: 'Could not copy to the clipboard' })
  }
}

function copiedMessage(count, what, whatPlural = `${what}s`) {
  if (count === 1) return `${what.charAt(0).toUpperCase()}${what.slice(1)} copied`
  return `${count} ${whatPlural} copied`
}

/** A row without the value keeps an empty line, so a pasted column lines up with the rows. */
function copyFieldItem(targets, { id, label, field, what, whatPlural }) {
  return {
    id: `interfaces.copy.${id}`,
    label,
    disabled: !targets.some((row) => row[field]),
    command: () =>
      copyText(
        linesOf(targets, (row) => row[field]),
        copiedMessage(targets.length, what, whatPlural),
      ),
  }
}

function copyMenu(targets) {
  return {
    id: 'interfaces.copy',
    label: 'Copy',
    icon: 'pi pi-copy',
    items: [
      {
        id: 'interfaces.copy.rows',
        label: targets.length === 1 ? 'Row' : 'Rows',
        command: () =>
          copyText(
            tabSeparatedRows(targets, visibleColumns.value, (row, col) => row[col.field]),
            copiedMessage(targets.length, 'row'),
          ),
      },
      { separator: true },
      copyFieldItem(targets, {
        id: 'mac',
        label: 'MAC address',
        field: 'macText',
        what: 'MAC address',
        whatPlural: 'MAC addresses',
      }),
      copyFieldItem(targets, {
        id: 'ip',
        label: 'IP address',
        field: 'ipText',
        what: 'IP address',
        whatPlural: 'IP addresses',
      }),
      copyFieldItem(targets, {
        id: 'peerName',
        label: 'Peer node name',
        field: 'peerNodeName',
        what: 'peer node name',
      }),
      copyFieldItem(targets, {
        id: 'peerMac',
        label: 'Peer MAC address',
        field: 'peerMac',
        what: 'peer MAC address',
        whatPlural: 'peer MAC addresses',
      }),
      copyFieldItem(targets, {
        id: 'peerIp',
        label: 'Peer IP address',
        field: 'peerIp',
        what: 'peer IP address',
        whatPlural: 'peer IP addresses',
      }),
    ],
  }
}

function exportCsv(targets) {
  const columns = visibleColumns.value.map(({ field, label }) => ({ field, label }))
  downloadCsv(
    safeFilename(`${props.object.name}-interfaces`, 'interfaces'),
    toCsv(targets, columns),
  )
}

function exportItem(targets) {
  return {
    id: 'interfaces.export',
    label: targets.length === 1 ? 'Export row to CSV' : 'Export rows to CSV',
    icon: 'pi pi-download',
    command: () => exportCsv(targets),
  }
}

/** The selection when there is one, otherwise every row the filter shows. */
function onExportClick() {
  exportCsv(selectedRows.value.length ? selectedRows.value : filteredRows.value)
}

// Del deletes the selected rows only while the keyboard is in the table; F2 stays
// ObjectsView's (it renames the node).
const tableRef = ref(null)
const tableElement = computed(() => tableRef.value?.$el ?? null)
const { menuItems: selectionMenuItems } = useActions(
  computed(() => contextFor(selectedRows.value)),
  { domains: ['object'] },
)
useActionShortcuts(
  computed(() => selectionMenuItems.value.filter((item) => item.shortcut === 'Del')),
  { containerRef: tableElement, rowScopedShortcuts: ['Del'] },
)

// Avoids a PrimeVue Tag per row.
function operStateClass(state) {
  if (state === 1) return 'if-tag-up'
  if (state === 2) return 'if-tag-down'
  if (state === 3) return 'if-tag-testing'
  return 'if-tag-unknown'
}

function adminStateClass(state) {
  if (state === 1) return 'if-tag-up'
  if (state === 2) return 'if-tag-disabled'
  if (state === 3) return 'if-tag-testing'
  return 'if-tag-unknown'
}

/** The shared status palette, as `StatusTag` draws it. */
function statusStyle(status) {
  const info = getStatusInfo(status)
  return { background: info.bgColor, color: info.textColor }
}

function cellText(row, col) {
  const value = row[col.field]
  return value === '' || value == null || value === 0 ? '--' : value
}
</script>

<template>
  <div class="interfaces-view">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="interfaces-toolbar">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filterText"
          data-filter-input
          placeholder="Filter interfaces..."
          class="interfaces-filter"
        />
      </IconField>
      <span v-if="!isLoading" class="interfaces-count">{{ countText }}</span>
      <Button
        icon="pi pi-download"
        :label="selectedRows.length ? 'Export selected' : 'Export'"
        severity="secondary"
        text
        size="small"
        :disabled="filteredRows.length === 0"
        @click="onExportClick"
      />
      <ColumnChooser
        v-model="store.visibleColumnIds"
        v-model:order="store.columnOrder"
        :columns="ALL_COLUMNS"
      />
    </div>

    <AppTable
      ref="tableRef"
      :columns="visibleColumns"
      :rows="filteredRows"
      :loading="isLoading"
      :error="isError ? error : null"
      :column-borders="true"
      :page-size="50"
      :page-size-options="[25, 50, 100, 200, 500]"
      storage-key="interfaces"
      reorderable
      sort-field="name"
      :sort-order="1"
      auto-width
      selectable
      :selected-ids="selectedIds"
      class="interfaces-app-table"
      @selection-change="selectedIds = $event"
      @row-click="onRowClick"
      @row-contextmenu="onRowContextMenu"
      @column-move="store.moveColumn(ALL_COLUMNS, $event)"
      @retry="refetch"
    >
      <template #cell="{ col, row }">
        <AppLink
          v-if="col.type === 'self-link'"
          :to="objectTarget(row)"
          class="cell-link"
          @click.stop
        >
          {{ row.name }}
        </AppLink>
        <template v-else-if="col.type === 'peer-node'">
          <AppLink
            v-if="row.peerNodeId"
            :to="objectTarget({ id: row.peerNodeId, class: 'Node' })"
            class="cell-link"
            @click.stop
          >
            {{ row.peerNodeName }}
          </AppLink>
          <span v-else>--</span>
        </template>
        <template v-else-if="col.type === 'peer-interface'">
          <AppLink
            v-if="row.peerInterfaceId"
            :to="objectTarget({ id: row.peerInterfaceId, class: 'Interface' })"
            class="cell-link"
            @click.stop
          >
            {{ row.peerInterfaceName }}
          </AppLink>
          <span v-else>--</span>
        </template>
        <span
          v-else-if="col.type === 'oper-state'"
          class="if-tag"
          :class="operStateClass(row.operState)"
        >
          {{ row.operStateText || 'Unknown' }}
        </span>
        <span
          v-else-if="col.type === 'admin-state'"
          class="if-tag"
          :class="adminStateClass(row.adminState)"
        >
          {{ row.adminStateText || 'Unknown' }}
        </span>
        <span v-else-if="col.type === 'status'" class="if-tag" :style="statusStyle(row.status)">
          {{ row.statusText }}
        </span>
        <span v-else>{{ cellText(row, col) }}</span>
      </template>
      <template #empty>No interfaces found</template>
    </AppTable>

    <ActionContextMenu ref="menuRef" :items="menuItems" />
  </div>
</template>

<style scoped>
.interfaces-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.interfaces-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-content-border-color);
  flex-shrink: 0;
}

.interfaces-filter {
  width: 260px;
}

.interfaces-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  margin-right: auto;
}

.interfaces-app-table {
  flex: 1;
  min-height: 0;
}

.cell-link {
  color: var(--p-primary-color);
  text-decoration: none;
}

.cell-link:hover {
  text-decoration: underline;
}

.if-tag {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: var(--p-border-radius-sm, 4px);
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
}

.if-tag-up {
  background: #d1fae5;
  color: #065f46;
}
.if-tag-down {
  background: #fee2e2;
  color: #7f1d1d;
}
.if-tag-testing {
  background: #fef9c3;
  color: #854d0e;
}

/* Dark variants: background is the hue at 22% lightness, text at 78%, as in the status
   helpers in src/utils/objectUtils.js. */
html.app-dark .if-tag-up {
  background: #145c37;
  color: #9af3da;
}
html.app-dark .if-tag-down {
  background: #620e0e;
  color: #e7a7a7;
}
html.app-dark .if-tag-testing {
  background: #645c0d;
  color: #f0c99e;
}
.if-tag-disabled {
  background: var(--p-surface-100, #f3f4f6);
  color: var(--p-text-muted-color);
  border: 1px solid var(--p-content-border-color);
}
.if-tag-unknown {
  background: var(--p-surface-100, #f3f4f6);
  color: var(--p-text-muted-color);
}
</style>
