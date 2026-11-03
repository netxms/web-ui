// Code tables are ported from the legacy client's LogLabelProvider.java and the server's `LC_*`
// constants (nxcore_logs.h).

import { normalizeSeverity, severityConfig } from './alarmDisplay'

/** Column types as reported by the WebAPI (`s_columnTypeNames` in server/core/logs.cpp). */
export const LOG_COLUMN_TYPE = {
  TEXT: 'text',
  SEVERITY: 'severity',
  OBJECT_ID: 'objectId',
  USER_ID: 'userId',
  EVENT_CODE: 'eventCode',
  TIMESTAMP: 'timestamp',
  INTEGER: 'integer',
  ALARM_STATE: 'alarmState',
  ALARM_HELPDESK_STATE: 'alarmHelpdeskState',
  ZONE_UIN: 'zoneUIN',
  EVENT_ORIGIN: 'eventOrigin',
  TEXT_DETAILS: 'textDetails',
  JSON_DETAILS: 'jsonDetails',
  COMPLETION_STATUS: 'completionStatus',
  ACTION_CODE: 'actionCode',
  ATM_TRANSACTION_CODE: 'atmTransactionCode',
  ASSET_OPERATION: 'assetOperation',
  DEPLOYMENT_STATUS: 'deploymentStatus',
  AI_TASK_STATUS: 'aiTaskStatus',
  MAC_ADDRESS: 'macAddress',
  CONNECTION_EVENT: 'connectionEvent',
  AI_OPERATOR_EXECUTION_STATUS: 'aiOperatorExecutionStatus',
  OBSERVATION_STATE: 'observationState',
  UNKNOWN: 'unknown',
}

/** Filter types accepted by `POST /v1/logs/{name}/query`. */
export const LOG_FILTER_TYPE = {
  EQUALS: 'equals',
  RANGE: 'range',
  SET: 'set',
  LIKE: 'like',
  LESS: 'less',
  GREATER: 'greater',
  CHILD_OF: 'childOf',
  RELATIVE: 'relative',
  CURRENT_PERIOD: 'currentPeriod',
}

/** Everything downstream switches on these, never on the raw type. */
export const COLUMN_KIND = {
  TIME: 'time',
  SEVERITY: 'severity',
  OBJECT: 'object',
  USER: 'user',
  EVENT: 'event',
  ZONE: 'zone',
  CODED: 'coded',
  NUMERIC: 'numeric',
  MAC: 'mac',
  JSON: 'json',
  TEXT: 'text',
}

const KIND_BY_TYPE = {
  [LOG_COLUMN_TYPE.TIMESTAMP]: COLUMN_KIND.TIME,
  [LOG_COLUMN_TYPE.SEVERITY]: COLUMN_KIND.SEVERITY,
  [LOG_COLUMN_TYPE.OBJECT_ID]: COLUMN_KIND.OBJECT,
  [LOG_COLUMN_TYPE.USER_ID]: COLUMN_KIND.USER,
  [LOG_COLUMN_TYPE.EVENT_CODE]: COLUMN_KIND.EVENT,
  [LOG_COLUMN_TYPE.ZONE_UIN]: COLUMN_KIND.ZONE,
  [LOG_COLUMN_TYPE.ALARM_STATE]: COLUMN_KIND.CODED,
  [LOG_COLUMN_TYPE.ALARM_HELPDESK_STATE]: COLUMN_KIND.CODED,
  [LOG_COLUMN_TYPE.EVENT_ORIGIN]: COLUMN_KIND.CODED,
  [LOG_COLUMN_TYPE.COMPLETION_STATUS]: COLUMN_KIND.CODED,
  [LOG_COLUMN_TYPE.ASSET_OPERATION]: COLUMN_KIND.CODED,
  [LOG_COLUMN_TYPE.DEPLOYMENT_STATUS]: COLUMN_KIND.CODED,
  [LOG_COLUMN_TYPE.AI_TASK_STATUS]: COLUMN_KIND.CODED,
  [LOG_COLUMN_TYPE.CONNECTION_EVENT]: COLUMN_KIND.CODED,
  [LOG_COLUMN_TYPE.AI_OPERATOR_EXECUTION_STATUS]: COLUMN_KIND.CODED,
  [LOG_COLUMN_TYPE.OBSERVATION_STATE]: COLUMN_KIND.CODED,
  [LOG_COLUMN_TYPE.INTEGER]: COLUMN_KIND.NUMERIC,
  [LOG_COLUMN_TYPE.ACTION_CODE]: COLUMN_KIND.NUMERIC,
  [LOG_COLUMN_TYPE.ATM_TRANSACTION_CODE]: COLUMN_KIND.NUMERIC,
  [LOG_COLUMN_TYPE.MAC_ADDRESS]: COLUMN_KIND.MAC,
  [LOG_COLUMN_TYPE.JSON_DETAILS]: COLUMN_KIND.JSON,
  [LOG_COLUMN_TYPE.TEXT]: COLUMN_KIND.TEXT,
  [LOG_COLUMN_TYPE.TEXT_DETAILS]: COLUMN_KIND.TEXT,
}

