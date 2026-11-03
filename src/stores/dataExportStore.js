import { ref, watch } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { useAuthStore } from '@/stores/authStore'
import { createDataExportForm } from '@/utils/dataExport'

/**
 * Held outside the view so leaving the tool mid-export keeps the form and the running export.
 *
 * @typedef {object} DataExportJob
 * @property {number} taskId
 * @property {number} startedAt - ms, names the downloaded files
 * @property {boolean} keepMapping - a mapping file was asked for
 * @property {boolean} autoSave - save the archive on completion; leaving the tool mid-export
 *   turns it off, so a completion elsewhere waits for a click
 */
export const useDataExportStore = defineStore('dataExport', () => {
  const authStore = useAuthStore()

  /** @type {import('vue').Ref<import('@/utils/dataExport').DataExportForm>} */
  const form = ref(createDataExportForm())

  /** The `selectionOf` the preview was taken for, or null. */
  const previewSelection = ref(null)

  /** `metricKey`s of preview rows the user unchecked. */
  const excluded = ref(new Set())

  /** @type {import('vue').Ref<DataExportJob|null>} */
  const job = ref(null)

  /**
   * The server deletes each file after its first download, so saving again comes from here.
   *
   * @type {import('vue').Ref<{ archive: Blob|null, mapping: Blob|null }>}
   */
  const files = ref({ archive: null, mapping: null })

  function clearPreview() {
    previewSelection.value = null
    excluded.value = new Set()
  }

  /**
   * @param {number} taskId
   * @param {boolean} keepMapping
   */
  function startJob(taskId, keepMapping) {
    job.value = { taskId, startedAt: Date.now(), keepMapping, autoSave: true }
    files.value = { archive: null, mapping: null }
  }

  /** @param {boolean} on */
  function setAutoSave(on) {
    if (job.value) job.value = { ...job.value, autoSave: on }
  }

  function dismissJob() {
    job.value = null
    files.value = { archive: null, mapping: null }
  }

  /**
   * @param {'archive'|'mapping'} type
   * @param {Blob} blob
   */
  function keepFile(type, blob) {
    files.value = { ...files.value, [type]: blob }
  }

  // Pinia outlives sign-out; the next account must not inherit the form, preview or export.
  watch(
    () => authStore.sessionGuid,
    () => {
      form.value = createDataExportForm()
      clearPreview()
      dismissJob()
    },
  )

  return {
    form,
    previewSelection,
    excluded,
    job,
    files,
    clearPreview,
    startJob,
    setAutoSave,
    dismissJob,
    keepFile,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useDataExportStore, import.meta.hot))
}
