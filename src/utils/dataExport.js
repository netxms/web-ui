/**
 * Data export over `/v1/data-export`: the server selects DCIs by system tag glob under a root
 * object, or takes an explicit `dciList` (the preview's checkboxes), and exports their history
 * as a background task producing a ZIP, plus a pseudonym mapping file for anonymized exports.
 *
 * @typedef {object} DataExportForm
 * @property {number} rootId - root object id, 0 for none
 * @property {string[]} groups - checked tag group prefixes (`DCI_SYSTEM_TAG_GROUPS`)
 * @property {string} extraPatterns - comma-separated globs
 * @property {{ preset: string, from?: number, to?: number }} time - see TimeRangeButton
 * @property {'raw'|'hourly'|'daily'} tier
 * @property {boolean} anonymize
 * @property {boolean} keepMapping - only meaningful with `anonymize`
 *
 * @typedef {object} DataExportMetric - one row of `POST /v1/data-export/metrics`
 * @property {number} ownerId
 * @property {number} dciId
 * @property {string} tag
 * @property {string} name
 * @property {string} description
 * @property {string} unit
 * @property {string} origin - e.g. snmp, agent, push, computed
 * @property {string} dataType
 * @property {'raw'|'hourly'|'daily'} tier - the tier the export would actually read
 */
import { CHART_TIME_PRESETS, resolveTimeRange } from './dciChartModel'
import { DCI_SYSTEM_TAG_GROUPS } from './dciSystemTags'

export const DATA_EXPORT_TIERS = [
  { id: 'raw', label: 'Raw samples' },
  { id: 'hourly', label: 'Hourly aggregates' },
  { id: 'daily', label: 'Daily aggregates' },
]

export const DATA_EXPORT_TIME_PRESETS = CHART_TIME_PRESETS.filter(
  (preset) => preset.seconds >= 3600,
)

export const DEFAULT_DATA_EXPORT_TIME = Object.freeze({ preset: 'last1d' })

const DEFAULT_GROUPS = DCI_SYSTEM_TAG_GROUPS.map((group) => group.prefix).filter(
  (prefix) => prefix !== 'iface',
)

/** Server keeps finished files this long, or until downloaded once (`EXPORT_RETENTION_MS`). */
export const DATA_EXPORT_RETENTION_MINUTES = 60

/**
 * @param {number} [rootId]
 * @returns {DataExportForm}
 */
export function createDataExportForm(rootId = 0) {
  return {
    rootId: Number(rootId) || 0,
    groups: [...DEFAULT_GROUPS],
    extraPatterns: '',
    time: { ...DEFAULT_DATA_EXPORT_TIME },
    tier: 'raw',
    anonymize: false,
    keepMapping: false,
  }
}

export function parsePatterns(text) {
  return String(text ?? '')
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean)
}

/**
 * @param {DataExportForm} form
 * @returns {string[]}
 */
export function collectTagPatterns(form) {
  const checked = new Set(form.groups ?? [])
  const patterns = DCI_SYSTEM_TAG_GROUPS.filter((group) => checked.has(group.prefix)).map(
    (group) => group.pattern,
  )
  return [...new Set([...patterns, ...parsePatterns(form.extraPatterns)])]
}

/**
 * @param {DataExportForm} form
 * @returns {string|null}
 */
export function selectionProblem(form) {
  if (!form.rootId) return 'Choose a root object first'
  if (collectTagPatterns(form).length === 0) return 'Choose at least one tag group or pattern'
  return null
}

/**
 * Includes window and tier because the server reports per metric which tier it would read.
 * The time stays unresolved (`{ preset }`), so this works as a stable query key.
 *
 * @param {DataExportForm} form
 * @returns {{ rootId: number, tagPatterns: string[], tier: string, time: object }}
 */
export function selectionOf(form) {
  return {
    rootId: form.rootId,
    tagPatterns: collectTagPatterns(form),
    tier: form.tier,
    time: { ...form.time },
  }
}

export function sameMetricSet(a, b) {
  return (
    !!a &&
    !!b &&
    a.rootId === b.rootId &&
    a.tagPatterns.length === b.tagPatterns.length &&
    a.tagPatterns.every((pattern, index) => pattern === b.tagPatterns[index])
  )
}

