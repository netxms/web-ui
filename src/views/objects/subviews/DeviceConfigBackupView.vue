<script setup>
/**
 * Differences from legacy:
 *
 * - No "Backup Now": the legacy action is NXCP-only, the WebAPI does not expose it.
 * - The Diff tab carries an explicit "Compare with" select, defaulting to the predecessor.
 * - Line diff, not character diff (see `@/utils/textDiff`).
 *
 * Listing needs plain `read`, but reading content needs `readDeviceConfig` and a refusal is
 * audited server-side, so the content pane gates itself rather than letting every row
 * selection earn the user an audit entry.
 */
import { computed, inject, ref, watch } from 'vue'
import Button from 'primevue/button'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import { useToast } from 'primevue/usetoast'
import AppTable from '@/components/common/AppTable.vue'
import EntityContextMenu from '@/components/common/EntityContextMenu.vue'
import FormField from '@/components/common/FormField.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import RefetchIndicator from '@/components/common/RefetchIndicator.vue'
import ConfigTextViewer from '@/components/objects/ConfigTextViewer.vue'
import RestoreDeviceConfigDialog from '@/components/objects/RestoreDeviceConfigDialog.vue'
import { hasObjectRight } from '@/auth/objectAccessRights'
import {
  useDeviceConfigBackups,
  useDeviceConfigBackup,
  useInvalidateDeviceConfigBackups,
} from '@/queries/useDeviceConfigBackupQueries'
import { useResizeHandle } from '@/composables/useResizeHandle'
import { useWorkingState } from '@/composables/useWorkingState'
import { safeFilename } from '@/utils/csvExport'
import { downloadText } from '@/utils/fileDownload'
import { diffLines, diffStats, diffToText } from '@/utils/textDiff'
import { formatDateTime, formatDateTimeShort } from '@/utils/timeFormat'

const props = defineProps({
  object: { type: Object, required: true },
})

const toast = useToast()

const objectId = computed(() => props.object.id)
const canReadContent = computed(() => hasObjectRight(props.object, 'READ_DEVICE_CONFIG'))
const canRestore = computed(() => hasObjectRight(props.object, 'UPLOAD_DEVICE_CONFIG'))

const { data, isLoading, isFetching, isError, error, refetch } = useDeviceConfigBackups(objectId)

const refreshSignal = inject('viewRefreshSignal', null)
if (refreshSignal) watch(refreshSignal, () => refetch())

const invalidateBackups = useInvalidateDeviceConfigBackups()

/**
 * Newest first, sorted here: the status column compares each row with its successor in this
 * array, whatever order arrives.
 */
