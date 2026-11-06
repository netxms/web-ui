<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import QueryErrorState from '@/components/common/QueryErrorState.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import LogAdvancedFilters from './LogAdvancedFilters.vue'
import LogColumnChooser from './LogColumnChooser.vue'
import LogRecordDrawer from './LogRecordDrawer.vue'
import LogResultsStream from './LogResultsStream.vue'
import LogResultsTable from './LogResultsTable.vue'
import LogSqlDialog from './LogSqlDialog.vue'
import LogTimeRangePicker from './LogTimeRangePicker.vue'
import { useLogLiveTail } from '@/composables/useLogLiveTail'
import { useLogValueResolver } from '@/composables/useLogValueResolver'
import { buildLogFilterDefs } from '@/filterDefs/logFilterDefs'
import { getLogLabel, groupLogsByFamily } from '@/config/logCatalog'
import { useLogQuery, useLogQuerySql, useLogSchema } from '@/queries/useLogQueries'
import { RESULT_MODE, useLogPrefsStore } from '@/stores/logPrefsStore'
import {
  getCursorRecordIdColumn,
  getPrimaryTimeColumn,
  getResultColumns,
} from '@/utils/logColumnTypes'
import {
  applyOmnibarTokens,
  buildLogQueryRequest,
  createObjectFilter,
  createQueryModel,
  defaultOrderBy,
  parseFromQuery,
  projectToOmnibar,
  serializeToQuery,
} from '@/utils/logQueryModel'
import { logTarget } from '@/utils/routeTargets'

const props = defineProps({
  logName: { type: String, required: true },
  /** Log summary from `GET /v1/logs`. */
  log: { type: Object, default: null },
  /** Logs offered by the switcher. Omit to hide the switcher. */
  switchableLogs: { type: Array, default: null },
  /**
   * Read-only filters imposed by the embedding context; never written to the URL.
   * @type {Array<{column: string, conditions: object[]}>}
   */
  lockedFilters: { type: Array, default: () => [] },
  /** Embedded mode: no URL sync, tighter chrome. */
  compact: { type: Boolean, default: false },
  /** The object whose view embeds the explorer; its own references render without a link. */
  ownerObjectId: { type: Number, default: null },
})

const emit = defineEmits(['switch-log'])

const route = useRoute()
const router = useRouter()
const prefs = useLogPrefsStore()

const {
  data: schema,
  isLoading: schemaLoading,
  error: schemaError,
  refetch: refetchSchema,
} = useLogSchema(() => props.logName)

const columns = computed(() => schema.value?.columns ?? [])
const resultColumns = computed(() => getResultColumns(columns.value))
const hasTimeColumn = computed(() => getPrimaryTimeColumn(columns.value) != null)
const recordIdColumn = computed(
  () => props.log?.recordIdColumn ?? schema.value?.recordIdColumn ?? null,
)

const model = ref(createQueryModel([]))
const advancedOpen = ref(false)

function withLocked(base) {
  const locked = props.lockedFilters.map((filter, index) => ({
    id: -1 - index,
    operation: 'or',
    ...filter,
    locked: true,
  }))
  return [...locked, ...base.filter((f) => !f.locked)]
}

function resetModel() {
  const next = props.compact
    ? createQueryModel(columns.value)
    : parseFromQuery(route.query, columns.value)

  // `?object=<id>` becomes an ordinary filter; the first sync rewrites it as `f`.
  const objectColumn = props.log?.objectIdColumn ?? schema.value?.objectIdColumn
  const objectId = Number(route.query.object)
  if (!props.compact && objectColumn && Number.isInteger(objectId) && objectId > 0) {
    const alreadyFiltered = next.filters.some((f) => f.column === objectColumn)
    if (!alreadyFiltered) {
      next.filters.unshift(createObjectFilter(objectColumn, objectId, route.query.objectName))
    }
  }

  // The remembered range applies only when the URL states no query: a shared link opens as sent.
  const remembered = prefs.getTimePreset(props.logName)
  const urlHasQuery = !props.compact && MODEL_QUERY_KEYS.some((key) => route.query[key] != null)
  if (remembered && hasTimeColumn.value && !urlHasQuery) {
    next.time = { preset: remembered, from: null, to: null }
  }

  next.filters = withLocked(next.filters)
  model.value = next
}

