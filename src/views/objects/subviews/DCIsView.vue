<script setup>
import { ref, computed, inject, watch, toRef, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfirm } from 'primevue/useconfirm'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import AppTable from '@/components/common/AppTable.vue'
import AppLink from '@/components/common/AppLink.vue'
import ColumnChooser from '@/components/common/ColumnChooser.vue'
import StatusIcon from '@/components/common/StatusIcon.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import SelectionActions from '@/components/common/SelectionActions.vue'
import DciHistoryPreview from '@/components/objects/DciHistoryPreview.vue'
import DciTableCurrentView from '@/components/objects/DciTableCurrentView.vue'
import DciEditorView from '@/components/objects/DciEditorView.vue'
import {
  useDciCurrentValues,
  useObjectsByIds,
  usePrefetchDciHistory,
} from '@/queries/useObjectQueries'
import { useDciConfigList, useUpdateDci, useDeleteDci } from '@/queries/useDciConfigQueries'
import { useDciValueMapping } from '@/queries/useMappingTableQueries'
import { useEntityDetail } from '@/composables/useEntityDetail'
import { useWorkingState } from '@/composables/useWorkingState'
import { useDciLiveTableStore, useDciConfigTableStore } from '@/stores/dciTableStore'
import { userPrefs } from '@/utils/appStorage'
import { formatDateTimeWithSeconds } from '@/utils/timeFormat'
import { DCI_DATA_TYPES, displayDciValue } from '@/utils/dciFormat'
import { createChartModel, serializeToQuery } from '@/utils/dciChartModel'
import { PREVIEW_RANGE_SECONDS, previewWindowEnd } from '@/utils/dciHistoryPreview'
import { liveThresholdInfo, thresholdExpressionLabel } from '@/utils/dciThresholdUtils'
import { dciSource, isTemplateItem } from '@/utils/dciSource'
import { objectTarget, dciTarget } from '@/utils/routeTargets'
import { resolveHref, isPlainLeftClick } from '@/utils/navigation'
import { notify } from '@/utils/notify'
import {
  DCI_TARGET_CLASSES,
  getDciStatusInfo,
  getDciSourceTypeLabel,
  getDciDataTypeLabel,
  getDciCollectionErrorInfo,
} from '@/utils/objectUtils'

const props = defineProps({
  object: { type: Object, required: true },
})

const route = useRoute()
const router = useRouter()
const object = toRef(props, 'object')

const isDciTarget = computed(() => DCI_TARGET_CLASSES.has(props.object.class))
// Templates carry DCI configuration but are never polled.
const hasLiveData = computed(() => isDciTarget.value && props.object.class !== 'Template')
const objectId = computed(() => props.object.id)

const MODE_OPTIONS = [
  { label: 'Live Data', value: 'values' },
  { label: 'Configuration', value: 'config' },
]
const mode = ref(hasLiveData.value ? 'values' : 'config')

watch(hasLiveData, (val) => {
  if (!val) mode.value = 'config'
})

const {
  data: dciCurrentValues,
  isLoading: loadingDciValues,
  isFetching,
  isError: isErrorDciValues,
  error: errorDciValues,
  refetch,
} = useDciCurrentValues(objectId, { enabled: hasLiveData })

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const configModeEnabled = computed(() => isDciTarget.value && mode.value === 'config')

const {
  data: dciConfigList,
  isLoading: loadingConfig,
  isFetching: isFetchingConfig,
  isError: isErrorConfig,
  error: errorConfig,
  refetch: refetchConfig,
} = useDciConfigList(objectId, { enabled: configModeEnabled })

const updateDci = useUpdateDci()
const deleteDci = useDeleteDci()
const confirm = useConfirm()

const { entityId, isDetailView, detailTarget, openDetail, closeDetail } = useEntityDetail()

const isCreateMode = computed(() => entityId.value === 'new')
const editDciId = computed(() => {
  if (!entityId.value || entityId.value === 'new') return null
  return Number(entityId.value)
})

// Hide template items: taste, so it follows the account. Templates own their DCIs outright.
const HIDE_TEMPLATE_ITEMS_FIELD = 'dci.hideTemplateItems'
const canHideTemplateItems = computed(() => props.object.class !== 'Template')
const hideTemplateItems = ref(userPrefs.get(HIDE_TEMPLATE_ITEMS_FIELD) === true)

watch(hideTemplateItems, (value) => userPrefs.set(HIDE_TEMPLATE_ITEMS_FIELD, value || undefined))
watch(userPrefs.revision, () => {
  hideTemplateItems.value = userPrefs.get(HIDE_TEMPLATE_ITEMS_FIELD) === true
})

function passesTemplateFilter(dci) {
  return !(hideTemplateItems.value && canHideTemplateItems.value && isTemplateItem(dci))
}

/**
 * Rows the filter text matches but the template toggle hides; the toggle is remembered, so
 * this explains a list that looks short.
 */
