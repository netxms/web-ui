/**
 * DCI anomaly detection: the `anomalyDetection` object of a DCI configuration (DCIAnomalyDetection
 * in openapi.yaml) and the `anomaly` state of a current value (DCIAnomalyState).
 */

import { DCI_DATA_TYPES, formatDciValue } from './dciFormat'
import { formatDateMedium, formatDateTimeShort } from './timeFormat'

/** DCF_DETECT_ANOMALIES and DCF_ANOMALY_LLM_TUNING (include/nxcldefs.h). */
export const DCF_DETECT_ANOMALIES = 0x000001
export const DCF_ANOMALY_LLM_TUNING = 0x000200

/**
 * The model learns from up to 30 days of stored values, skipping the most recent 7 so that an
 * ongoing level shift is not absorbed (ANOMALY_RAW_TRAINING_RANGE + ANOMALY_TRAINING_LAG).
 */
export const ANOMALY_MIN_RETENTION_DAYS = 37

const LEARNS_FROM = `the ${ANOMALY_MIN_RETENTION_DAYS} days anomaly detection learns from (30 days, ending a week ago)`

/** Server defaults (AnomalySettings), for a new DCI. */
export function defaultAnomalyDetection() {
  return {
    enabled: false,
    llmTuning: false,
    sensitivity: 3.5,
    direction: 'both',
    mode: 'auto',
    minTrainingDays: 7,
  }
}

/** Drift detector settings are not edited, so a save leaves them as stored. */
const EDITABLE_KEYS = [
  'enabled',
  'llmTuning',
  'sensitivity',
  'direction',
  'mode',
  'minTrainingDays',
  'hardBounds',
]

export const ANOMALY_DIRECTION_OPTIONS = [
  { value: 'both', label: 'In both directions' },
  { value: 'up', label: 'Up only' },
  { value: 'down', label: 'Down only' },
]

export const ANOMALY_MODE_OPTIONS = [
  { value: 'auto', label: 'Automatic selection' },
  { value: 'value', label: 'Value' },
  { value: 'rate', label: 'Rate of change' },
]

const TYPE_LABELS = {
  range: 'Out of expected range',
  step: 'Sudden change',
  drift: 'Level shift',
}

/** Servers before netxms 41605cfc2c have only the flag bits. */
export function hasAnomalySettings(config) {
  return config?.anomalyDetection != null && typeof config.anomalyDetection === 'object'
}

function withBit(flags, mask, on) {
  return on ? flags | mask : flags & ~mask
}

/**
 * The DCI document as written: only the editable anomaly settings, and flag bits that agree with
 * them. The server applies `anomalyDetection` after `flags`, so a stale copy of either undoes
 * the other.
 *
 * @param {object} data - DCI configuration or merge-patch
 * @returns {object}
 */
export function serializeAnomalyDetection(data) {
  if (!hasAnomalySettings(data)) return data
  const { anomalyDetection, ...rest } = data
  if (rest.type === 'table') return rest

  const write = {}
  for (const key of EDITABLE_KEYS) {
    if (key in anomalyDetection) write[key] = anomalyDetection[key]
  }
  // Tuning only works with detection on; the server turns it off with detection.
  if (write.enabled === false) write.llmTuning = false
  if ('hardBounds' in write) write.hardBounds = hardBoundsForWrite(write.hardBounds)

  if (rest.flags != null && typeof write.enabled === 'boolean') {
    let flags = withBit(rest.flags, DCF_DETECT_ANOMALIES, write.enabled)
    if (typeof write.llmTuning === 'boolean') {
      flags = withBit(flags, DCF_ANOMALY_LLM_TUNING, write.llmTuning)
    }
    rest.flags = flags
  }
  return { ...rest, anomalyDetection: write }
}

/** Nested objects are merged by the server, so a cleared side goes as an explicit null. */
function hardBoundsForWrite(bounds) {
  const min = bounds?.min ?? null
  const max = bounds?.max ?? null
  return min == null && max == null ? null : { min, max }
}

/** Min above max is rejected by the server. */
export function hardBoundsError(bounds) {
  const min = bounds?.min
  const max = bounds?.max
  return min != null && max != null && min > max ? 'Minimum is above maximum' : ''
}

function retentionDays(form) {
  const days = Number.parseInt(String(form.retentionTime ?? '').trim(), 10)
  // Macros or an empty field cannot be judged.
  return Number.isFinite(days) ? Math.max(days, 1) : 0
}

/**
 * What keeps the model from learning, or learning well, as the editor's storage settings stand
 * (legacy Thresholds page). The server-wide default retention is known only to the server, so it
 * comes from the saved document while retention stays at the default.
 *
 * @param {object} form - DCI configuration being edited
 * @param {object | null} saved - DCI configuration as last read
 * @returns {{ id: string, text: string }[]}
 */
export function anomalyTrainingWarnings(form, saved) {
  if (form.retentionType === 'none') {
    return [
      {
        id: 'storageDisabled',
        text: 'Collected values are not stored, so anomaly detection will not be able to learn.',
      },
    ]
  }

  const savedIssues = saved?.anomalyDetection?.trainingIssues ?? []
  const warnings = []
  if (savedIssues.includes('dataReadError')) {
    warnings.push({
      id: 'dataReadError',
      text: 'Collected values could not be read from the database at the last training, so anomaly detection could not learn.',
    })
  }
  if (form.retentionType === 'custom') {
    const days = retentionDays(form)
    if (days > 0 && days < ANOMALY_MIN_RETENTION_DAYS) {
      warnings.push({
        id: 'shortRetention',
        text: `History is kept for ${days} days, less than ${LEARNS_FROM}. Detection will be less accurate.`,
      })
    }
  } else if (saved?.retentionType === 'default' && savedIssues.includes('shortRetention')) {
    warnings.push({
      id: 'shortRetention',
      text: `The server's default history retention is shorter than ${LEARNS_FROM}. Detection will be less accurate.`,
    })
  }
  if ((form.sampleSaveInterval ?? 1) > 1) {
    warnings.push({
      id: 'sparseSamples',
      text: 'Not every collected value is stored. Anomaly detection will be less accurate.',
    })
  }
  return warnings
}