/** Only a pick in the picker is remembered, never a range that arrived with a link. */
function onTimeChange(value) {
  model.value.time = value
  prefs.setTimePreset(props.logName, value.preset)
}

const MODEL_QUERY_KEYS = ['t', 'from', 'to', 'f', 'sort']
const CONSUMED_QUERY_KEYS = [...MODEL_QUERY_KEYS, 'object', 'objectName']

// Must be registered before the immediate reset watcher, to see the first model: that is what
// rewrites `?object=` into `f`.
watch(
  model,
  (value) => {
    if (props.compact || columns.value.length === 0) return
    const query = serializeToQuery(value, columns.value)
    if (
      JSON.stringify(query) === JSON.stringify(pickModelKeys(route.query)) &&
      route.query.object == null
    ) {
      return
    }
    // Anything the model does not own stays on the URL untouched.
    const passthrough = {}
    for (const [key, value_] of Object.entries(route.query)) {
      if (!CONSUMED_QUERY_KEYS.includes(key)) passthrough[key] = value_
    }
    router.replace({ ...logTarget(props.logName), query: { ...passthrough, ...query } })
  },
  { deep: true },
)

function pickModelKeys(query) {
  const picked = {}
  for (const key of MODEL_QUERY_KEYS) {
    if (query[key] != null) picked[key] = query[key]
  }
  return picked
}

// `immediate`: the schema is usually already cached at setup, so a change-only watcher would
// never fire.
watch(
  [() => props.logName, columns],
  ([, cols]) => {
    if (cols.length > 0) resetModel()
  },
  { immediate: true },
)

watch(
  () => props.lockedFilters,
  () => {
    if (columns.value.length > 0) model.value.filters = withLocked(model.value.filters)
  },
  { deep: true },
)

const filterDefs = computed(() => buildLogFilterDefs(columns.value))
const omnibar = computed(() => projectToOmnibar(model.value, columns.value))

const omnibarModel = computed(() => ({ text: '', tokens: omnibar.value.tokens }))

function onOmnibarUpdate(value) {
  model.value = {
    ...model.value,
    filters: applyOmnibarTokens(model.value, value.tokens, columns.value),
  }
}

const pageSize = computed(() => prefs.getPageSize(props.logName))

const request = computed(() =>
  columns.value.length === 0
    ? null
    : buildLogQueryRequest(model.value, columns.value, { limit: pageSize.value }),
)

// Declared before the paged query, which is disabled while live: the two must never poll the
// same log at once.
const live = ref(props.compact ? false : route.query.live === '1')

const {
  data: pages,
  isLoading: pagedLoading,
  isFetching: pagedFetching,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  error: pagedError,
  refetch,
} = useLogQuery(() => props.logName, request, {
  enabled: computed(() => columns.value.length > 0 && !live.value),
})

const pagedRows = computed(() => {
  const idColumn = recordIdColumn.value
  const all = []
  for (const page of pages.value?.pages ?? []) {
    for (const record of page.records ?? []) {
      // Syslog and SNMP traps name a record id column they do not return; position is stable
      // because pages only ever append.
      const id = idColumn != null ? record[idColumn] : undefined
      all.push({ ...record, id: id ?? `row-${all.length}` })
    }
  }
  return all
})

const pagedResolved = computed(() =>
  (pages.value?.pages ?? []).map((page) => page.resolvedValues).filter(Boolean),
)

const timeColumn = computed(() => getPrimaryTimeColumn(columns.value)?.name ?? null)

// Not `recordIdColumn`: a cursor on a declared-but-absent id column (syslog, SNMP traps) never
// advances, so the tail must fall back to the time column.
const tailRecordIdColumn = computed(() =>
  getCursorRecordIdColumn(columns.value, recordIdColumn.value),
)

const canGoLive = computed(
  () => columns.value.length > 0 && (tailRecordIdColumn.value != null || timeColumn.value != null),
)

// No time range (a bounded seed would only open a quiet log empty), and always newest first:
// the tail prepends each batch.
const liveRequest = computed(() =>
  columns.value.length === 0 || !live.value
    ? null
    : buildLogQueryRequest(
        {
          ...model.value,
          time: { preset: 'any', from: null, to: null },
          orderBy: defaultOrderBy(columns.value),
        },
        columns.value,
        { limit: pageSize.value },
      ),
)

