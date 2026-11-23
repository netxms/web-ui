<script setup>
/**
 * The agent's process table, read every 5 seconds while not paused, as legacy ProcessesView.
 * CPU % needs two samples, so it fills in from the second read on.
 */
import { computed, inject, ref, shallowRef, watch } from 'vue'
import Button from 'primevue/button'
import NodeTableView from '@/components/objects/NodeTableView.vue'
import { hasObjectRight } from '@/auth/objectAccessRights'
import { useAgentActions } from '@/composables/useAgentActions'
import { useCpuCount, useProcesses } from '@/queries/useNodeInventoryQueries'
import { useObject } from '@/queries/useObjectQueries'
import { agentCommandLine } from '@/utils/agentCommand'
import { processRows } from '@/utils/nodeInventory'

const REFRESH_INTERVAL = 5000

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)
const paused = ref(false)

const { data, dataUpdatedAt, isLoading, isFetching, isError, error, refetch } = useProcesses(
  objectId,
  { refetchInterval: computed(() => (paused.value ? false : REFRESH_INTERVAL)) },
)
const { data: cpuCount } = useCpuCount(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const rows = shallowRef([])
let previousSample = null

watch(objectId, () => {
  previousSample = null
  rows.value = []
})

watch(
  dataUpdatedAt,
  () => {
    if (!data.value) return
    const result = processRows(
      data.value.table,
      previousSample,
      cpuCount.value ?? 1,
      dataUpdatedAt.value,
    )
    previousSample = result.sample
    rows.value = result.rows
  },
  { immediate: true },
)

const COLUMNS = [
  { id: 'pid', field: 'pid', label: 'PID', sortable: true, width: 90 },
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 200 },
  { id: 'user', field: 'user', label: 'User', sortable: true, width: 140 },
  { id: 'threads', field: 'threads', label: 'Threads', sortable: true, width: 90 },
  { id: 'handles', field: 'handles', label: 'Handles', sortable: true, width: 90 },
  {
    id: 'vmSize',
    field: 'vmSize',
    sortField: 'vmSizeSort',
    label: 'VM Size',
    sortable: true,
    width: 110,
  },
  { id: 'rss', field: 'rss', sortField: 'rssSort', label: 'RSS', sortable: true, width: 110 },
  { id: 'cpu', field: 'cpu', sortField: 'cpuSort', label: 'CPU %', sortable: true, width: 90 },
  {
    id: 'memory',
    field: 'memory',
    sortField: 'memorySort',
    label: 'Memory %',
    sortable: true,
    width: 100,
  },
  { id: 'pageFaults', field: 'pageFaults', label: 'Page Faults', sortable: true, width: 110 },
  { id: 'ktime', field: 'ktime', label: 'System Time (ms)', sortable: true, width: 140 },
  { id: 'utime', field: 'utime', label: 'User Time (ms)', sortable: true, width: 130 },
  { id: 'commandLine', field: 'commandLine', label: 'Command Line', sortable: true, width: 500 },
]

const FILTER_FIELDS = ['name', 'commandLine', 'user']
const COPY_FIELDS = COLUMNS.map((col) => col.field)

const { run, running } = useAgentActions(objectId, () => refetch())

const { data: details } = useObject(objectId)
const canControl = computed(() => hasObjectRight(details.value ?? props.object, 'CONTROL'))

function terminate(targets) {
  run({
    commands: targets.map((row) => agentCommandLine('Process.Terminate', [row.pid])),
    success: targets.length === 1 ? 'Process terminated' : 'Processes terminated',
    failure: 'Cannot terminate process',
    confirm: {
      header: 'Terminate Process',
      message:
        targets.length === 1
          ? `Terminate process ${targets[0].name ?? ''} (PID ${targets[0].pid})?`
          : `Terminate ${targets.length} selected processes?`,
      acceptProps: { label: 'Terminate', severity: 'danger' },
    },
  })
}

function terminateAction(targets) {
  return {
    label: 'Terminate',
    icon: 'pi pi-times-circle',
    severity: 'danger',
    disabled: !canControl.value || running.value,
    command: () => terminate(targets),
  }
}

const selectionActions = (selected) => [terminateAction(selected)]
const menuItems = (targets) => [{ ...terminateAction(targets), label: 'Terminate...' }]
</script>

<template>
  <NodeTableView
    storage-key="processes"
    :export-name="`processes-${object.name}`"
    :columns="COLUMNS"
    :rows="rows"
    :loading="isLoading"
    :is-fetching="isFetching"
    :error="isError ? error : null"
    sort-field="name"
    :sort-order="1"
    :filter-fields="FILTER_FIELDS"
    filter-placeholder="Filter processes..."
    noun="process"
    noun-plural="processes"
    empty-message="The agent reports no processes."
    :copy-fields="COPY_FIELDS"
    selectable
    :selection-actions="selectionActions"
    :menu-items="menuItems"
    @retry="refetch()"
  >
    <template #toolbar-end>
      <Button
        v-tooltip.bottom="paused ? null : 'Refreshes every 5 seconds'"
        :label="paused ? 'Resume' : 'Pause'"
        :icon="paused ? 'pi pi-play' : 'pi pi-pause'"
        size="small"
        severity="secondary"
        text
        @click="paused = !paused"
      />
    </template>
  </NodeTableView>
</template>
