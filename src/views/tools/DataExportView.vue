<script setup>
/**
 * Exports the history of tagged DCIs under a root object as a ZIP of CSV files. Unchecking
 * preview rows narrows the export to an explicit DCI list; without a preview the server
 * resolves the patterns.
 *
 * Unlike legacy, changing the root or the tags drops the preview, and changing the window or
 * tier re-runs it keeping the unchecks (the server's per-metric tier depends on both). The
 * working state lives in `dataExportStore`; the root is also in the URL (`?root=`).
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'
import AppLink from '@/components/common/AppLink.vue'
import AppTable from '@/components/common/AppTable.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SmartFilterInput from '@/components/common/SmartFilterInput.vue'
import DataExportForm from '@/components/tools/DataExportForm.vue'
import DataExportJobBar from '@/components/tools/DataExportJobBar.vue'
import { useObjectsByIds } from '@/queries/useObjectQueries'
import {
  useDataExportPreview,
  useDataExportState,
  useStartDataExport,
} from '@/queries/useDataExportQueries'
import { useDataExportStore } from '@/stores/dataExportStore'
import {
  DATA_EXPORT_TIERS,
  buildExportRequest,
  isExportFinished,
  metricKey,
  nextExcluded,
  previewChange,
  selectionOf,
  selectionProblem,
} from '@/utils/dataExport'
import { getDciSourceTypeLabel } from '@/utils/objectUtils'
import { objectTarget, toolTarget } from '@/utils/routeTargets'
import { useWorkingState } from '@/composables/useWorkingState'

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const store = useDataExportStore()
const { form, previewSelection, excluded } = storeToRefs(store)

// A URL without a root keeps the form's, and the next watcher writes it back.
watch(
  () => route.query.root,
  (root) => {
    const id = Number(root) || 0
    if (id && id !== form.value.rootId) form.value.rootId = id
  },
  { immediate: true },
)

watch(
  () => form.value.rootId,
  (id) => {
    if (id === (Number(route.query.root) || 0)) return
    const query = { ...route.query }
    if (id) query.root = String(id)
    else delete query.root
    router.replace(toolTarget('data-export', query))
  },
  { immediate: true },
)

const selection = computed(() => selectionOf(form.value))
const problem = computed(() => selectionProblem(form.value))

const {
  data: preview,
  isFetching: previewFetching,
  error: previewError,
  refetch: refetchPreview,
} = useDataExportPreview(previewSelection)

/** Said once after the form outdated the preview, until the next Preview or Export. */
const notice = ref(null)

watch(selection, (next) => {
  const change = previewChange(previewSelection.value, next)
  if (change === 'clear') {
    store.clearPreview()
    notice.value =
      'The selection changed, so the preview was cleared. Export takes every metric the tag ' +
      'patterns match, or press Preview to review them again.'
  } else if (change === 'refresh') {
    previewSelection.value = next
  }
})

function runPreview() {
  if (problem.value) return
  notice.value = null
  excluded.value = new Set()
  const next = selection.value
  if (JSON.stringify(next) === JSON.stringify(previewSelection.value)) refetchPreview()
  else previewSelection.value = next
}

function clearPreview() {
  store.clearPreview()
  notice.value = null
}

const metrics = computed(() => (previewSelection.value ? (preview.value?.metrics ?? []) : []))

const ownerIds = computed(() => [...new Set(metrics.value.map((metric) => metric.ownerId))])
const { objectsById } = useObjectsByIds(ownerIds)

const tierLabels = Object.fromEntries(DATA_EXPORT_TIERS.map((tier) => [tier.id, tier.label]))

const rows = computed(() =>
  metrics.value.map((metric) => {
    const owner = objectsById.value.get(metric.ownerId) ?? null
    return {
      ...metric,
      id: metricKey(metric),
      owner,
      ownerName: owner?.name ?? `[${metric.ownerId}]`,
      originLabel: metric.origin ? getDciSourceTypeLabel(metric.origin) : '',
      tierLabel: tierLabels[metric.tier] ?? metric.tier ?? '',
    }
  }),
)

