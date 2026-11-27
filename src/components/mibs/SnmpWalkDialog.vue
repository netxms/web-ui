<script setup>
/**
 * Legacy MibWalkDialog: walks `oid` on a node when opened and lets one variable be picked.
 * Closing stops a walk still running.
 *
 * @event select - the picked `SnmpWalkRow`
 */
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import AppTable from '@/components/common/AppTable.vue'
import { SNMP_WALK_LIMIT, useSnmpWalk } from '@/composables/useSnmpWalk'

const props = defineProps({
  visible: { type: Boolean, required: true },
  objectId: { type: Number, default: null },
  snmpAgentName: { type: String, default: null },
  oid: { type: String, default: '' },
})

const emit = defineEmits(['update:visible', 'select'])

const walk = useSnmpWalk()
const search = ref('')

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      walk.clear()
      return
    }
    search.value = ''
    if (props.objectId && props.oid) {
      walk.start({ objectId: props.objectId, oid: props.oid, snmpAgentName: props.snmpAgentName })
    }
  },
  { immediate: true },
)

const COLUMNS = [
  { id: 'oid', field: 'oid', sortField: 'seq', label: 'OID', sortable: true, width: 240 },
  { id: 'name', field: 'name', label: 'OID as Text', sortable: true, width: 200 },
  { id: 'type', field: 'type', label: 'Type', sortable: true, width: 110 },
  { id: 'value', field: 'value', label: 'Value', sortable: true, width: 260 },
]

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const rows = walk.rows.value
  if (!q) return rows
  return rows.filter((row) =>
    [row.value, row.oid, row.fullName].some((v) =>
      String(v ?? '')
        .toLowerCase()
        .includes(q),
    ),
  )
})

const tableError = computed(() =>
  walk.status.value === 'error' && walk.rows.value.length === 0 ? walk.error.value : null,
)

const statusText = computed(() => {
  const count = walk.rows.value.length
  switch (walk.status.value) {
    case 'running':
      return `Walking... ${count.toLocaleString()} so far`
    case 'error':
      return count ? `The walk failed partway: ${walk.error.value?.message ?? ''}` : ''
    case 'completed':
      return walk.truncated.value
        ? `Stopped at ${SNMP_WALK_LIMIT.toLocaleString()} variables`
        : `${count.toLocaleString()} ${count === 1 ? 'variable' : 'variables'}`
    default:
      return ''
  }
})

const emptyText = computed(() => {
  if (search.value) return 'No variables match the filter'
  if (walk.running.value) return 'Waiting for the node...'
  return `The node returned no variables under ${props.oid}`
})

function onRowClick(row) {
  emit('select', row)
  emit('update:visible', false)
}

function retry() {
  walk.start({ objectId: props.objectId, oid: props.oid, snmpAgentName: props.snmpAgentName })
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="MIB Walk Results"
    modal
    :style="{ width: '900px' }"
    :breakpoints="{ '960px': '95vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="walk-layout">
      <div class="toolbar">
        <IconField style="width: 100%">
          <InputIcon class="pi pi-search" />
          <InputText
            v-model="search"
            data-filter-input
            placeholder="Filter by value, OID or name..."
            size="small"
            style="width: 100%"
            autofocus
          />
        </IconField>
      </div>

      <AppTable
        :columns="COLUMNS"
        :rows="filtered"
        :loading="walk.running.value && walk.rows.value.length === 0"
        :error="tableError"
        :page-size="100"
        striped
        column-borders
        resize-fit
        class="walk-table"
        @row-click="onRowClick"
        @retry="retry"
      >
        <template #cell="{ col, row }">
          <span v-if="col.id === 'oid'" class="mono" :title="row.oid">{{ row.oid }}</span>
          <span v-else class="cell-text" :title="row[col.field] || undefined">{{
            row[col.field]
          }}</span>
        </template>
        <template #empty>{{ emptyText }}</template>
      </AppTable>
    </div>

    <template #footer>
      <span class="footer-status" role="status">
        <i v-if="walk.running.value" class="pi pi-spin pi-spinner" aria-hidden="true" />
        {{ statusText }}
      </span>
      <span class="footer-hint">Click a variable to use its OID</span>
      <Button
        v-if="walk.running.value"
        label="Stop"
        icon="pi pi-stop"
        severity="secondary"
        size="small"
        outlined
        @click="walk.stop()"
      />
      <Button
        label="Cancel"
        severity="secondary"
        size="small"
        @click="emit('update:visible', false)"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.walk-layout {
  display: flex;
  flex-direction: column;
  height: 500px;
  margin: -1.25rem;
  margin-top: 0;
  overflow: hidden;
}

.toolbar {
  padding: 0.5rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
  flex-shrink: 0;
}

.walk-table {
  flex: 1;
  min-height: 0;
}

.mono {
  font-family: var(--font-mono);
}

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footer-status {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin-right: auto;
  min-width: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.footer-hint {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}
</style>