const tail = useLogLiveTail(() => props.logName, liveRequest, {
  enabled: live,
  recordIdColumn: tailRecordIdColumn,
  timeColumn,
})

function toggleLive(value) {
  live.value = value
  if (!props.compact) syncLiveToUrl()
}

function syncLiveToUrl() {
  const query = { ...route.query }
  if (live.value) query.live = '1'
  else delete query.live
  router.replace({ ...logTarget(props.logName), query })
}

watch(canGoLive, (possible) => {
  if (!possible && live.value) toggleLive(false)
})

const rows = computed(() => (live.value ? tail.rows.value : pagedRows.value))
const isLoading = computed(() => (live.value ? tail.isLoading.value : pagedLoading.value))
const isFetching = computed(() => (live.value ? tail.isFetching.value : pagedFetching.value))
const queryError = computed(() => (live.value ? tail.error.value : pagedError.value))

const valueResolver = useLogValueResolver(
  rows,
  resultColumns,
  computed(() => (live.value ? tail.resolvedPages.value : pagedResolved.value)),
)

const resolver = computed(() => ({ ...valueResolver.value, ownerObjectId: props.ownerObjectId }))

function retry() {
  if (live.value) tail.resume()
  else refetch()
}

const visibleColumnNames = computed({
  get: () => {
    const stored = prefs.getColumns(props.logName)
    const available = new Set(resultColumns.value.map((c) => c.name))
    const filtered = (stored ?? []).filter((name) => available.has(name))
    return filtered.length > 0 ? filtered : resultColumns.value.map((c) => c.name)
  },
  set: (value) => prefs.setColumns(props.logName, value),
})

const visibleColumns = computed(() =>
  resultColumns.value.filter((column) => visibleColumnNames.value.includes(column.name)),
)

const columnWidths = computed(() => prefs.getColumnWidths(props.logName))

const mode = computed({
  get: () => prefs.getMode(props.logName),
  set: (value) => prefs.setMode(props.logName, value),
})

const MODE_OPTIONS = [
  { value: RESULT_MODE.TABLE, label: 'Table' },
  { value: RESULT_MODE.STREAM, label: 'Stream' },
]

const SOURCE_OPTIONS = [
  { value: false, label: 'Historical' },
  { value: true, label: 'Live' },
]

const logOptions = computed(() =>
  groupLogsByFamily(props.switchableLogs ?? []).map((family) => ({
    label: family.label,
    items: family.logs.map((log) => ({ value: log.name, label: getLogLabel(log.name) })),
  })),
)

function onSwitchLog(name) {
  if (props.compact) {
    emit('switch-log', name)
  } else {
    router.push(logTarget(name))
  }
}

const selectedRow = ref(null)
const drawerOpen = ref(false)

function openRecord(row) {
  // Rows are rebuilt on every recompute; compare by id, not reference.
  const sameRow = row?.id != null && row.id === selectedRow.value?.id
  if (drawerOpen.value && sameRow) {
    drawerOpen.value = false
    return
  }
  selectedRow.value = row
  drawerOpen.value = true
}

const sqlOpen = ref(false)
const {
  mutate: buildSql,
  data: sqlResult,
  isPending: sqlPending,
  error: sqlError,
} = useLogQuerySql()

/** In live mode, the tail's seed rather than the model. */
const activeRequest = computed(() => (live.value ? liveRequest.value : request.value))

function showSql() {
  sqlOpen.value = true
  buildSql({ name: props.logName, request: activeRequest.value })
}

const hiddenCount = computed(() => omnibar.value.hidden.length)

const hiddenSummary = computed(() =>
  hiddenCount.value === 0 ? null : omnibar.value.hidden.map((c) => c.text).join('; '),
)

const scopeSummary = computed(() =>
  omnibar.value.locked.length === 0 ? null : omnibar.value.locked.map((c) => c.text).join(', '),
)
</script>

