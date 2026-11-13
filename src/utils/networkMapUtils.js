import {
  getStatusHexColor,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  getDciCollectionErrorInfo,
} from './objectUtils'
import {
  safeBgrIntToHex,
  parseMapFlags,
  MAP_FLAGS,
  MAP_LINK_COLOR_SOURCES,
  MAP_BACKGROUND_NONE,
  MAP_BACKGROUND_GEOMAP,
} from './networkMapAdapters'
import { displayDciValue } from './dciFormat'
import { dciSourceKey } from './dciValues'
import { useTheme } from '@/composables/useTheme'

// Reactive: computeds calling getCanvasBackground() re-run when the theme toggles.
const { isDark } = useTheme()

export const MAP_TYPE_LABELS = {
  0: 'Custom',
  1: 'Layer 2 Topology',
  2: 'IP Topology',
  3: 'Internal Communication',
  4: 'OSPF Topology',
  5: 'Hybrid Topology',
  10: 'Geographic',
}

export const MAP_TYPE_GEO = 10

// Manually authored, no seed objects / topology discovery.
export const MAP_TYPE_CUSTOM = 0

// Index-aligned with the server enum values.
// MapCanvasType: GRAPH(0), GEOGRAPHICAL(1)
export const MAP_CANVAS_TYPE_LABELS = ['Graph', 'Geographical']
// MapObjectDisplayMode: ICON(0), SMALL_LABEL(1), LARGE_LABEL(2), STATUS(3), FLOOR_PLAN(4)
export const MAP_OBJECT_DISPLAY_MODE_LABELS = [
  'Icons',
  'Small labels',
  'Large labels',
  'Status icons',
  'Floor plan',
]
// MapInitialViewMode: FIT_TO_SCREEN(0), ZOOM_AND_CENTER(1)
export const MAP_INITIAL_VIEW_MODE_LABELS = ['Fit to screen', 'Zoom and center']
// Background geo-position fields apply.
export const MAP_CANVAS_TYPE_GEOGRAPHICAL = 1

export const MAP_INITIAL_VIEW_FIT_TO_SCREEN = 0
export const MAP_INITIAL_VIEW_ZOOM_AND_CENTER = 1

// Legacy fallback when the map has no stored backgroundZoom.
const DEFAULT_GEO_CANVAS_ZOOM = 3

/**
 * Mirrors AbstractNetworkMapView.isGeographicalCanvas(). `rawContent` is read first so the
 * properties panel's live preview flips the canvas before saving; MAP_TYPE_GEO covers the geo
 * demo map, which has no rawContent.
 *
 * @param {object | null | undefined} mapData - internal map format
 * @returns {boolean}
 */
export function isGeographicalCanvas(mapData) {
  if (!mapData) return false
  if (mapData.mapType === MAP_TYPE_GEO) return true
  const canvasType = mapData.rawContent?.canvasType ?? mapData.canvasType
  return canvasType === MAP_CANVAS_TYPE_GEOGRAPHICAL
}

/**
 * Legacy requestInitialView() / createGeoContent(): FIT_TO_SCREEN frames the placed objects,
 * ZOOM_AND_CENTER uses the stored centre and zoom.
 *
 * @param {object | null | undefined} mapData - internal map format
 * @returns {{ mode: number, lat: number, lon: number, zoom: number }}
 */
export function mapInitialView(mapData) {
  const raw = mapData?.rawContent
  const zoom = Number(raw?.backgroundZoom)
  return {
    mode: raw?.initialViewMode ?? MAP_INITIAL_VIEW_FIT_TO_SCREEN,
    lat: Number(raw?.backgroundLatitude) || 0,
    lon: Number(raw?.backgroundLongitude) || 0,
    zoom: Number.isFinite(zoom) && zoom > 0 ? Math.floor(zoom) : DEFAULT_GEO_CANVAS_ZOOM,
  }
}

/**
 * Object elements without a location (or unresolved), for the legacy "N nodes hidden (no
 * location)" notice.
 *
 * @param {object | null | undefined} mapData - internal map format
 * @returns {number}
 */