/**
 * Unknown types degrade to text, which is always safe: `like` works on any column.
 *
 * @param {string} type
 * @returns {string} one of COLUMN_KIND
 */
export function getColumnKind(type) {
  return KIND_BY_TYPE[type] ?? COLUMN_KIND.TEXT
}

/**
 * INVALID_UID (0xFFFFFFFF) arrives as -1 or 4294967295 depending on whether the database column
 * is signed. Zero is the built-in `system` user, not unset.
 *
 * @param {number|null|undefined} value
 */
export function isUnsetUserId(value) {
  return value == null || value === -1 || value === 0xffffffff
}

const ALARM_STATES = ['Outstanding', 'Acknowledged', 'Resolved', 'Terminated']
const ALARM_HELPDESK_STATES = ['Ignored', 'Open', 'Closed']
const EVENT_ORIGINS = [
  'System',
  'Agent',
  'Client',
  'Syslog',
  'SNMP',
  'Script',
  'Remote Server',
  'Windows Event',
  'OpenTelemetry',
]
const ASSET_OPERATIONS = ['Create', 'Delete', 'Update', 'Link', 'Unlink']
const CONNECTION_EVENTS = ['Connect', 'Disconnect', 'Move']
const DEPLOYMENT_STATUSES = [
  'Scheduled',
  'Pending',
  'Initializing',
  'Transferring file',
  'Installing',
  'Waiting for agent',
  'Completed',
  'Failed',
  'Cancelled',
]
const SEVERITIES = ['Normal', 'Warning', 'Minor', 'Major', 'Critical']

// Stored as single characters (LCF_CHAR_COLUMN) but read back by the WebAPI as integers, so
// either the character or 0 arrives.
const AI_TASK_STATUSES = [
  { value: 'S', label: 'Scheduled' },
  { value: 'R', label: 'Running' },
  { value: 'C', label: 'Completed' },
  { value: 'F', label: 'Failed' },
  { value: 'U', label: 'Unknown' },
]
const AI_OPERATOR_EXECUTION_STATUSES = [
  { value: 'C', label: 'Completed' },
  { value: 'F', label: 'Failed' },
  { value: 'S', label: 'Skipped' },
]
const OBSERVATION_STATES = ['New', 'Acknowledged', 'Dismissed']

function indexedOptions(labels) {
  return labels.map((label, value) => ({ value, label }))
}

const OPTIONS_BY_TYPE = {
  [LOG_COLUMN_TYPE.SEVERITY]: indexedOptions(SEVERITIES),
  [LOG_COLUMN_TYPE.ALARM_STATE]: indexedOptions(ALARM_STATES),
  [LOG_COLUMN_TYPE.ALARM_HELPDESK_STATE]: indexedOptions(ALARM_HELPDESK_STATES),
  [LOG_COLUMN_TYPE.EVENT_ORIGIN]: indexedOptions(EVENT_ORIGINS),
  [LOG_COLUMN_TYPE.ASSET_OPERATION]: indexedOptions(ASSET_OPERATIONS),
  [LOG_COLUMN_TYPE.CONNECTION_EVENT]: indexedOptions(CONNECTION_EVENTS),
  [LOG_COLUMN_TYPE.DEPLOYMENT_STATUS]: indexedOptions(DEPLOYMENT_STATUSES),
  [LOG_COLUMN_TYPE.OBSERVATION_STATE]: indexedOptions(OBSERVATION_STATES),
  [LOG_COLUMN_TYPE.COMPLETION_STATUS]: [
    { value: 0, label: 'Failure' },
    { value: 1, label: 'Success' },
  ],
  [LOG_COLUMN_TYPE.AI_TASK_STATUS]: AI_TASK_STATUSES,
  [LOG_COLUMN_TYPE.AI_OPERATOR_EXECUTION_STATUS]: AI_OPERATOR_EXECUTION_STATUSES,
}

