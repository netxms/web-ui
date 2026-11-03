// The omnibar is a projection of `filters` (a token is a condition), never a second source of
// truth. Top-level request filters are ANDed; OR exists only within one column, via a `set`
// filter.

import { toApiTimestamp } from './timeFormat'
import {
  COLUMN_KIND,
  LOG_FILTER_TYPE,
  LOG_OPERATORS,
  getColumnKind,
  getCodedLabel,
  getCodedOptions,
  getColumnLabel,
  getDefaultOperator,
  getPrimaryTimeColumn,
} from './logColumnTypes'

/** Server allows up to 10000, and offset + limit <= 100000. */
export const DEFAULT_PAGE_SIZE = 250

export const TIME_PRESETS = [
  { id: 'last15m', label: 'Last 15 minutes', value: 15, unit: 'minute' },
  { id: 'last1h', label: 'Last hour', value: 1, unit: 'hour' },
  { id: 'last4h', label: 'Last 4 hours', value: 4, unit: 'hour' },
  { id: 'last24h', label: 'Last 24 hours', value: 24, unit: 'hour' },
  { id: 'last7d', label: 'Last 7 days', value: 7, unit: 'day' },
  { id: 'last30d', label: 'Last 30 days', value: 30, unit: 'day' },
  { id: 'today', label: 'Today', period: 'today' },
  { id: 'yesterday', label: 'Yesterday', period: 'yesterday' },
  { id: 'thisWeek', label: 'This week', period: 'thisWeek' },
  { id: 'thisMonth', label: 'This month', period: 'thisMonth' },
  { id: 'custom', label: 'Custom range...' },
  { id: 'any', label: 'Any time' },
]

// As in the legacy client: a rolling window shows nothing for a quiet log, which reads as broken.
export const DEFAULT_TIME_PRESET = 'any'

/** @param {string} id */
export function getTimePreset(id) {
  return TIME_PRESETS.find((p) => p.id === id) ?? null
}

let nextId = 1
function uid() {
  return nextId++
}

/** Seconds east of UTC, as `currentPeriod` expects (`getTimezoneOffset()` is minutes west). */
function getTimeZoneOffsetSeconds() {
  return -new Date().getTimezoneOffset() * 60
}

/**
 * @typedef {object} LogCondition
 * @property {number} id
 * @property {string} operatorId - key into LOG_OPERATORS
 * @property {*} value
 * @property {*} [from]
 * @property {*} [to]
 * @property {string} [unit]
 * @property {string} [period]
 * @property {string} [display] - cached label for picker-backed values (object/user names)
 */

/**
 * @typedef {object} LogColumnFilter
 * @property {number} id
 * @property {string} column
 * @property {'and'|'or'} operation
 * @property {LogCondition[]} conditions
 * @property {boolean} [locked] - read-only, imposed by an object context
 */

/**
 * @typedef {object} LogQueryModel
 * @property {{preset: string, from: string|null, to: string|null}} time
 * @property {LogColumnFilter[]} filters
 * @property {Array<{column: string, descending: boolean}>} orderBy
 */

/**
 * @param {import('@/api/logsApi').LogColumn[]} columns
 * @returns {LogQueryModel}
 */
export function createQueryModel(columns) {
  return {
    time: { preset: DEFAULT_TIME_PRESET, from: null, to: null },
    filters: [],
    orderBy: defaultOrderBy(columns),
  }
}

/**
 * @param {import('@/api/logsApi').LogColumn[]} columns
 */
export function defaultOrderBy(columns) {
  const time = getPrimaryTimeColumn(columns)
  if (time) return [{ column: time.name, descending: true }]
  const recordId = (columns ?? []).find((c) => c.recordId)
  return recordId ? [{ column: recordId.name, descending: true }] : []
}

/**
 * @param {import('@/api/logsApi').LogColumn} column
 * @returns {LogCondition}
 */
export function createCondition(column) {
  const operator = getDefaultOperator(column.type)
  const condition = { id: uid(), operatorId: operator.id, value: null }
  if (operator.value === 'relative') {
    condition.value = 1
    condition.unit = 'hour'
  } else if (operator.value === 'period') {
    condition.period = 'today'
  } else if (operator.value === 'range') {
    condition.from = null
    condition.to = null
  }
  return condition
}

/**
 * @param {import('@/api/logsApi').LogColumn} column
 * @returns {LogColumnFilter}
 */