function countHidden(rows, text) {
  if (!hideTemplateItems.value || !canHideTemplateItems.value) return 0
  const search = text.toLowerCase()
  return rows.filter((dci) => isTemplateItem(dci) && (!search || matchesSearch(dci, search))).length
}

// The catalogs are in display order; the stores hold which ones are on.
const liveColumnStore = useDciLiveTableStore()
const configColumnStore = useDciConfigTableStore()

const LIVE_COLUMNS = [
  { id: 'id', field: 'id', label: 'ID', sortable: true, width: 70 },
  {
    id: 'description',
    field: 'description',
    label: 'Description',
    sortable: true,
    width: 300,
    mandatory: true,
  },
  { id: 'metric', field: 'name', label: 'Metric', sortable: true, width: 220 },
  { id: 'origin', field: 'sourceType', label: 'Origin', sortable: true, width: 90 },
  { id: 'dataType', field: 'dataType', label: 'Data Type', sortable: true, width: 120 },
  { id: 'value', field: 'value', label: 'Value', width: 150 },
  { id: 'timestamp', field: 'timestamp', label: 'Last Poll', sortable: true, width: 160 },
  { id: 'status', field: '_statusId', label: 'Status', sortable: true, width: 110 },
  { id: 'threshold', field: '_thresholdRank', label: 'Threshold', sortable: true, width: 200 },
  { id: 'event', field: null, label: 'Event', width: 180 },
  { id: 'message', field: null, label: 'Message', width: 260 },
  { id: 'tag', field: 'userTag', label: 'Tag', sortable: true, width: 110 },
  { id: 'comments', field: 'comments', label: 'Comments', width: 220 },
]

const CONFIG_COLUMNS = [
  { id: 'id', field: 'id', label: 'ID', sortable: true, width: 60 },
  {
    id: 'description',
    field: 'description',
    label: 'Description',
    sortable: true,
    width: 260,
    mandatory: true,
  },
  { id: 'origin', field: 'origin', label: 'Origin', sortable: true, width: 90 },
  { id: 'metric', field: 'name', label: 'Metric', sortable: true, width: 240 },
  { id: 'dataType', field: 'dataType', label: 'Data Type', sortable: true, width: 120 },
  { id: 'units', field: 'unitName', label: 'Units', sortable: true, width: 70 },
  { id: 'schedule', field: 'pollingScheduleType', label: 'Schedule', sortable: true, width: 90 },
  { id: 'retention', field: 'retentionType', label: 'Retention', sortable: true, width: 90 },
  { id: 'tag', field: 'userTag', label: 'Tag', sortable: true, width: 100 },
  { id: 'status', field: 'status', label: 'Status', sortable: true, width: 100 },
  { id: 'thresholds', field: null, label: 'Thresholds', width: 160 },
  { id: 'template', field: '_templateName', label: 'Template', sortable: true, width: 200 },
]

const ACTIONS_COLUMN = { id: 'actions', field: null, label: '', width: 40, reorderable: false }

const liveColumns = computed(() => [...liveColumnStore.shownColumns(LIVE_COLUMNS), ACTIONS_COLUMN])
const configColumns = computed(() => [
  ...configColumnStore.shownColumns(CONFIG_COLUMNS),
  ACTIONS_COLUMN,
])

// Both types arrive as value summaries; a table's contents are fetched by the expansion.
const { mappedValue } = useDciValueMapping(() => dciCurrentValues.value?.values)
const dciValues = computed(() => {
  const raw = dciCurrentValues.value?.values ?? []
  return raw.map((dci) => {
    const threshold = liveThresholdInfo(dci)
    return {
      ...dci,
      mappedValue: mappedValue(dci),
      _isTable: dci.isTable === true,
      _statusId: getDciStatusInfo(dci.status).id,
      _threshold: threshold,
      // Fired thresholds above suspended ones, worst severity first.
      _thresholdRank: !threshold ? 0 : threshold.kind === 'disabled' ? 1 : 2 + threshold.severity,
    }
  })
})

function isStringDci(dci) {
  return !dci._isTable && dci.dataType === DCI_DATA_TYPES.STRING
}

function isNumericDci(dci) {
  return !dci._isTable && dci.dataType !== DCI_DATA_TYPES.STRING
}

function matchesSearch(dci, search) {
  return (
    (dci.description ?? '').toLowerCase().includes(search) ||
    (dci.name ?? '').toLowerCase().includes(search)
  )
}

// One filter for both modes; both row shapes carry `description` and `name`.
const filterText = ref('')
const filteredValues = computed(() => {
  const search = filterText.value.toLowerCase()
  return dciValues.value.filter(
    (dci) => passesTemplateFilter(dci) && (!search || matchesSearch(dci, search)),
  )
})

// AppTable mounts an expansion only while its row is open, so each fetches its own data for
// exactly that long.
const liveTable = ref()
const configTable = ref()

// Instance discovery points back at the owner itself, which needs no lookup.
const sourceObjectIds = computed(() => {
  const ids = new Set()
  for (const dci of dciConfigList.value ?? []) {
    const source = dciSource(dci, objectId.value)
    if (source?.kind === 'object') ids.add(source.objectId)
  }
  return [...ids]
})
const { objectsById: sourceObjectsById } = useObjectsByIds(sourceObjectIds)