/**
 * @param {string} type
 * @returns {Array<{value: number|string, label: string}>|null}
 */
export function getCodedOptions(type) {
  return OPTIONS_BY_TYPE[type] ?? null
}

/**
 * Falls back to the raw value so an unrecognised code is visible rather than blank.
 *
 * @param {string} type
 * @param {number|string} value
 * @returns {string}
 */
export function getCodedLabel(type, value) {
  const options = OPTIONS_BY_TYPE[type]
  if (!options) return value == null ? '' : String(value)

  // Alarm state carries helpdesk bits above the state nibble (Alarm.STATE_MASK).
  const code =
    type === LOG_COLUMN_TYPE.ALARM_STATE && typeof value === 'number' ? value & 0x0f : value

  const match =
    options.find((o) => o.value === code) ??
    // Char-typed statuses may arrive as their ordinal instead of the character.
    (typeof code === 'number' ? options[code] : null)
  return match ? match.label : code == null ? '' : String(code)
}

/**
 * @param {number|string} value
 */
export function getSeverityDisplay(value) {
  const key = normalizeSeverity(value)
  return { key, label: getCodedLabel(LOG_COLUMN_TYPE.SEVERITY, value), ...severityConfig[key] }
}

/**
 * `type` and `negated` go straight into the request body; `wrap` surrounds the entered text
 * with `%`.
 *
 * @typedef {object} LogOperator
 * @property {string} id
 * @property {string} label
 * @property {string} type - LOG_FILTER_TYPE value
 * @property {boolean} negated
 * @property {boolean} [wrap]
 * @property {'none'|'single'|'range'|'relative'|'period'|'object'} value - editor to render
 */

/** @type {Record<string, LogOperator>} */
export const LOG_OPERATORS = {
  is: { id: 'is', label: 'is', type: LOG_FILTER_TYPE.EQUALS, negated: false, value: 'single' },
  isNot: {
    id: 'isNot',
    label: 'is not',
    type: LOG_FILTER_TYPE.EQUALS,
    negated: true,
    value: 'single',
  },
  contains: {
    id: 'contains',
    label: 'contains',
    type: LOG_FILTER_TYPE.LIKE,
    negated: false,
    wrap: true,
    value: 'single',
  },
  notContains: {
    id: 'notContains',
    label: 'does not contain',
    type: LOG_FILTER_TYPE.LIKE,
    negated: true,
    wrap: true,
    value: 'single',
  },
  matches: {
    id: 'matches',
    label: 'matches pattern',
    type: LOG_FILTER_TYPE.LIKE,
    negated: false,
    value: 'single',
  },
  notMatches: {
    id: 'notMatches',
    label: 'does not match pattern',
    type: LOG_FILTER_TYPE.LIKE,
    negated: true,
    value: 'single',
  },
  lt: { id: 'lt', label: 'less than', type: LOG_FILTER_TYPE.LESS, negated: false, value: 'single' },
  gt: {
    id: 'gt',
    label: 'greater than',
    type: LOG_FILTER_TYPE.GREATER,
    negated: false,
    value: 'single',
  },
  between: {
    id: 'between',
    label: 'between',
    type: LOG_FILTER_TYPE.RANGE,
    negated: false,
    value: 'range',
  },
  notBetween: {
    id: 'notBetween',
    label: 'not between',
    type: LOG_FILTER_TYPE.RANGE,
    negated: true,
    value: 'range',
  },
  below: {
    id: 'below',
    label: 'is below',
    type: LOG_FILTER_TYPE.CHILD_OF,
    negated: false,
    value: 'object',
  },
  notBelow: {
    id: 'notBelow',
    label: 'is not below',
    type: LOG_FILTER_TYPE.CHILD_OF,
    negated: true,
    value: 'object',
  },
  before: {
    id: 'before',
    label: 'before',
    type: LOG_FILTER_TYPE.LESS,
    negated: false,
    value: 'single',
  },
  after: {
    id: 'after',
    label: 'after',
    type: LOG_FILTER_TYPE.GREATER,
    negated: false,
    value: 'single',
  },
  last: {
    id: 'last',
    label: 'within the last',
    type: LOG_FILTER_TYPE.RELATIVE,
    negated: false,
    value: 'relative',
  },
  period: {
    id: 'period',
    label: 'during',
    type: LOG_FILTER_TYPE.CURRENT_PERIOD,
    negated: false,
    value: 'period',
  },
}

