/** Server database column widths. */
export const NAME_MAX_LENGTH = 63
export const MODEL_SLOT_MAX_LENGTH = 63

/** Seconds. */
export const INTERVAL_MIN = 60
export const INTERVAL_MAX = 604800

/** 0 means "use the server default". */
export const RETENTION_DAYS_MAX = 3650
export const MAX_RECORDS_MAX = 1000000

/** Legacy client defaults. */
export const DEFAULT_MIN_INTERVAL = 300
export const DEFAULT_MAX_INTERVAL = 3600

/**
 * @param {{ enabled?: boolean, executing?: boolean }} operator
 * @returns {{ label: string, class: string, icon: string }}
 */
export function aiOperatorState(operator) {
  if (operator?.executing) {
    return { label: 'Running', class: 'status-ok', icon: 'pi pi-spin pi-spinner' }
  }
  if (operator?.enabled) {
    return { label: 'Enabled', class: 'status-ok', icon: 'pi pi-check-circle' }
  }
  return { label: 'Disabled', class: 'status-muted', icon: 'pi pi-pause-circle' }
}

/** The server treats 0 as "no cap". */
export function formatTokenBudget(budget) {
  return budget ? budget.toLocaleString() : 'Unlimited'
}

export function formatOverride(value, unit) {
  return value ? `${value} ${unit}` : 'Server default'
}

/**
 * Mirrors the server's checks, which answer 400.
 *
 * @param {{ name: string, minInterval: number, maxInterval: number }} form
 * @returns {{ name?: string, minInterval?: string, maxInterval?: string }} field -> message
 */
export function validateAiOperator(form) {
  const errors = {}
  if (!form.name?.trim()) errors.name = 'Instance name is required.'
  if (!(form.minInterval >= INTERVAL_MIN)) {
    errors.minInterval = `Minimum interval must be at least ${INTERVAL_MIN} seconds.`
  }
  if (form.maxInterval < form.minInterval) {
    errors.maxInterval = 'Maximum interval cannot be less than the minimum interval.'
  }
  return errors
}

/**
 * Neutral colors on purpose, like alarm states: nearly every row is New, and a hue would read
 * as a severity. `action` is the wording for moving an observation into the state.
 */
export const OBSERVATION_STATES = Object.freeze([
  {
    value: 'new',
    label: 'New',
    action: 'Mark as new',
    color: 'var(--p-text-color)',
    icon: 'pi pi-circle-fill',
  },
  {
    value: 'acknowledged',
    label: 'Acknowledged',
    action: 'Acknowledge',
    color: 'var(--p-text-muted-color)',
    icon: 'pi pi-check',
  },
  {
    value: 'dismissed',
    label: 'Dismissed',
    action: 'Dismiss',
    color: 'var(--p-text-muted-color)',
    icon: 'pi pi-times-circle',
  },
])

/**
 * @param {string} [state] - 'new' | 'acknowledged' | 'dismissed'
 * @returns {{ label: string, color: string, icon: string }}
 */
export function observationState(state) {
  return (
    OBSERVATION_STATES.find((s) => s.value === state) ?? {
      label: state || 'Unknown',
      color: 'var(--p-text-muted-color)',
      icon: 'pi pi-question-circle',
    }
  )
}

/**
 * The model writes these as free text, usually bare ids of unknown kind, so they cannot be
 * linked; only the server's own `check:<id>:<name>` has a known shape. Entries need not be
 * strings: the server stores the array as sent.
 *
 * @param {{ references?: * }} [observation]
 * @returns {string[]}
 */
export function observationReferences(observation) {
  const references = observation?.references
  if (!Array.isArray(references)) return []
  return references.map((reference) => {
    const text = typeof reference === 'string' ? reference : JSON.stringify(reference)
    const check = /^check:\d+:(.+)$/.exec(text)
    return check ? `Check: ${check[1]}` : text
  })
}

/** The legacy client caps the monitor at this whatever the element says. */
export const OBSERVATION_MONITOR_MAX_RECORDS = 500

/**
 * `includeChildren` gives the legacy "equals or child of" filter; an older server ignores it and
 * matches the object exactly.
 *
 * @param {{ instanceId?: number, newOnly?: boolean, maxRecords?: number }} config
 * @param {number} objectId - context-resolved, 0 for none
 */