export function countUnplacedObjects(mapData) {
  let count = 0
  for (const el of mapData?.elements ?? []) {
    if (el.type === 'object' && !el.geolocation) count++
  }
  return count
}

export { MAP_FLAGS }

// MF_* flag checkboxes, grouped by the property section each lives in (as the legacy MapOptions
// page). `iconOnly`: the legacy client greys these out unless the display mode is Icons. `hint`:
// persisted but not rendered by this UI.

/** Options -> "Object display options". */
export const MAP_OBJECT_DISPLAY_FLAGS = [
  { bit: MAP_FLAGS.SHOW_STATUS_ICON, label: 'Show status icon', iconOnly: true },
  { bit: MAP_FLAGS.SHOW_STATUS_FRAME, label: 'Show status frame', iconOnly: true },
  { bit: MAP_FLAGS.SHOW_STATUS_BKGND, label: 'Show status background', iconOnly: true },
  { bit: MAP_FLAGS.TRANSLUCENT_LABEL_BKGND, label: 'Translucent label background' },
]

/** Options -> "Topology options" (topology maps only). */
export const MAP_TOPOLOGY_FLAGS = [
  { bit: MAP_FLAGS.SHOW_END_NODES, label: 'Include end nodes' },
  { bit: MAP_FLAGS.USE_L1_TOPOLOGY, label: 'Use physical link information' },
  { bit: MAP_FLAGS.SHOW_WIFI_CLIENTS, label: 'Include WiFi clients' },
]

/** Links -> "Link options". */
export const MAP_LINK_FLAGS = [
  { bit: MAP_FLAGS.SHOW_LINK_DIRECTION, label: 'Show link direction' },
  { bit: MAP_FLAGS.SHOW_TRAFFIC, label: 'Display traffic data' },
  { bit: MAP_FLAGS.DONT_UPDATE_LINK_TEXT, label: 'Disable link texts update' },
]

/** Advanced (legacy "Advanced options" group). */
export const MAP_ADVANCED_FLAGS = [
  { bit: MAP_FLAGS.CALCULATE_STATUS, label: 'Calculate map status from contained objects' },
  {
    bit: MAP_FLAGS.FIT_TO_SCREEN,
    label: 'Fit map to screen',
    hint: 'Saved for the desktop client — this canvas always fills the available space.',
  },
]

// Background-image placement is one Fit-mode choice written as MF_* bits.
export const MAP_BACKGROUND_FIT_MODES = {
  NATIVE: 'native',
  CENTER: 'center',
  FIT: 'fit',
}

export function backgroundFitModeFromFlags(flags) {
  if (hasMapFlag(flags, MAP_FLAGS.FIT_BKGND_IMAGE)) return MAP_BACKGROUND_FIT_MODES.FIT
  if (hasMapFlag(flags, MAP_FLAGS.CENTER_BKGND_IMAGE)) return MAP_BACKGROUND_FIT_MODES.CENTER
  return MAP_BACKGROUND_FIT_MODES.NATIVE
}

/** Native clears both placement bits (native size, at the origin). */
export function flagsWithBackgroundFitMode(flags, mode) {
  let next = (flags ?? 0) & ~MAP_FLAGS.FIT_BKGND_IMAGE & ~MAP_FLAGS.CENTER_BKGND_IMAGE
  if (mode === MAP_BACKGROUND_FIT_MODES.FIT) next |= MAP_FLAGS.FIT_BKGND_IMAGE
  else if (mode === MAP_BACKGROUND_FIT_MODES.CENTER) next |= MAP_FLAGS.CENTER_BKGND_IMAGE
  return next
}

export function hasMapFlag(flags, bit) {
  return ((flags ?? 0) & bit) !== 0
}

/**
 * For maps that carry none (demo maps); 0 would switch status colouring off. Matches the legacy
 * NetMap.Show* preference defaults.
 */
export const DEFAULT_MAP_FLAGS =
  MAP_FLAGS.SHOW_STATUS_ICON |
  MAP_FLAGS.SHOW_STATUS_FRAME |
  MAP_FLAGS.SHOW_STATUS_BKGND |
  MAP_FLAGS.TRANSLUCENT_LABEL_BKGND

