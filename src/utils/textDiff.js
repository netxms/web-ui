/**
 * Line-oriented diff for device configuration backups. Unlike legacy (a character diff), lines
 * are the unit: a router config is a list of statements. LCS over lines after stripping common
 * prefix and suffix, so the quadratic table sees only the changed middle.
 */

/** Past this the middle is reported as one delete plus one insert rather than hanging the tab. */
const MAX_LCS_CELLS = 4_000_000

/**
 * @typedef {object} DiffLine
 * @property {'context'|'added'|'removed'} kind
 * @property {string} text - without its terminator
 * @property {number|null} oldLine - 1-based, null for an addition
 * @property {number|null} newLine - 1-based, null for a removal
 */

/**
 * A trailing newline does not become an empty line, and CRLF is normalised, so neither diffs as
 * an edit.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  if (!text) return []
  const normalized = text.replaceAll('\r\n', '\n').replace(/\n$/, '')
  return normalized.split('\n')
}

/**
 * @param {string} oldText
 * @param {string} newText
 * @returns {DiffLine[]} every line of both texts, in order
 */
export function diffLines(oldText, newText) {
  const a = splitLines(oldText)
  const b = splitLines(newText)

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++

  // Common suffix, never overlapping the prefix.
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const result = []
  for (let i = 0; i < start; i++) {
    result.push({ kind: 'context', text: a[i], oldLine: i + 1, newLine: i + 1 })
  }

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  for (const entry of diffMiddle(midA, midB)) {
    result.push({
      kind: entry.kind,
      text: entry.text,
      oldLine: entry.oldIndex === null ? null : start + entry.oldIndex + 1,
      newLine: entry.newIndex === null ? null : start + entry.newIndex + 1,
    })
  }

  for (let i = endA; i < a.length; i++) {
    result.push({
      kind: 'context',
      text: a[i],
      oldLine: i + 1,
      newLine: i - endA + endB + 1,
    })
  }

  return result
}

/**
 * Indices in the returned entries are relative to the middle section.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {Array<{ kind: string, text: string, oldIndex: number|null, newIndex: number|null }>}
 */
function diffMiddle(a, b) {
  if (a.length === 0 && b.length === 0) return []
  if (a.length === 0) {
    return b.map((text, i) => ({ kind: 'added', text, oldIndex: null, newIndex: i }))
  }
  if (b.length === 0) {
    return a.map((text, i) => ({ kind: 'removed', text, oldIndex: i, newIndex: null }))
  }
  if (a.length * b.length > MAX_LCS_CELLS) {
    return [
      ...a.map((text, i) => ({ kind: 'removed', text, oldIndex: i, newIndex: null })),
      ...b.map((text, i) => ({ kind: 'added', text, oldIndex: null, newIndex: i })),
    ]
  }

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const width = b.length + 1
  const lcs = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }

  const entries = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      entries.push({ kind: 'context', text: a[i], oldIndex: i, newIndex: j })
      i++
      j++
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      // Removal first, so a changed line reads "old line, then new line".
      entries.push({ kind: 'removed', text: a[i], oldIndex: i, newIndex: null })
      i++
    } else {
      entries.push({ kind: 'added', text: b[j], oldIndex: null, newIndex: j })
      j++
    }
  }
  while (i < a.length) {
    entries.push({ kind: 'removed', text: a[i], oldIndex: i, newIndex: null })
    i++
  }
  while (j < b.length) {
    entries.push({ kind: 'added', text: b[j], oldIndex: null, newIndex: j })
    j++
  }
  return entries
}

/**
 * @param {DiffLine[]} lines
 * @returns {{ added: number, removed: number, changed: boolean }}
 */
export function diffStats(lines) {
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.kind === 'added') added++
    else if (line.kind === 'removed') removed++
  }
  return { added, removed, changed: added > 0 || removed > 0 }
}

/**
 * Returns the same line objects with gap markers spliced in, so the renderer stays a flat list.
 *
 * @param {DiffLine[]} lines
 * @param {number} [context=3] - unchanged lines kept on each side of a change
 * @returns {Array<DiffLine|{ kind: 'gap', skipped: number }>}
 */
export function collapseUnchanged(lines, context = 3) {
  const keep = Array.from({ length: lines.length }, () => false)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind === 'context') continue
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) {
      keep[j] = true
    }
  }

  const out = []
  let skipped = 0
  for (let i = 0; i < lines.length; i++) {
    if (keep[i]) {
      if (skipped > 0) {
        out.push({ kind: 'gap', skipped })
        skipped = 0
      }
      out.push(lines[i])
    } else {
      skipped++
    }
  }
  if (skipped > 0) out.push({ kind: 'gap', skipped })
  return out
}

/**
 * Unified-diff text.
 *
 * @param {DiffLine[]} lines
 * @returns {string}
 */
export function diffToText(lines) {
  return lines
    .map((line) => {
      const prefix = line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '
      return prefix + line.text
    })
    .join('\n')
}
