/**
 * Template DCIs: chart and table-value entries that name a DCI by pattern, matched against the
 * DCIs of the dashboard's context object, so one dashboard gives every node its own charts.
 * Legacy: LineChartElement.configureMetrics, ChartDciConfig copy constructors,
 * TableValueElement.configureContext.
 */
import { CONTEXT_OBJECT_ID } from '@/utils/dashboardContext'

/** @param {{ nodeId?: unknown }} entry */
export function isTemplateDci(entry) {
  const nodeId = Number(entry?.nodeId ?? 0)
  return nodeId === 0 || nodeId === CONTEXT_OBJECT_ID
}

/**
 * Java regex. A leading inline "(?i)" is common in NetXMS configs and fatal in JS, so it becomes
 * the flag; other Java-only syntax throws, and the caller reports it as legacy does.
 */
function compilePattern(pattern) {
  if (!pattern) return null
  return pattern.startsWith('(?i)') ? new RegExp(pattern.slice(4), 'i') : new RegExp(pattern)
}

/** `\1`..`\9` -> capture groups, as in ChartDciConfig(src, matcher, dciValue). */
export function substituteCaptureGroups(template, match) {
  let out = ''
  let escaped = false
  for (const c of template) {
    if (!escaped) {
      if (c === '\\') escaped = true
      else out += c
      continue
    }
    escaped = false
    if (c === '\\') out += '\\'
    else if (c >= '0' && c <= '9') out += match?.[Number(c)] ?? ''
    else out += `\\${c}`
  }
  return out
}

function equalsIgnoreCase(pattern, value) {
  return !!pattern && typeof value === 'string' && pattern.toLowerCase() === value.toLowerCase()
}

function instantiate(entry, dci, contextObjectId, name) {
  return { ...entry, nodeId: contextObjectId, dciId: dci.id, name, fromTemplate: true }
}

/**
 * @param {Array<object>} dciList - normalized entries (dciListFromApi)
 * @param {Array<object>|null} contextDcis - adapted current values of the context object; null
 *   drops template entries
 * @param {number|null} contextObjectId
 * @returns {Array<object>} concrete entries, in list order
 * @throws {SyntaxError} for an invalid pattern in a regexMatch entry
 */
export function resolveTemplateDcis(dciList, contextDcis, contextObjectId) {
  const resolved = []
  for (const entry of dciList ?? []) {
    if (!isTemplateDci(entry)) {
      resolved.push(entry)
      continue
    }
    if (!contextDcis || !contextObjectId) continue

    if (entry.regexMatch) {
      const matchers = [
        [compilePattern(entry.dciName), 'name'],
        [compilePattern(entry.dciDescription), 'description'],
        [compilePattern(entry.dciTag), 'userTag'],
      ].filter(([re]) => re)
      for (const dci of contextDcis) {
        if (dci.isTable) continue
        let match = null
        for (const [re, field] of matchers) {
          match = re.exec(dci[field] ?? '')
          if (match) break
        }
        if (!match) continue
        const name = entry.name ? substituteCaptureGroups(entry.name, match) : dci.description
        resolved.push(instantiate(entry, dci, contextObjectId, name))
        if (!entry.multiMatch) break
      }
      continue
    }

    for (const dci of contextDcis) {
      if (
        equalsIgnoreCase(entry.dciName, dci.name) ||
        equalsIgnoreCase(entry.dciDescription, dci.description) ||
        equalsIgnoreCase(entry.dciTag, dci.userTag)
      ) {
        resolved.push(instantiate(entry, dci, contextObjectId, entry.name || dci.description))
        if (!entry.multiMatch) break
      }
    }
  }
  return resolved
}

/**
 * TableValueElement.configureContext: the first table DCI of the context object whose name,
 * description or user tag contains the pattern (case-sensitive substring, or an unanchored regex
 * with `regexMatch`).
 *
 * @param {{ dciName?: string, dciDescription?: string, dciTag?: string,
 *   regexMatch?: boolean } | null} templateConfig
 * @param {Array<object>|null} contextDcis - adapted current values of the context object
 * @returns {object|null}
 * @throws {SyntaxError} for an invalid pattern with regexMatch
 */
export function findTemplateTableDci(templateConfig, contextDcis) {
  if (!templateConfig || !contextDcis) return null
  const toMatcher = (pattern) => {
    if (!pattern) return null
    if (!templateConfig.regexMatch) return (value) => value.includes(pattern)
    const re = compilePattern(pattern)
    return (value) => re.test(value)
  }
  const matchers = [
    [toMatcher(templateConfig.dciName), 'name'],
    [toMatcher(templateConfig.dciDescription), 'description'],
    [toMatcher(templateConfig.dciTag), 'userTag'],
  ].filter(([matches]) => matches)
  if (matchers.length === 0) return null
  return (
    contextDcis.find(
      (dci) =>
        dci.isTable &&
        matchers.some(([matches, field]) => typeof dci[field] === 'string' && matches(dci[field])),
    ) ?? null
  )
}