const backups = computed(() =>
  [...(data.value ?? [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  ),
)

/**
 * Relative to the next-older backup, as legacy computes it: "Initial" for the oldest row,
 * then R and/or S for the configurations whose hash moved.
 */
function statusFor(index) {
  const list = backups.value
  if (index === list.length - 1) return 'Initial'
  const current = list[index]
  const previous = list[index + 1]
  const runningChanged = current.runningConfigHash !== previous.runningConfigHash
  const startupChanged = current.startupConfigHash !== previous.startupConfigHash
  if (runningChanged && startupChanged) return 'R S'
  if (runningChanged) return 'R'
  if (startupChanged) return 'S'
  return ''
}

/**
 * Legacy thresholds: the next unit is used once the value reads as at least 10 of it, so a
 * 1.4 KB config does not round down to "1 KB".
 */
function formatSize(bytes) {
  if (!bytes) return '--'
  if (bytes >= 10_995_116_277_760) return `${(bytes / 1_099_511_627_776).toFixed(1)} TB`
  if (bytes >= 10_737_418_240) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
  if (bytes >= 10_485_760) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 10_240) return `${(bytes / 1024).toFixed(1)} KB`
  return String(bytes)
}

const rows = computed(() =>
  backups.value.map((backup, index) => ({
    ...backup,
    timestampText: formatDateTime(backup.timestamp),
    lastCheckText: backup.lastCheckTime ? formatDateTime(backup.lastCheckTime) : '--',
    runningSizeText: formatSize(backup.runningConfigSize),
    startupSizeText: formatSize(backup.startupConfigSize),
    status: statusFor(index),
  })),
)

const filterText = ref('')

const filteredRows = computed(() => {
  const search = filterText.value.trim().toLowerCase()
  if (!search) return rows.value
  return rows.value.filter((row) =>
    ['timestampText', 'lastCheckText', 'runningSizeText', 'startupSizeText', 'status'].some(
      (field) =>
        String(row[field] ?? '')
          .toLowerCase()
          .includes(search),
    ),
  )
})

const COLUMNS = [
  {
    id: 'timestamp',
    field: 'timestampText',
    sortField: 'timestamp',
    label: 'Timestamp',
    sortable: true,
    width: 200,
  },
  { id: 'lastCheck', field: 'lastCheckText', label: 'Last Check', sortable: true, width: 200 },
  {
    id: 'running',
    field: 'runningSizeText',
    sortField: 'runningConfigSize',
    label: 'Running Config',
    sortable: true,
    width: 130,
  },
  {
    id: 'startup',
    field: 'startupSizeText',
    sortField: 'startupConfigSize',
    label: 'Startup Config',
    sortable: true,
    width: 130,
  },
  { id: 'status', field: 'status', label: 'Status', sortable: true, width: 110 },
]

const selectedId = ref(null)
const compareWithId = ref(null)
/** Read by the secondary query, so it is declared up here. */
const activeTab = ref('running')
/** Independent of the visible content tab. */
const diffKind = ref('running')

// Ahead of the rows watcher, which falls back to the newest backup when the remembered one is
// gone. Not the comparison pick: one deleted meanwhile would make the Diff tab fail.
useWorkingState('device-config-backups', {
  view: { filterText, activeTab, diffKind },
  object: { selectedId },
})

/** Backup ids are per provider, not global. */
watch(objectId, () => {
  selectedId.value = null
  compareWithId.value = null
})

// Defaults to the newest backup so the pane is never empty, as legacy does after a refresh.
watch(
  rows,
  (list) => {
    if (list.length === 0) {
      selectedId.value = null
      return
    }
    if (!list.some((row) => row.id === selectedId.value)) selectedId.value = list[0].id
  },
  { immediate: true },
)

const selectedRow = computed(() => rows.value.find((row) => row.id === selectedId.value) ?? null)

/** The default comparison target. */
const predecessorId = computed(() => {
  const list = backups.value
  const index = list.findIndex((backup) => backup.id === selectedId.value)
  return index >= 0 && index < list.length - 1 ? list[index + 1].id : null
})

const effectiveCompareId = computed(() => {
  if (compareWithId.value && compareWithId.value !== selectedId.value) return compareWithId.value
  return predecessorId.value
})

const contentEnabled = computed(() => canReadContent.value)

const {
  data: primary,
  isLoading: isLoadingPrimary,
  isError: isPrimaryError,
  error: primaryError,
} = useDeviceConfigBackup(objectId, selectedId, { enabled: contentEnabled })

const { data: secondary, isLoading: isLoadingSecondary } = useDeviceConfigBackup(
  objectId,
  effectiveCompareId,
  { enabled: computed(() => contentEnabled.value && activeTab.value === 'diff') },
)

/**
 * A binary backup is base64 on the wire, so both panes say what it is instead of decoding it;
 * the restore endpoint refuses binary outright.
 */
const isBinary = computed(() => !!selectedRow.value?.isBinary)

const runningText = computed(() => (isBinary.value ? '' : (primary.value?.runningConfig ?? '')))
const startupText = computed(() => (isBinary.value ? '' : (primary.value?.startupConfig ?? '')))

const diffResult = computed(() => {
  if (isBinary.value || !primary.value || !secondary.value) return null
  const pick = (backup) =>
    diffKind.value === 'startup' ? (backup.startupConfig ?? '') : (backup.runningConfig ?? '')
  return diffLines(pick(secondary.value), pick(primary.value))
})

const diffSummary = computed(() => (diffResult.value ? diffStats(diffResult.value) : null))

const DIFF_KIND_OPTIONS = [
  { value: 'running', label: 'Running config' },
  { value: 'startup', label: 'Startup config' },
]

const compareOptions = computed(() =>
  backups.value
    .filter((backup) => backup.id !== selectedId.value)
    .map((backup) => ({ value: backup.id, label: formatDateTimeShort(backup.timestamp) })),
)

const visibleText = computed(() => {
  if (activeTab.value === 'diff') return diffResult.value ? diffToText(diffResult.value) : ''
  return activeTab.value === 'startup' ? startupText.value : runningText.value
})

const visibleKind = computed(() => (activeTab.value === 'diff' ? 'diff' : activeTab.value))

function copyVisible() {
  if (!visibleText.value) return
  navigator.clipboard.writeText(visibleText.value).then(() => {
    toast.add({ severity: 'success', summary: 'Configuration copied', life: 2000 })
  })
}

function exportVisible() {
  if (!visibleText.value) return
  const stamp = selectedRow.value?.timestamp
    ? new Date(selectedRow.value.timestamp).toISOString().slice(0, 19).replaceAll(/[:T]/g, '')
    : 'backup'
  const name = `${safeFilename(props.object.name, 'node')}_${visibleKind.value}_${stamp}.txt`
  downloadText(name, visibleText.value)
}

const restoreVisible = ref(false)
const restoreBackup = ref(null)
const restoreKind = ref('running')

function openRestore(row, kind) {
  restoreBackup.value = row
  restoreKind.value = kind
  restoreVisible.value = true
}

function onRestored({ targetObjectId }) {
  toast.add({
    severity: 'success',
    summary: 'Configuration restored',
    life: 4000,
  })
  // Only the node on screen has a list to refresh.
  if (targetObjectId === objectId.value) invalidateBackups(objectId.value)
}

const contextMenu = ref(null)

const contextMenuItems = computed(() => {
  const row = contextMenu.value?.contextData
  if (!row) return []
  const items = [
    {
      label: 'Copy row',
      icon: 'pi pi-copy',
      command: () => {
        const text = [
          row.timestampText,
          row.lastCheckText,
          row.runningSizeText,
          row.startupSizeText,
          row.status,
        ].join('\t')
        navigator.clipboard.writeText(text).then(() => {
          toast.add({ severity: 'success', summary: 'Row copied', life: 2000 })
        })
      },
    },
  ]
  // Restore reads the content on the server, so it needs both rights; binary is refused.
  if (canRestore.value && canReadContent.value && !row.isBinary) {
    items.push(
      { separator: true },
      {
        label: 'Restore running config on node...',
        icon: 'pi pi-upload',
        disabled: !row.runningConfigSize,
        command: () => openRestore(row, 'running'),
      },
      {
        label: 'Restore startup config on node...',
        icon: 'pi pi-upload',
        disabled: !row.startupConfigSize,
        command: () => openRestore(row, 'startup'),
      },
    )
  }
  return items
})

function onRowContextMenu({ event, row }) {
  selectedId.value = row.id
  contextMenu.value.show(event, row)
}

const workareaRef = ref(null)
const paneHeight = ref(360)

const { isResizing, handleBindings: resizeBindings } = useResizeHandle({
  size: paneHeight,
  setSize: (px) => (paneHeight.value = px),
  min: 160,
  // Measured, so the table keeps a usable height whatever the window size.
  max: () => (workareaRef.value?.getBoundingClientRect().height ?? 700) - 160,
  label: 'Resize configuration pane',
  orientation: 'horizontal',
})

/**
 * A loaded provider that does not implement a call answers 501, an unreachable one 500; both
 * are about the server, so they get a plain explanation.
 */
const providerMessage = computed(() => {
  const status = error.value?.status
  if (status === 501) return 'The configured backup provider does not support listing backups.'
  if (status === 500) return error.value.message || 'The backup provider is unavailable.'
  return null
})

const tableError = computed(() => (providerMessage.value || !isError.value ? null : error.value))

/** Decided once so all content panels agree. */
const contentState = computed(() => {
  if (isLoadingPrimary.value) return 'loading'
  if (isPrimaryError.value) return 'error'
  if (isBinary.value) return 'binary'
  return 'ready'
})

const diffState = computed(() => {
  if (isLoadingPrimary.value || isLoadingSecondary.value) return 'loading'
  if (isPrimaryError.value) return 'error'
  if (isBinary.value) return 'binary'
  if (!effectiveCompareId.value) return 'nothing-to-compare'
  return 'ready'
})
</script>

<template>
  <div ref="workareaRef" class="backup-view">
    <RefetchIndicator :is-fetching="isFetching && !isLoading" />

    <div class="backup-toolbar">
      <IconField>
        <InputIcon class="pi pi-search" />
        <InputText
          v-model="filterText"
          data-filter-input
          placeholder="Filter backups..."
          class="filter-input"
        />
      </IconField>
      <span v-if="!isLoading" class="backup-count">
        {{ $plural(filteredRows.length, 'backup', 'backups') }}
      </span>
    </div>

    <Message v-if="providerMessage" severity="warn" :closable="false" class="backup-notice">
      {{ providerMessage }}
    </Message>

    <AppTable
      :columns="COLUMNS"
      :rows="filteredRows"
      :loading="isLoading"
      :error="tableError"
      sort-field="timestamp"
      :sort-order="-1"
      :page-size="50"
      :page-size-options="[25, 50, 100, 200]"
      storage-key="device-config-backups"
      auto-width
      striped
      size="small"
      class="backup-table"
      @row-click="selectedId = $event.id"
      @row-contextmenu="onRowContextMenu"
      @retry="refetch()"
    >
      <template #cell="{ col, row }">
        <span
          v-if="col.id === 'status' && row.status"
          class="status-chip"
          :class="{ 'status-chip--initial': row.status === 'Initial' }"
          >{{ row.status }}</span
        >
        <span v-else-if="col.id === 'timestamp'" :class="{ 'row-current': row.id === selectedId }">
          {{ row.timestampText }}
        </span>
        <span v-else>{{ row[col.field] ?? '--' }}</span>
      </template>
      <template #empty>
        <div class="empty-message">No configuration backups stored for this node yet.</div>
      </template>
    </AppTable>

    <div class="backup-bottom">
      <div
        class="resize-handle"
        :class="{ 'resize-handle--dragging': isResizing }"
        v-bind="resizeBindings"
      />

      <div class="backup-pane" :style="{ height: paneHeight + 'px' }">
        <Message
          v-if="!canReadContent"
          severity="info"
          :closable="false"
          class="backup-notice backup-notice--pane"
        >
          You do not have permission to view backup content on this node. Ask your administrator for
          the "Read device configuration" right on this object.
        </Message>

        <Tabs v-else v-model:value="activeTab" class="backup-tabs">
          <TabList>
            <Tab value="running">Running Config</Tab>
            <Tab value="startup">Startup Config</Tab>
            <Tab value="diff">Diff</Tab>
          </TabList>

          <!-- Overlaid on the tab strip: PrimeVue's Tabs styles TabList as a direct child. -->
          <div class="backup-tabs__actions">
            <Button
              v-tooltip.bottom="'Copy to clipboard'"
              icon="pi pi-copy"
              size="small"
              severity="secondary"
              text
              rounded
              aria-label="Copy configuration to clipboard"
              :disabled="!visibleText"
              @click="copyVisible"
            />
            <Button
              v-tooltip.bottom="'Export to file'"
              icon="pi pi-download"
              size="small"
              severity="secondary"
              text
              rounded
              aria-label="Export configuration to file"
              :disabled="!visibleText"
              @click="exportVisible"
            />
          </div>

          <TabPanels class="backup-tabs__panels">
            <TabPanel value="running" class="backup-tabs__panel">
              <LoadingState v-if="contentState === 'loading'" message="Loading configuration..." />
              <Message
                v-else-if="contentState === 'error'"
                severity="error"
                :closable="false"
                class="backup-notice--pane"
              >
                {{ primaryError?.message }}
              </Message>
              <div v-else-if="contentState === 'binary'" class="pane-notice">
                This backup holds a binary configuration ({{ selectedRow?.runningSizeText }}), which
                cannot be shown as text.
              </div>
              <ConfigTextViewer
                v-else
                :text="runningText"
                label="Running configuration"
                empty-message="No running configuration stored in this backup."
              />
            </TabPanel>

            <TabPanel value="startup" class="backup-tabs__panel">
              <LoadingState v-if="contentState === 'loading'" message="Loading configuration..." />
              <Message
                v-else-if="contentState === 'error'"
                severity="error"
                :closable="false"
                class="backup-notice--pane"
              >
                {{ primaryError?.message }}
              </Message>
              <div v-else-if="contentState === 'binary'" class="pane-notice">
                This backup holds a binary configuration ({{ selectedRow?.startupSizeText }}), which
                cannot be shown as text.
              </div>
              <ConfigTextViewer
                v-else
                :text="startupText"
                label="Startup configuration"
                empty-message="No startup configuration stored in this backup."
              />
            </TabPanel>

            <TabPanel value="diff" class="backup-tabs__panel">
              <div class="diff-controls">
                <FormField label="Compare" group class="diff-control">
                  <Select
                    v-model="diffKind"
                    :options="DIFF_KIND_OPTIONS"
                    option-label="label"
                    option-value="value"
                    size="small"
                    aria-label="Configuration to compare"
                  />
                </FormField>
                <FormField label="With backup" group class="diff-control">
                  <Select
                    v-model="compareWithId"
                    :options="compareOptions"
                    option-label="label"
                    option-value="value"
                    size="small"
                    :placeholder="predecessorId ? 'Previous backup' : 'No earlier backup'"
                    :disabled="compareOptions.length === 0"
                    show-clear
                    aria-label="Backup to compare with"
                    class="diff-control__select"
                  />
                </FormField>
                <span v-if="diffSummary" class="diff-summary">
                  <template v-if="diffSummary.changed">
                    <span class="diff-summary__added">+{{ diffSummary.added }}</span>
                    <span class="diff-summary__removed">-{{ diffSummary.removed }}</span>
                  </template>
                  <template v-else>No differences</template>
                </span>
              </div>

              <LoadingState v-if="diffState === 'loading'" message="Loading configurations..." />
              <Message
                v-else-if="diffState === 'error'"
                severity="error"
                :closable="false"
                class="backup-notice--pane"
              >
                {{ primaryError?.message }}
              </Message>
              <div v-else-if="diffState === 'binary'" class="pane-notice">
                Binary configurations cannot be compared as text.
              </div>
              <div v-else-if="diffState === 'nothing-to-compare'" class="pane-notice">
                This is the oldest stored backup, so there is nothing earlier to compare it with.
                Pick another backup above to compare in the other direction.
              </div>
              <ConfigTextViewer
                v-else
                :diff="diffResult ?? []"
                label="Configuration differences"
                empty-message="No differences between these backups."
              />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>

    <EntityContextMenu ref="contextMenu" :items="contextMenuItems" />

    <RestoreDeviceConfigDialog
      v-model:visible="restoreVisible"
      :source-object="object"
      :backup="restoreBackup"
      :initial-config-kind="restoreKind"
      @restored="onRestored"
    />
  </div>
</template>

<style scoped>
.backup-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

.backup-toolbar {
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

.backup-count {
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.backup-notice {
  margin: 0.75rem;
}

.backup-notice--pane {
  margin: 1rem;
}

.backup-table {
  flex: 1;
  min-height: 0;
}

.empty-message {
  text-align: center;
  padding: 2rem;
  color: var(--p-text-muted-color);
}

.status-chip {
  display: inline-block;
  padding: 0.0625rem 0.375rem;
  border-radius: var(--p-border-radius-sm, 0.25rem);
  font-size: 0.75rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--p-primary-color) 18%, transparent);
  color: var(--p-primary-color);
}

.status-chip--initial {
  background: var(--p-surface-200);
  color: var(--p-text-muted-color);
  font-weight: 500;
}

:root[data-theme='dark'] .status-chip--initial,
:root:not([data-theme='light']) .status-chip--initial {
  background: var(--p-surface-700);
}

.row-current {
  font-weight: 600;
}

.backup-bottom {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.resize-handle {
  height: 5px;
  flex-shrink: 0;
  cursor: ns-resize;
  background: var(--p-surface-border);
  transition: background 0.15s;
  user-select: none;
}

.resize-handle:hover,
.resize-handle:focus-visible,
.resize-handle--dragging {
  background: var(--p-primary-color);
  outline: none;
}

.backup-pane {
  flex-shrink: 0;
  overflow: hidden;
  background: var(--p-surface-card);
  display: flex;
  flex-direction: column;
}

.backup-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  position: relative;
}

/* The strip's own height sets the row, so the buttons align with the tab labels. */
.backup-tabs__actions {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  height: 2.5rem;
  background: var(--p-surface-card);
}

.backup-tabs__panels {
  flex: 1;
  min-height: 0;
  padding: 0;
  background: transparent;
}

.backup-tabs__panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.pane-notice {
  padding: 1.5rem;
  text-align: center;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.diff-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
}

/* FormField stacks label over control by default; a toolbar sits inline. */
.diff-control {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

.diff-control :deep(label),
.diff-control :deep(.form-field__label) {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.diff-control__select {
  min-width: 14rem;
}

.diff-summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--p-text-muted-color);
}

.diff-summary__added {
  color: var(--p-green-600);
}

.diff-summary__removed {
  color: var(--p-red-600);
}
</style>