export function createColumnFilter(column) {
  return { id: uid(), column: column.name, operation: 'or', conditions: [createCondition(column)] }
}

/**
 * @param {string} columnName - the log's `objectIdColumn`
 * @param {number} objectId
 * @param {string} [objectName]
 * @param {boolean} [locked]
 * @returns {LogColumnFilter}
 */
export function createObjectFilter(columnName, objectId, objectName, locked = false) {
  return {
    id: uid(),
    column: columnName,
    operation: 'or',
    ...(locked ? { locked: true } : {}),
    conditions: [{ id: uid(), operatorId: 'is', value: objectId, display: objectName ?? null }],
  }
}

/**
 * Only what can be typed unambiguously: equality on a coded column, "contains" on text.
 *
 * @param {LogCondition} condition
 * @param {import('@/api/logsApi').LogColumn} column
 */
function isTokenRepresentable(condition, column) {
  if (!column) return false
  const kind = getColumnKind(column.type)
  if (kind === COLUMN_KIND.CODED || kind === COLUMN_KIND.SEVERITY) {
    return condition.operatorId === 'is'
  }
  if (kind === COLUMN_KIND.TEXT || kind === COLUMN_KIND.MAC || kind === COLUMN_KIND.JSON) {
    return condition.operatorId === 'contains'
  }
  return false
}

export function isOmnibarColumn(column, primaryTimeColumnName) {
  if (!column || column.detail || column.name === primaryTimeColumnName) return false
  const kind = getColumnKind(column.type)
  return (
    kind === COLUMN_KIND.CODED ||
    kind === COLUMN_KIND.SEVERITY ||
    kind === COLUMN_KIND.TEXT ||
    kind === COLUMN_KIND.MAC ||
    kind === COLUMN_KIND.JSON
  )
}

/**
 * `hidden`: conditions the omnibar cannot express; `locked`: imposed by the embedding context.
 *
 * @param {LogQueryModel} model
 * @param {import('@/api/logsApi').LogColumn[]} columns
 * @returns {{tokens: Array<{key: string, value: string}>, hidden: LogConditionSummary[], locked: LogConditionSummary[]}}
 */
export function projectToOmnibar(model, columns) {
  const byName = indexColumns(columns)
  const tokens = []
  const hidden = []
  const locked = []

  for (const filter of model.filters) {
    const column = byName[filter.column]
    for (const condition of filter.conditions) {
      if (filter.locked) {
        locked.push(summarizeCondition(filter.column, condition, column))
      } else if (isTokenRepresentable(condition, column)) {
        tokens.push({ key: filter.column, value: conditionValueToText(condition, column) })
      } else {
        hidden.push(summarizeCondition(filter.column, condition, column))
      }
    }
  }
  return { tokens, hidden, locked }
}

/**
 * @typedef {object} LogConditionSummary
 * @property {string} key - column name
 * @property {string} columnLabel
 * @property {string} label - operator and operands, without the column
 * @property {string} text - the full readable sentence, column included
 */
function summarizeCondition(columnName, condition, column) {
  const columnLabel = getColumnLabel(column) || columnName
  const label = describeCondition(condition, column)
  return { key: columnName, columnLabel, label, text: `${columnLabel} ${label}` }
}

/**
 * Conditions the omnibar does not own are kept; a column left with no conditions is dropped.
 *
 * @param {LogQueryModel} model
 * @param {Array<{key: string, value: string}>} tokens
 * @param {import('@/api/logsApi').LogColumn[]} columns
 * @returns {LogColumnFilter[]}
 */
export function applyOmnibarTokens(model, tokens, columns) {
  const byName = indexColumns(columns)
  const grouped = new Map()
  for (const token of tokens) {
    if (!byName[token.key]) continue
    if (!grouped.has(token.key)) grouped.set(token.key, [])
    grouped.get(token.key).push(token.value)
  }

  const result = []
  const seen = new Set()

  for (const filter of model.filters) {
    const column = byName[filter.column]
    const retained = filter.locked
      ? filter.conditions
      : filter.conditions.filter((c) => !isTokenRepresentable(c, column))
    const values = filter.locked ? [] : (grouped.get(filter.column) ?? [])
    if (!filter.locked) seen.add(filter.column)

    const conditions = [...retained, ...values.map((v) => conditionFromText(v, column))]
    if (conditions.length > 0) result.push({ ...filter, conditions })
  }

  for (const [name, values] of grouped) {
    if (seen.has(name)) continue
    const column = byName[name]
    result.push({
      id: uid(),
      column: name,
      operation: 'or',
      conditions: values.map((v) => conditionFromText(v, column)),
    })
  }
  return result
}