/**
 * rawContent is read first: it is the properties editor's working copy, so flag edits show live.
 *
 * @param {object | null | undefined} mapData - internal map (from adaptApiNetworkMap)
 * @returns {{
 *   flags: number, displayMode: number, showStatusIcon: boolean,
 *   showStatusFrame: boolean, showStatusBackground: boolean,
 *   showLinkDirection: boolean, translucentLabelBackground: boolean,
 * }}
 */
export function resolveMapRenderOptions(mapData) {
  const rawContent = mapData?.rawContent
  // `flags: 0` is a legitimate "everything off" value.
  const flags =
    rawContent?.flags !== undefined
      ? parseMapFlags(rawContent.flags)
      : (mapData?.flags ?? DEFAULT_MAP_FLAGS)
  return {
    flags,
    displayMode: rawContent?.objectDisplayMode ?? mapData?.objectDisplayMode ?? 0,
    showStatusIcon: hasMapFlag(flags, MAP_FLAGS.SHOW_STATUS_ICON),
    showStatusFrame: hasMapFlag(flags, MAP_FLAGS.SHOW_STATUS_FRAME),
    showStatusBackground: hasMapFlag(flags, MAP_FLAGS.SHOW_STATUS_BKGND),
    showLinkDirection: hasMapFlag(flags, MAP_FLAGS.SHOW_LINK_DIRECTION),
    translucentLabelBackground: hasMapFlag(flags, MAP_FLAGS.TRANSLUCENT_LABEL_BKGND),
  }
}

export const LINK_TYPES = {
  NORMAL: 0,
  VPN: 1,
  MULTILINK: 2,
  AGENT_TUNNEL: 3,
  AGENT_PROXY: 4,
  SSH_PROXY: 5,
  SNMP_PROXY: 6,
}

const LINK_TYPE_COLORS = {
  [LINK_TYPES.AGENT_TUNNEL]: '#ef4444',
  [LINK_TYPES.AGENT_PROXY]: '#22c55e',
  [LINK_TYPES.SSH_PROXY]: '#06b6d4',
  [LINK_TYPES.SNMP_PROXY]: '#eab308',
}

const LINK_TYPE_DASH = {
  [LINK_TYPES.VPN]: '8 4',
  [LINK_TYPES.MULTILINK]: '0',
}

export const DEFAULT_LINK_COLOR = '#94a3b8'

/**
 * Type/custom-colour heuristics only; resolveLinkColor() falls back here.
 * @param {object} link
 * @returns {string} hex color
 */
export function getLinkColor(link) {
  if (link.color === 'custom' && link.customColor) return link.customColor
  return LINK_TYPE_COLORS[link.type] ?? DEFAULT_LINK_COLOR
}

// Port of legacy LinkStylingHelper.resolveLinkColor.

// UNKNOWN and above (UNMANAGED, DISABLED, TESTING) never win a most-critical comparison.
const STATUS_CRITICAL = 4
const STATUS_UNKNOWN = 5

/**
 * @param {(number | null | undefined)[]} statuses
 * @returns {number | null}
 */
function mostCriticalStatus(statuses) {
  let best = null
  for (const s of statuses) {
    if (s == null || s >= STATUS_UNKNOWN) continue
    if (best === null || s > best) best = s
    if (best === STATUS_CRITICAL) break
  }
  return best
}

/**
 * Legacy LinkTooltip.calculateLinkStatus: the most critical of the object-status-list objects,
 * else of the endpoint interfaces.
 * @param {object} link - internal link (statusSources from adaptApiLink)
 * @returns {number | null}
 */
export function linkStatus(link) {
  const { interfaces = [], objects = [] } = link.statusSources ?? {}
  return (
    mostCriticalStatus(objects.map((o) => o?.status)) ??
    mostCriticalStatus(interfaces.map((i) => i?.status))
  )
}

