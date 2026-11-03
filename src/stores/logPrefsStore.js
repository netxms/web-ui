import { ref, watch } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { getLogCatalogEntry } from '@/config/logCatalog'
import { DEFAULT_PAGE_SIZE, getTimePreset as getLogTimePreset } from '@/utils/logQueryModel'
import { createBucket, userPrefs } from '@/utils/appStorage'

/**
 * Per-log view preferences; the query itself lives in the URL. Columns, mode and time range
 * follow the account in one `userPrefs` field; widths, page size, last log and drawer width stay
 * in this browser.
 */
const logPrefsBucket = createBucket('log-prefs', 'local')

const PRESENTATION_FIELD = 'logs.presentation'

export const RESULT_MODE = { TABLE: 'table', STREAM: 'stream' }

function loadFromStorage() {
  const stored = logPrefsBucket.read()
  return Object.keys(stored).length ? stored : null
}

function saveToStorage(data) {
  logPrefsBucket.write(data)
}

function splitByLog(byLog) {
  const local = {}
  const presentation = {}
  for (const [name, entry] of Object.entries(byLog ?? {})) {
    const { columns, mode, time, ...rest } = entry ?? {}
    const shown = {}
    if (columns !== undefined) shown.columns = columns
    if (mode !== undefined) shown.mode = mode
    if (time !== undefined) shown.time = time
    if (Object.keys(shown).length) presentation[name] = shown
    if (Object.keys(rest).length) local[name] = rest
  }
  return { local, presentation }
}

function mergeByLog(...sources) {
  const merged = {}
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    for (const [name, entry] of Object.entries(source)) {
      if (entry && typeof entry === 'object') merged[name] = { ...merged[name], ...entry }
    }
  }
  return merged
}

function clampDrawerWidth(px) {
  const n = Number(px)
  if (Number.isNaN(n)) return DEFAULT_DRAWER_WIDTH
  return Math.min(MAX_DRAWER_WIDTH, Math.max(MIN_DRAWER_WIDTH, Math.round(n)))
}

const DEFAULT_DRAWER_WIDTH = 560
const MIN_DRAWER_WIDTH = 360
const MAX_DRAWER_WIDTH = 1100

export const useLogPrefsStore = defineStore('logPrefs', () => {
  const lastLog = ref(null)
  /**
   * @type {import('vue').Ref<Record<string, {columns?: string[], mode?: string, time?: string,
   *   widths?: Record<string, number>, pageSize?: number}>>}
   */
  const byLog = ref({})
  /** One panel, shared across logs. */
  const drawerWidth = ref(DEFAULT_DRAWER_WIDTH)

  const stored = loadFromStorage()
  if (stored) {
    if (typeof stored.lastLog === 'string') lastLog.value = stored.lastLog
    if (stored.drawerWidth != null) drawerWidth.value = clampDrawerWidth(stored.drawerWidth)
  }
  byLog.value = mergeByLog(stored?.byLog, userPrefs.get(PRESENTATION_FIELD))

  watch(
    [lastLog, byLog, drawerWidth],
    () => {
      const { local, presentation } = splitByLog(byLog.value)
      saveToStorage({ lastLog: lastLog.value, byLog: local, drawerWidth: drawerWidth.value })
      if (Object.keys(presentation).length) userPrefs.set(PRESENTATION_FIELD, presentation)
      else userPrefs.remove(PRESENTATION_FIELD)
    },
    { deep: true, flush: 'post' },
  )

  // This browser's widths and page sizes stay when the account's presentation arrives.
  watch(userPrefs.revision, () => {
    byLog.value = mergeByLog(splitByLog(byLog.value).local, userPrefs.get(PRESENTATION_FIELD))
  })

  function setDrawerWidth(px) {
    drawerWidth.value = clampDrawerWidth(px)
  }

  function prefsFor(name) {
    return byLog.value[name] ?? {}
  }

  function update(name, patch) {
    byLog.value = { ...byLog.value, [name]: { ...prefsFor(name), ...patch } }
  }

  /** null when the user has never chosen: every result column shows. */
  function getColumns(name) {
    const columns = prefsFor(name).columns
    return Array.isArray(columns) ? columns : null
  }

  function setColumns(name, columns) {
    update(name, { columns })
  }

  function getMode(name) {
    return (
      prefsFor(name).mode ??
      (getLogCatalogEntry(name).stream ? RESULT_MODE.STREAM : RESULT_MODE.TABLE)
    )
  }

  function setMode(name, mode) {
    update(name, { mode })
  }

  function getPageSize(name) {
    return prefsFor(name).pageSize ?? DEFAULT_PAGE_SIZE
  }

  function setPageSize(name, pageSize) {
    update(name, { pageSize })
  }

  /** Only presets are kept: a custom range would be stale by the next visit. */
  function getTimePreset(name) {
    const time = prefsFor(name).time
    return typeof time === 'string' && getLogTimePreset(time) && time !== 'custom' ? time : null
  }

  function setTimePreset(name, preset) {
    if (preset === 'custom' || !getLogTimePreset(preset)) return
    update(name, { time: preset })
  }

  function getColumnWidths(name) {
    const widths = prefsFor(name).widths
    return widths && typeof widths === 'object' ? widths : {}
  }

  function setColumnWidths(name, widths) {
    update(name, { widths: { ...getColumnWidths(name), ...widths } })
  }

  function setLastLog(name) {
    lastLog.value = name
  }

  return {
    lastLog,
    byLog,
    drawerWidth,
    setDrawerWidth,
    getColumns,
    setColumns,
    getMode,
    setMode,
    getPageSize,
    setPageSize,
    getTimePreset,
    setTimePreset,
    getColumnWidths,
    setColumnWidths,
    setLastLog,
  }
})

// Without this, a hot reload leaves the existing store on its old shape.
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLogPrefsStore, import.meta.hot))
}
