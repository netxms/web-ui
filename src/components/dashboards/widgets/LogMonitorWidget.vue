<script setup>
import { computed, watch } from 'vue'
import Button from 'primevue/button'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import LogResultsStream from '@/components/logs/LogResultsStream.vue'
import { useLogLiveTail } from '@/composables/useLogLiveTail'
import { useLogValueResolver } from '@/composables/useLogValueResolver'
import { useDashboardContext } from '@/composables/useDashboardContext'
import { useWidgetActive } from '@/composables/useWidgetActive'
import { getMessageColumn } from '@/config/logCatalog'
import { useLogSchema } from '@/queries/useLogQueries'
import {
  COLUMN_KIND,
  getColumnKind,
  getCursorRecordIdColumn,
  getPrimaryTimeColumn,
  getResultColumns,
} from '@/utils/logColumnTypes'
import { buildLogQueryRequest, createQueryModel, defaultOrderBy } from '@/utils/logQueryModel'
import { resolveContextObjectId } from '@/utils/dashboardContext'

/**
 * The legacy Syslog, SNMP Trap and Event Monitor widgets in one, polling the log through
 * `useLogLiveTail` (the WebAPI has no equivalent of the NXCP monitor channels). Because it reads
 * the log, it seeds with recent records and shows events flagged `EF_DO_NOT_MONITOR`, which the
 * log does not expose as a column.
 *
 * Syslog has no record id, so it pages on `msg_timestamp`, the time parsed from the message: a
 * device whose clock runs ahead stalls the feed unless the server sets
 * `Syslog.IgnoreMessageTimestamp`. Trap timestamps are server receive time.
 */
const props = defineProps({
  widget: { type: Object, required: true },
})

const LOG_BY_TYPE = {
  'syslog-monitor': 'syslog',
  'snmp-trap-monitor': 'SnmpTrapLog',
  'event-monitor': 'EventLog',
}

/** Legacy caps its historical load at 500 rows. */
const MAX_PRELOAD_ROWS = 500
const DEFAULT_PRELOAD_ROWS = 100

// Not derived from `maxEvents`: the cursor moves to the newest row of each batch, so a page
// smaller than the arrival rate loses rows for good. `maxEvents` bounds what is kept.
const POLL_PAGE_SIZE = 250

/** Legacy's default seed window, in minutes. */
const DEFAULT_PRELOAD_MINUTES = 60