// Legacy LinkStylingHelper.LINK_UTILIZATION_THRESHOLDS / COLOR_LINK_UTILIZATION; tenths of a
// percent (1000 = 100%).
const LINK_UTILIZATION_THRESHOLDS = [10, 100, 250, 400, 550, 700, 850, 1000]
const LINK_UTILIZATION_COLORS = [
  '#c0c0c0', // 0%
  '#7630fa', // 1-9%
  '#0039fa', // 10-24%
  '#19bcfc', // 25-39%
  '#40e92d', // 40-54%
  '#f1e930', // 55-69%
  '#feb427', // 70-84%
  '#f90010', // 85-100%
]

/**
 * @param {number} utilization - tenths of a percent
 * @returns {string} hex color
 */
export function getLinkUtilizationColor(utilization) {
  let index = 0
  const last = LINK_UTILIZATION_COLORS.length - 1
  while (utilization >= LINK_UTILIZATION_THRESHOLDS[index] && ++index < last);
  return LINK_UTILIZATION_COLORS[index]
}

function maxInterfaceUtilization(interfaces) {
  let max = null
  for (const iface of interfaces ?? []) {
    const u = iface?.utilization
    // The server reports -1 for "never measured".
    if (typeof u !== 'number' || u < 0) continue
    if (max === null || u > max) max = u
  }
  return max
}

/**
 * Null when the configured source has no data (e.g. interface objects could not be fetched), so
 * callers can fall back. `link.statusSources` is resolved by adaptApiLink, keeping this pure.
 *
 * @param {object} link - internal link (from adaptApiNetworkMap)
 * @param {object} [mapContent] - map.rawContent (defaultLinkColor/ColorSource)
 * @returns {string | null}
 */
export function resolveLinkColor(link, mapContent) {
  const source = link.colorSource ?? MAP_LINK_COLOR_SOURCES.DEFAULT
  const { interfaces = [], objects = [] } = link.statusSources ?? {}

  switch (source) {
    // The server evaluates the script and delivers its result in `color`.
    case MAP_LINK_COLOR_SOURCES.CUSTOM:
    case MAP_LINK_COLOR_SOURCES.SCRIPT:
      return link.customColor ?? null

    case MAP_LINK_COLOR_SOURCES.INTERFACE_STATUS: {
      const status = mostCriticalStatus(interfaces.map((i) => i?.status))
      return status === null ? null : getStatusHexColor(status)
    }

    case MAP_LINK_COLOR_SOURCES.LINK_UTILIZATION: {
      const util = maxInterfaceUtilization(interfaces)
      return util === null ? null : getLinkUtilizationColor(util)
    }

    case MAP_LINK_COLOR_SOURCES.OBJECT_STATUS: {
      const status = mostCriticalStatus(objects.map((o) => o?.status))
      // Utilization only substitutes while the link is not already critical.
      if (link.useInterfaceUtilization && status !== STATUS_CRITICAL) {
        const util = maxInterfaceUtilization([...interfaces, ...objects])
        if (util !== null) return getLinkUtilizationColor(util)
      }
      return status === null ? null : getStatusHexColor(status)
    }

    default: {
      // The map may itself delegate to interface status/utilization.
      const mapSource = mapContent?.defaultLinkColorSource
      if (
        mapSource === MAP_LINK_COLOR_SOURCES.INTERFACE_STATUS ||
        mapSource === MAP_LINK_COLOR_SOURCES.LINK_UTILIZATION
      ) {
        return resolveLinkColor({ ...link, colorSource: mapSource }, null)
      }
      if (LINK_TYPE_COLORS[link.type]) return LINK_TYPE_COLORS[link.type]
      return safeBgrIntToHex(mapContent?.defaultLinkColor ?? null)
    }
  }
}

/**
 * @param {object} link
 * @returns {string}
 */
export function getLinkDash(link) {
  return LINK_TYPE_DASH[link.type] ?? '0'
}

/**
 * @param {object} link
 * @returns {number}
 */
export function getLinkWidth(link) {
  return link.type === LINK_TYPES.MULTILINK ? 4 : 2
}