// Null for a source object the user cannot read, which is then shown by id only.
function sourceObjectOf(source) {
  if (!source) return null
  if (source.kind === 'instanceDiscovery') return props.object
  return sourceObjectsById.value.get(source.objectId) ?? null
}

const configRows = computed(() =>
  (dciConfigList.value ?? []).map((dci) => {
    const source = dciSource(dci, objectId.value)
    const sourceObject = sourceObjectOf(source)
    return {
      ...dci,
      _source: source,
      _sourceObject: sourceObject,
      _templateName: !source
        ? null
        : source.kind === 'instanceDiscovery'
          ? 'Instance discovery'
          : (sourceObject?.name ?? `[${source.objectId}]`),
    }
  }),
)

const hiddenLiveCount = computed(() => countHidden(dciValues.value, filterText.value))
const hiddenConfigCount = computed(() => countHidden(configRows.value, filterText.value))
const filteredConfig = computed(() => {
  const search = filterText.value.toLowerCase()
  return configRows.value.filter(
    (dci) => passesTemplateFilter(dci) && (!search || matchesSearch(dci, search)),
  )
})

// Coming back from the editor: the list stays mounted (v-show), so only the edited DCI needs
// bringing into view. If the list does not have it yet, the next refreshes retry for a few
// seconds only, so a DCI that never shows up cannot yank the list around later.
const REVEAL_WAIT_MS = 5000
let pendingRevealId = null
let pendingRevealTimer = null
let createdDciId = null

function activeTable() {
  return mode.value === 'values' ? liveTable.value : configTable.value
}

function clearPendingReveal() {
  pendingRevealId = null
  clearTimeout(pendingRevealTimer)
}

function revealDci(id) {
  clearPendingReveal()
  if (activeTable()?.revealRow(id)) return
  pendingRevealId = id
  pendingRevealTimer = setTimeout(clearPendingReveal, REVEAL_WAIT_MS)
}

function onCreated(created) {
  createdDciId = created?.id ?? null
  closeDetail()
}

// Post flush: the table needs its new rows, and the editor must be gone before its row can
// take the focus.
watch(
  entityId,
  (id, previousId) => {
    if (id || !previousId) return
    const revealId = previousId === 'new' ? createdDciId : Number(previousId)
    createdDciId = null
    if (revealId) revealDci(revealId)
  },
  { flush: 'post' },
)

watch(
  [filteredValues, filteredConfig],
  () => {
    if (pendingRevealId == null || isDetailView.value) return
    if (activeTable()?.revealRow(pendingRevealId)) clearPendingReveal()
  },
  { flush: 'post' },
)

onBeforeUnmount(clearPendingReveal)

function enableDci(dci) {
  updateDci.mutate({ objectId: objectId.value, dciId: dci.id, data: { status: 'active' } })
}

function disableDci(dci) {
  updateDci.mutate({ objectId: objectId.value, dciId: dci.id, data: { status: 'disabled' } })
}

function confirmDeleteDci(dci) {
  confirm.require({
    header: 'Confirm Delete',
    message: `Delete "${dci.description || dci.name}"?`,
    icon: 'pi pi-exclamation-triangle',
    acceptSeverity: 'danger',
    acceptLabel: 'Delete',
    rejectLabel: 'Cancel',
    accept: () => deleteDci.mutate({ objectId: objectId.value, dciId: dci.id }),
  })
}

// Chartable: a numeric history to plot (not table or string DCIs).
function isChartable(dci) {
  return !dci._isTable && isNumericDci(dci)
}

function isTabulatable(dci) {
  return !dci._isTable
}

const selectedDciIds = ref(new Set())

// Filter and mode follow the user to the next node, as in legacy; the selection is this
// node's.
useWorkingState('dcis', {
  view: { mode, filterText },
  object: { selectedDciIds },
})
if (!hasLiveData.value) mode.value = 'config'

// A filter that hides a selected DCI would otherwise chart something the user cannot see.
watch([filterText, mode, hideTemplateItems], () => {
  selectedDciIds.value = new Set()
})

const selectedDcis = computed(() =>
  filteredValues.value.filter((dci) => selectedDciIds.value.has(dci.id)),
)

/** Built through `objectTarget` so ctrl/cmd and middle click open it in a browser tab. */
function chartTarget(dcis, overrides = {}) {
  const model = createChartModel({
    dcis: dcis.map((dci) => ({ nodeId: objectId.value, dciId: dci.id, label: dci.description })),
    ...overrides,
  })
  return objectTarget(object.value, 'chart', {
    query: serializeToQuery(model, objectId.value),
  })
}

/**
 * A DCI that stopped collecting opens on the window its preview showed: the chart's default
 * "last hour" would be empty.
 */
