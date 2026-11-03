/**
 * Find Object state and its round trip through the URL query string. The presence of `q`
 * (the script) puts the view in advanced mode.
 */

import { SEARCH_MODE, compileObjectFilter, STANDARD_FIELDS } from './objectQueryScript'

/** Matches the legacy finder's result ceiling. */
export const RESULT_LIMIT = 5000

/** @returns {object} */
export function createModel() {
  return {
    text: '',
    mode: SEARCH_MODE.NORMAL,
    classes: [],
    zones: [],
    ipFrom: '',
    ipTo: '',
    rootObjectId: 0,
    /** Raw NXSL. Non-empty means advanced mode. */
    script: '',
  }
}

/** True when the user has entered nothing. */
export function isBlank(model) {
  if (model.script.trim()) return false
  return compileObjectFilter(model).script === 'true'
}

function splitList(value) {
  if (typeof value !== 'string' || !value) return []
  return value.split(',').filter(Boolean)
}

/**
 * @param {object} model
 * @returns {Record<string, string>}
 */
export function toQuery(model) {
  const query = {}
  if (model.script.trim()) {
    query.q = model.script
  } else {
    if (model.text.trim()) query.text = model.text.trim()
    if (model.mode !== SEARCH_MODE.NORMAL) query.mode = model.mode
    if (model.classes.length) query.class = model.classes.join(',')
    if (model.zones.length) query.zone = model.zones.join(',')
    if (model.ipFrom.trim()) query.from = model.ipFrom.trim()
    if (model.ipTo.trim()) query.to = model.ipTo.trim()
  }
  if (model.rootObjectId) query.root = String(model.rootObjectId)
  return query
}

/**
 * Unknown values fall back to defaults, so a hand-edited URL still opens the tool.
 *
 * @param {Record<string, unknown>} query
 */
export function fromQuery(query = {}) {
  const model = createModel()
  const str = (value) => (typeof value === 'string' ? value : '')

  model.script = str(query.q)
  model.text = str(query.text)
  if (Object.values(SEARCH_MODE).includes(query.mode)) model.mode = query.mode
  model.classes = splitList(str(query.class))
  model.zones = splitList(str(query.zone)).map(Number).filter(Number.isFinite)
  model.ipFrom = str(query.from)
  model.ipTo = str(query.to)

  const root = Number(str(query.root))
  model.rootObjectId = Number.isFinite(root) && root > 0 ? root : 0

  return model
}

/**
 * Advanced mode sets `readAllFields`: a hand-written script assigns its own extra columns as
 * globals, and the server returns them only with that flag.
 *
 * @param {object} model
 * @returns {object | null} null when there is nothing to run
 */
export function toRequest(model) {
  const script = model.script.trim()
  if (script) {
    return {
      query: script,
      readAllFields: true,
      rootObjectId: model.rootObjectId,
      limit: RESULT_LIMIT,
    }
  }
  if (isBlank(model)) return null

  const compiled = compileObjectFilter(model)
  return {
    query: compiled.script,
    fields: compiled.fields,
    rootObjectId: model.rootObjectId,
    limit: RESULT_LIMIT,
  }
}

/** So dynamic columns do not duplicate the standard ones. */
export const CONSUMED_FIELDS = new Set(STANDARD_FIELDS)
