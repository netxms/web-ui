/** Forwarder name column width in the server database (wchar_t, MAX_OBJECT_NAME). */
export const NAME_MAX_LENGTH = 63

/** Description column width in the server database (MAX_NC_DESCRIPTION). */
export const DESCRIPTION_MAX_LENGTH = 255

/** Last delivery status codes, indexed by `sendStatus` (EventForwarderLabelProvider.java). */
export const SEND_STATUS_LABELS = ['Unknown', 'Success', 'Failure']

// A hint, never a whitelist: server modules register their own drivers.
const DRIVER_CONFIG_HINTS = {
  isc: ['hostname'],
  snmptrap: [
    'hostname',
    'port (162)',
    'codepage',
    'version (2c)',
    'community (public)',
    'authMethod',
    'privMethod',
    'userName (netxms)',
    'authPassword',
    'privPassword',
    'useInformRequest',
  ],
  otlp: [
    'endpoint',
    'verifyPeer (true)',
    'serviceName',
    'batchSize',
    'flushInterval',
    'timeout',
    'queueSizeLimit',
    'authToken',
    'headers (object)',
  ],
}

/**
 * @param {{ driverInitialized?: boolean, healthCheckStatus?: boolean }} forwarder
 * @returns {{ label: string, class: string, icon: string }}
 */
export function eventForwarderStatus(forwarder) {
  if (!forwarder?.driverInitialized) {
    return { label: 'Not Initialized', class: 'status-error', icon: 'pi pi-times-circle' }
  }
  if (!forwarder.healthCheckStatus) {
    return { label: 'Unhealthy', class: 'status-warn', icon: 'pi pi-exclamation-circle' }
  }
  return { label: 'Healthy', class: 'status-ok', icon: 'pi pi-check-circle' }
}

/**
 * @param {number} [sendStatus]
 * @returns {string}
 */
export function sendStatusLabel(sendStatus) {
  return SEND_STATUS_LABELS[sendStatus] ?? SEND_STATUS_LABELS[0]
}

/**
 * @param {string} [driverName]
 * @returns {string[] | null}
 */
export function driverConfigHint(driverName) {
  return DRIVER_CONFIG_HINTS[driverName] ?? null
}

/**
 * @param {string} text
 * @returns {{ ok: true, value: Object } | { ok: false, error: string }}
 */
export function parseConfiguration(text) {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return { ok: true, value: {} }

  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch (err) {
    return { ok: false, error: err.message }
  }

  // The server silently substitutes {} for anything that is not a JSON object.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Configuration must be a JSON object.' }
  }
  return { ok: true, value: parsed }
}

/**
 * @param {Object} [configuration]
 * @returns {string}
 */
export function formatConfiguration(configuration) {
  if (!configuration || Object.keys(configuration).length === 0) return ''
  return JSON.stringify(configuration, null, 2)
}
