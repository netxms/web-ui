<script setup>
/** The agent's service table; start, stop and the Windows start type go through the agent. */
import { computed, inject, watch } from 'vue'
import NodeTableView from '@/components/objects/NodeTableView.vue'
import { hasObjectRight } from '@/auth/objectAccessRights'
import { useAgentActions } from '@/composables/useAgentActions'
import { useServices } from '@/queries/useNodeInventoryQueries'
import { useObject } from '@/queries/useObjectQueries'
import { agentCommandLine } from '@/utils/agentCommand'
import { serviceRows } from '@/utils/nodeInventory'

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)

const { data, isLoading, isFetching, isError, error, refetch } = useServices(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const rows = computed(() => serviceRows(data.value?.table))

const COLUMNS = [
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 180 },
  { id: 'displayName', field: 'displayName', label: 'Display Name', sortable: true, width: 280 },
  { id: 'state', field: 'state', label: 'State', sortable: true, width: 100 },
  { id: 'pid', field: 'pid', sortField: 'pidSort', label: 'PID', sortable: true, width: 80 },
  { id: 'type', field: 'type', label: 'Type', sortable: true, width: 120 },
  { id: 'startup', field: 'startup', label: 'Startup', sortable: true, width: 140 },
  { id: 'runAs', field: 'runAs', label: 'Run As', sortable: true, width: 200 },
  { id: 'commandLine', field: 'commandLine', label: 'Command Line', sortable: true, width: 400 },
  { id: 'dependencies', field: 'dependencies', label: 'Dependencies', sortable: true, width: 200 },
]

const FILTER_FIELDS = COLUMNS.map((col) => col.field)
const COPY_FIELDS = FILTER_FIELDS

const { run, running } = useAgentActions(objectId, () => refetch())

// The tree's object carries no platform.
const { data: details } = useObject(objectId)

const canControl = computed(() => hasObjectRight(details.value ?? props.object, 'CONTROL'))

// Legacy offers start types only on Windows, where the agent implements them.
const isWindows = computed(() => (details.value?.platformName ?? '').startsWith('windows-'))

function serviceAction(targets, { label, icon, action, success }) {
  return {
    label,
    icon,
    disabled: !canControl.value || running.value,
    command: () =>
      run({
        commands: targets.map((row) => agentCommandLine(action, [row.name])),
        success,
        failure: 'Cannot execute service control command',
      }),
  }
}

const START = {
  label: 'Start',
  icon: 'pi pi-play',
  action: 'Service.Start',
  success: 'Service started',
}
const STOP = {
  label: 'Stop',
  icon: 'pi pi-stop',
  action: 'Service.Stop',
  success: 'Service stopped',
}

const START_TYPES = [
  { label: 'Automatic', action: 'Service.SetStartType.Automatic' },
  { label: 'Manual', action: 'Service.SetStartType.Manual' },
  { label: 'Disabled', action: 'Service.SetStartType.Disabled' },
]

const selectionActions = (selected) => [
  serviceAction(selected, START),
  serviceAction(selected, STOP),
]

function menuItems(targets) {
  const items = [serviceAction(targets, START), serviceAction(targets, STOP)]
  if (isWindows.value) {
    items.push(
      { separator: true },
      {
        label: 'Change Start Type',
        icon: 'pi pi-cog',
        disabled: !canControl.value || running.value,
        items: START_TYPES.map(({ label, action }) =>
          serviceAction(targets, { label, action, success: `Start type set to ${label}` }),
        ),
      },
    )
  }
  return items
}
</script>

<template>
  <NodeTableView
    storage-key="services"
    :export-name="`services-${object.name}`"
    :columns="COLUMNS"
    :rows="rows"
    :loading="isLoading"
    :is-fetching="isFetching"
    :error="isError ? error : null"
    sort-field="name"
    :sort-order="1"
    :filter-fields="FILTER_FIELDS"
    filter-placeholder="Filter services..."
    noun="service"
    noun-plural="services"
    empty-message="The agent reports no services."
    :copy-fields="COPY_FIELDS"
    selectable
    :selection-actions="selectionActions"
    :menu-items="menuItems"
    @retry="refetch()"
  />
</template>