const OPERATORS_BY_KIND = {
  [COLUMN_KIND.TIME]: ['last', 'period', 'between', 'before', 'after'],
  [COLUMN_KIND.SEVERITY]: ['is', 'isNot'],
  [COLUMN_KIND.CODED]: ['is', 'isNot'],
  [COLUMN_KIND.EVENT]: ['is', 'isNot'],
  [COLUMN_KIND.ZONE]: ['is', 'isNot'],
  [COLUMN_KIND.USER]: ['is', 'isNot'],
  [COLUMN_KIND.OBJECT]: ['is', 'isNot', 'below', 'notBelow'],
  [COLUMN_KIND.NUMERIC]: ['is', 'isNot', 'lt', 'gt', 'between', 'notBetween'],
  [COLUMN_KIND.MAC]: ['contains', 'notContains', 'matches', 'notMatches'],
  [COLUMN_KIND.JSON]: ['contains', 'notContains', 'matches', 'notMatches'],
  [COLUMN_KIND.TEXT]: ['contains', 'notContains', 'matches', 'notMatches'],
}

/**
 * In menu order; the first is the default for a new condition.
 *
 * @param {string} type
 * @returns {LogOperator[]}
 */
export function getOperatorsForType(type) {
  const ids = OPERATORS_BY_KIND[getColumnKind(type)] ?? OPERATORS_BY_KIND[COLUMN_KIND.TEXT]
  return ids.map((id) => LOG_OPERATORS[id])
}

/**
 * @param {string} type
 * @returns {LogOperator}
 */
export function getDefaultOperator(type) {
  return getOperatorsForType(type)[0]
}

/**
 * `detail` columns are only populated by `GET /v1/logs/{name}/records/{id}`.
 *
 * @param {import('@/api/logsApi').LogColumn[]} columns
 */
export function getResultColumns(columns) {
  return (columns ?? []).filter((c) => !c.detail)
}

/**
 * @param {import('@/api/logsApi').LogColumn[]} columns
 * @returns {import('@/api/logsApi').LogColumn|null}
 */
export function getPrimaryTimeColumn(columns) {
  return (columns ?? []).find((c) => c.type === LOG_COLUMN_TYPE.TIMESTAMP) ?? null
}

/**
 * The declared id column is not always returned (syslog `msg_id`, SNMP traps `trap_id`), and a
 * cursor on a column no row carries never advances, so that case reads as "no record id".
 *
 * @param {import('@/api/logsApi').LogColumn[]} columns
 * @param {string|null|undefined} declaredName - the log's `recordIdColumn`
 * @returns {string|null}
 */
export function getCursorRecordIdColumn(columns, declaredName) {
  if (!declaredName) return null
  return (columns ?? []).some((c) => c.name === declaredName) ? declaredName : null
}

/**
 * @param {import('@/api/logsApi').LogColumn} column
 */
export function getColumnLabel(column) {
  return column?.description || column?.name || ''
}

/** Lower is better. */
const META_PRIORITY_BY_KIND = {
  [COLUMN_KIND.CODED]: 1,
  [COLUMN_KIND.SEVERITY]: 2,
  [COLUMN_KIND.EVENT]: 3,
  [COLUMN_KIND.NUMERIC]: 4,
  [COLUMN_KIND.USER]: 5,
  [COLUMN_KIND.ZONE]: 6,
  [COLUMN_KIND.MAC]: 7,
  [COLUMN_KIND.OBJECT]: 8,
  [COLUMN_KIND.TEXT]: 9,
  [COLUMN_KIND.TIME]: 10,
  [COLUMN_KIND.JSON]: 11,
}

/**
 * The same capped set for every row, so values line up down the list.
 *
 * @param {import('@/api/logsApi').LogColumn[]} columns
 * @param {object} [options]
 * @param {string[]} [options.exclude]
 * @param {string|null} [options.recordIdColumn] - promoted to first
 * @param {number} [options.limit]
 * @returns {import('@/api/logsApi').LogColumn[]}
 */
export function getStreamMetaColumns(
  columns,
  { exclude = [], recordIdColumn = null, limit = 6 } = {},
) {
  const skip = new Set(exclude.filter(Boolean))
  const priority = (column) => {
    if (column.recordId || column.name === recordIdColumn) return 0
    return META_PRIORITY_BY_KIND[getColumnKind(column.type)] ?? 9
  }

  return getResultColumns(columns)
    .filter((column) => !skip.has(column.name))
    .map((column, index) => ({ column, index, priority: priority(column) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.column)
}
