/**
 * Presentation metadata for the built-in logs; the server supplies everything else. Logs not
 * listed fall back to the `Other` family. Titles match the legacy LogDescriptorRegistry.
 */

import { DCI_TARGET_CLASSES } from '@/utils/objectUtils'

const CONTAINER_CLASSES = new Set([
  'Container',
  'ServiceRoot',
  'Cluster',
  'Rack',
  'Chassis',
  'Collector',
  'Zone',
  'Subnet',
  'EntireNetwork',
])

export const LOG_FAMILIES = [
  { id: 'events', label: 'Events and Alerts' },
  { id: 'audit', label: 'Audit and Changes' },
  { id: 'server', label: 'Server Activity' },
  { id: 'ai', label: 'AI' },
  { id: 'other', label: 'Other' },
]

/**
 * @typedef {object} LogCatalogEntry
 * @property {string} label - short display title
 * @property {string} icon - PrimeIcons class
 * @property {string} family - LOG_FAMILIES id
 * @property {boolean} [stream] - default the results area to Stream mode
 * @property {string} [messageColumn] - promoted to the wide line in Stream mode
 * @property {(object: {class: string, platformName?: string}) => boolean} [appliesTo]
 */

const isDciTargetOrContainer = (object) =>
  DCI_TARGET_CLASSES.has(object?.class) || CONTAINER_CLASSES.has(object?.class)

/** @type {Record<string, LogCatalogEntry>} */
export const LOG_CATALOG = {
  EventLog: {
    label: 'Events',
    icon: 'pi pi-bolt',
    family: 'events',
    stream: true,
    messageColumn: 'event_message',
    appliesTo: (object) => isDciTargetOrContainer(object) || object?.class === 'BusinessService',
  },
  AlarmLog: {
    label: 'Alarms',
    icon: 'pi pi-bell',
    family: 'events',
    // Not `rule_description`, which is the event processing rule's own text.
    messageColumn: 'message',
    appliesTo: (object) => isDciTargetOrContainer(object) || object?.class === 'BusinessService',
  },
  syslog: {
    label: 'Syslog',
    icon: 'pi pi-align-left',
    family: 'events',
    stream: true,
    messageColumn: 'msg_text',
    appliesTo: isDciTargetOrContainer,
  },
  SnmpTrapLog: {
    label: 'SNMP Traps',
    icon: 'pi pi-inbox',
    family: 'events',
    stream: true,
    messageColumn: 'trap_varlist',
    appliesTo: isDciTargetOrContainer,
  },
  WindowsEventLog: {
    label: 'Windows Events',
    icon: 'pi pi-microsoft',
    family: 'events',
    stream: true,
    messageColumn: 'message',
    appliesTo: (object) =>
      CONTAINER_CLASSES.has(object?.class) ||
      (object?.class === 'Node' &&
        (object?.platformName ?? '').toLowerCase().startsWith('windows')),
  },
  OpenTelemetryLog: {
    label: 'OpenTelemetry',
    icon: 'pi pi-share-alt',
    family: 'events',
    stream: true,
    messageColumn: 'body',
    appliesTo: isDciTargetOrContainer,
  },

  AuditLog: {
    label: 'Audit',
    icon: 'pi pi-verified',
    family: 'audit',
    appliesTo: () => true,
  },
  AssetChangeLog: {
    label: 'Asset Changes',
    icon: 'pi pi-tags',
    family: 'audit',
    appliesTo: isDciTargetOrContainer,
  },
  MaintenanceJournal: {
    label: 'Maintenance Journal',
    icon: 'pi pi-wrench',
    family: 'audit',
    appliesTo: isDciTargetOrContainer,
  },

  NotificationLog: { label: 'Notifications', icon: 'pi pi-send', family: 'server' },
  ServerActionExecutionLog: {
    label: 'Server Action Executions',
    icon: 'pi pi-play',
    family: 'server',
  },
  PackageDeploymentLog: { label: 'Package Deployments', icon: 'pi pi-box', family: 'server' },
  ConnectionHistory: {
    label: 'Connection History',
    icon: 'pi pi-link',
    family: 'server',
    appliesTo: (object) => object?.class === 'Node' && !!object?.capabilities?.isBridge,
  },

  AIOperatorExecutionLog: { label: 'AI Operator Executions', icon: 'pi pi-sparkles', family: 'ai' },
  AIOperatorObservations: {
    label: 'AI Operator Observations',
    icon: 'pi pi-eye',
    family: 'ai',
    appliesTo: isDciTargetOrContainer,
  },
  AITaskLog: { label: 'AI Tasks', icon: 'pi pi-list-check', family: 'ai' },
}

/**
 * `SnmpTrapLog` -> `Snmp Trap Log`.
 *
 * @param {string} name
 * @param {string} name
 */
export function humanizeLogName(name) {
  if (!name) return ''
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * @param {string} name
 * @param {string} name
 * @returns {LogCatalogEntry}
 */
export function getLogCatalogEntry(name) {
  return LOG_CATALOG[name] ?? { label: humanizeLogName(name), icon: 'pi pi-list', family: 'other' }
}

export function getLogLabel(name) {
  return getLogCatalogEntry(name).label
}

/**
 * In family declaration order, dropping empty families.
 *
 * @param {import('@/api/logsApi').LogSummary[]} logs
 * @param {import('@/api/logsApi').LogSummary[]} logs
 * @returns {Array<{id: string, label: string, logs: import('@/api/logsApi').LogSummary[]}>}
 */
export function groupLogsByFamily(logs) {
  const buckets = new Map(LOG_FAMILIES.map((f) => [f.id, []]))
  for (const log of logs ?? []) {
    const family = getLogCatalogEntry(log.name).family
    ;(buckets.get(family) ?? buckets.get('other')).push(log)
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => getLogLabel(a.name).localeCompare(getLogLabel(b.name)))
  }
  return LOG_FAMILIES.map((family) => ({ ...family, logs: buckets.get(family.id) })).filter(
    (family) => family.logs.length > 0,
  )
}

// Most specific first: `AlarmLog` has both `message` and `rule_description`.
const MESSAGE_NAME_PATTERNS = [
  /^(message|msg_text|body|text|description)$/i,
  /(^|_)(message|msg|body)($|_)/i,
  /varlist|varbind|description/i,
]

/**
 * @param {string} name - log name
 * @param {import('@/api/logsApi').LogColumn[]} columns
 * @returns {import('@/api/logsApi').LogColumn|null}
 */
export function getMessageColumn(name, columns) {
  const candidates = (columns ?? []).filter((c) => !c.detail && c.type === 'text')
  if (candidates.length === 0) return null

  const configured = getLogCatalogEntry(name).messageColumn
  const exact = candidates.find((c) => c.name === configured)
  if (exact) return exact

  for (const pattern of MESSAGE_NAME_PATTERNS) {
    const hit = candidates.find((c) => pattern.test(c.name))
    if (hit) return hit
  }
  return candidates.at(-1)
}

/**
 * @param {import('@/api/logsApi').LogSummary[]} logs
 * @param {object} object - full object document
 */
export function getObjectApplicableLogs(logs, object) {
  if (!object) return []
  return (logs ?? []).filter((log) => {
    if (!log.objectIdColumn) return false
    const entry = getLogCatalogEntry(log.name)
    return entry.appliesTo ? entry.appliesTo(object) : isDciTargetOrContainer(object)
  })
}
