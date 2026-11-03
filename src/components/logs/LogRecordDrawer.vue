<script setup>
import { computed } from 'vue'
import LogCell from './LogCell.vue'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import RecordPanel from '@/components/common/RecordPanel.vue'
import { useLogRecord } from '@/queries/useLogQueries'
import { useLogPrefsStore } from '@/stores/logPrefsStore'
import { COLUMN_KIND, getColumnKind, getColumnLabel } from '@/utils/logColumnTypes'

// Query results omit `detail` columns; only the single-record endpoint returns them. The row
// in hand is the placeholder.
const props = defineProps({
  visible: { type: Boolean, default: false },
  logName: { type: String, required: true },
  row: { type: Object, default: null },
  columns: { type: Array, default: () => [] },
  recordIdColumn: { type: String, default: null },
  resolver: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:visible'])

// `setDrawerWidth` clamps to RecordPanel's default bounds in the store.
const prefs = useLogPrefsStore()

// Syslog and SNMP traps name a record id column they do not return: nothing to fetch with.
const recordId = computed(() => {
  if (!props.recordIdColumn || !props.row) return null
  return props.row[props.recordIdColumn] ?? null
})

const enabled = computed(() => props.visible && recordId.value != null)

const {
  data: record,
  isLoading,
  error,
  refetch,
} = useLogRecord(
  computed(() => (enabled.value ? props.logName : null)),
  computed(() => (enabled.value ? recordId.value : null)),
)

const source = computed(() => record.value ?? props.row ?? {})

const WIDE_KINDS = new Set([COLUMN_KIND.JSON])
const WIDE_VALUE_LENGTH = 90

const fields = computed(() =>
  props.columns
    .filter((column) => column.name in source.value)
    .map((column) => {
      const value = source.value[column.name]
      const kind = getColumnKind(column.type)
      const wide =
        WIDE_KINDS.has(kind) ||
        (kind === COLUMN_KIND.TEXT && String(value ?? '').length > WIDE_VALUE_LENGTH)
      return { column, value, wide }
    }),
)

const hasDetailColumns = computed(() => props.columns.some((column) => column.detail))

const title = computed(() =>
  recordId.value == null ? 'Record details' : `Record ${recordId.value}`,
)
</script>

<template>
  <RecordPanel
    :visible="visible"
    :title="title"
    icon="pi pi-list"
    :width="prefs.drawerWidth"
    resize-label="Resize record panel"
    @update:visible="emit('update:visible', $event)"
    @update:width="prefs.setDrawerWidth"
  >
    <QueryErrorState v-if="error" :error="error" @retry="refetch()" />

    <p v-else-if="recordId == null && hasDetailColumns" class="record-note">
      This log does not expose a record id, so the additional detail fields cannot be loaded.
      Showing the values from the results list.
    </p>

    <dl class="record-list">
      <div
        v-for="field in fields"
        :key="field.column.name"
        class="record-row"
        :class="{ 'record-row--wide': field.wide }"
      >
        <dt class="record-label">
          {{ getColumnLabel(field.column) }}
          <i v-if="isLoading && field.column.detail" class="pi pi-spin pi-spinner record-spinner" />
        </dt>
        <dd class="record-value">
          <LogCell :value="field.value" :column="field.column" :resolver="resolver" expanded />
        </dd>
      </div>
    </dl>
  </RecordPanel>
</template>

<style scoped>
.record-note {
  margin: 0 0 1rem;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  background: var(--p-surface-ground);
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.record-spinner {
  font-size: 0.625rem;
}
</style>