function conditionValueToText(condition, column) {
  return getCodedOptions(column.type)
    ? getCodedLabel(column.type, condition.value)
    : String(condition.value ?? '')
}

function conditionFromText(text, column) {
  const options = getCodedOptions(column.type)
  if (options) {
    const match = options.find((o) => String(o.label).toLowerCase() === String(text).toLowerCase())
    return { id: uid(), operatorId: 'is', value: match ? match.value : text }
  }
  return { id: uid(), operatorId: 'contains', value: text }
}

/**
 * @param {LogCondition} condition
 * @param {import('@/api/logsApi').LogColumn} column
 */
export function describeCondition(condition, column) {
  const operator = LOG_OPERATORS[condition.operatorId]
  if (!operator) return ''
  const label = (value) =>
    column && getCodedOptions(column.type) ? getCodedLabel(column.type, value) : String(value ?? '')

  switch (operator.value) {
    case 'range':
      return `${operator.label} ${label(condition.from)} and ${label(condition.to)}`
    case 'relative':
      return `${operator.label} ${condition.value} ${condition.unit}${condition.value === 1 ? '' : 's'}`
    case 'period':
      return `${operator.label} ${getTimePreset(condition.period)?.label ?? condition.period}`
    case 'object':
      return `${operator.label} ${condition.display ?? condition.value}`
    default:
      return `${operator.label} ${condition.display ?? label(condition.value)}`
  }
}

/**
 * @param {LogQueryModel} model
 * @param {import('@/api/logsApi').LogColumn[]} columns
 * @param {object} [options]
 * @param {number} [options.offset]
 * @param {number} [options.limit]
 * @param {number} [options.timeZoneOffset]
 * @returns {{filters: object[], orderBy: object[], offset: number, limit: number}}
 */
export function buildLogQueryRequest(model, columns, options = {}) {
  const {
    offset = 0,
    limit = DEFAULT_PAGE_SIZE,
    timeZoneOffset = getTimeZoneOffsetSeconds(),
  } = options

  const byName = indexColumns(columns)
  const filters = []

  const timeFilter = buildTimeFilter(model.time, columns, timeZoneOffset)
  if (timeFilter) filters.push(timeFilter)

  for (const filter of model.filters) {
    const column = byName[filter.column]
    if (!column) continue
    const built = filter.conditions
      .map((c) => buildCondition(c, timeZoneOffset))
      .filter((c) => c !== null)
    if (built.length === 0) continue

    if (built.length === 1) {
      filters.push({ column: filter.column, ...built[0] })
    } else {
      filters.push({
        column: filter.column,
        type: LOG_FILTER_TYPE.SET,
        operation: filter.operation === 'and' ? 'and' : 'or',
        filters: built,
      })
    }
  }

  const orderBy = (model.orderBy ?? []).filter((o) => byName[o.column])
  return { filters, orderBy, offset, limit }
}

function buildTimeFilter(time, columns, timeZoneOffset) {
  const column = getPrimaryTimeColumn(columns)
  if (!column || !time || time.preset === 'any') return null

  const preset = getTimePreset(time.preset)
  if (!preset) return null

  if (preset.unit) {
    return {
      column: column.name,
      type: LOG_FILTER_TYPE.RELATIVE,
      value: preset.value,
      unit: preset.unit,
    }
  }
  if (preset.period) {
    return {
      column: column.name,
      type: LOG_FILTER_TYPE.CURRENT_PERIOD,
      period: preset.period,
      timeZoneOffset,
    }
  }

  const from = toApiTimestamp(time.from)
  const to = toApiTimestamp(time.to)
  if (from && to) {
    return { column: column.name, type: LOG_FILTER_TYPE.RANGE, from, to }
  }
  if (from) return { column: column.name, type: LOG_FILTER_TYPE.GREATER, value: from }
  if (to) return { column: column.name, type: LOG_FILTER_TYPE.LESS, value: to }
  return null
}

