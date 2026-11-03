/**
 * Each widget keeps the element's untouched data/layout JSON in `raw`, so fields the UI does
 * not edit round-trip on save.
 *
 * Widget: { id, type (registry key or 'unknown'), apiType, x, y, w, h, config, raw }
 *
 * The legacy layout is flow order plus spans, not positions. Saving also writes gridX/gridY
 * into each layout; loading uses them only when every element has them.
 */
import { getTypeDef, getTypeDefByApi, UNKNOWN_TYPE_DEF } from './dashboardElements'

/**
 * @param {unknown} val
 * @param {unknown} fallback
 */
function parseJson(val, fallback) {
  if (val == null) return fallback
  if (typeof val === 'string') {
    try {
      return JSON.parse(val)
    } catch {
      return fallback
    }
  }
  return val
}

/** Scripted charts: the server runs the script at this element index of the saved dashboard. */
const SCRIPTED_ELEMENT_TYPES = new Set([30, 31, 33])

/**
 * @param {object} obj
 * @returns {{ id: number, name: string, cols: number, rowHeight: number,
 *             scrollable: boolean, displayPriority: number, showAsObjectView: boolean,
 *             showContextSelector: boolean, forcedContextObjectId: number,
 *             objectContextFlagsSupported: boolean, widgets: Array }}
 */
export function adaptApiDashboard(obj) {
  const cols = obj.numColumns || 4
  const elements = obj.elements ?? []

  const parsed = elements.map((element, idx) => {
    const layout = parseJson(element.layout, {}) ?? {}
    const data = parseJson(element.data, {}) ?? {}
    const def = getTypeDefByApi(element.type)

    const config = def.fromApi(data)
    if (SCRIPTED_ELEMENT_TYPES.has(element.type)) {
      config.dashboardId = obj.id
      config.elementIndex = idx
    }
    // Embedded dashboard: needs its own id to detect embedding cycles.
    if (element.type === 7) {
      config.dashboardId = obj.id
    }

    return {
      id: element.guid ?? `el-${idx}-${element.type}`,
      type: def === UNKNOWN_TYPE_DEF ? 'unknown' : def.key,
      apiType: element.type,
      w: Math.min(layout.horizontalSpan || 1, cols),
      h: layout.verticalSpan || 1,
      config,
      raw: { data, layout },
    }
  })

  const hasExplicitGrid =
    parsed.length > 0 &&
    parsed.every((w) => w.raw.layout.gridX != null && w.raw.layout.gridY != null)

  let x = 0
  let y = 0
  let rowMaxH = 0

  const widgets = parsed.map((widget) => {
    if (hasExplicitGrid) {
      return {
        ...widget,
        x: Math.min(Number(widget.raw.layout.gridX) || 0, cols - 1),
        y: Number(widget.raw.layout.gridY) || 0,
      }
    }
    if (x + widget.w > cols) {
      y += rowMaxH || 1
      x = 0
      rowMaxH = 0
    }
    const placed = { ...widget, x, y }
    x += widget.w
    rowMaxH = Math.max(rowMaxH, widget.h)
    return placed
  })

  return {
    id: obj.id,
    name: obj.name,
    cols,
    rowHeight: obj.rowHeight ?? 80,
    scrollable: obj.scrollable ?? false,
    // Older servers do not send the object-context flags at all.
    displayPriority: obj.displayPriority ?? 0,
    showAsObjectView: obj.showAsObjectView === true,
    showContextSelector: obj.showContextSelector === true,
    forcedContextObjectId: obj.forcedContextObjectId ?? 0,
    objectContextFlagsSupported: 'showAsObjectView' in obj,
    widgets,
  }
}

/**
 * Elements are ordered by (y, x), the closest flow-order equivalent of the grid.
 *
 * @param {object} dashboard - { id, name?, cols, rowHeight?, scrollable?, widgets }
 * @returns {object} API-shaped dashboard { id, name?, numColumns, elements, ... }
 */
export function serializeDashboard(dashboard) {
  const widgets = [...(dashboard.widgets ?? [])].sort((a, b) => a.y - b.y || a.x - b.x)

  const result = {
    id: dashboard.id,
    numColumns: dashboard.cols ?? 4,
    rowHeight: dashboard.rowHeight ?? 80,
    scrollable: dashboard.scrollable ?? false,
    elements: widgets.map((w) => ({
      guid: String(w.id),
      type: w.apiType ?? getTypeDef(w.type).apiType,
      data: widgetDataToApi(w),
      layout: {
        ...w.raw?.layout,
        horizontalSpan: w.w,
        verticalSpan: w.h,
        gridX: w.x,
        gridY: w.y,
      },
    })),
  }
  if (dashboard.name != null) result.name = dashboard.name
  if (dashboard.aiHint != null) result.aiHint = dashboard.aiHint
  if (dashboard.displayPriority != null) result.displayPriority = dashboard.displayPriority
  return result
}

function widgetDataToApi(widget) {
  const def = widget.type === 'unknown' ? UNKNOWN_TYPE_DEF : getTypeDef(widget.type)
  const original = widget.raw?.data ?? {}
  return { ...original, ...def.toApi(widget.config ?? {}, original) }
}

/**
 * @param {object} widget
 * @param {object} payload
 * @param {object} [payload.config] - full new config
 * @param {object} [payload.rawData] - full replacement data JSON; config is re-derived from it
 * @param {object} [payload.layout] - fields to merge into raw.layout
 * @returns {object}
 */
export function updateWidgetConfig(widget, { config, rawData, layout }) {
  const def = widget.type === 'unknown' ? UNKNOWN_TYPE_DEF : getTypeDef(widget.type)
  const mergedLayout = layout ? { ...widget.raw?.layout, ...layout } : (widget.raw?.layout ?? {})

  let nextConfig
  let nextData
  if (rawData) {
    nextData = { ...rawData }
    nextConfig = def.fromApi(nextData)
  } else {
    nextConfig = config ?? widget.config
    nextData = { ...widget.raw?.data, ...def.toApi(nextConfig, widget.raw?.data ?? {}) }
  }

  // Keep the execution context scripted charts get at load time.
  if (widget.config?.dashboardId != null && nextConfig.dashboardId == null) {
    nextConfig.dashboardId = widget.config.dashboardId
    nextConfig.elementIndex = widget.config.elementIndex
  }

  return { ...widget, config: nextConfig, raw: { data: nextData, layout: mergedLayout } }
}

/**
 * @param {string} type - registry key
 * @param {number} [y=0]
 * @returns {object}
 */
export function createWidget(type, y = 0) {
  const def = getTypeDef(type)
  if (def === UNKNOWN_TYPE_DEF) throw new Error(`Unknown widget type: ${type}`)
  const data = structuredClone(def.defaultData ?? {})
  return {
    id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    apiType: def.apiType,
    x: 0,
    y,
    w: def.defaultSize.w,
    h: def.defaultSize.h,
    config: def.fromApi(data),
    raw: { data, layout: {} },
  }
}