<template>
  <div class="log-explorer" :class="{ 'log-explorer--compact': compact }">
    <div class="explorer-toolbar">
      <Select
        v-if="switchableLogs && switchableLogs.length > 0"
        :model-value="logName"
        :options="logOptions"
        option-label="label"
        option-value="value"
        option-group-label="label"
        option-group-children="items"
        size="small"
        filter
        class="log-switcher"
        @update:model-value="onSwitchLog"
      />
      <span v-else class="log-title">{{ getLogLabel(logName) }}</span>

      <SelectButton
        v-if="canGoLive"
        :model-value="live"
        :options="SOURCE_OPTIONS"
        option-label="label"
        option-value="value"
        size="small"
        :allow-empty="false"
        class="explorer-live-toggle"
        @update:model-value="toggleLive"
      />

      <LogTimeRangePicker
        v-if="!live"
        :model-value="model.time"
        :disabled="!hasTimeColumn"
        v-tooltip.bottom="hasTimeColumn ? null : 'This log has no timestamp column'"
        @update:model-value="onTimeChange"
      />
      <span
        v-else
        class="explorer-live-state"
        :class="{ 'explorer-live-state--paused': tail.paused.value }"
      >
        <i :class="tail.paused.value ? 'pi pi-pause' : 'pi pi-circle-fill'" />
        {{ tail.paused.value ? 'Paused' : 'Live' }}
      </span>

      <div class="explorer-toolbar-spacer" />

      <SelectButton
        v-model="mode"
        :options="MODE_OPTIONS"
        option-label="label"
        option-value="value"
        size="small"
        :allow-empty="false"
      />
      <LogColumnChooser
        v-if="mode === RESULT_MODE.TABLE"
        v-model="visibleColumnNames"
        :columns="resultColumns"
      />
      <Button
        v-if="!live"
        icon="pi pi-refresh"
        size="small"
        severity="secondary"
        outlined
        aria-label="Refresh"
        v-tooltip.bottom="'Refresh'"
        :loading="isFetching"
        @click="refetch()"
      />
      <Button
        icon="pi pi-code"
        size="small"
        severity="secondary"
        outlined
        aria-label="Show SQL"
        v-tooltip.bottom="'Show SQL'"
        :disabled="!activeRequest"
        @click="showSql"
      />
    </div>

    <div class="explorer-filters">
      <SmartFilterInput
        :model-value="omnibarModel"
        :filter-defs="filterDefs"
        placeholder="Filter records..."
        class="explorer-omnibar"
        @update:model-value="onOmnibarUpdate"
      />

      <span v-if="scopeSummary" class="explorer-scope" v-tooltip.bottom="scopeSummary">
        <i class="pi pi-lock" />
        {{ scopeSummary }}
      </span>

      <Button
        :label="hiddenCount > 0 ? `Advanced (${hiddenCount})` : 'Advanced'"
        :icon="advancedOpen ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
        size="small"
        :text="hiddenCount === 0"
        :outlined="hiddenCount > 0"
        :severity="hiddenCount > 0 ? undefined : 'secondary'"
        v-tooltip.bottom="hiddenSummary"
        @click="advancedOpen = !advancedOpen"
      />
    </div>

    <LogAdvancedFilters
      v-if="advancedOpen"
      v-model:filters="model.filters"
      v-model:order-by="model.orderBy"
      :columns="columns"
      class="explorer-advanced"
    />

    <div class="explorer-results">
      <RefetchIndicator :is-fetching="isFetching && !isLoading && !isFetchingNextPage" />

      <QueryErrorState
        v-if="schemaError"
        :error="schemaError"
        :message="
          schemaError.status === 403 ? 'You do not have permission to read this log.' : undefined
        "
        @retry="refetchSchema()"
      />
      <QueryErrorState v-else-if="queryError" :error="queryError" @retry="retry()" />

      <LogResultsStream
        v-else-if="mode === RESULT_MODE.STREAM"
        :log-name="logName"
        :rows="rows"
        :columns="resultColumns"
        :record-id-column="recordIdColumn"
        :resolver="resolver"
        :empty-title="live ? 'Waiting for new records' : 'No records match this query'"
        selectable
        @select="openRecord"
      />

      <LogResultsTable
        v-else
        :rows="rows"
        :columns="visibleColumns"
        :resolver="resolver"
        :loading="isLoading || schemaLoading"
        :page-size="pageSize"
        :column-widths="columnWidths"
        selectable
        @select="openRecord"
        @column-resize="(widths) => prefs.setColumnWidths(logName, widths)"
        @page-size-change="(size) => prefs.setPageSize(logName, size)"
      >
        <template #empty>
          {{ live ? 'Waiting for new records.' : 'No records match this query.' }}
        </template>
      </LogResultsTable>
    </div>

    <!-- The API returns no total count, so this reports what has been loaded. -->
    <div class="explorer-footer">
      <span class="explorer-count">
        {{ rows.length }} record{{ rows.length === 1 ? '' : 's' }} {{ live ? 'shown' : 'loaded' }}
      </span>

      <template v-if="live">
        <Button
          :label="tail.paused.value ? 'Resume' : 'Pause'"
          :icon="tail.paused.value ? 'pi pi-play' : 'pi pi-pause'"
          size="small"
          text
          @click="tail.togglePause()"
        />
        <span v-if="tail.pendingCount.value > 0" class="explorer-pending">
          {{ tail.pendingCount.value }} new
        </span>
        <span v-if="tail.reconnecting.value" class="explorer-reconnecting">
          <i class="pi pi-sync pi-spin" />
          Reconnecting
        </span>
        <Button
          label="Clear"
          icon="pi pi-eraser"
          size="small"
          text
          :disabled="rows.length === 0 && tail.pendingCount.value === 0"
          @click="tail.clear()"
        />
      </template>

      <template v-else>
        <Button
          v-if="hasNextPage"
          :label="`Load ${pageSize} more`"
          icon="pi pi-angle-down"
          size="small"
          text
          :loading="isFetchingNextPage"
          @click="fetchNextPage()"
        />
        <span v-else-if="rows.length > 0" class="explorer-count explorer-count--muted">
          End of results
        </span>
      </template>
    </div>

    <LogRecordDrawer
      v-model:visible="drawerOpen"
      :log-name="logName"
      :row="selectedRow"
      :columns="columns"
      :record-id-column="recordIdColumn"
      :resolver="resolver"
    />

    <LogSqlDialog
      v-model:visible="sqlOpen"
      :sql="sqlResult?.query ?? ''"
      :loading="sqlPending"
      :error="sqlError"
    />
  </div>
