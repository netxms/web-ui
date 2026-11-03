/**
 * From the `result` of execute-dashboard-script. The server sends a hash as a JSON object, an
 * array as a hash keyed "1".."n" whose hash elements are JSON strings, and a scalar as
 * { "1": value }. Entries are read as legacy ScriptedChartElement does: name / value / color, or a
 * plain number.
 *
 * @param {unknown} result
 * @returns {Array<{ name: string, value: number, color?: string }>}
 */
export function normalizeScriptResult(result) {
  if (result == null) return []
  if (Array.isArray(result)) return result.map((entry, i) => toItem(String(i + 1), entry))
  if (typeof result === 'object') {
    return Object.entries(result).map(([key, entry]) => toItem(key, entry))
  }
  return [toItem('1', result)]
}

function toItem(key, entry) {
  const element = parseElement(entry)
  if (element) {
    const name = typeof element.name === 'string' && element.name.trim() !== '' ? element.name : key
    return {
      name,
      value: toNumber(element.value),
      ...(element.color ? { color: element.color } : {}),
    }
  }
  return { name: key, value: toNumber(entry) }
}

/** Given as an object or as a JSON string starting with "{". */
function parseElement(entry) {
  if (entry !== null && typeof entry === 'object') return entry
  if (typeof entry !== 'string' || !entry.trimStart().startsWith('{')) return null
  try {
    const parsed = JSON.parse(entry)
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