function previewChartTarget(row) {
  const end = previewWindowEnd(row.timestamp)
  if (end == null) return chartTarget([row])
  return chartTarget([row], {
    time: { preset: 'custom', from: end - PREVIEW_RANGE_SECONDS, to: end },
  })
}

function openChart(dcis, overrides) {
  if (!dcis.length) return
  router.push(chartTarget(dcis, overrides))
}

/** Anchors navigate natively on ctrl/cmd/middle click; a plain click runs an SPA push. */
function navClick(event, target) {
  if (!isPlainLeftClick(event)) return
  event.preventDefault()
  router.push(target)
}

// A row the pointer rests on is likely expanded next, so its history is prefetched after a
// dwell that keeps a sweeping pointer from fetching every row. Table DCIs show contents.
const PREFETCH_DWELL_MS = 500

const prefetchDciHistory = usePrefetchDciHistory()
let prefetchTimer = null

function onLiveRowEnter(row) {
  clearTimeout(prefetchTimer)
  if (row._isTable) return
  prefetchTimer = setTimeout(() => {
    prefetchDciHistory(objectId.value, row.id, { endAt: previewWindowEnd(row.timestamp) })
  }, PREFETCH_DWELL_MS)
}

function onLiveRowLeave() {
  clearTimeout(prefetchTimer)
}

onBeforeUnmount(onLiveRowLeave)

/** The whole selection when the row is part of one, otherwise just that row. */
function chartSubjects(row) {
  const multiSelected = selectedDciIds.value.has(row.id) && selectedDcis.value.length > 1
  return multiSelected ? selectedDcis.value : [row]
}

const selectionActions = computed(() => {
  const chartable = selectedDcis.value.filter(isChartable)
  const actions = []
  if (chartable.length) {
    const target = chartTarget(chartable)
    actions.push({
      label: 'Line chart',
      icon: 'pi pi-chart-line',
      href: resolveHref(target),
      command: (event) => navClick(event, target),
    })
  }
  if (chartable.length > 1) {
    actions.push({
      label: 'Compare',
      icon: 'pi pi-chart-bar',
      command: () => openChart(chartable, { mode: 'comparison' }),
    })
  }
  actions.push({
    label: 'Data table',
    icon: 'pi pi-table',
    command: () => openChart(selectedDcis.value.filter(isTabulatable), { mode: 'table' }),
  })
  const previewable = selectedDcis.value.filter((dci) => !dci._isTable)
  if (previewable.length) {
    actions.push({ label: 'Preview', icon: 'pi pi-eye', command: () => previewDcis(previewable) })
  }
  return actions
})

// Each open preview fetches a day of history, so opening a selection at once is bounded.
const PREVIEW_LIMIT = 20

function previewDcis(dcis) {
  const opened = liveTable.value?.expandRows(
    dcis.map((dci) => dci.id),
    PREVIEW_LIMIT,
  )
  if (opened != null && opened < dcis.length) {
    notify({
      severity: 'info',
      summary: `Opened the first ${opened} previews`,
      detail:
        `${dcis.length - opened} more stayed closed: ` +
        `previews open at most ${PREVIEW_LIMIT} rows at once.`,
      life: 5000,
    })
  }
}

/** Mirrors the legacy Last Values menu. */
function chartMenuItems(row) {
  const subjects = chartSubjects(row)
  const chartable = subjects.filter(isChartable)
  const tabulatable = subjects.filter(isTabulatable)
  const items = []

  if (chartable.length) {
    items.push(
      {
        label: 'Line chart',
        icon: 'pi pi-chart-line',
        command: () => openChart(chartable),
      },
      {
        label: 'Raw data line chart',
        icon: 'pi pi-chart-line',
        command: () => openChart(chartable, { raw: true }),
      },
      {
        label: 'Bar chart',
        icon: 'pi pi-chart-bar',
        command: () => openChart(chartable, { mode: 'comparison', comparisonType: 'bar' }),
      },
      {
        label: 'Pie chart',
        icon: 'pi pi-chart-pie',
        command: () => openChart(chartable, { mode: 'comparison', comparisonType: 'pie' }),
      },
    )
  }

  if (tabulatable.length) {
    items.push({
      label: 'Data table',
      icon: 'pi pi-table',
      command: () => openChart(tabulatable, { mode: 'table' }),
    })
  }

  if (items.length) items.push({ separator: true })
  return items
}

const contextMenu = ref()

function onActionsClick(event, rowData) {
  contextMenu.value.show(event, rowData)
}

const contextMenuItems = computed(() => {
  const data = contextMenu.value?.contextData
  if (!data) return []

  if (mode.value === 'config') {
    const items = [
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => openDetail(data.id),
      },
    ]
    if (data.status === 'active') {
      items.push({
        label: 'Disable',
        icon: 'pi pi-ban',
        command: () => disableDci(data),
      })
    } else if (data.status === 'disabled') {
      items.push({
        label: 'Enable',
        icon: 'pi pi-check-circle',
        command: () => enableDci(data),
      })
    }
    items.push({
      label: 'Delete',
      icon: 'pi pi-trash',
      command: () => confirmDeleteDci(data),
    })
    return items
  }

  // Charting first, as in the legacy Last Values menu.
  const items = [...chartMenuItems(data)]

  items.push({
    label: 'Edit',
    icon: 'pi pi-pencil',
    command: () => openDetail(data.id),
  })

  if (!data._isTable) {
    items.push({
      label: 'Quick preview',
      icon: 'pi pi-eye',
      command: () => previewDcis(chartSubjects(data).filter((dci) => !dci._isTable)),
    })
  }

  return items
})