function buildCondition(condition, timeZoneOffset) {
  const operator = LOG_OPERATORS[condition.operatorId]
  if (!operator) return null

  const filter = { type: operator.type }
  if (operator.negated) filter.negated = true

  switch (operator.value) {
    case 'range': {
      const from = normalizeValue(condition.from)
      const to = normalizeValue(condition.to)
      if (from == null || to == null) return null
      filter.from = from
      filter.to = to
      break
    }
    case 'relative': {
      // The server rejects a relative filter with a non-positive value.
      if (!(condition.value > 0) || !condition.unit) return null
      filter.value = condition.value
      filter.unit = condition.unit
      break
    }
    case 'period': {
      if (!condition.period) return null
      filter.period = condition.period
      filter.timeZoneOffset = timeZoneOffset
      break
    }
    default: {
      const value = normalizeValue(condition.value)
      if (value == null || value === '') return null
      filter.value = operator.wrap ? `%${value}%` : value
    }
  }
  return filter
}

// The server's filter parser accepts ISO 8601 to second precision only (not `toISOString()`).
function normalizeValue(value) {
  if (value == null) return null
  if (value instanceof Date) return toApiTimestamp(value)
  return value
}

function indexColumns(columns) {
  const index = {}
  for (const column of columns ?? []) index[column.name] = column
  return index
}

/**
 * Defaults are omitted to keep links short.
 *
 * @param {LogQueryModel} model
 * @param {import('@/api/logsApi').LogColumn[]} columns
 */
export function serializeToQuery(model, columns) {
  const query = {}
  if (model.time.preset !== DEFAULT_TIME_PRESET) query.t = model.time.preset
  if (model.time.preset === 'custom') {
    if (model.time.from) query.from = toApiTimestamp(model.time.from)
    if (model.time.to) query.to = toApiTimestamp(model.time.to)
  }

  const persisted = model.filters
    .filter((f) => !f.locked && f.conditions.length > 0)
    .map((f) => ({
      c: f.column,
      o: f.operation,
      x: f.conditions.map((condition) => compactCondition(condition)),
    }))
  if (persisted.length > 0) query.f = JSON.stringify(persisted)

  const defaults = defaultOrderBy(columns)
  if (!sameOrderBy(model.orderBy, defaults)) {
    query.sort = model.orderBy.map((o) => `${o.column}:${o.descending ? 'desc' : 'asc'}`).join(',')
  }
  return query
}

/**
 * Unknown columns and operators are dropped: the URL is user-editable.
 *
 * @param {Record<string, string>} query
 * @param {import('@/api/logsApi').LogColumn[]} columns
 * @returns {LogQueryModel}
 */
export function parseFromQuery(query, columns) {
  const model = createQueryModel(columns)
  const byName = indexColumns(columns)

  if (query.t && getTimePreset(query.t)) model.time.preset = query.t
  if (model.time.preset === 'custom') {
    model.time.from = query.from ?? null
    model.time.to = query.to ?? null
  }

  if (query.f) {
    try {
      const parsed = JSON.parse(query.f)
      if (Array.isArray(parsed)) {
        model.filters = parsed
          .filter((entry) => byName[entry?.c] && Array.isArray(entry.x))
          .map((entry) => ({
            id: uid(),
            column: entry.c,
            operation: entry.o === 'and' ? 'and' : 'or',
            conditions: entry.x.filter((c) => LOG_OPERATORS[c?.op]).map(expandCondition),
          }))
          .filter((f) => f.conditions.length > 0)
      }
    } catch {
      // Malformed filter parameter: no filters.
    }
  }

  if (query.sort) {
    const parsed = query.sort
      .split(',')
      .map((part) => {
        const [column, direction] = part.split(':')
        return { column, descending: direction !== 'asc' }
      })
      .filter((o) => byName[o.column])
    if (parsed.length > 0) model.orderBy = parsed
  }
  return model
}

function compactCondition(condition) {
  const compact = { op: condition.operatorId }
  for (const key of ['value', 'from', 'to', 'unit', 'period', 'display']) {
    if (condition[key] != null) compact[key] = normalizeValue(condition[key])
  }
  return compact
}

function expandCondition(compact) {
  const condition = { id: uid(), operatorId: compact.op, value: compact.value ?? null }
  for (const key of ['from', 'to', 'unit', 'period', 'display']) {
    if (compact[key] != null) condition[key] = compact[key]
  }
  return condition
}

function sameOrderBy(a, b) {
  if ((a ?? []).length !== (b ?? []).length) return false
  return a.every((o, i) => o.column === b[i].column && !!o.descending === !!b[i].descending)
}