export function observationMonitorParams(config, objectId) {
  const requested = Number(config?.maxRecords) || 50
  return {
    limit: Math.min(Math.max(requested, 1), OBSERVATION_MONITOR_MAX_RECORDS),
    ...(config?.instanceId > 0 ? { instance: config.instanceId } : {}),
    ...(config?.newOnly !== false ? { state: 'new' } : {}),
    ...(objectId > 0 ? { object: objectId, includeChildren: true } : {}),
  }
}

/** Seconds. */
export const CHECK_INTERVAL_MIN = 30
export const CHECK_DURATION_MAX = 604800

/** Legacy client defaults. */
export const DEFAULT_CHECK = Object.freeze({
  name: '',
  description: '',
  enabled: true,
  locked: false,
  source: '',
  interval: 300,
  objectId: 0,
  action: 'wake',
  cooldown: 0,
  renotifyInterval: 0,
})

export const CHECK_ACTION_OPTIONS = Object.freeze([
  { value: 'wake', label: 'Wake operator' },
  { value: 'observe', label: 'Record observation' },
])

const CHECK_VERDICTS = {
  quiet: { label: 'Quiet', class: 'status-ok', icon: 'pi pi-check-circle' },
  fired: { label: 'Fired', class: 'status-warn', icon: 'pi pi-bell' },
  error: { label: 'Error', class: 'status-error', icon: 'pi pi-times-circle' },
}

/**
 * @param {string} [verdict] - 'never' | 'quiet' | 'fired' | 'error'
 * @returns {{ label: string, class: string, icon: string }}
 */
export function checkVerdict(verdict) {
  return (
    CHECK_VERDICTS[verdict] ?? {
      label: 'Never run',
      class: 'status-muted',
      icon: 'pi pi-minus-circle',
    }
  )
}

/** @returns {{ name?: string, source?: string, interval?: string }} */
export function validateAiOperatorCheck(form) {
  const errors = {}
  if (!form.name?.trim()) errors.name = 'Check name is required.'
  if (!form.source?.trim()) errors.source = 'Script is required.'
  if (!(form.interval >= CHECK_INTERVAL_MIN)) {
    errors.interval = `Run interval must be at least ${CHECK_INTERVAL_MIN} seconds.`
  }
  return errors
}

const CHECK_FIELDS = Object.keys(DEFAULT_CHECK)

/**
 * An existing check sends only what changed: the operator edits its own checks between
 * iterations, and resending an unchanged field would undo its edit.
 *
 * @param {object} form
 * @param {object|null} original - null for a new check
 */
export function buildAiOperatorCheckPayload(form, original) {
  // A cleared InputNumber emits null; 0 is what "none" means for these fields.
  const normalized = {
    ...form,
    name: form.name.trim(),
    description: (form.description ?? '').trim(),
    objectId: form.objectId ?? 0,
    cooldown: form.cooldown ?? 0,
    renotifyInterval: form.renotifyInterval ?? 0,
  }
  if (!original) return Object.fromEntries(CHECK_FIELDS.map((f) => [f, normalized[f]]))
  return Object.fromEntries(
    CHECK_FIELDS.filter((f) => normalized[f] !== original[f]).map((f) => [f, normalized[f]]),
  )
}

/**
 * `instructions` goes out only when the user edited them: the operator rewrites them between
 * iterations, and a stale copy would revert that.
 *
 * `ownerUserId` goes out only when picked or changed; absent, the server keeps the owner (or
 * uses the built-in "ai-operator" account), and it refuses 0, so form value 0 means "default".
 *
 * @param {object} form
 * @param {object|null} operator - null for a new instance
 */
export function buildAiOperatorPayload(form, operator) {
  const payload = {
    name: form.name.trim(),
    description: form.description.trim(),
    enabled: form.enabled,
    scopeFilter: form.scopeFilter.trim(),
    modelSlot: form.modelSlot.trim(),
    minInterval: form.minInterval,
    maxInterval: form.maxInterval,
    dailyTokenBudget: form.dailyTokenBudget ?? 0,
    personaPrompt: form.personaPrompt.trim(),
    observationRetentionDays: form.observationRetentionDays ?? 0,
    observationMaxRecords: form.observationMaxRecords ?? 0,
  }
  if (form.ownerUserId && form.ownerUserId !== operator?.ownerUserId) {
    payload.ownerUserId = form.ownerUserId
  }
  if (!operator) return payload

  payload.instructionsLocked = form.instructionsLocked === true
  if ((form.instructions ?? '') !== (operator.instructions ?? '')) {
    payload.instructions = (form.instructions ?? '').trim()
  }
  return payload
}