// Legacy LinkConfig style/width/colour with map-level defaults, resolved into render values.

/** SWT LINE_* style code -> SVG stroke-dasharray ('0' meaning solid). */
const LINK_STYLE_DASH = {
  1: '0',
  2: '8 4',
  3: '2 3',
  4: '8 3 2 3',
  5: '8 3 2 3 2 3',
}

const LINK_ROUTING_LABELS = ['Map default', 'Direct', 'Manhattan', 'Bend points']
export const LINK_STYLE_LABELS = ['Map default', 'Solid', 'Dash', 'Dot', 'Dashdot', 'Dashdotdot']

// Manhattan has no orthogonal auto-routing yet and draws straight.
const LINK_ROUTING_IN_DEVELOPMENT = new Set([2])

/** @returns {{ label: string, value: number }[]} */
export function buildRoutingOptions() {
  return LINK_ROUTING_LABELS.map((label, value) => ({
    label: LINK_ROUTING_IN_DEVELOPMENT.has(value) ? `${label} (in development)` : label,
    value,
  }))
}

/**
 * The canvases bake these into edge data, so a change needs an element rebuild. Normalized:
 * a no-op preview patch writes both width spellings and fills nullish fields with 0, which a
 * key-by-key diff would see as a change.
 * @param {object | null | undefined} mapData
 * @returns {number[]}
 */
function normalizedLinkDefaults(mapData) {
  const r = mapData?.rawContent ?? {}
  return [
    r.defaultLinkStyle ?? 0,
    r.defaultLinkWidth ?? r.defaultLinkWidht ?? 0,
    r.defaultLinkColor ?? 0,
    r.defaultLinkColorSource ?? 0,
  ]
}

/**
 * @param {object | null | undefined} a
 * @param {object | null | undefined} b
 * @returns {boolean}
 */
export function linkDefaultsChanged(a, b) {
  const na = normalizedLinkDefaults(a)
  const nb = normalizedLinkDefaults(b)
  return na.some((v, i) => v !== nb[i])
}

/**
 * Null where unresolved; the canvas then falls back to the type-based heuristics.
 * @param {object} link - internal link (from adaptApiNetworkMap)
 * @param {object} [mapContent] - map.rawContent (defaultLinkStyle/Width/Color)
 * @returns {{ dash: string | null, width: number | null, color: string | null }}
 */
export function resolveLinkVisual(link, mapContent) {
  const styleCode = link.style > 0 ? link.style : (mapContent?.defaultLinkStyle ?? 0)
  const dash = LINK_STYLE_DASH[styleCode] ?? null

  // Older servers spell the key "defaultLinkWidht".
  const defaultWidth = mapContent?.defaultLinkWidth ?? mapContent?.defaultLinkWidht ?? 0
  const width = link.width > 0 ? link.width : defaultWidth || null

  return { dash, width, color: resolveLinkColor(link, mapContent) }
}

/**
 * Cytoscape `segments` geometry: a weight (fraction along source->target) and a perpendicular
 * distance per point. The sign follows cytoscape's normal `{ x: -dy/l, y: dx/l }`; the opposite
 * cross-product order mirrors every bend. The caller must set `edge-distances: node-position`,
 * since this measures from node centres.
 *
 * @param {{x: number, y: number}[]} points - absolute bend points
 * @param {{x: number, y: number}} source - source node center
 * @param {{x: number, y: number}} target - target node center
 * @returns {{ weights: number[], distances: number[] } | null} null when there are no points or
 *   the endpoints coincide
 */
export function bendPointsToSegments(points, source, target) {
  if (!points?.length) return null
  const dx = target.x - source.x
  const dy = target.y - source.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1) return null
  const len = Math.sqrt(len2)
  const weights = []
  const distances = []
  for (const p of points) {
    const vx = p.x - source.x
    const vy = p.y - source.y
    weights.push((vx * dx + vy * dy) / len2)
    distances.push((vy * dx - vx * dy) / len)
  }
  return { weights, distances }
}

// Port of legacy MultiLabelConnectionLocator placement and LinkDciValueProvider formatting.

