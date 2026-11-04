/** Alarms as text: for the clipboard, CSV and the AI assistant. */
import { getState, normalizeSeverity, severityLabels } from './alarmDisplay'
import { formatDateTime } from './timeFormat'

function severityText(alarm) {
  return severityLabels[normalizeSeverity(alarm.severity)] ?? severityLabels.normal
}

/**
 * The legacy client's "Copy to clipboard" format.
 *
 * @param {object[]} alarms
 * @param {{ sourceName: (alarm: object) => string }} names
 */
export function alarmsAsText(alarms, { sourceName }) {
  return alarms
    .map((alarm) => `[${severityText(alarm)}]\t${sourceName(alarm)}\t${alarm.message}`)
    .join('\n')
}

/** @param {object[]} alarms */
export function alarmMessagesAsText(alarms) {
  return alarms.map((alarm) => alarm.message).join('\n')
}

const EXPORT_CELLS = {
  severity: (alarm) => severityText(alarm),
  state: (alarm) => getState(alarm).label,
  source: (alarm, names) => names.sourceName(alarm),
  zone: (alarm, names) => names.zoneName(alarm) ?? '',
  message: (alarm) => alarm.message,
  repeatCount: (alarm) => alarm.repeatCount,
  comments: (alarm) => alarm.commentCount,
  helpdeskReference: (alarm) => alarm.helpdeskReference,
  ackResolveBy: (alarm) => alarm.resolvedByUserName || alarm.ackByUserName,
  created: (alarm) => formatDateTime(alarm.creationTime),
  lastChangeTime: (alarm) => formatDateTime(alarm.lastChangeTime),
}

/**
 * Rows for `toCsv`, keyed by column id.
 *
 * @param {object[]} alarms
 * @param {Array<{ id: string }>} columns
 * @param {{ sourceName: (alarm: object) => string, zoneName: (alarm: object) => string|null }} names
 */
export function alarmExportRows(alarms, columns, names) {
  return alarms.map((alarm) =>
    Object.fromEntries(columns.map(({ id }) => [id, EXPORT_CELLS[id]?.(alarm, names)])),
  )
}

/**
 * The prompt of the server's own alarm comment (`Alarm::requestAIAssistantComment`), which the
 * WebAPI does not expose, plus the alarm id for the assistant's alarm tools.
 *
 * @param {object} alarm
 * @param {string} sourceName
 */
export function alarmAssistantPrompt(alarm, sourceName) {
  return [
    'Analyze the following alarm and help me understand and resolve the issue. ' +
      'Use additional tools and data sources if needed to enrich your analysis.',
    '',
    `Alarm ID: ${alarm.id}`,
    `Source object name: ${sourceName}`,
    `Source object ID: ${alarm.source}`,
    `Severity: ${severityText(alarm)}`,
    `Message: ${alarm.message}`,
    `Last change time: ${formatDateTime(alarm.lastChangeTime)}`,
  ].join('\n')
}
