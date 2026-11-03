/**
 * @param {object | object[]} nodeOrNodes - a tree node (with .children) or an array of nodes
 * @returns {object[]}
 */
export function collectDescendantDashboards(nodeOrNodes) {
  const nodes = Array.isArray(nodeOrNodes) ? nodeOrNodes : (nodeOrNodes?.children ?? [])
  const result = []
  for (const node of nodes) {
    if (node.class === 'Dashboard') result.push(node)
    if (node.children?.length) result.push(...collectDescendantDashboards(node.children))
  }
  return result
}

/**
 * @param {object | object[]} nodeOrNodes - a tree node (with .children) or an array of nodes
 * @returns {object[]}
 */
export function collectDescendantGroups(nodeOrNodes) {
  const nodes = Array.isArray(nodeOrNodes) ? nodeOrNodes : (nodeOrNodes?.children ?? [])
  const result = []
  for (const node of nodes) {
    if (node.class === 'DashboardGroup') result.push(node)
    if (node.children?.length) result.push(...collectDescendantGroups(node.children))
  }
  return result
}

/** grid-layout-plus needs `i` (string id) in addition to x, y, w, h. */
export function widgetsToLayout(widgets) {
  return widgets.map((w) => ({ i: String(w.id), x: w.x, y: w.y, w: w.w, h: w.h }))
}

export function mergeLayout(widgets, layout) {
  const posMap = Object.fromEntries(layout.map((item) => [item.i, item]))
  return widgets.map((w) => {
    const pos = posMap[String(w.id)]
    if (!pos) return w
    return { ...w, x: pos.x, y: pos.y, w: pos.w, h: pos.h }
  })
}

/** px; must match the gap the canvas renders with. */
const ROW_GAP = 8

/** Floor for a row holding a card-chrome widget; inline widgets (labels, separators) have none. */
const MIN_CARD_ROW = 60

/** The WebAPI emits layout flags as either a boolean or the string 'true'/'false'. */
function layoutBool(value, fallback) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return fallback
}

function layoutNum(value, fallback) {
  if (value == null || value === '') return fallback
  const n = Number(value)
  return Number.isNaN(n) ? fallback : n
}

/**
 * `grid-template-rows` tracks reproducing the legacy client's DashboardLayout.java, which sizes
 * each row separately: `grabVerticalSpace` rows share the leftover height, the rest shrink to
 * content. grid-layout-plus has one uniform row height, so view mode uses a CSS grid instead.
 * The fill passes and where `heightHint` applies mirror the legacy layout.
 *
 * @param {Array} widgets - internal widget shape ({ y, h, type, raw.layout })
 * @param {(widget: object) => boolean} isInline - true for widgets drawn without card chrome
 * @param {object} [options]
 * @param {boolean} [options.scrollable] - scrollable boards ignore grab and stack fixed rows
 * @param {number} [options.rowHeight] - fixed row height used by scrollable boards
 * @returns {string[]} one CSS track per row, top to bottom
 */
export function computeRowTracks(widgets, isInline, { scrollable = false, rowHeight = 80 } = {}) {
  const rowCount = (widgets ?? []).reduce((max, w) => Math.max(max, w.y + w.h), 0)
  if (rowCount <= 0) return []

  const floors = Array.from({ length: rowCount }, () => 0)
  const hints = Array.from({ length: rowCount }, () => 0)
  // 0 = untouched, 1 = content-sized, 2 = claimable by a multi-row grabber, 3 = grows
  const fill = Array.from({ length: rowCount }, () => 0)

  const rowsOf = (w) => {
    const rows = []
    for (let i = 0; i < w.h; i++) {
      const r = w.y + i
      if (r >= 0 && r < rowCount) rows.push(r)
    }
    return rows
  }

  const entries = (widgets ?? []).map((w) => {
    const layout = w.raw?.layout ?? {}
    const grab = !scrollable && layoutBool(layout.grabVerticalSpace, true)
    const hint = layoutNum(layout.heightHint, -1)
    return {
      widget: w,
      grab,
      rows: rowsOf(w),
      // A multi-row span swallows the gaps between its rows, so the hint has to be
      // split across the rows net of them.
      perRowHint: !grab && hint > 0 ? Math.floor((hint - (w.h - 1) * ROW_GAP) / w.h) : 0,
    }
  })

  for (const { widget, rows, perRowHint } of entries) {
    const inline = isInline(widget)
    for (const r of rows) {
      if (!inline) floors[r] = Math.max(floors[r], MIN_CARD_ROW)
      if (perRowHint > 0) hints[r] = Math.max(hints[r], perRowHint)
    }
  }

  for (const { grab, rows } of entries) {
    if (grab && rows.length === 1) fill[rows[0]] = 3
  }
  for (const { grab, rows } of entries) {
    if (!grab) for (const r of rows) if (fill[r] < 3) fill[r] = 1
  }
  for (const { grab, rows } of entries) {
    if (grab && rows.length > 1) for (const r of rows) if (fill[r] === 0) fill[r] = 2
  }
  for (const { grab, rows } of entries) {
    if (!grab || rows.length <= 1) continue
    const claimable = rows.filter((r) => fill[r] >= 2)
    if (claimable.length) for (const r of claimable) fill[r] = 3
    else if (rows.length) fill[rows[0]] = 3
  }

  return fill.map((state, r) => {
    if (scrollable) return `${Math.max(hints[r] || rowHeight, floors[r])}px`
    if (state === 3) return `minmax(${floors[r]}px, 1fr)`
    const min = Math.max(hints[r], floors[r])
    return min > 0 ? `minmax(${min}px, auto)` : 'auto'
  })
}

/**
 * Parses computeRowTracks() output, so the two must change together. When false, edit mode
 * (grid-layout-plus, uniform rows) lays out the same as view mode.
 *
 * @param {string[]} tracks - output of computeRowTracks()
 * @returns {boolean}
 */
export function hasContentSizedRows(tracks) {
  return (tracks ?? []).some((track) => !track.endsWith('1fr)'))
}