</template>

<style scoped>
.log-explorer {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  height: 100%;
  min-height: 0;
}

.explorer-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.explorer-toolbar-spacer {
  flex: 1;
}

.log-switcher {
  min-width: 14rem;
}

.log-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--p-text-color);
}

.explorer-filters {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.explorer-omnibar {
  flex: 1;
  min-width: 16rem;
}

.explorer-scope {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  max-width: 18rem;
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--p-surface-border);
  border-radius: 999px;
  background: var(--p-surface-ground);
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.explorer-advanced {
  border-top: 1px solid var(--p-surface-border);
  border-bottom: 1px solid var(--p-surface-border);
}

.explorer-results {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.explorer-results > *:not(.refetch-indicator) {
  min-height: 0;
  flex: 1;
}

.explorer-footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-bottom: 0.5rem;
}

.explorer-count {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.explorer-count--muted {
  opacity: 0.7;
}

.explorer-reconnecting {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: var(--p-amber-500);
}

.explorer-pending {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-primary-color);
}

.explorer-live-state {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--p-green-500);
}

.explorer-live-state i {
  font-size: 0.5rem;
  animation: explorer-live-pulse 2s ease-in-out infinite;
}

.explorer-live-state--paused {
  color: var(--p-text-muted-color);
}

.explorer-live-state--paused i {
  font-size: 0.75rem;
  animation: none;
}

@keyframes explorer-live-pulse {
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .explorer-live-state i {
    animation: none;
  }
}

/* Embedded in an object tab with no padding of its own: chrome is inset, results run edge to edge. */
.log-explorer--compact {
  gap: 0;
}

.log-explorer--compact .explorer-toolbar,
.log-explorer--compact .explorer-filters {
  gap: 0.375rem;
}

.log-explorer--compact .explorer-toolbar {
  padding: 0.75rem 0.75rem 0.5rem;
}

.log-explorer--compact .explorer-filters {
  padding: 0 0.75rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
}

.log-explorer--compact .explorer-advanced {
  padding-inline: 0.75rem;
  padding-bottom: 0.75rem;
  border-top: none;
}

.log-explorer--compact .explorer-footer {
  padding: 0.375rem 0.75rem;
  border-top: 1px solid var(--p-surface-border);
}
</style>