// Legacy LastValuesLabelProvider: the mapped value, or the formatter with the DCI's own unit
// and multiplier.
function formatValue(dci) {
  if (dci.noValue || dci.value === '' || dci.value == null) return '-'
  return displayDciValue(dci)
}

// The cell can be ellipsized; a mapped value also names the raw one.
function valueTooltip(dci) {
  const text = formatValue(dci)
  return dci.mappedValue != null && text !== '-' ? `${text} (raw value: ${dci.value})` : text
}

// As legacy, any consecutive errors show the marker: the cache still holds the last good
// value, so an empty-value check would hide almost every failure.
function hasValueError(dci) {
  return dci.errorCount > 0
}

function valueErrorInfo(dci) {
  return getDciCollectionErrorInfo(dci.lastCollectionError)
}

// The reason text is ellipsized in a narrow column.
function valueErrorTooltip(dci) {
  const count = dci.errorCount
  return `${valueErrorInfo(dci).text} - ${count} collection error${count > 1 ? 's' : ''}`
}

function isEpochTimestamp(ts) {
  if (!ts) return true
  const d = new Date(ts)
  return d.getFullYear() <= 1970
}

function formatTimestamp(ts) {
  if (!ts || isEpochTimestamp(ts)) return '-'
  return formatDateTimeWithSeconds(new Date(ts))
}

function getRowClass(dci) {
  // Not being collected: whatever it shows is history.
  const inactive = dci._statusId !== 'active' ? 'dci-row-inactive' : null
  if (dci._isTable) return ['dci-row-table', inactive]
  if (dci.hasActiveThreshold) return ['dci-row-threshold', inactive]
  if (dci.errorCount > 0) {
    return [valueErrorInfo(dci).severity === 'warn' ? 'dci-row-invalid' : 'dci-row-error', inactive]
  }
  return inactive
}

/** A DCI that is not collecting and has nothing to show says why instead of "-". */
function showsStatusForValue(dci) {
  return dci._statusId !== 'active' && formatValue(dci) === '-'
}

function thresholdTooltip(threshold) {
  return [threshold.event, threshold.message].filter(Boolean).join(': ')
}

function activeThreshold(row) {
  return row._threshold?.kind === 'active' ? row._threshold : null
}

// Legacy flattens comments onto one line; the tooltip keeps the line breaks.
function commentLine(comments) {
  return (comments ?? '').replace(/\r/g, '').replace(/\n/g, ' ')
}

/** Table thresholds have no one-line form. */
function thresholdsSummary(dci) {
  const thresholds = dci.thresholds ?? []
  if (!thresholds.length) return ''
  if (dci.type === 'table') {
    return `${thresholds.length} threshold${thresholds.length > 1 ? 's' : ''}`
  }
  const first = thresholdExpressionLabel(thresholds[0])
  return thresholds.length > 1 ? `${first} (+${thresholds.length - 1})` : first
}

/** The DCI it was made from, on the object that made it. */
function sourceDciTarget(row) {
  return dciTarget(row._sourceObject, row._source.dciId)
}
</script>

