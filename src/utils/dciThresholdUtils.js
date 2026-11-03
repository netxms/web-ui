import { formatDateTimeWithSeconds } from '@/utils/timeFormat'

const FUNCTION_LABELS = {
  last: 'Last',
  average: 'Avg',
  meanDeviation: 'MeanDev',
  diff: 'Diff',
  error: 'Error',
  sum: 'Sum',
  script: 'Script',
  absoluteDeviation: 'AbsDev',
  anomaly: 'Anomaly',
}

// Pattern operators are words, as in legacy: a "!" before "like" is easy to miss in a cell.
const CONDITION_LABELS = {
  less: '<',
  lessOrEqual: '<=',
  equal: '=',
  greaterOrEqual: '>=',
  greater: '>',
  notEqual: '!=',
  like: 'LIKE',
  notLike: 'NOT LIKE',
  iLike: 'ICASE LIKE',
  iNotLike: 'ICASE NOT LIKE',
}

export function thresholdFunctionLabel(fn) {
  return FUNCTION_LABELS[fn] ?? fn
}

export function thresholdConditionLabel(condition) {
  return CONDITION_LABELS[condition] ?? condition
}

export function thresholdExpressionLabel(threshold) {
  if (threshold.function === 'script') return 'Script'
  if (threshold.function === 'error') return 'Error count'
  if (threshold.function === 'anomaly') return 'Anomaly'
  const fn = thresholdFunctionLabel(threshold.function)
  const cond = thresholdConditionLabel(threshold.condition)
  return `${fn} ${cond} ${threshold.value}`
}

/**
 * The Live Data Threshold cell, after the legacy last values view, except that legacy's "OK"
 * (printed even for DCIs without thresholds) is null here.
 *
 * @param {object} dci - a current-values row (DCIValue)
 * @returns {{ kind: 'disabled', text: string } |
 *   { kind: 'active', text: string, severity: number, event: string, message: string } |
 *   null}
 */
export function liveThresholdInfo(dci) {
  const disabledUntil = dci?.thresholdDisableEndTime ?? 0
  if (disabledUntil === -1) return { kind: 'disabled', text: 'Disabled permanently' }
  if (disabledUntil > 0) {
    const until = formatDateTimeWithSeconds(disabledUntil, { unixSeconds: true })
    return { kind: 'disabled', text: `Disabled until ${until}` }
  }

  const threshold = dci?.hasActiveThreshold ? dci.threshold : null
  if (!threshold) return null
  return {
    kind: 'active',
    // The server sends a table DCI's threshold condition already formatted.
    text: dci.isTable ? (threshold.condition ?? '') : thresholdExpressionLabel(threshold),
    severity: threshold.currentSeverity ?? 0,
    event: threshold.activationEvent ?? '',
    message: threshold.lastEventMessage ?? '',
  }
}
