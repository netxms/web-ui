<script setup>
/**
 * Sessions open on the node, read live from its agent every 30 seconds while shown, as legacy
 * UserSessionsView. A screenshot needs a session agent running in the session.
 */
import { computed, inject, watch } from 'vue'
import NodeTableView from '@/components/objects/NodeTableView.vue'
import { hasObjectRight } from '@/auth/objectAccessRights'
import { useAgentActions } from '@/composables/useAgentActions'
import { useUserSessions } from '@/queries/useNodeInventoryQueries'
import { useObject } from '@/queries/useObjectQueries'
import { agentCommandLine } from '@/utils/agentCommand'
import { toSessionRow } from '@/utils/nodeInventory'

const REFRESH_INTERVAL = 30000

const props = defineProps({
  object: { type: Object, required: true },
})

const objectId = computed(() => props.object.id)

const { data, isLoading, isFetching, isError, error, refetch } = useUserSessions(objectId, {
  refetchInterval: REFRESH_INTERVAL,
})

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const rows = computed(() => (data.value?.entries ?? []).map(toSessionRow))

const COLUMNS = [
  { id: 'id', field: 'id', label: 'ID', sortable: true, width: 80 },
  { id: 'user', field: 'user', label: 'User', sortable: true, width: 150 },
  { id: 'terminal', field: 'terminal', label: 'Terminal', sortable: true, width: 150 },
  { id: 'state', field: 'state', label: 'State', sortable: true, width: 120 },
  { id: 'clientName', field: 'clientName', label: 'Client Name', sortable: true, width: 150 },
  {
    id: 'clientAddress',
    field: 'clientAddress',
    sortField: 'clientAddressSort',
    label: 'Client Address',
    sortable: true,
    width: 150,
  },
  { id: 'display', field: 'display', label: 'Display', sortable: true, width: 130 },
  {
    id: 'loginTime',
    field: 'loginTime',
    sortField: 'loginTimeSort',
    label: 'Login Time',
    sortable: true,
    width: 180,
  },
  {
    id: 'idleTime',
    field: 'idleTime',
    sortField: 'idleTimeSort',
    label: 'Idle Time',
    sortable: true,
    width: 110,
  },
  { id: 'agentType', field: 'agentType', label: 'Agent Type', sortable: true, width: 110 },
  { id: 'agentPid', field: 'agentPid', label: 'Agent PID', sortable: true, width: 100 },
]

const FILTER_FIELDS = ['user', 'terminal', 'state', 'clientName', 'clientAddress']
const COPY_FIELDS = COLUMNS.map((col) => col.field)

const { run, running } = useAgentActions(objectId, () => refetch())

const { data: details } = useObject(objectId)
const canControl = computed(() => hasObjectRight(details.value ?? props.object, 'CONTROL'))
const canScreenshot = computed(() => hasObjectRight(details.value ?? props.object, 'SCREENSHOT'))

function takeScreenshot(row) {
  document.dispatchEvent(
    new CustomEvent('object:screenshot', {
      detail: { object: props.object, sessionName: row.screenshotSession },
    }),
  )
}

function logOff(targets) {
  run({
    commands: targets.map((row) => agentCommandLine('System.TerminateUserSession', [row.id])),
    success: targets.length === 1 ? 'Session logged off' : 'Sessions logged off',
    failure: 'Cannot log off user session',
    confirm: {
      header: 'Log Off',
      message:
        targets.length === 1
          ? `Log off ${targets[0].user ?? 'the user'} (session ${targets[0].id})?`
          : `Log off ${targets.length} selected sessions?`,
      acceptProps: { label: 'Log Off', severity: 'danger' },
    },
  })
}

function screenshotAction(targets) {
  const [row] = targets
  return {
    label: 'Take Screenshot',
    icon: 'pi pi-image',
    disabled: targets.length !== 1 || !row.hasSessionAgent || !canScreenshot.value,
    command: () => takeScreenshot(row),
  }
}

function logOffAction(targets) {
  return {
    label: 'Log Off',
    icon: 'pi pi-sign-out',
    severity: 'danger',
    disabled: !canControl.value || running.value,
    command: () => logOff(targets),
  }
}

const selectionActions = (selected) => [screenshotAction(selected), logOffAction(selected)]
const menuItems = (targets) => [
  screenshotAction(targets),
  { ...logOffAction(targets), label: 'Log Off...' },
]
</script>

<template>
  <NodeTableView
    storage-key="user-sessions"
    :export-name="`user-sessions-${object.name}`"
    :columns="COLUMNS"
    :rows="rows"
    :loading="isLoading"
    :is-fetching="isFetching"
    :error="isError ? error : null"
    sort-field="id"
    :sort-order="1"
    :filter-fields="FILTER_FIELDS"
    filter-placeholder="Filter sessions..."
    noun="session"
    noun-plural="sessions"
    empty-message="No user sessions are open on this node."
    :copy-fields="COPY_FIELDS"
    selectable
    :selection-actions="selectionActions"
    :menu-items="menuItems"
    @retry="refetch()"
  />
</template>