function optionLabel(options, value) {
  return options.find((o) => o.value === value)?.label ?? value
}

function boundsText(bounds) {
  const min = bounds?.min
  const max = bounds?.max
  if (min == null && max == null) return null
  if (min == null) return `at most ${max}`
  if (max == null) return `at least ${min}`
  return `${min} .. ${max}`
}

/** What the AI suggested, as one line; null when there is nothing. */
export function anomalyTuningSummary(tuning) {
  if (!tuning) return null
  const parts = []
  if (tuning.sensitivity != null) parts.push(`sensitivity ${tuning.sensitivity}`)
  if (tuning.direction) parts.push(optionLabel(ANOMALY_DIRECTION_OPTIONS, tuning.direction))
  if (tuning.mode) parts.push(optionLabel(ANOMALY_MODE_OPTIONS, tuning.mode))
  const bounds = boundsText(tuning.hardBounds)
  if (bounds) parts.push(`hard bounds ${bounds}`)
  if (!parts.length) return null
  const when = tuning.generatedAt
    ? formatDateTimeShort(tuning.generatedAt, { unixSeconds: true })
    : null
  const text = parts.join(', ')
  return when ? `${text} (generated ${when})` : text
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * State of the trained model, as one line.
 *
 * @param {object} anomalyDetection - as last read
 * @returns {string}
 */
export function anomalyModelStatus(anomalyDetection) {
  const model = anomalyDetection?.model
  let text
  if (!model) {
    text = 'Not trained yet'
  } else if (model.learning) {
    const needed = anomalyDetection.minTrainingDays
    text =
      needed != null
        ? `Learning: ${model.trainingDays ?? 0} of ${plural(needed, 'day')} collected`
        : `Learning: ${plural(model.trainingDays ?? 0, 'day')} collected`
  } else {
    const analyzing = model.mode === 'rate' ? 'rate of change' : 'value'
    const baseline = model.individualWeekdays
      ? 'some days of week on their own'
      : 'weekdays and weekend'
    text =
      `Trained ${formatDateTimeShort(model.timestamp)} on ${plural(model.trainingDays ?? 0, 'day')} ` +
      `(${formatDateMedium(model.trainedFrom)} to ${formatDateMedium(model.trainedTo)}), ` +
      `analyzing ${analyzing}, baseline for ${baseline}`
  }
  if (anomalyDetection?.baselineStart) {
    text += `. Baseline restarted ${formatDateTimeShort(anomalyDetection.baselineStart)}`
  }
  return text
}

/** Current values carry `anomaly` only for items with detection on. */
export function hasLiveAnomalyDetection(value) {
  return value?.anomaly != null && typeof value.anomaly === 'object'
}

/** A configuration row the regenerate endpoint accepts. */
export function hasConfiguredAnomalyDetection(dci) {
  return dci?.type !== 'table' && dci?.anomalyDetection?.enabled === true
}

const RANK = { off: 0, normal: 1, learning: 2, blocked: 3, anomaly: 4 }

const ISSUE_NOTES = {
  sparseSamples: 'Not every collected value is stored, detection is less accurate',
  shortRetention: `History retention is shorter than ${LEARNS_FROM}, detection is less accurate`,
}

function boundText(value, n) {
  return formatDciValue({ ...value, value: String(n), dataType: DCI_DATA_TYPES.FLOAT })
}

/**
 * The Anomaly Detection cell of Live Data (legacy LastValuesLabelProvider).
 *
 * @param {object} value - adapted current value
 * @returns {{ kind: 'off'|'normal'|'learning'|'blocked'|'anomaly', text: string,
 *   tooltip: string, rank: number }}
 */
export function anomalyCellInfo(value) {
  if (!hasLiveAnomalyDetection(value)) return { kind: 'off', text: '', tooltip: '', rank: 0 }
  const state = value.anomaly
  const issues = state.trainingIssues ?? []
  const notes = issues.map((issue) => ISSUE_NOTES[issue]).filter(Boolean)
  const result = (kind, text, lines = []) => ({
    kind,
    text,
    tooltip: [...lines, ...notes].join('\n'),
    rank: RANK[kind],
  })

  const type = state.type && state.type !== 'none' ? state.type : null
  // Out of hard bounds is still reported while learning.
  if (state.learning && !type) {
    if (issues.includes('storageDisabled')) {
      return result('blocked', 'Cannot learn (collected values are not stored)')
    }
    if (issues.includes('dataReadError')) {
      return result('blocked', 'Cannot learn (collected values cannot be read)')
    }
    return result('learning', 'Learning')
  }

  let range = null
  if (state.expectedLow != null && state.expectedHigh != null) {
    const low = boundText(value, state.expectedLow)
    const high = boundText(value, state.expectedHigh)
    range =
      state.mode === 'rate'
        ? `expected rate of change ${low} .. ${high} per second`
        : `expected ${low} .. ${high}`
  }
  const lines = []
  if (state.slot) lines.push(`Compared with: ${state.slot}`)
  if (state.score != null) lines.push(`Score: ${Number(state.score).toFixed(2)}`)

  if (type) {
    const label = TYPE_LABELS[type] ?? type
    return result('anomaly', range ? `${label} (${range})` : label, lines)
  }
  return result('normal', range ?? '', lines)
}
