/** The server also reports "none". */
export const CHECK_TYPE_OPTIONS = [
  { value: 'object', label: 'Object status' },
  { value: 'dci', label: 'DCI threshold' },
  { value: 'script', label: 'Script' },
]

const CHECK_TYPE_LABELS = {
  ...Object.fromEntries(CHECK_TYPE_OPTIONS.map((o) => [o.value, o.label])),
  none: 'None',
}

/** @param {string} type */
export function checkTypeLabel(type) {
  return CHECK_TYPE_LABELS[type] ?? type ?? ''
}

/** 0 is the server default (`BusinessServices.Check.Threshold.*`); the server refuses > 4. */
export const CHECK_THRESHOLD_OPTIONS = [
  { value: 0, label: 'Default' },
  { value: 1, label: 'Warning' },
  { value: 2, label: 'Minor' },
  { value: 3, label: 'Major' },
  { value: 4, label: 'Critical' },
]

/** A check only ever reports 0, 2 or 4; `status` is the object status to colour the chip. */
const CHECK_STATES = {
  0: { label: 'OK', status: 0 },
  2: { label: 'Degraded', status: 2 },
  4: { label: 'Failed', status: 4 },
}

/** @param {number} status */
export function checkState(status) {
  return CHECK_STATES[status] ?? { label: 'Unknown', status: 5 }
}

/** @param {object} raw */
export function normalizeCheck(raw) {
  const prototypeServiceId = raw?.prototypeServiceId ?? 0
  return {
    id: raw?.id ?? 0,
    serviceId: raw?.serviceId ?? 0,
    type: raw?.type ?? 'none',
    description: raw?.description ?? '',
    relatedObjectId: raw?.relatedObjectId ?? 0,
    relatedDciId: raw?.relatedDciId ?? 0,
    statusThreshold: raw?.statusThreshold ?? 0,
    script: raw?.script ?? '',
    status: raw?.status ?? 0,
    failureReason: raw?.failureReason ?? '',
    prototypeServiceId,
    prototypeCheckId: raw?.prototypeCheckId ?? 0,
    // Server refuses PATCH on these (409); legacy greys them out and disables Edit.
    autoCreated: raw?.autoCreated ?? prototypeServiceId !== 0,
  }
}

/**
 * Auto-binding marks a check with its own service as the prototype.
 *
 * @param {ReturnType<typeof normalizeCheck>} check
 * @returns {'manual'|'autobind'|'prototype'}
 */
export function checkOrigin(check) {
  if (!check.prototypeServiceId) return 'manual'
  return check.prototypeServiceId === check.serviceId ? 'autobind' : 'prototype'
}

export function emptyCheckForm() {
  return {
    description: '',
    type: 'object',
    relatedObjectId: 0,
    relatedDciId: 0,
    statusThreshold: 0,
    script: '',
  }
}

/** @param {ReturnType<typeof normalizeCheck>} check */
export function checkToForm(check) {
  return {
    description: check.description,
    // Legacy maps a "none" check onto Object status when it opens the editor.
    type: check.type === 'none' ? 'object' : check.type,
    relatedObjectId: check.relatedObjectId,
    relatedDciId: check.relatedDciId,
    statusThreshold: check.statusThreshold,
    script: check.script,
  }
}

/**
 * Stricter than legacy, which saves an object or DCI check with nothing selected.
 *
 * @param {ReturnType<typeof emptyCheckForm>} form
 */
export function validateCheckForm(form) {
  const errors = {}
  if (form.type === 'object' && !form.relatedObjectId) {
    errors.relatedObjectId = 'Select the object to check'
  }
  if (form.type === 'dci') {
    if (!form.relatedObjectId) errors.relatedObjectId = 'Select the object the DCI belongs to'
    else if (!form.relatedDciId) errors.relatedDciId = 'Select a DCI'
  }
  return errors
}

/**
 * Always the whole check, as legacy sends it. "Unnamed" is the server's own default.
 *
 * @param {ReturnType<typeof emptyCheckForm>} form
 * @param {{ fallbackDescription?: string }} [options]
 */
export function buildCheckPayload(form, { fallbackDescription = '' } = {}) {
  const description = form.description.trim() || fallbackDescription.trim()
  return {
    type: form.type,
    description: description || 'Unnamed',
    relatedObjectId: form.relatedObjectId || 0,
    relatedDciId: form.type === 'dci' ? form.relatedDciId || 0 : 0,
    statusThreshold: form.statusThreshold ?? 0,
    script: form.type === 'script' ? form.script : null,
  }
}

/**
 * The copy has no prototype link, so duplicating an auto-created check gives an editable one.
 *
 * @param {ReturnType<typeof normalizeCheck>} check
 */
export function duplicateCheckPayload(check) {
  return buildCheckPayload(checkToForm(check))
}