/** LinkDataLocation enum as serialized by the server. */
export const LINK_DATA_LOCATIONS = ['CENTER', 'OBJECT1', 'OBJECT2']

/**
 * Legacy splits the line into 11 segments [1][OBJECT1:3][CENTER:3][OBJECT2:3][1] and places each
 * label within its part at `labelPosition` percent.
 *
 * @param {'CENTER'|'OBJECT1'|'OBJECT2'} location
 * @param {number} [labelPosition] 0-100
 * @returns {number} 0-1
 */
export function linkLabelFraction(location, labelPosition = 50) {
  const segment = 1 / 11
  const partStart = { OBJECT1: 1, CENTER: 4, OBJECT2: 7 }[location] ?? 4
  const clamped = Math.min(100, Math.max(0, labelPosition))
  return segment * partStart + segment * 3 * (clamped / 100)
}

/**
 * Falls back to the reason-specific error marker when collection failed (legacy
 * LinkDciValueProvider).
 *
 * @param {object | undefined} dciValue - DCIValue, as `useMapDciValues` returns it
 * @param {string} [formatString] - empty for the default
 * @returns {string}
 */
export function formatMapDciValue(dciValue, formatString) {
  if (!dciValue) return '...'
  if (dciValue.errorCount > 0) return getDciCollectionErrorInfo(dciValue.lastCollectionError).text
  return displayDciValue(dciValue, formatString)
}

/**
 * LinkDataDirection (Gson enum names); FORWARD runs from element 1 to element 2.
 * @param {unknown} direction
 * @returns {'NONE'|'FORWARD'|'REVERSE'}
 */
export function linkDataDirection(direction) {
  return direction === 'FORWARD' || direction === 'REVERSE' ? direction : 'NONE'
}

/**
 * Labelled with the element names, like legacy DataSourceEditDlg.
 * @param {string} [name1] - element 1 (link source) name
 * @param {string} [name2] - element 2 (link target) name
 * @returns {{ label: string, value: 'NONE'|'FORWARD'|'REVERSE' }[]}
 */
export function linkDirectionOptions(name1, name2) {
  const a = name1 || 'Element 1'
  const b = name2 || 'Element 2'
  return [
    { label: 'No direction', value: 'NONE' },
    { label: `${a} \u2192 ${b}`, value: 'FORWARD' },
    { label: `${b} \u2192 ${a}`, value: 'REVERSE' },
  ]
}

/**
 * One line per DCI at that location, in dciList order; a line is a list of
 * `{ text, direction }` segments (legacy LinkLabelLine). Empty values are skipped, as legacy
 * LinkDciValueProvider.getDciData does.
 * @param {object} link - internal link
 * @param {'CENTER'|'OBJECT1'|'OBJECT2'} location
 * @param {Map<string, object>} valuesByDci - keyed by `dciSourceKey`
 * @returns {{ text: string, direction: 'NONE'|'FORWARD'|'REVERSE' }[][]}
 */
export function linkDciLines(link, location, valuesByDci) {
  const lines = []
  for (const dci of link.dciList ?? []) {
    // An absent location means CENTER (the enum's zero value).
    if ((dci.location ?? 'CENTER') !== location) continue
    const value = valuesByDci?.get(dciSourceKey(dci))
    const text = formatMapDciValue(value, dci.formatString)
    if (!text) continue
    lines.push([{ text, direction: linkDataDirection(dci.direction) }])
  }
  return lines
}

/**
 * Legacy DCIContainerFigure shows "No value" when the text comes out empty.
 *
 * @param {object} element - internal 'dci-container' element
 * @param {Map<string, object>} valuesByDci - keyed by `dciSourceKey`
 * @returns {string[]}
 */
export function dciContainerLines(element, valuesByDci) {
  const lines = []
  for (const dci of element.dciList ?? []) {
    const value = valuesByDci?.get(dciSourceKey(dci))
    lines.push(formatMapDciValue(value, dci.formatString))
  }
  return lines.length ? lines : ['No value']
}

