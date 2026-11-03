<script setup>
/**
 * The archive is auto-saved on completion (as in the legacy view) only while someone is watching
 * (`job.autoSave`). The mapping file never is: a second unprompted download trips the browser's
 * "multiple downloads" prompt, and it undoes the anonymization.
 *
 * The server deletes each file after its first download, so fetched files are kept in the store.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import { downloadDataExportFile } from '@/api/dataExportApi'
import { useDataExportState } from '@/queries/useDataExportQueries'
import { useDataExportStore } from '@/stores/dataExportStore'
import {
  DATA_EXPORT_RETENTION_MINUTES,
  exportFileName,
  formatExportSize,
  isExportFinished,
} from '@/utils/dataExport'
import { downloadBlob } from '@/utils/fileDownload'

const store = useDataExportStore()

const plural = (count, word) =>
  `${Number(count).toLocaleString()} ${word}${Number(count) === 1 ? '' : 's'}`

const taskId = computed(() => store.job?.taskId ?? null)
const { data: state, error, dataUpdatedAt } = useDataExportState(taskId)

const mountedAt = Date.now()

/**
 * 'running' | 'completed' | 'failed' | 'lost' (404/403) | 'checking' (no answer yet)
 *
 * A known end state wins over a later 404: the server forgets the task once both files are
 * downloaded.
 */
const phase = computed(() => {
  if (isExportFinished(state.value)) return state.value.state
  const status = error.value?.status
  if (status === 404 || status === 403) return 'lost'
  if (state.value) return 'running'
  return 'checking'
})

const progress = computed(() => Number(state.value?.progress) || 0)

const summary = computed(() => {
  const s = state.value ?? {}
  const parts = [
    plural(s.metricCount ?? 0, 'metric'),
    plural(s.sampleCount ?? 0, 'sample'),
    formatExportSize(s.archiveSize),
  ]
  if (s.skippedCount) parts.push(`${s.skippedCount} skipped as non-numeric or inaccessible`)
  return parts.join(', ')
})

const lostText = computed(() =>
  error.value?.status === 403
    ? 'This export was started by another account.'
    : 'The server no longer has this export. Files are removed after their first download or ' +
      `${DATA_EXPORT_RETENTION_MINUTES} minutes after completion, and a server restart drops them.`,
)

const downloading = ref(null)
const downloadError = ref(null)

/** @param {'archive'|'mapping'} type */
async function save(type) {
  const job = store.job
  if (!job) return
  const name = exportFileName(new Date(job.startedAt), type)
  const kept = store.files[type]
  if (kept) {
    downloadBlob(name, kept)
    return
  }
  downloading.value = type
  downloadError.value = null
  try {
    const blob = await downloadDataExportFile(job.taskId, type)
    // Dismissed, or replaced by a new export, while the file was on its way.
    if (store.job?.taskId !== job.taskId) return
    store.keepFile(type, blob)
    downloadBlob(name, blob)
  } catch (err) {
    if (store.job?.taskId !== job.taskId) return
    downloadError.value =
      err?.status === 404
        ? 'The server no longer has this file. Each file can be downloaded once, within ' +
          `${DATA_EXPORT_RETENTION_MINUTES} minutes of completion.`
        : `Could not download the file: ${err?.message ?? 'unknown error'}`
  } finally {
    downloading.value = null
  }
}

const archiveLabel = computed(() => (store.files.archive ? 'Save archive again' : 'Save archive'))
const mappingLabel = computed(() =>
  store.files.mapping ? 'Save mapping file again' : 'Save mapping file',
)

// A fresh "still running" answer re-arms the auto-save that leaving the view switched off;
// cached data from before this mount does not count.
watch(
  [() => state.value?.state, dataUpdatedAt],
  ([current, updatedAt]) => {
    if (!store.job) return
    if ((current === 'pending' || current === 'running') && updatedAt >= mountedAt) {
      if (!store.job.autoSave) store.setAutoSave(true)
      return
    }
    if (current === 'completed' && store.job.autoSave) {
      // One attempt. A failed one leaves the buttons, not a retry loop.
      store.setAutoSave(false)
      if (!store.files.archive) save('archive')
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (store.job && !isExportFinished(state.value)) store.setAutoSave(false)
})
</script>

<template>
  <div v-if="store.job" class="job-bar" :class="`job-bar--${phase}`" role="status">
    <div class="job-line">
      <template v-if="phase === 'running' || phase === 'checking'">
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        <span class="job-text">Exporting DCI history...</span>
      </template>

      <template v-else-if="phase === 'completed'">
        <i class="pi pi-check-circle job-icon job-icon--ok" aria-hidden="true" />
        <span class="job-text">Export completed: {{ summary }}</span>
      </template>

      <template v-else-if="phase === 'failed'">
        <i class="pi pi-times-circle job-icon job-icon--error" aria-hidden="true" />
        <span class="job-text"
          >Export failed: {{ state?.failureReason || 'the server did not give a reason.' }}</span
        >
      </template>

      <template v-else>
        <i class="pi pi-exclamation-triangle job-icon job-icon--warn" aria-hidden="true" />
        <span class="job-text">{{ lostText }}</span>
      </template>

      <div class="job-actions">
        <template v-if="phase === 'completed'">
          <Button
            :label="archiveLabel"
            icon="pi pi-download"
            size="small"
            :outlined="!!store.files.archive"
            :loading="downloading === 'archive'"
            :disabled="!!downloading"
            @click="save('archive')"
          />
          <Button
            v-if="state?.mappingAvailable"
            :label="mappingLabel"
            icon="pi pi-key"
            size="small"
            severity="secondary"
            outlined
            :loading="downloading === 'mapping'"
            :disabled="!!downloading"
            @click="save('mapping')"
          />
        </template>
        <Button
          v-tooltip.bottom="'Dismiss'"
          icon="pi pi-times"
          size="small"
          severity="secondary"
          text
          rounded
          aria-label="Dismiss"
          @click="store.dismissJob()"
        />
      </div>
    </div>

    <ProgressBar
      v-if="phase === 'running' || phase === 'checking'"
      :value="progress"
      :show-value="progress > 0"
      :mode="progress > 0 ? 'determinate' : 'indeterminate'"
      class="job-progress"
    />

    <p
      v-if="error && (phase === 'running' || phase === 'checking')"
      class="job-note job-note--error"
    >
      Could not check the export's progress: {{ error.message }}. Trying again.
    </p>
    <p v-if="downloadError" class="job-note job-note--error">{{ downloadError }}</p>
    <p v-else-if="phase === 'completed'" class="job-note">
      <template v-if="state?.mappingAvailable">
        The mapping file links pseudonyms back to real names; keep it private.
      </template>
      Each file can be downloaded from the server once, within
      {{ DATA_EXPORT_RETENTION_MINUTES }} minutes of completion; this page keeps a copy until you
      dismiss it or sign out.
    </p>
  </div>
</template>

<style scoped>
.job-bar {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--p-surface-border);
  background: var(--p-surface-ground);
  font-size: 0.8125rem;
  min-width: 0;
}

.job-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.job-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.job-icon--ok {
  color: var(--netxms-status-normal);
}

.job-icon--error {
  color: var(--netxms-status-critical);
}

.job-icon--warn {
  color: var(--netxms-status-minor);
}

.job-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
  flex-shrink: 0;
}

.job-progress {
  height: 0.875rem;
}

.job-note {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.job-note--error {
  color: var(--p-red-500);
}
</style>