// Not plain `Number()`: a cleared InputNumber emits null, `Number(null)` is 0, and 0 events to
// load means "discard all history".
function numericConfig(value, fallback) {
  if (value == null || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const config = computed(() => props.widget.config ?? {})
const logName = computed(() => LOG_BY_TYPE[props.widget.type] ?? null)
const isEventMonitor = computed(() => props.widget.type === 'event-monitor')

const {
  data: schema,
  isLoading: schemaLoading,
  error: schemaError,
  refetch: refetchSchema,
} = useLogSchema(logName)

const columns = computed(() => schema.value?.columns ?? [])
const resultColumns = computed(() => getResultColumns(columns.value))
const recordIdColumn = computed(() => schema.value?.recordIdColumn ?? null)
const objectIdColumn = computed(() => schema.value?.objectIdColumn ?? null)
const timeColumn = computed(() => getPrimaryTimeColumn(columns.value)?.name ?? null)

// Syslog and traps declare a record id column they never return; a cursor on it never advances.
const tailRecordIdColumn = computed(() =>
  getCursorRecordIdColumn(columns.value, recordIdColumn.value),
)

const messageColumn = computed(() => getMessageColumn(logName.value, columns.value))
const eventCodeColumn = computed(
  () => columns.value.find((c) => getColumnKind(c.type) === COLUMN_KIND.EVENT) ?? null,
)

const { contextObjectId } = useDashboardContext()

// `0xFFFFFFFF` is legacy's context sentinel (the dashboard's object); 0 means no scope.
const scopeObjectId = computed(() => {
  // No `numericConfig`: cleared, absent and zero all mean "no scope".
  const id = resolveContextObjectId(config.value.objectId, contextObjectId.value)
  return id > 0 ? id : null
})

// 0 means no history, as in legacy ("0 to disable"); see `discardPending`.
const preloadCount = computed(() => {
  if (!isEventMonitor.value) return DEFAULT_PRELOAD_ROWS
  const max = numericConfig(config.value.maxEvents, DEFAULT_PRELOAD_ROWS)
  if (max < 0) return DEFAULT_PRELOAD_ROWS
  return Math.min(Math.trunc(max), MAX_PRELOAD_ROWS)
})

/** So "load 25" shows 25 and rolls, rather than growing to a full page. */
const bufferLimit = computed(() => (preloadCount.value > 0 ? preloadCount.value : MAX_PRELOAD_ROWS))

function buildFilters() {
  const filters = []
  const cfg = config.value

  // Legacy sends EQUALS or CHILDOF on the source column; no object means the whole system.
  if (scopeObjectId.value && objectIdColumn.value) {
    const display = cfg.objectName || null
    filters.push({
      column: objectIdColumn.value,
      operation: 'or',
      conditions: [
        { operatorId: 'is', value: scopeObjectId.value, display },
        { operatorId: 'below', value: scopeObjectId.value, display },
      ],
    })
  }

  if (!isEventMonitor.value) return filters

  // Relative, so it stays a sliding window however long the dashboard is open.
  const minutes = numericConfig(cfg.timeRangeMinutes, DEFAULT_PRELOAD_MINUTES)
  if (timeColumn.value && preloadCount.value > 0 && minutes > 0) {
    filters.push({
      column: timeColumn.value,
      operation: 'or',
      conditions: [{ operatorId: 'last', value: minutes, unit: 'minute' }],
    })
  }

  const codes = Array.isArray(cfg.eventCodes) ? cfg.eventCodes : []
  if (codes.length > 0 && eventCodeColumn.value) {
    filters.push({
      column: eventCodeColumn.value.name,
      operation: 'or',
      conditions: codes.map((code) => ({ operatorId: 'is', value: code })),
    })
  }

  return filters
}

const request = computed(() => {
  const cols = columns.value
  if (cols.length === 0) return null
  return buildLogQueryRequest(
    {
      ...createQueryModel(cols),
      // The seed is bounded by `limit`, not a time range; the event monitor adds its window as a
      // filter.
      time: { preset: 'any', from: null, to: null },
      // The tail prepends each batch.
      orderBy: defaultOrderBy(cols),
      filters: buildFilters(),
    },
    cols,
    { limit: POLL_PAGE_SIZE },
  )
})

// Stops polling off-screen; coming back re-seeds from the newest records.
const widgetActive = useWidgetActive()
const enabled = computed(() => widgetActive.value && request.value != null)

const tail = useLogLiveTail(logName, request, {
  enabled,
  recordIdColumn: tailRecordIdColumn,
  timeColumn,
  bufferLimit,
})

const resolver = useLogValueResolver(tail.rows, resultColumns, tail.resolvedPages)

/**
 * "No history": discard the seed but keep the cursor, so polling resumes from the newest record
 * the server had. A `timestamp > now` filter would compare against the browser clock and drop
 * rows written in the mount second.
 *
 * Armed on every source the tail restarts on, not only `request`: `enabled` carries
 * `widgetActive`, which flips as the widget scrolls in and out and re-seeds the tail.
 * Arming on anything that does not restart the tail would make the next `clear()` drop live rows.
 */
let discardPending = false

watch([logName, request, enabled], () => (discardPending = preloadCount.value === 0), {
  immediate: true,
})

watch(
  () => tail.lastUpdate.value,
  (value) => {
    if (value == null || !discardPending) return
    discardPending = false
    tail.clear()
  },
)

// Client-side, like legacy's viewer filter: every token must appear (case-insensitive) in the
// message, event name or source object name. A server-side LIKE on the message is narrower and
// case-sensitive on PostgreSQL.
const filterTokens = computed(() => {
  if (!isEventMonitor.value) return []
  return (config.value.filter ?? '').toLowerCase().split(/\s+/).filter(Boolean)
})

function searchableText(row) {
  const parts = []
  if (messageColumn.value) parts.push(row[messageColumn.value.name])
  if (eventCodeColumn.value) {
    parts.push(resolver.value.eventsByCode?.get(row[eventCodeColumn.value.name]))
  }
  // `objectIdColumn` is a column name, not a column object.
  if (objectIdColumn.value) {
    parts.push(resolver.value.objectsById?.get(row[objectIdColumn.value])?.name)
  }
  return parts
    .filter((part) => part != null)
    .join(' ')
    .toLowerCase()
}

const rows = computed(() => {
  if (filterTokens.value.length === 0) return tail.rows.value
  return tail.rows.value.filter((row) => {
    const haystack = searchableText(row)
    return filterTokens.value.every((token) => haystack.includes(token))
  })
})

/** A terminal failure stops the loop, so retrying is resuming. */
function retry() {
  tail.resume()
}

// "Reconnecting": a transient failure keeps the rows and retries. Paused wins over it.
const liveState = computed(() => {
  if (tail.paused.value) return { label: 'Paused', icon: 'pi pi-pause', modifier: 'paused' }
  if (tail.reconnecting.value) {
    return { label: 'Reconnecting', icon: 'pi pi-sync pi-spin', modifier: 'reconnecting' }
  }
  return { label: 'Live', icon: 'pi pi-circle-fill', modifier: null }
})
</script>

<template>
  <div class="log-monitor-widget">
    <QueryErrorState
      v-if="schemaError"
      :error="schemaError"
      :message="
        schemaError.status === 403 ? 'You do not have permission to read this log.' : undefined
      "
      @retry="refetchSchema()"
    />
    <QueryErrorState v-else-if="tail.error.value" :error="tail.error.value" @retry="retry" />

    <div v-else-if="schemaLoading || tail.isLoading.value" class="lmw-state">
      <i class="pi pi-spin pi-spinner" />
      <span>Loading&hellip;</span>
    </div>

    <div v-else-if="!tail.supported.value" class="lmw-state">
      <i class="pi pi-ban" />
      <span>This log cannot be tailed</span>
    </div>

    <template v-else>
      <div class="lmw-feed">
        <LogResultsStream
          :log-name="logName"
          :rows="rows"
          :columns="resultColumns"
          :record-id-column="recordIdColumn"
          :resolver="resolver"
          :empty-title="
            filterTokens.length > 0 && tail.rows.value.length > 0
              ? 'No records match this filter'
              : 'Waiting for new records'
          "
        />
      </div>

      <div class="lmw-footer">
        <span
          class="lmw-live-state"
          :class="liveState.modifier ? `lmw-live-state--${liveState.modifier}` : null"
          data-testid="live-state"
        >
          <i :class="liveState.icon" />
          {{ liveState.label }}
        </span>
        <span class="lmw-count">{{ rows.length }}</span>
        <!-- Polling never stops while paused, so this is the backlog, not a gap. -->
        <span v-if="tail.pendingCount.value > 0" class="lmw-pending">
          {{ tail.pendingCount.value }} new
        </span>
        <div class="lmw-footer-spacer" />
        <Button
          :aria-label="tail.paused.value ? 'Resume' : 'Pause'"
          v-tooltip.top="tail.paused.value ? 'Resume' : 'Pause'"
          :icon="tail.paused.value ? 'pi pi-play' : 'pi pi-pause'"
          size="small"
          text
          severity="secondary"
          @click="tail.togglePause()"
        />
        <Button
          aria-label="Clear"
          v-tooltip.top="'Clear'"
          icon="pi pi-eraser"
          size="small"
          text
          severity="secondary"
          :disabled="tail.rows.value.length === 0 && tail.pendingCount.value === 0"
          @click="tail.clear()"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.log-monitor-widget {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.lmw-feed {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.lmw-feed > * {
  flex: 1;
  min-height: 0;
}

.lmw-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  height: 100%;
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.lmw-state .pi {
  font-size: 1.25rem;
  opacity: 0.4;
}

.lmw-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  padding: 0.125rem 0.25rem 0;
  border-top: 1px solid var(--p-surface-border);
}

.lmw-footer-spacer {
  flex: 1;
}

.lmw-count {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.lmw-pending {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-primary-color);
}

.lmw-live-state {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--p-green-500);
}

.lmw-live-state i {
  font-size: 0.5rem;
  animation: lmw-live-pulse 2s ease-in-out infinite;
}

.lmw-live-state--paused {
  color: var(--p-text-muted-color);
}

.lmw-live-state--paused i {
  font-size: 0.75rem;
  animation: none;
}

/* Amber, not red: the feed is still on screen and still trying. */
.lmw-live-state--reconnecting {
  color: var(--p-amber-500);
}

.lmw-live-state--reconnecting i {
  font-size: 0.75rem;
  animation: none;
}

@keyframes lmw-live-pulse {
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lmw-live-state i {
    animation: none;
  }
}
</style>