/**
 * `clear` when the metric set changed; `refresh` (keeping unchecks) when only window or tier
 * changed, since the tier read per metric depends on both.
 *
 * @param {ReturnType<typeof selectionOf>|null} previewed - what the preview was taken for
 * @param {ReturnType<typeof selectionOf>} next - what the form selects now
 * @returns {'keep'|'clear'|'refresh'}
 */
export function previewChange(previewed, next) {
  if (!previewed) return 'keep'
  if (!sameMetricSet(previewed, next)) return 'clear'
  if (
    previewed.tier !== next.tier ||
    JSON.stringify(previewed.time) !== JSON.stringify(next.time)
  ) {
    return 'refresh'
  }
  return 'keep'
}

/**
 * Rows hidden by the filter keep their state: select-all over a filtered list must not
 * uncheck everything outside it.
 *
 * @param {Set<string>} excluded - unchecked keys before
 * @param {Iterable<string>} visibleIds - keys of the rows the table shows
 * @param {Set<string>} selected - the table's next selection
 * @returns {Set<string>}
 */
export function nextExcluded(excluded, visibleIds, selected) {
  const visible = new Set(visibleIds)
  const result = new Set([...excluded].filter((id) => !visible.has(id)))
  for (const id of visible) {
    if (!selected.has(id)) result.add(id)
  }
  return result
}

/**
 * Body for `POST /v1/data-export/metrics`. Times go as Unix seconds; an ISO string would be
 * parsed in whatever zone the server assumes.
 *
 * @param {ReturnType<typeof selectionOf>} selection
 * @param {number} [now] - Unix seconds
 */
export function buildSelectionRequest(selection, now) {
  const { timeFrom, timeTo } = resolveTimeRange({ time: selection.time }, now)
  return {
    rootObjectId: selection.rootId,
    tagPatterns: selection.tagPatterns,
    timeFrom,
    timeTo,
    tier: selection.tier,
  }
}

/**
 * @param {DataExportForm} form
 * @param {Array<{ ownerId: number, dciId: number }>|null} dciList - checked preview rows, or
 *   null to let the server resolve the tag patterns; a non-empty list overrides root and patterns
 * @param {number} [now] - Unix seconds
 */
export function buildExportRequest(form, dciList, now) {
  return {
    ...buildSelectionRequest(selectionOf(form), now),
    ...(dciList ? { dciList } : {}),
    format: 'csv',
    anonymize: !!form.anonymize,
    keepMapping: !!form.anonymize && !!form.keepMapping,
  }
}

/** @param {{ ownerId: number, dciId: number }} metric */
export function metricKey(metric) {
  return `${metric.ownerId}:${metric.dciId}`
}

/** @param {{ state?: string }|null|undefined} state */
export function isExportFinished(state) {
  return state?.state === 'completed' || state?.state === 'failed'
}

/**
 * ms, or false to stop: once finished, or the task is gone (404) or not ours (403).
 *
 * @param {object|undefined} state
 * @param {{ status?: number }|null|undefined} error
 * @returns {number|false}
 */
export function exportPollInterval(state, error) {
  if (isExportFinished(state)) return false
  return error?.status === 404 || error?.status === 403 ? false : 1000
}

/**
 * Our own name rather than the server's Content-Disposition (`netxms-export-<task>.zip`):
 * client builds are white label. Local time, as in legacy.
 *
 * @param {Date} startedAt
 * @param {'archive'|'mapping'} type
 */
export function exportFileName(startedAt, type) {
  const pad = (value) => String(value).padStart(2, '0')
  const d = startedAt
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return type === 'mapping' ? `data-export-${stamp}-mapping.csv` : `data-export-${stamp}.zip`
}

/** @param {number} bytes */
export function formatExportSize(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} bytes`
  const units = ['KB', 'MB', 'GB', 'TB']
  let scaled = value / 1024
  let unit = 0
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024
    unit++
  }
  return `${scaled.toFixed(1)} ${units[unit]}`
}
