<script setup>
/** Packages as the last configuration poll stored them; uninstall goes through the agent. */
import { computed, inject, watch } from 'vue'
import NodeTableView from '@/components/objects/NodeTableView.vue'
import { hasObjectRight } from '@/auth/objectAccessRights'
import { useAgentActions } from '@/composables/useAgentActions'
import { useSoftwareInventory } from '@/queries/useNodeInventoryQueries'
import { useObject } from '@/queries/useObjectQueries'
import { agentCommandLine } from '@/utils/agentCommand'
import { toSoftwareRow } from '@/utils/nodeInventory'

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)

const { data, isLoading, isFetching, isError, error, refetch } = useSoftwareInventory(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const rows = computed(() => (data.value?.entries ?? []).map(toSoftwareRow))

const COLUMNS = [
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 240 },
  { id: 'version', field: 'version', label: 'Version', sortable: true, width: 140 },
  { id: 'user', field: 'user', label: 'User', sortable: true, width: 140 },
  { id: 'vendor', field: 'vendor', label: 'Vendor', sortable: true, width: 200 },
  {
    id: 'date',
    field: 'date',
    sortField: 'dateSort',
    label: 'Install Date',
    sortable: true,
    width: 130,
  },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 320 },
  { id: 'url', field: 'url', label: 'URL', sortable: true, width: 220 },
]

const FILTER_FIELDS = ['name', 'version', 'user', 'vendor', 'description']
const COPY_FIELDS = ['name', 'version', 'user', 'vendor', 'date', 'description', 'url']

const { run } = useAgentActions(objectId, () => refetch())

const { data: details } = useObject(objectId)
const canControl = computed(() => hasObjectRight(details.value ?? props.object, 'CONTROL'))

function uninstall(row) {
  run({
    commands: [agentCommandLine('System.UninstallProduct', [row.uninstallKey])],
    success: 'Uninstall requested',
    failure: 'Cannot uninstall software package',
    confirm: {
      header: 'Uninstall Package',
      message:
        `Request uninstall of "${row.name}"? Uninstallation may fail if the package does not ` +
        'support unattended removal.',
      acceptProps: { label: 'Uninstall', severity: 'danger' },
    },
  })
}

// As legacy: one package at a time, and only one the agent can name for its uninstaller.
function menuItems(targets, row) {
  if (!row.uninstallKey) return []
  return [
    {
      label: 'Uninstall...',
      icon: 'pi pi-trash',
      disabled: !canControl.value,
      command: () => uninstall(row),
    },
  ]
}

function isWebUrl(url) {
  return /^https?:\/\//i.test(url ?? '')
}
</script>

<template>
  <NodeTableView
    storage-key="software-inventory"
    :export-name="`software-inventory-${object.name}`"
    :columns="COLUMNS"
    :rows="rows"
    :loading="isLoading"
    :is-fetching="isFetching"
    :error="isError ? error : null"
    sort-field="name"
    :sort-order="1"
    :filter-fields="FILTER_FIELDS"
    filter-placeholder="Filter packages..."
    noun="package"
    noun-plural="packages"
    :collected="data?.entries != null"
    not-collected-message="No software inventory collected for this node yet. It is read during a configuration poll."
    empty-message="The node reports no installed software."
    :copy-fields="COPY_FIELDS"
    :menu-items="menuItems"
    @retry="refetch()"
  >
    <template #cell="{ col, row }">
      <a
        v-if="col.id === 'url' && isWebUrl(row.url)"
        :href="row.url"
        target="_blank"
        rel="noopener noreferrer"
        class="cell-link"
        >{{ row.url }}</a
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
</style>
