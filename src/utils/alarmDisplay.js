// `color` is for marks only (icons, dots, bars, borders); anything carrying text takes the
// `bgColor` + `textColor` pair. Severity icons come from StatusIcon.vue.
const paletteColors = (key) => ({
  color: `var(--netxms-status-${key})`,
  bgColor: `var(--netxms-status-${key}-bg)`,
  textColor: `var(--netxms-status-${key}-text)`,
})
export const severityConfig = {
  critical: paletteColors('critical'),
  major: paletteColors('major'),
  minor: paletteColors('minor'),
  warning: paletteColors('warning'),
  normal: paletteColors('normal'),
}

// Neutral on purpose: a hue would read as a severity. The icon shapes are the legacy client's.
export const stateConfig = {
  outstanding: { label: 'Outstanding', icon: 'pi pi-lightbulb', color: 'var(--p-text-color)' },
  acknowledged: { label: 'Acknowledged', icon: 'pi pi-flag', color: 'var(--p-text-muted-color)' },
  resolved: {
    label: 'Resolved',
    icon: 'pi pi-check-circle',
    color: 'var(--netxms-status-normal)',
  },
  terminated: { label: 'Terminated', icon: 'pi pi-ban', color: 'var(--p-text-muted-color)' },
}

// The API may return severity/state as integers or strings.
export function normalizeSeverity(value) {
  if (typeof value === 'string') return value.toLowerCase()
  const map = { 0: 'normal', 1: 'warning', 2: 'minor', 3: 'major', 4: 'critical' }
  return map[value] ?? 'normal'
}

export function normalizeState(value) {
  if (typeof value === 'string') return value.toLowerCase()
  const map = { 0: 'outstanding', 1: 'acknowledged', 2: 'resolved', 3: 'terminated' }
  return map[value] ?? 'outstanding'
}

/**
 * @param {string} state - normalized (normalizeState)
 * @returns {{ acknowledge: boolean, resolve: boolean, terminate: boolean }}
 */
export function alarmActionAvailability(state) {
  return {
    acknowledge: state === 'outstanding',
    resolve: state !== 'resolved' && state !== 'terminated',
    terminate: state !== 'terminated',
  }
}

export function getSeverity(alarm) {
  return severityConfig[normalizeSeverity(alarm.severity)] || severityConfig.normal
}

// A sticky acknowledgment survives new occurrences of the alarm's event. Like the legacy
// client, only the icon differs.
const STICKY_ACKNOWLEDGED = {
  ...stateConfig.acknowledged,
  icon: 'pi pi-flag-fill',
  hint: 'Acknowledged (sticky)',
}

export function getState(alarm) {
  const state = stateConfig[normalizeState(alarm.state)] || stateConfig.outstanding
  return state === stateConfig.acknowledged && alarm.isSticky ? STICKY_ACKNOWLEDGED : state
}

/** The index is the wire severity code. */
export const SEVERITY_ORDER = ['normal', 'warning', 'minor', 'major', 'critical']

/** Not in `severityConfig`: `logColumnTypes` spreads that over its own `label`. */
export const severityLabels = {
  normal: 'Normal',
  warning: 'Warning',
  minor: 'Minor',
  major: 'Major',
  critical: 'Critical',
}

/**
 * @param {number|string|undefined} value
 * @returns {number} 0 (normal) to 4 (critical)
 */
export function severityRank(value) {
  const index = SEVERITY_ORDER.indexOf(normalizeSeverity(value))
  return index === -1 ? 0 : index
}