<template>
  <!-- Container / non-DCI target -->
  <div v-if="!isDciTarget" class="dcis-view">
    <div class="dcis-toolbar">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText placeholder="Search data collection items..." class="filter-input" disabled />
      </IconField>
    </div>
    <div class="dcis-placeholder">
      <i class="pi pi-search placeholder-icon" />
      <p class="placeholder-title">Search in associated objects</p>
      <p class="placeholder-text">
        Use the search bar to find data collection items across child objects of this
        {{ object.class?.toLowerCase() ?? 'object' }}.
      </p>
    </div>
  </div>

  <!-- `display: contents`, so the editor and the list still size against the tab. -->
  <div v-else class="dcis-host">
    <DciEditorView
      v-if="isDetailView"
      :object-id="objectId"
      :dci-id="isCreateMode ? null : editDciId"
      :owner-object="object"
      :initial-tab="route.query.tab"
      @back="closeDetail"
      @created="onCreated"
    />

    <!-- Stays mounted under the editor, so Back finds it as it was left. -->
    <div v-show="!isDetailView" class="dcis-view">
      <RefetchIndicator
        :is-fetching="
          mode === 'values' ? isFetching && !loadingDciValues : isFetchingConfig && !loadingConfig
        "
      />

      <div class="dcis-toolbar">
        <SelectButton
          v-if="hasLiveData"
          v-model="mode"
          :options="MODE_OPTIONS"
          option-label="label"
          option-value="value"
          size="small"
        />

        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText
            v-model="filterText"
            data-filter-input
            placeholder="Filter by description or metric..."
            class="filter-input"
          />
        </IconField>

        <template v-if="mode === 'values'">
          <span v-if="!loadingDciValues" class="dci-count"
            >{{ $plural(filteredValues.length, 'item')
            }}<template v-if="hiddenLiveCount">, {{ hiddenLiveCount }} hidden</template></span
          >
        </template>

        <template v-else>
          <span v-if="!loadingConfig" class="dci-count"
            >{{ $plural(filteredConfig.length, 'item')
            }}<template v-if="hiddenConfigCount">, {{ hiddenConfigCount }} hidden</template></span
          >
        </template>

        <!-- In the toolbar's free middle, so selecting a row moves nothing. -->
        <SelectionActions
          v-if="mode === 'values'"
          :count="selectedDcis.length"
          :actions="selectionActions"
          @clear="selectedDciIds = new Set()"
        />

        <div class="toolbar-end">
          <!-- Lit while template items are hidden; the accessible name says what pressing does. -->
          <Button
            v-if="canHideTemplateItems"
            v-tooltip.bottom="
              hideTemplateItems ? 'Show the DCIs templates added' : 'Hide the DCIs templates added'
            "
            :icon="hideTemplateItems ? 'pi pi-eye-slash' : 'pi pi-eye'"
            label="Template items"
            aria-label="Hide template items"
            :aria-pressed="hideTemplateItems"
            size="small"
            :severity="hideTemplateItems ? 'primary' : 'secondary'"
            :outlined="hideTemplateItems"
            class="template-items-toggle"
            @click="hideTemplateItems = !hideTemplateItems"
          />
          <ColumnChooser
            v-if="mode === 'values'"
            v-model="liveColumnStore.visibleColumnIds"
            v-model:order="liveColumnStore.columnOrder"
            :columns="LIVE_COLUMNS"
          />
          <ColumnChooser
            v-else
            v-model="configColumnStore.visibleColumnIds"
            v-model:order="configColumnStore.columnOrder"
            :columns="CONFIG_COLUMNS"
          />
          <Button
            label="Create DCI"
            data-tour="create-dci"
            icon="pi pi-plus"
            size="small"
            severity="primary"
            @click="openDetail('new')"
          />
        </div>
      </div>

      <AppTable
        v-if="mode === 'values'"
        ref="liveTable"
        :columns="liveColumns"
        :rows="filteredValues"
        :loading="loadingDciValues"
        :error="isErrorDciValues ? errorDciValues : null"
        sort-field="description"
        :sort-order="1"
        :row-class="getRowClass"
        expandable
        selectable
        :selected-ids="selectedDciIds"
        :row-selectable="isTabulatable"
        resize-fit
        :page-size="100"
        storage-key="dci-live-data"
        reorderable
        @selection-change="selectedDciIds = $event"
        @column-move="liveColumnStore.moveColumn(LIVE_COLUMNS, $event)"
        @row-contextmenu="({ event, row }) => onActionsClick(event, row)"
        @row-mouseenter="onLiveRowEnter"
        @row-mouseleave="onLiveRowLeave"
        @retry="refetch"
      >
        <template #cell="{ col, row }">
          <span v-if="col.id === 'id'">{{ row.id }}</span>
          <span v-else-if="col.id === 'description'" class="cell-ellipsis">
            <i v-if="row._isTable" class="pi pi-table table-dci-icon" />{{ row.description }}
          </span>
          <span v-else-if="col.id === 'metric'" class="cell-ellipsis dci-metric">{{
            row.name
          }}</span>
          <template v-else-if="col.id === 'origin'">
            {{ getDciSourceTypeLabel(row.sourceType) }}
          </template>
          <template v-else-if="col.id === 'dataType'">
            {{ row._isTable ? 'Table' : getDciDataTypeLabel(row.dataType) }}
          </template>
          <template v-else-if="col.id === 'value'">
            <!-- A table DCI's summary carries no value; the rows arrive when expanded. -->
            <span v-if="row._isTable" class="text-muted">Table</span>
            <span
              v-else-if="hasValueError(row)"
              v-tooltip.right="valueErrorTooltip(row)"
              :class="['value-error', `value-error--${valueErrorInfo(row).severity}`]"
            >
              <i
                :class="[
                  'pi error-icon',
                  valueErrorInfo(row).severity === 'warn'
                    ? 'pi-exclamation-triangle'
                    : 'pi-times-circle',
                ]"
              />
              <span class="value-error-text">{{ valueErrorInfo(row).text }}</span>
            </span>
            <span
              v-else-if="showsStatusForValue(row)"
              :class="['dci-status', `dci-status--${row._statusId}`]"
            >
              {{ getDciStatusInfo(row.status).label }}
            </span>
            <span
              v-else
              v-tooltip.right="valueTooltip(row)"
              :class="['value-text', { 'value-empty': row.value === '' || row.noValue }]"
            >
              {{ formatValue(row) }}
            </span>
          </template>
          <template v-else-if="col.id === 'timestamp'">
            <span v-if="row._isTable" class="text-muted">-</span>
            <span v-else :class="{ 'text-muted': isEpochTimestamp(row.timestamp) }">
              {{ formatTimestamp(row.timestamp) }}
            </span>
          </template>
          <span
            v-else-if="col.id === 'status'"
            :class="['dci-status', `dci-status--${row._statusId}`]"
          >
            {{ getDciStatusInfo(row.status).label }}
          </span>
          <span v-else-if="col.id === 'threshold'" class="dci-threshold-cell">
            <span
              v-if="activeThreshold(row)"
              v-tooltip.left="thresholdTooltip(row._threshold) || null"
              class="dci-threshold"
            >
              <StatusIcon :status="row._threshold.severity" />
              <span class="cell-ellipsis">{{ row._threshold.text }}</span>
            </span>
            <span v-else-if="row._threshold" class="cell-ellipsis text-muted">
              {{ row._threshold.text }}
            </span>
          </span>
          <span v-else-if="col.id === 'event'" class="cell-ellipsis">
            {{ activeThreshold(row)?.event }}
          </span>
          <span
            v-else-if="col.id === 'message'"
            v-tooltip.left="activeThreshold(row)?.message || null"
            class="cell-ellipsis"
          >
            {{ activeThreshold(row)?.message }}
          </span>
          <span v-else-if="col.id === 'tag'" class="cell-ellipsis">{{ row.userTag }}</span>
          <span
            v-else-if="col.id === 'comments'"
            v-tooltip.left="row.comments || null"
            class="cell-ellipsis"
          >
            {{ commentLine(row.comments) }}
          </span>
          <template v-else-if="col.id === 'actions'">
            <Button
              icon="pi pi-ellipsis-v"
              text
              rounded
              severity="secondary"
              size="small"
              class="row-action-btn"
              aria-label="Actions"
              @click.stop="onActionsClick($event, row)"
            />
          </template>
        </template>
        <template #expansion="{ row }">
          <div class="dci-expansion">
            <dl class="dci-details">
              <div class="dci-detail">
                <dt>Metric</dt>
                <dd class="dci-metric">{{ row.name }}</dd>
              </div>
              <div class="dci-detail">
                <dt>Origin</dt>
                <dd>{{ getDciSourceTypeLabel(row.sourceType) }}</dd>
              </div>
              <div v-if="!row._isTable" class="dci-detail">
                <dt>Data type</dt>
                <dd>{{ getDciDataTypeLabel(row.dataType) }}</dd>
              </div>
              <div v-if="row._statusId !== 'active'" class="dci-detail">
                <dt>Status</dt>
                <dd :class="['dci-status', `dci-status--${row._statusId}`]">
                  {{ getDciStatusInfo(row.status).label }}
                </dd>
              </div>
            </dl>
            <div v-if="row._isTable">
              <DciTableCurrentView
                :object-id="objectId"
                :dci-id="row.id"
                :dci-name="row.description || row.name"
              />
            </div>
            <template v-else>
              <DciHistoryPreview
                :object-id="objectId"
                :dci-id="row.id"
                :is-string="isStringDci(row)"
                :last-timestamp="row.timestamp"
              />
              <div class="expansion-actions">
                <Button
                  v-if="isChartable(row)"
                  as="a"
                  :href="resolveHref(previewChartTarget(row))"
                  label="Open in chart view"
                  icon="pi pi-external-link"
                  size="small"
                  severity="secondary"
                  outlined
                  @click="navClick($event, previewChartTarget(row))"
                />
                <Button
                  label="Edit"
                  icon="pi pi-pencil"
                  size="small"
                  severity="secondary"
                  outlined
                  @click="openDetail(row.id)"
                />
              </div>
            </template>
          </div>
        </template>
        <template #empty>
          <div class="empty-message">No data collection items found.</div>
        </template>
      </AppTable>

      <AppTable
        v-if="mode === 'config'"
        ref="configTable"
        :columns="configColumns"
        :rows="filteredConfig"
        :loading="loadingConfig"
        :error="isErrorConfig ? errorConfig : null"
        sort-field="description"
        :sort-order="1"
        :row-class="(row) => (row.status !== 'active' ? 'dci-row-inactive' : null)"
        :page-size="100"
        storage-key="dci-config"
        reorderable
        resize-fit
        :target-for="(row) => detailTarget(row.id)"
        @row-click="(row) => openDetail(row.id)"
        @row-contextmenu="({ event, row }) => onActionsClick(event, row)"
        @column-move="configColumnStore.moveColumn(CONFIG_COLUMNS, $event)"
        @retry="refetchConfig"
      >
        <template #cell="{ col, row }">
          <span v-if="col.id === 'id'">{{ row.id }}</span>
          <span v-else-if="col.id === 'description'" class="cell-ellipsis">
            {{ row.description || row.name }}
          </span>
          <span v-else-if="col.id === 'metric'" class="cell-ellipsis dci-metric">{{
            row.name
          }}</span>
          <template v-else-if="col.id === 'origin'">{{
            getDciSourceTypeLabel(row.origin)
          }}</template>
          <template v-else-if="col.id === 'dataType'">
            {{ row.type === 'table' ? 'Table' : getDciDataTypeLabel(row.dataType) }}
          </template>
          <template v-else-if="col.id === 'units'">{{ row.unitName }}</template>
          <template v-else-if="col.id === 'schedule'">
            <span v-if="row.pollingScheduleType === 'default'" class="text-muted">Default</span>
            <span v-else-if="row.pollingScheduleType === 'custom'">{{ row.pollingInterval }}s</span>
            <span v-else class="text-muted">Advanced</span>
          </template>
          <template v-else-if="col.id === 'retention'">
            <span v-if="row.retentionType === 'default'" class="text-muted">Default</span>
            <span v-else-if="row.retentionType === 'none'" class="text-muted">None</span>
            <span v-else>{{ row.retentionTime }}d</span>
          </template>
          <span v-else-if="col.id === 'tag'" class="cell-ellipsis">{{ row.userTag }}</span>
          <span
            v-else-if="col.id === 'status'"
            :class="['dci-status', `dci-status--${getDciStatusInfo(row.status).id}`]"
          >
            {{ getDciStatusInfo(row.status).label }}
          </span>
          <span v-else-if="col.id === 'thresholds'" class="cell-ellipsis">
            {{ thresholdsSummary(row) }}
          </span>
          <span v-else-if="col.id === 'template'" class="dci-template-cell">
            <AppLink
              v-if="row._sourceObject"
              v-tooltip.left="'Open the DCI this one was made from'"
              :to="sourceDciTarget(row)"
              class="cell-ellipsis"
              @click.stop
            >
              {{ row._templateName }}
            </AppLink>
            <span v-else-if="row._source" class="cell-ellipsis text-muted">
              {{ row._templateName }}
            </span>
          </span>
          <template v-else-if="col.id === 'actions'">
            <Button
              icon="pi pi-ellipsis-v"
              text
              rounded
              severity="secondary"
              size="small"
              class="row-action-btn"
              aria-label="Actions"
              @click.stop="onActionsClick($event, row)"
            />
          </template>
        </template>
        <template #empty>
          <div class="empty-message">No data collection items configured.</div>
        </template>
      </AppTable>

      <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />
    </div>
  </div>
