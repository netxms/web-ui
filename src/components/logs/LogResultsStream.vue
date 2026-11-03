<script setup>
import { computed } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import LogCell from './LogCell.vue'
import { getMessageColumn } from '@/config/logCatalog'
import {
  COLUMN_KIND,
  getColumnKind,
  getColumnLabel,
  getPrimaryTimeColumn,
  getSeverityDisplay,
  getStreamMetaColumns,
} from '@/utils/logColumnTypes'
import { isArriving } from '@/utils/logArrival'
import { formatDateTime } from '@/utils/timeFormat'

const props = defineProps({
  logName: { type: String, required: true },
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  recordIdColumn: { type: String, default: null },
  resolver: { type: Object, default: () => ({}) },
  selectable: { type: Boolean, default: false },
  emptyTitle: { type: String, default: 'No records match this query' },
})

const emit = defineEmits(['select'])

function onRowKeydown(event, row) {
  if (!props.selectable) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  emit('select', row)
}

const timeColumn = computed(() => getPrimaryTimeColumn(props.columns))
const messageColumn = computed(() => getMessageColumn(props.logName, props.columns))

const severityColumn = computed(
  () => props.columns.find((c) => getColumnKind(c.type) === COLUMN_KIND.SEVERITY) ?? null,
)

const sourceColumn = computed(
  () => props.columns.find((c) => getColumnKind(c.type) === COLUMN_KIND.OBJECT) ?? null,
)

const metaColumns = computed(() =>
  getStreamMetaColumns(props.columns, {
    exclude: [
      timeColumn.value?.name,
      messageColumn.value?.name,
      severityColumn.value?.name,
      sourceColumn.value?.name,
    ],
    recordIdColumn: props.recordIdColumn,
  }),
)

const hiddenColumnCount = computed(() => {
  const shown = new Set(
    [
      timeColumn.value,
      messageColumn.value,
      severityColumn.value,
      sourceColumn.value,
      ...metaColumns.value,
    ]
      .filter(Boolean)
      .map((c) => c.name),
  )
  return props.columns.filter((c) => !shown.has(c.name)).length
})

function severityOf(row) {
  if (!severityColumn.value) return null
  return getSeverityDisplay(row[severityColumn.value.name])
}

const TINTED = new Set(['critical', 'major', 'warning'])

function rowStyle(row) {
  const severity = severityOf(row)
  if (!severity?.color) return null
  return {
    '--log-severity-color': severity.color,
    '--log-severity-bg': severity.bgColor,
    '--log-severity-text': severity.textColor,
    ...(TINTED.has(severity.key)
      ? { background: `color-mix(in srgb, ${severity.color} 9%, transparent)` }
      : {}),
  }
}
</script>

<template>
  <div class="log-stream">
    <EmptyState v-if="rows.length === 0" icon="pi pi-align-left" :title="emptyTitle" />

    <!-- Not a <button>: a source cell may render a link. The rule cannot evaluate a bound `role`. -->
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
    <article
      v-for="row in rows"
      :key="row.id"
      class="stream-row"
      :class="{ 'is-selectable': selectable, 'is-arriving': isArriving(row) }"
      :style="rowStyle(row)"
      :role="selectable ? 'button' : undefined"
      :tabindex="selectable ? 0 : undefined"
      @click="selectable && emit('select', row)"
      @keydown="onRowKeydown($event, row)"
    >
      <div class="stream-headline">
        <span v-if="timeColumn" class="stream-time">
          {{ formatDateTime(row[timeColumn.name]) ?? row[timeColumn.name] }}
        </span>

        <span v-if="severityColumn" class="stream-severity">
          <StatusIcon :status="severityOf(row).key" tone="text" size="1.25em" />
          {{ severityOf(row).label }}
        </span>

        <LogCell
          v-if="sourceColumn"
          :value="row[sourceColumn.name]"
          :column="sourceColumn"
          :resolver="resolver"
          class="stream-source"
        />
        <span v-if="messageColumn" class="stream-message">{{ row[messageColumn.name] }}</span>
      </div>

      <div v-if="metaColumns.length > 0" class="stream-meta">
        <span v-for="column in metaColumns" :key="column.name" class="stream-meta-item">
          <span class="stream-meta-label">{{ getColumnLabel(column) }}</span>
          <LogCell
            :value="row[column.name]"
            :column="column"
            :resolver="resolver"
            class="stream-meta-value"
          />
        </span>
        <span v-if="hiddenColumnCount > 0" class="stream-meta-more">
          +{{ hiddenColumnCount }} more
        </span>
      </div>
    </article>
  </div>
</template>

<style scoped>
.log-stream {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100%;
  font-size: 0.8125rem;
}

.stream-row {
  border-left: 4px solid var(--log-severity-color, var(--p-surface-border));
  border-bottom: 1px solid var(--p-surface-border);
  padding: 0.4rem 0.75rem 0.4rem 0.625rem;
}

.stream-row.is-selectable {
  cursor: pointer;
}

/* The wash is only on the first keyframe so it decays into the row's own (inline) background. */
.stream-row.is-arriving {
  animation: stream-row-arrive 900ms ease-out;
}

@keyframes stream-row-arrive {
  0% {
    opacity: 0.4;
    transform: translateY(-3px);
    background-color: color-mix(in srgb, var(--p-primary-color) 26%, transparent);
  }

  20% {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stream-row.is-arriving {
    animation-name: stream-row-arrive-flat;
  }
}

@keyframes stream-row-arrive-flat {
  0% {
    background-color: color-mix(in srgb, var(--p-primary-color) 26%, transparent);
  }
}

.stream-row.is-selectable:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.stream-row:hover {
  background: var(--p-surface-hover);
}

.stream-headline {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}

.stream-time {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--p-text-muted-color);
}

.stream-severity {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  align-self: center;
  min-width: 5.25rem;
  padding: 0.05rem 0.4rem;
  border-radius: 3px;
  /* The palette's text pair, not the fill: fill-on-wash contrast is too low. */
  background: var(--log-severity-bg, transparent);
  color: var(--log-severity-text, inherit);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.stream-source {
  flex-shrink: 0;
  max-width: 12rem;
  font-weight: 600;
}

.stream-message {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--p-text-color);
}

.stream-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.1rem 0.875rem;
  margin-top: 0.15rem;
  padding-left: 0.125rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.stream-meta-item {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  min-width: 0;
}

.stream-meta-label {
  flex-shrink: 0;
  opacity: 0.65;
}

.stream-meta-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stream-meta-more {
  align-self: baseline;
  font-style: italic;
  opacity: 0.6;
}
</style>