/**
 * @param {string} hex1
 * @param {string} hex2
 * @param {number} t  0.0 -> hex1, 1.0 -> hex2
 * @returns {string}
 */
function interpolateHex(hex1, hex2, t) {
  const parse = (h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
  const [r1, g1, b1] = parse(hex1)
  const [r2, g2, b2] = parse(hex2)
  return (
    '#' +
    [r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]
      .map((c) => Math.round(c).toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * Green to yellow up to 50%, to orange up to 80%, to red at 100%.
 * @param {number} rawValue
 * @param {number} maxValue
 * @returns {string} hex color
 */
export function getHeatmapColor(rawValue, maxValue) {
  if (!maxValue || maxValue <= 0) return '#22c55e'
  const pct = Math.min(1, Math.max(0, rawValue / maxValue))
  if (pct <= 0.5) return interpolateHex('#22c55e', '#eab308', pct / 0.5)
  if (pct <= 0.8) return interpolateHex('#eab308', '#f97316', (pct - 0.5) / 0.3)
  return interpolateHex('#f97316', '#ef4444', (pct - 0.8) / 0.2)
}

/**
 * 2px at 0% to 6px at 100%.
 * @param {number} rawValue
 * @param {number} maxValue
 * @returns {number}
 */
export function getHeatmapWidth(rawValue, maxValue) {
  if (!maxValue || maxValue <= 0) return 2
  return 2 + Math.min(1, Math.max(0, rawValue / maxValue)) * 4
}

/**
 * @param {object[]} elements
 * @returns {object[]}
 */
export function getDecorations(elements) {
  return elements.filter((e) => e.type === 'decoration')
}

/**
 * Light colours (L > 50%) get their lightness inverted and clamped near the app's dark surface
 * tones; a background already set to something dark is left as configured.
 * @param {string} hex
 * @returns {string}
 */
function darkModeCanvasBackground(hex) {
  const { r, g, b } = hexToRgb(hex)
  const hsl = rgbToHsl(r, g, b)
  if (hsl.l <= 0.5) return hex
  const invertedL = Math.min(Math.max(1 - hsl.l, 0.08), 0.3)
  const rgb = hslToRgb(hsl.h, hsl.s, invertedL)
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

/**
 * @param {object} background
 * @returns {string}
 */
export function getCanvasBackground(background) {
  if (!background) return 'var(--p-surface-ground)'
  if (background.type === 'color') {
    return isDark.value ? darkModeCanvasBackground(background.color) : background.color
  }
  return 'var(--p-surface-ground)'
}

/** Used for a geographic backdrop when the map stores no size. */
export const DEFAULT_GEO_BACKDROP_PAGE = { w: 1024, h: 768 }

/** Highest zoom a geographic backdrop is drawn at. */
export const GEO_BACKDROP_MAX_ZOOM = 19

/** Smallest side, in map units, that dragging the backdrop page leaves. */
const MIN_BACKDROP_PAGE = 16

/**
 * The backdrop page after dragging its right edge (`e`), bottom edge (`s`) or corner (`se`) by
 * `dx`, `dy` map units. The top left corner is the map origin and stays. With `aspect` (width over
 * height) the corner keeps that shape, following whichever side the pointer pulls further.
 *
 * @param {{ w: number, h: number }} page
 * @param {'e'|'s'|'se'} handle
 * @param {number} dx
 * @param {number} dy
 * @param {{ aspect?: number|null }} [options]
 * @returns {{ width: number, height: number }}
 */
export function resizeBackdropPage(page, handle, dx, dy, { aspect = null } = {}) {
  let width = handle.includes('e') ? page.w + dx : page.w
  let height = handle.includes('s') ? page.h + dy : page.h
  if (handle === 'se' && aspect > 0) {
    if (width / aspect >= height) height = width / aspect
    else width = height * aspect
  }
  return {
    width: Math.max(MIN_BACKDROP_PAGE, Math.round(width)),
    height: Math.max(MIN_BACKDROP_PAGE, Math.round(height)),
  }
}

/**
 * The background image, distinct from the colour (getCanvasBackground). `background` UUID:
 * null / MAP_BACKGROUND_NONE - none; MAP_BACKGROUND_GEOMAP - OSM tiles at
 * backgroundLat/Lon/Zoom; anything else - an image-library image. As in the legacy client, the
 * image occupies the page rectangle `[0,0, width,height]`; geo tiles fill it centred on the
 * stored coordinates.
 *
 * @param {object | null | undefined} mapData - internal map (from adaptApiNetworkMap)
 * @returns {{ type: 'none' }
 *   | { type: 'image', guid: string, mode: 'default'|'center'|'fit', page: { w: number, h: number } }
 *   | { type: 'geo', lat: number, lon: number, zoom: number, page: { w: number, h: number } }}
 */
export function resolveMapBackdrop(mapData) {
  const raw = mapData?.rawContent
  const guid = typeof raw?.background === 'string' ? raw.background.toLowerCase() : null
  if (!guid || guid === MAP_BACKGROUND_NONE) return { type: 'none' }

  const w = Number(raw.width) > 0 ? Number(raw.width) : 0
  const h = Number(raw.height) > 0 ? Number(raw.height) : 0

  if (guid === MAP_BACKGROUND_GEOMAP) {
    const zoom = Number(raw.backgroundZoom)
    return {
      type: 'geo',
      lat: Number(raw.backgroundLatitude) || 0,
      lon: Number(raw.backgroundLongitude) || 0,
      zoom: Number.isFinite(zoom)
        ? Math.min(GEO_BACKDROP_MAX_ZOOM, Math.max(0, Math.floor(zoom)))
        : 1,
      page: { w: w || DEFAULT_GEO_BACKDROP_PAGE.w, h: h || DEFAULT_GEO_BACKDROP_PAGE.h },
    }
  }

  // rawContent.flags is the edit-time working copy; fall back to the read-side bitmask.
  const flags = raw.flags !== undefined ? parseMapFlags(raw.flags) : (mapData?.flags ?? 0)
  const mode = hasMapFlag(flags, MAP_FLAGS.FIT_BKGND_IMAGE)
    ? 'fit'
    : hasMapFlag(flags, MAP_FLAGS.CENTER_BKGND_IMAGE)
      ? 'center'
      : 'default'
  // Original-case GUID, to match the image-library lookup key.
  return { type: 'image', guid: raw.background, mode, page: { w, h } }
}

/**
 * Grid pitch in graph coordinates. Snapping is to grid vertices, not cell centres as in the legacy
 * client, so elements of any size line up: node centres and decoration top-left corners land on
 * an intersection. 80 clears a node circle plus its pill label.
 */
export const GRID_SIZE = 80

/**
 * @param {number} value
 * @param {number} [gridSize]
 * @returns {number}
 */
export function snapCoord(value, gridSize = GRID_SIZE) {
  if (!Number.isFinite(value) || !gridSize) return value
  return Math.round(value / gridSize) * gridSize
}

/**
 * @param {{ x: number, y: number }} point
 * @param {number} [gridSize]
 * @returns {{ x: number, y: number }}
 */
export function snapPoint(point, gridSize = GRID_SIZE) {
  return { x: snapCoord(point.x, gridSize), y: snapCoord(point.y, gridSize) }
}

/**
 * @param {object | object[]} nodeOrNodes - a tree node (with .children) or an array of nodes
 * @returns {object[]}
 */
export function collectDescendantMaps(nodeOrNodes) {
  const nodes = Array.isArray(nodeOrNodes) ? nodeOrNodes : (nodeOrNodes?.children ?? [])
  const result = []
  for (const node of nodes) {
    if (node.class === 'NetworkMap') result.push(node)
    if (node.children?.length) result.push(...collectDescendantMaps(node.children))
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
    if (node.class === 'NetworkMapGroup') result.push(node)
    if (node.children?.length) result.push(...collectDescendantGroups(node.children))
  }
  return result
}

/** Served locally without API calls. */
export const MOCK_MAP_IDS = new Set([600, 601, 602, 603])
