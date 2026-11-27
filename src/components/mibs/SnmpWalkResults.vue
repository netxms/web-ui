<script setup>
/**
 * Variables of an SNMP walk (`useSnmpWalk`), as the bottom half of the MIB Explorer.
 *
 * @event select-oid - "Select in MIB tree" on a row, with the MIB object's OID
 * @event retry - the error state's Retry
 */
import { computed } from 'vue'
import Checkbox from 'primevue/checkbox'
import NodeTableView from '@/components/objects/NodeTableView.vue'
import { SNMP_WALK_LIMIT } from '@/composables/useSnmpWalk'

const props = defineProps({
  /** @type {import('vue').PropType<import('@/composables/useSnmpWalk').SnmpWalkRow[]>} */
  rows: { type: Array, required: true },
  /** `useSnmpWalk().status` */
  status: { type: String, required: true },
  error: { type: Error, default: null },
  truncated: { type: Boolean, default: false },
  /** `useSnmpWalk().target` */
  target: { type: Object, default: null },
  /** Shown before the first walk. */
  idleMessage: { type: String, required: true },
  exportName: { type: String, default: 'snmp-walk' },
})

const emit = defineEmits(['select-oid', 'retry'])

/** Legacy shows short textual names by default. */
const shortNames = defineModel('shortNames', { type: Boolean, default: true })

const nameField = computed(() => (shortNames.value ? 'name' : 'fullName'))

const columns = computed(() => [
  { id: 'oid', field: 'oid', sortField: 'seq', label: 'OID', sortable: true, width: 260 },
  { id: 'name', field: nameField.value, label: 'OID as Text', sortable: true, width: 240 },
  { id: 'type', field: 'type', label: 'Type', sortable: true, width: 160 },
  { id: 'value', field: 'value', label: 'Value', sortable: true, width: 320 },
  { id: 'rawValue', field: 'rawValue', label: 'Raw Value', sortable: true, width: 220 },
])

// As legacy's SnmpWalkFilter: the value, the OID and the full symbolic name.
const FILTER_FIELDS = ['value', 'oid', 'fullName']

const copyFields = computed(() => ['oid', nameField.value, 'type', 'value', 'rawValue'])

const copyItems = computed(() => [
  { name: 'OID', field: 'oid' },
  { name: 'OID as text', field: nameField.value },
  { name: 'Type', field: 'type' },
  { name: 'Value', field: 'value' },
  { name: 'Raw value', field: 'rawValue' },
])

function menuItems(targets, row) {
  return [
    {
      label: 'Select in MIB tree',
      icon: 'pi pi-sitemap',
      disabled: !row.objectOid,
      command: () => emit('select-oid', row.objectOid),
    },
  ]
}

/** A failure before any variable arrived is the table's error state; after, a toolbar note. */
const tableError = computed(() =>
  props.status === 'error' && props.rows.length === 0 ? props.error : null,
)

const note = computed(() => {
  const oid = props.target?.oid
  switch (props.status) {
    case 'running':
      return { icon: 'pi pi-spin pi-spinner', text: `Walking ${oid}...` }
    case 'stopped':
      return { icon: 'pi pi-stop-circle', text: 'Walk stopped' }
    case 'error':
      return props.rows.length
        ? {
            icon: 'pi pi-exclamation-triangle',
            severity: 'error',
            text: `The walk failed partway: ${props.error?.message ?? 'unknown error'}`,
          }
        : null
    case 'completed':
      return props.truncated
        ? {
            icon: 'pi pi-exclamation-triangle',
            severity: 'warn',
            text: `Stopped at ${SNMP_WALK_LIMIT.toLocaleString()} variables. Walk a narrower subtree for the rest.`,
          }
        : null
    default:
      return null
  }
})

const emptyMessage = computed(() => {
  switch (props.status) {
    case 'idle':
      return props.idleMessage
    case 'running':
      return 'Waiting for the node...'
    case 'stopped':
      return 'The walk was stopped before any variable arrived.'
    default:
      return `The node returned no variables under ${props.target?.oid}.`
  }
})
</script>

<template>
  <NodeTableView
    storage-key="snmp-walk"
    :export-name="exportName"
    :columns="columns"
    :rows="rows"
    :error="tableError"
    :filter-fields="FILTER_FIELDS"
    filter-placeholder="Filter by value, OID or name..."
    noun="variable"
    noun-plural="variables"
    :empty-message="emptyMessage"
    :copy-fields="copyFields"
    :copy-items="copyItems"
    :menu-items="menuItems"
    :page-size="100"
    @retry="emit('retry')"
  >
    <template #toolbar>
      <span
        v-if="note"
        class="walk-note"
        :class="note.severity ? `walk-note--${note.severity}` : null"
        role="status"
      >
        <i :class="note.icon" aria-hidden="true" />
        <span class="walk-note-text">{{ note.text }}</span>
      </span>
    </template>
    <template #toolbar-end>
      <label class="short-names">
        <Checkbox v-model="shortNames" binary input-id="snmp-walk-short-names" />
        <span>Short names</span>
      </label>
    </template>
    <template #cell="{ col, row }">
      <span v-if="col.id === 'oid' || col.id === 'rawValue'" class="mono">{{
        row[col.field]
      }}</span>
      <span v-else-if="col.id === 'name'" :class="{ 'mono-muted': !row[col.field] }">{{
        row[col.field] || '--'
      }}</span>
      <span v-else>{{ row[col.field] }}</span>
    </template>
  </NodeTableView>
</template>

<style scoped>
.walk-note {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.walk-note-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.walk-note--warn {
  color: var(--p-orange-500);
}

.walk-note--error {
  color: var(--p-red-500);
}

.short-names {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  white-space: nowrap;
  cursor: pointer;
}

.mono {
  font-family: var(--font-mono);
}

.mono-muted {
  color: var(--p-text-muted-color);
}
</style>
