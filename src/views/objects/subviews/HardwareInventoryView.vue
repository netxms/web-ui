<script setup>
/**
 * Two sources, as legacy HardwareInventoryView: the components the agent reports, or the
 * ENTITY-MIB component tree. A node with only one gets that one; with both the user picks.
 * Assets linked to a component show in the Asset column (linking needs the NXCP-only
 * link/unlink requests, so there are no asset actions).
 */
import { computed, inject, ref, watch } from 'vue'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import AppLink from '@/components/common/AppLink.vue'
import NodeTableView from '@/components/objects/NodeTableView.vue'
import { useWorkingState } from '@/composables/useWorkingState'
import {
  useComponentAssets,
  useHardwareInventory,
  usePhysicalComponents,
} from '@/queries/useNodeInventoryQueries'
import { useObject } from '@/queries/useObjectQueries'
import { flattenComponentTree, toHardwareRow, visibleTreeRows } from '@/utils/nodeInventory'
import { objectTarget } from '@/utils/routeTargets'

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)

// The tree's object carries no capabilities.
const { data: details } = useObject(objectId)
const capabilities = computed(() => details.value?.capabilities ?? null)

const hasAgentSource = computed(() => !!capabilities.value?.isNativeAgent)
const hasEntityMibSource = computed(
  () => !!(capabilities.value?.hasEntityMib || capabilities.value?.emulatedEntityMib),
)

const SOURCE_OPTIONS = [
  { label: 'Agent', value: 'agent' },
  { label: 'ENTITY-MIB', value: 'entityMib' },
]

const preferredSource = ref('agent')
const collapsed = ref(new Set())

useWorkingState('hardware-inventory', {
  view: { preferredSource },
  object: { collapsed },
})

/** Null until the node's capabilities are known. */
const source = computed(() => {
  if (!capabilities.value) return null
  if (preferredSource.value === 'entityMib' && hasEntityMibSource.value) return 'entityMib'
  return hasAgentSource.value ? 'agent' : 'entityMib'
})

const hardware = useHardwareInventory(objectId, {
  enabled: computed(() => source.value === 'agent'),
})
const components = usePhysicalComponents(objectId, {
  enabled: computed(() => source.value === 'entityMib'),
})
const { data: assets, refetch: refetchAssets } = useComponentAssets(objectId)

const active = computed(() => (source.value === 'entityMib' ? components : hardware))

function refetch() {
  if (!source.value) return
  active.value.refetch()
  refetchAssets()
}

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, refetch)

const assetMap = computed(() => assets.value ?? new Map())

const hardwareRows = computed(() =>
  (hardware.data.value?.entries ?? []).map((entry, index) =>
    toHardwareRow(entry, index, assetMap.value),
  ),
)

const treeRows = computed(() =>
  flattenComponentTree(components.data.value?.root ?? null, assetMap.value),
)

// Servers before the component tree endpoint answer 404 for it.
const treeUnsupported = computed(
  () => source.value === 'entityMib' && components.error.value?.status === 404,
)

const AGENT_COLUMNS = [
  {
    id: 'category',
    field: 'category',
    sortField: 'categorySort',
    label: 'Category',
    sortable: true,
    width: 150,
  },
  { id: 'index', field: 'index', label: 'Index', sortable: true, width: 80 },
  { id: 'type', field: 'type', label: 'Type', sortable: true, width: 150 },
  { id: 'vendor', field: 'vendor', label: 'Vendor', sortable: true, width: 180 },
  { id: 'model', field: 'model', label: 'Model', sortable: true, width: 220 },
  {
    id: 'capacity',
    field: 'capacity',
    sortField: 'capacitySort',
    label: 'Capacity',
    sortable: true,
    width: 120,
  },
  { id: 'partNumber', field: 'partNumber', label: 'Part Number', sortable: true, width: 150 },
  { id: 'serial', field: 'serial', label: 'Serial Number', sortable: true, width: 180 },
  { id: 'location', field: 'location', label: 'Location', sortable: true, width: 150 },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 260 },
  { id: 'asset', field: 'asset', label: 'Asset', sortable: true, width: 180 },
]

// Tree order is the device's containment order, so no column sorts.
const TREE_COLUMNS = [
  { id: 'name', field: 'name', label: 'Name', width: 280 },
  { id: 'class', field: 'class', label: 'Class', width: 120 },
  { id: 'description', field: 'description', label: 'Description', width: 260 },
  { id: 'model', field: 'model', label: 'Model', width: 180 },
  { id: 'firmware', field: 'firmware', label: 'Firmware', width: 140 },
  { id: 'serial', field: 'serial', label: 'Serial Number', width: 180 },
  { id: 'vendor', field: 'vendor', label: 'Vendor', width: 160 },
  { id: 'interface', field: 'interface', label: 'Interface', width: 140 },
  { id: 'asset', field: 'asset', label: 'Asset', width: 180 },
]

const AGENT_FIELDS = [
  'category',
  'type',
  'vendor',
  'model',
  'capacity',
  'partNumber',
  'serial',
  'location',
  'description',
  'asset',
]
const TREE_FIELDS = [
  'name',
  'class',
  'description',
  'model',
  'firmware',
  'serial',
  'vendor',
  'interface',
  'asset',
]

const COPY_ITEMS = [
  { name: 'Description', field: 'description' },
  { name: 'Model', field: 'model' },
  { name: 'Serial number', field: 'serial' },
]
const TREE_COPY_ITEMS = [{ name: 'Name', field: 'name' }, ...COPY_ITEMS]

