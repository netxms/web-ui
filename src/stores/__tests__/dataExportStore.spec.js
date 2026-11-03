import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { ref, reactive } from 'vue'

// The real auth store resolves a vue-query client at setup.
const sessionGuid = ref(null)
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => reactive({ sessionGuid }) }))

const { useDataExportStore } = await import('@/stores/dataExportStore')

describe('dataExportStore', () => {
  let pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    sessionGuid.value = 'session-a'
  })

  afterEach(() => {
    pinia._e.stop()
  })

  it('starts a job armed for auto-save, with no files', () => {
    const store = useDataExportStore()
    store.startJob(12, true)

    expect(store.job).toMatchObject({ taskId: 12, keepMapping: true, autoSave: true })
    expect(store.files).toEqual({ archive: null, mapping: null })

    store.setAutoSave(false)
    expect(store.job.autoSave).toBe(false)
  })

  it('keeps downloaded files until the job is dismissed or replaced', () => {
    const store = useDataExportStore()
    const blob = new Blob(['zip'])
    store.startJob(12, false)
    store.keepFile('archive', blob)
    expect(store.files.archive).toBe(blob)

    store.startJob(13, false)
    expect(store.files.archive).toBeNull()

    store.keepFile('archive', blob)
    store.dismissJob()
    expect(store.job).toBeNull()
    expect(store.files.archive).toBeNull()
  })

  it('clears the preview and its unchecks together', () => {
    const store = useDataExportStore()
    store.previewSelection = { rootId: 1, tagPatterns: ['eed.*'], tier: 'raw', time: {} }
    store.excluded = new Set(['1:2'])

    store.clearPreview()

    expect(store.previewSelection).toBeNull()
    expect(store.excluded.size).toBe(0)
  })

  it("drops the previous account's form, preview and export on a session change", async () => {
    const store = useDataExportStore()
    store.form.rootId = 42
    store.previewSelection = { rootId: 42, tagPatterns: ['eed.*'], tier: 'raw', time: {} }
    store.startJob(12, false)

    sessionGuid.value = null
    sessionGuid.value = 'session-b'
    await flushPromises()

    expect(store.form.rootId).toBe(0)
    expect(store.previewSelection).toBeNull()
    expect(store.job).toBeNull()
  })
})