</template>

<style scoped>
.dcis-host {
  display: contents;
}

.dcis-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.dcis-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.filter-input {
  width: 300px;
}

.dci-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.toolbar-end {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.template-items-toggle {
  flex-shrink: 0;
}

/* Past PrimeVue's own small rounded icon button, which is loaded later and at 2rem would set the
   height of every row. */
.p-button.p-button-sm.row-action-btn {
  width: 1.5rem;
  height: 1.5rem;
}

/* One line: the tooltip or the row expansion has the rest. */
.cell-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dci-metric {
  font-family: var(--font-mono);
}

/* Text, not a chip: only the two "not collecting" states stand out. */
.dci-status--disabled {
  color: var(--p-text-muted-color);
}

.dci-status--unsupported {
  color: var(--p-red-400);
}

.dci-threshold-cell,
.dci-template-cell {
  display: block;
  min-width: 0;
}

.dci-threshold {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}

.value-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.value-empty {
  color: var(--p-text-muted-color);
}

.value-error {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
}

.value-error-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.value-error--error {
  color: var(--p-red-400);
}

.value-error--warn {
  color: var(--p-yellow-600);
}

.text-muted {
  color: var(--p-text-muted-color);
}

.error-icon {
  color: inherit;
  flex-shrink: 0;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.dci-expansion {
  padding: 1rem 1.5rem;
  background: var(--p-surface-ground);
}

.dci-details {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.5rem;
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  white-space: normal;
}

.dci-detail {
  display: flex;
  gap: 0.375rem;
  min-width: 0;
}

.dci-detail dt {
  color: var(--p-text-muted-color);
}

.dci-detail dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.expansion-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--p-surface-border);
}

.dcis-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 3rem;
  text-align: center;
  color: var(--p-text-muted-color);
}

.placeholder-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.placeholder-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--p-text-color);
  margin: 0 0 0.5rem;
}

.placeholder-text {
  font-size: 0.875rem;
  max-width: 400px;
  margin: 0;
  line-height: 1.5;
}

.table-dci-icon {
  margin-right: 0.25rem;
  color: var(--p-primary-color);
}

:deep(.dci-row-threshold) {
  border-left: 3px solid var(--p-yellow-500);
}

:deep(.dci-row-error) {
  border-left: 3px solid var(--p-red-400);
}

:deep(.dci-row-invalid) {
  border-left: 3px solid var(--p-yellow-500);
}

:deep(.dci-row-inactive) td {
  color: var(--p-text-muted-color);
}
</style>