function filterTree(rows, text) {
  const matches = text
    ? (row) =>
        TREE_FIELDS.some((field) =>
          String(row[field] ?? '')
            .toLowerCase()
            .includes(text),
        )
    : null
  return visibleTreeRows(rows, collapsed.value, matches)
}

function toggle(id) {
  const next = new Set(collapsed.value)
  if (!next.delete(id)) next.add(id)
  collapsed.value = next
}

function expandAll() {
  collapsed.value = new Set()
}

function collapseAll() {
  collapsed.value = new Set(treeRows.value.filter((row) => row.hasChildren).map((row) => row.id))
}
</script>

<template>
  <NodeTableView
    v-if="source !== 'entityMib'"
    key="agent"
    storage-key="hardware-inventory"
    :export-name="`hardware-inventory-${object.name}`"
    :columns="AGENT_COLUMNS"
    :rows="hardwareRows"
    :loading="!source || hardware.isLoading.value"
    :is-fetching="hardware.isFetching.value"
    :error="hardware.isError.value ? hardware.error.value : null"
    sort-field="categorySort"
    :sort-order="1"
    :filter-fields="AGENT_FIELDS"
    filter-placeholder="Filter components..."
    noun="component"
    noun-plural="components"
    :collected="hardware.data.value?.entries != null"
    not-collected-message="No hardware inventory collected for this node yet. It is read during a configuration poll."
    empty-message="The node reports no hardware components."
    :copy-fields="AGENT_FIELDS"
    :copy-items="COPY_ITEMS"
    @retry="refetch"
  >
    <template v-if="hasEntityMibSource" #toolbar>
      <SelectButton
        v-model="preferredSource"
        :options="SOURCE_OPTIONS"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        size="small"
        aria-label="Inventory source"
      />
    </template>
    <template #cell="{ col, row }">
      <AppLink
        v-if="col.id === 'asset' && row.assetId"
        :to="objectTarget({ id: row.assetId, class: 'Asset' })"
        class="cell-link"
        >{{ row.asset }}</AppLink
      >
      <span v-else>{{ row[col.field] ?? '--' }}</span>
    </template>
  </NodeTableView>

  <NodeTableView
    v-else
    key="entityMib"
    storage-key="physical-components"
    :export-name="`physical-components-${object.name}`"
    :columns="TREE_COLUMNS"
    :rows="treeRows"
    :loading="components.isLoading.value"
    :is-fetching="components.isFetching.value"
    :error="components.isError.value && !treeUnsupported ? components.error.value : null"
    :filter-fields="TREE_FIELDS"
    :filter="filterTree"
    filter-placeholder="Filter components..."
    noun="component"
    noun-plural="components"
    :collected="!treeUnsupported && components.data.value?.root != null"
    :not-collected-message="
      treeUnsupported
        ? 'This server does not provide the ENTITY-MIB component tree.'
        : 'No ENTITY-MIB components collected for this node yet. They are read during a configuration poll.'
    "
    empty-message="No components match the filter."
    :copy-fields="TREE_FIELDS"
    :copy-items="TREE_COPY_ITEMS"
    @retry="refetch"
  >
    <template v-if="hasAgentSource" #toolbar>
      <SelectButton
        v-model="preferredSource"
        :options="SOURCE_OPTIONS"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        size="small"
        aria-label="Inventory source"
      />
    </template>
    <template #toolbar-end>
      <Button
        v-tooltip.bottom="'Expand all'"
        icon="pi pi-angle-double-down"
        size="small"
        severity="secondary"
        text
        rounded
        aria-label="Expand all"
        :disabled="!treeRows.length"
        @click="expandAll"
      />
      <Button
        v-tooltip.bottom="'Collapse all'"
        icon="pi pi-angle-double-up"
        size="small"
        severity="secondary"
        text
        rounded
        aria-label="Collapse all"
        :disabled="!treeRows.length"
        @click="collapseAll"
      />
    </template>
    <template #cell="{ col, row, filtering }">
      <span v-if="col.id === 'name'" class="tree-cell" :style="{ '--tree-depth': row.depth }">
        <button
          v-if="row.hasChildren && !filtering"
          type="button"
          class="tree-toggle"
          :aria-label="collapsed.has(row.id) ? `Expand ${row.name}` : `Collapse ${row.name}`"
          :aria-expanded="!collapsed.has(row.id)"
          @click.stop="toggle(row.id)"
        >
          <i :class="collapsed.has(row.id) ? 'pi pi-chevron-right' : 'pi pi-chevron-down'" />
        </button>
        <span v-else class="tree-toggle-space" />
        <span class="tree-name">{{ row.name }}</span>
      </span>
      <AppLink
        v-else-if="col.id === 'asset' && row.assetId"
        :to="objectTarget({ id: row.assetId, class: 'Asset' })"
        class="cell-link"
        >{{ row.asset }}</AppLink
      >
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

.tree-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding-inline-start: calc(var(--tree-depth) * 1.25rem);
  min-width: 0;
}

.tree-toggle,
.tree-toggle-space {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
}

.tree-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--p-border-radius-sm);
  background: none;
  color: var(--p-text-muted-color);
  cursor: pointer;
}

.tree-toggle:hover {
  background: var(--p-content-hover-background);
  color: var(--p-text-color);
}

.tree-toggle:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 1px;
}

.tree-toggle .pi {
  font-size: 0.75rem;
}

.tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