const filterState = ref({ text: '', tokens: [] })

useWorkingState('data-export', { view: { filterState } })

const filteredRows = computed(() => {
  const text = filterState.value.text.trim().toLowerCase()
  if (!text) return rows.value
  return rows.value.filter((row) =>
    [row.ownerName, row.tag, row.name, row.description].some((value) =>
      String(value ?? '')
        .toLowerCase()
        .includes(text),
    ),
  )
})

const includedRows = computed(() => rows.value.filter((row) => !excluded.value.has(row.id)))
const selectedIds = computed(() => new Set(includedRows.value.map((row) => row.id)))

function onSelectionChange(next) {
  excluded.value = nextExcluded(
    excluded.value,
    filteredRows.value.map((row) => row.id),
    next,
  )
}

const statusText = computed(() => {
  if (previewSelection.value) {
    if (previewFetching.value) return 'Searching for tagged metrics...'
    if (previewError.value || !preview.value) return ''
    const found = `${rows.value.length} ${rows.value.length === 1 ? 'metric' : 'metrics'} found`
    const skipped = preview.value.skippedCount
      ? `, ${preview.value.skippedCount} skipped (non-numeric, table or inaccessible)`
      : ''
    return `${found}${skipped}. Unchecked metrics are excluded from the export.`
  }
  return notice.value ?? ''
})

const columns = [
  { id: 'owner', field: 'ownerName', label: 'Owner', sortable: true, width: 200 },
  { id: 'tag', field: 'tag', label: 'Tag', sortable: true, width: 160 },
  { id: 'name', field: 'name', label: 'Name', sortable: true, width: 200 },
  { id: 'description', field: 'description', label: 'Description', sortable: true, width: 300 },
  { id: 'unit', field: 'unit', label: 'Unit', sortable: true, width: 80 },
  { id: 'origin', field: 'originLabel', label: 'Origin', sortable: true, width: 110 },
  { id: 'tier', field: 'tierLabel', label: 'Tier', sortable: true, width: 140 },
]

const { data: jobState } = useDataExportState(computed(() => store.job?.taskId ?? null))
const jobRunning = computed(() => !!store.job && !isExportFinished(jobState.value))

const startExport = useStartDataExport()
const startError = ref(null)

const exportProblem = computed(() => {
  if (problem.value) return problem.value
  if (jobRunning.value) return 'An export is already running'
  if (previewSelection.value && previewFetching.value) return 'Wait for the preview to finish'
  if (previewSelection.value && preview.value && includedRows.value.length === 0) {
    return 'Every previewed metric is unchecked'
  }
  return null
})

/** The checked preview rows, or null to let the server resolve the patterns. */
function exportDciList() {
  if (!previewSelection.value || !preview.value) return null
  return includedRows.value.map(({ ownerId, dciId }) => ({ ownerId, dciId }))
}

async function doExport() {
  startError.value = null
  notice.value = null
  const request = buildExportRequest(form.value, exportDciList())
  try {
    const taskId = await startExport.mutateAsync(request)
    store.startJob(taskId, request.keepMapping)
  } catch (err) {
    startError.value = err?.message ?? 'The server did not start the export.'
  }
}

function runExport() {
  if (exportProblem.value) return
  // The server hands out each file only once.
  const finishedUnsaved = store.job && jobState.value?.state === 'completed' && !store.files.archive
  if (finishedUnsaved) {
    confirm.require({
      header: 'Start a new export',
      message:
        'The archive of the last export has not been saved, and starting a new export ' +
        'discards it. Continue?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Start export',
      rejectLabel: 'Cancel',
      accept: doExport,
    })
    return
  }
  doExport()
}

const emptyState = computed(() =>
  problem.value
    ? {
        icon: 'pi pi-file-export',
        title: 'Choose what to export',
        message:
          'Pick a root object and the tag groups to export. Preview lists the metrics they ' +
          'select; Export takes them all.',
      }
    : {
        icon: 'pi pi-list-check',
        title: 'Review before exporting',
        message:
          'Press Preview to list the metrics the export would contain and uncheck the ones to ' +
          'leave out. Without a preview, the export takes every metric the tag patterns match.',
      },
)
</script>

<template>
  <div class="data-export-view">
    <div class="export-panel">
      <DataExportForm v-model="form" @submit="runPreview" />

      <div class="panel-toolbar">
        <span class="status-text">{{ statusText }}</span>
        <div class="toolbar-actions">
          <Button
            v-if="previewSelection"
            label="Clear preview"
            icon="pi pi-eraser"
            size="small"
            severity="secondary"
            text
            @click="clearPreview"
          />
          <!-- A disabled button gets no pointer events, so the wrapper carries the tooltip. -->
          <span v-tooltip.bottom="problem">
            <Button
              label="Preview"
              icon="pi pi-search"
              size="small"
              severity="secondary"
              outlined
              :loading="previewFetching"
              :disabled="!!problem"
              @click="runPreview"
            />
          </span>
          <span v-tooltip.bottom="exportProblem">
            <Button
              label="Export"
              icon="pi pi-download"
              size="small"
              :loading="startExport.isPending.value"
              :disabled="!!exportProblem"
              @click="runExport"
            />
          </span>
        </div>
      </div>

      <p v-if="startError" class="start-error" role="alert">
        <i class="pi pi-times-circle" aria-hidden="true" />
        Could not start the export: {{ startError }}
      </p>
    </div>

    <DataExportJobBar />

    <template v-if="previewSelection">
      <div class="preview-toolbar">
        <SmartFilterInput
          v-model="filterState"
          placeholder="Filter metrics..."
          class="filter-input"
        />
        <span v-if="preview" class="item-count">
          {{ includedRows.length }} of {{ $plural(rows.length, 'metric') }} selected
        </span>
      </div>

      <AppTable
        :columns="columns"
        :rows="filteredRows"
        :loading="previewFetching && rows.length === 0"
        :error="previewError"
        sort-field="ownerName"
        :sort-order="1"
        :page-size="100"
        storage-key="data-export-preview"
        selectable
        :selected-ids="selectedIds"
        striped
        size="small"
        auto-width
        class="preview-table"
        @selection-change="onSelectionChange"
        @retry="refetchPreview()"
      >
        <template #cell="{ col, row }">
          <AppLink
            v-if="col.id === 'owner' && row.owner"
            :to="objectTarget(row.owner)"
            class="cell-link"
            >{{ row.ownerName }}</AppLink
          >
          <span v-else-if="col.id === 'tag'" class="tag-cell">{{ row.tag }}</span>
          <span
            v-else-if="col.id === 'tier' && row.tier !== previewSelection.tier"
            v-tooltip.bottom="
              `No ${tierLabels[previewSelection.tier]?.toLowerCase()} for this metric over the ` +
              `chosen period; its raw samples are exported instead.`
            "
            class="tier-fallback"
            >{{ row.tierLabel }}</span
          >
          <span v-else>{{ row[col.field] || '' }}</span>
        </template>

        <template #empty>
          <template v-if="filterState.text">No metrics match the filter.</template>
          <template v-else>
            No numeric DCI under this object carries a matching system tag.
          </template>
        </template>
      </AppTable>
    </template>

    <EmptyState
      v-else
      :icon="emptyState.icon"
      :title="emptyState.title"
      :message="emptyState.message"
      class="export-prompt"
    />
  </div>
</template>

<style scoped>
.data-export-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  margin: -1rem;
}

.export-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
}

.panel-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2rem;
}

.status-text {
  min-width: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
  flex-shrink: 0;
}

.start-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-red-500);
}

.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-card);
}

.filter-input {
  width: 300px;
}

.item-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.preview-table {
  flex: 1;
  min-height: 0;
}

.export-prompt {
  flex: 1;
}

.cell-link {
  color: var(--p-primary-color);
  text-decoration: none;
}

.cell-link:hover {
  text-decoration: underline;
}

.tag-cell {
  font-family: var(--font-mono);
}

.tier-fallback {
  color: var(--netxms-status-minor);
}
</style>
