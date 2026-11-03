/**
 * Lossless network map adapters: raw NetworkMapContent <-> internal map format. Every element
 * and link keeps its untouched API JSON in `raw` and the map its settings in `rawContent`, so a
 * save round-trips everything the UI does not model; only edited fields are merged back.
 *
 * No app dependencies (theme/store imports): the live parity test imports it in plain node.
 */

import { bgrIntToHex, safeBgrIntToHex, hexToBgrInt } from '@/utils/colorUtils'

export { bgrIntToHex, safeBgrIntToHex, hexToBgrInt }

export const MAP_LINK_COLOR_SOURCES = {
  DEFAULT: 0,
  OBJECT_STATUS: 1,
  CUSTOM: 2,
  SCRIPT: 3,
  LINK_UTILIZATION: 4,
  INTERFACE_STATUS: 5,
}

// NetworkMapLink flag bits
export const LINK_FLAG_AUTO_GENERATED = 0x1
export const LINK_FLAG_EXCLUDE_FROM_AUTO_UPDATE = 0x2

// A null UUID means no background image, the all-ones UUID the geographic map, anything else an
// image-library image.
export const MAP_BACKGROUND_NONE = '00000000-0000-0000-0000-000000000000'
export const MAP_BACKGROUND_GEOMAP = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

/** MF_* map flag bits (server netxms_maps.h). */
export const MAP_FLAGS = {
  SHOW_STATUS_ICON: 0x000001,
  SHOW_STATUS_FRAME: 0x000002,
  SHOW_STATUS_BKGND: 0x000004,
  SHOW_END_NODES: 0x000008,
  CALCULATE_STATUS: 0x000010,
  FILTER_OBJECTS: 0x000020,
  SHOW_LINK_DIRECTION: 0x000040,
  USE_L1_TOPOLOGY: 0x000080,
  CENTER_BKGND_IMAGE: 0x000100,
  TRANSLUCENT_LABEL_BKGND: 0x000200,
  DONT_UPDATE_LINK_TEXT: 0x000400,
  FIT_BKGND_IMAGE: 0x000800,
  FIT_TO_SCREEN: 0x001000,
  SHOW_AS_OBJECT_VIEW: 0x002000,
  SHOW_TRAFFIC: 0x004000,
  SHOW_WIFI_CLIENTS: 0x008000,
}

/**
 * MF_* bit -> JSON boolean key (server s_mapFlagMapping[]). Current servers send `flags` as an
 * object of booleans, older ones as a raw integer; parseMapFlags() reads either.
 */
export const MAP_FLAG_JSON_KEYS = {
  [MAP_FLAGS.SHOW_STATUS_ICON]: 'showStatusIcon',
  [MAP_FLAGS.SHOW_STATUS_FRAME]: 'showStatusFrame',
  [MAP_FLAGS.SHOW_STATUS_BKGND]: 'showStatusBackground',
  [MAP_FLAGS.SHOW_END_NODES]: 'showEndNodes',
  [MAP_FLAGS.CALCULATE_STATUS]: 'calculateStatus',
  [MAP_FLAGS.FILTER_OBJECTS]: 'filterObjects',
  [MAP_FLAGS.SHOW_LINK_DIRECTION]: 'showLinkDirection',
  [MAP_FLAGS.USE_L1_TOPOLOGY]: 'useL1Topology',
  [MAP_FLAGS.CENTER_BKGND_IMAGE]: 'centerBackgroundImage',
  [MAP_FLAGS.TRANSLUCENT_LABEL_BKGND]: 'translucentLabelBackground',
  [MAP_FLAGS.DONT_UPDATE_LINK_TEXT]: 'dontUpdateLinkText',
  [MAP_FLAGS.FIT_BKGND_IMAGE]: 'fitBackgroundImage',
  [MAP_FLAGS.FIT_TO_SCREEN]: 'fitToScreen',
  [MAP_FLAGS.SHOW_AS_OBJECT_VIEW]: 'showAsObjectView',
  [MAP_FLAGS.SHOW_TRAFFIC]: 'showTraffic',
  [MAP_FLAGS.SHOW_WIFI_CLIENTS]: 'showWifiClients',
}

/**
 * @param {object | number | null | undefined} value
 * @returns {number}
 */
export function parseMapFlags(value) {
  if (typeof value === 'number') return value
  if (value == null || typeof value !== 'object') return 0
  let flags = 0
  for (const [bit, key] of Object.entries(MAP_FLAG_JSON_KEYS)) {
    if (value[key] === true) flags |= Number(bit)
  }
  return flags
}

/**
 * Every modeled bit is emitted; the server applies PATCH semantics, so unmodeled bits are left
 * untouched. Old servers ignore the key.
 * @param {number} flags
 * @returns {Record<string, boolean>}
 */
export function serializeMapFlags(flags) {
  const out = {}
  const bits = flags ?? 0
  for (const [bit, key] of Object.entries(MAP_FLAG_JSON_KEYS)) {
    out[key] = (bits & Number(bit)) !== 0
  }
  return out
}

// MAP_ELEMENT_* type codes
const ELEMENT_TYPE_KEYS = {
  0: 'generic',
  1: 'object',
  2: 'decoration',
  3: 'dci-container',
  4: 'dci-image',
  5: 'text-box',
}

/**
 * Map-level settings (server s_mapContentKeys, minus elements/links). Both spellings of the
 * default link width are listed: the server renamed "defaultLinkWidht", and only keys present in
 * the response are copied, so a round trip echoes whichever one the server used.
 */
export const MAP_CONTENT_SETTING_KEYS = [
  'mapType',
  'layout',
  'flags',
  'seedObjects',
  'discoveryRadius',
  'defaultLinkColor',
  'defaultLinkColorSource',
  'defaultLinkRouting',
  'defaultLinkWidht',
  'defaultLinkWidth',
  'defaultLinkStyle',
  'objectDisplayMode',
  'backgroundColor',
  'background',
  'backgroundLatitude',
  'backgroundLongitude',
  'backgroundZoom',
  'filter',
  'linkScript',
  'width',
  'height',
  'canvasType',
  'initialViewMode',
  'displayPriority',
  'linkMergeThreshold',
]

/** {} on empty or malformed input, as legacy does. */
function parseJsonSafe(str) {
  if (!str) return {}
  try {
    return JSON.parse(str)
  } catch {
    return {}
  }
}

// Legacy new-element defaults
// EditGroupBoxDialog.DEFAULT_COLOR = RGB(64,105,156) as a NetXMS BGR int.
const GROUP_BOX_DEFAULT_COLOR_INT = hexToBgrInt('#40699c')
// NetworkMapTextBox(long id) constructor defaults.
const TEXT_BOX_DEFAULTS = {
  text: '',
  backgroundColor: 2147483647, // Integer.MAX_VALUE ("white")
  textColor: 0,
  borderColor: 0,
  fontSize: 10,
  drillDownObjectId: 0,
  borderRequired: true,
}
// NetworkMapDCIContainer / DciContainerConfiguration constructor defaults.
const DCI_CONTAINER_DEFAULTS = {
  backgroundColor: 0xffffff,
  textColor: 0x202020,
  borderColor: 0x202020,
  borderRequired: false,
}

/**
 * Every element type is kept, so a save cannot destroy content the UI does not render.
 * objectName/objectClass/objectStatus are filled in later by adaptApiNetworkMap.
 * @param {object} raw
 * @returns {object}
 */
function adaptApiElement(raw) {
  const type = ELEMENT_TYPE_KEYS[raw.type] ?? 'unknown'
  const base = {
    id: `e-${raw.id}`,
    type,
    apiType: raw.type ?? 0,
    x: raw.posX ?? 0,
    y: raw.posY ?? 0,
    raw,
  }
  if (type === 'object') {
    return {
      ...base,
      objectId: raw.objectId,
      objectName: '',
      objectClass: 'Node',
      objectStatus: 5, // Unknown until resolved
      objectIpAddress: null,
      objectMacAddress: null,
      // What the icon is drawn from (see @/utils/objectIcons); display only, never serialized.
      objectCategory: 0,
      objectMapImage: null,
      objectCapabilities: null,
      // Null when the object has no location; the geographical canvas draws only elements with one.
      geolocation: null,
      // Only the floor-plan display mode uses the persisted size; 100x100 is the server default.
      width: raw.width ?? 100,
      height: raw.height ?? 100,
    }
  }
  if (type === 'decoration') {
    // MAP_DECORATION_GROUP_BOX = 0, MAP_DECORATION_IMAGE = 1. Image decorations carry the
    // image-library UUID in `title`.
    const isImage = raw.decorationType === 1
    return {
      ...base,
      decorationType: isImage ? 'image' : 'group-box',
      label: isImage ? '' : (raw.title ?? ''),
      ...(isImage ? { imageGuid: raw.title ?? '' } : {}),
      width: raw.width ?? 120,
      height: raw.height ?? 60,
      style: { color: raw.color != null ? bgrIntToHex(raw.color) : '#94a3b8', opacity: 0.08 },
    }
  }
  if (type === 'text-box') {
    const cfg = parseJsonSafe(raw.config)
    return {
      ...base,
      text: cfg.text ?? '',
      backgroundColor: bgrIntToHex(cfg.backgroundColor ?? TEXT_BOX_DEFAULTS.backgroundColor),
      textColor: bgrIntToHex(cfg.textColor ?? TEXT_BOX_DEFAULTS.textColor),
      borderColor: bgrIntToHex(cfg.borderColor ?? TEXT_BOX_DEFAULTS.borderColor),
      fontSize: cfg.fontSize ?? TEXT_BOX_DEFAULTS.fontSize,
      borderRequired: cfg.borderRequired ?? TEXT_BOX_DEFAULTS.borderRequired,
      drillDownObjectId: cfg.drillDownObjectId ?? TEXT_BOX_DEFAULTS.drillDownObjectId,
    }
  }
  if (type === 'dci-container') {
    const cfg = parseJsonSafe(raw.dciList)
    return {
      ...base,
      dciList: Array.isArray(cfg.dciList) ? cfg.dciList.map((d) => ({ ...d })) : [],
      backgroundColor: bgrIntToHex(cfg.backgroundColor ?? DCI_CONTAINER_DEFAULTS.backgroundColor),
      textColor: bgrIntToHex(cfg.textColor ?? DCI_CONTAINER_DEFAULTS.textColor),
      borderColor: bgrIntToHex(cfg.borderColor ?? DCI_CONTAINER_DEFAULTS.borderColor),
      borderRequired: cfg.borderRequired ?? DCI_CONTAINER_DEFAULTS.borderRequired,
    }
  }
  if (type === 'dci-image') {
    const cfg = parseJsonSafe(raw.dciList)
    return {
      ...base,
      dciRuleList: Array.isArray(cfg.dciRuleList) ? cfg.dciRuleList.map((r) => ({ ...r })) : [],
      dci: cfg.dci ? { ...cfg.dci } : null,
      defaultImage: cfg.defaultImage ?? null,
    }
  }
  return base
}

/**
 * @param {object} raw
 * @returns {{ color: 'default' | 'custom' | 'status', customColor: string | null }}
 */
function deriveLinkColorFields(raw) {
  // The server evaluates a SCRIPT color source and delivers the result in `color`.
  if (
    raw.colorSource === MAP_LINK_COLOR_SOURCES.CUSTOM ||
    raw.colorSource === MAP_LINK_COLOR_SOURCES.SCRIPT
  ) {
    return { color: 'custom', customColor: safeBgrIntToHex(raw.color) }
  }
  if (
    raw.colorSource === MAP_LINK_COLOR_SOURCES.OBJECT_STATUS ||
    raw.colorSource === MAP_LINK_COLOR_SOURCES.INTERFACE_STATUS ||
    raw.colorSource === MAP_LINK_COLOR_SOURCES.LINK_UTILIZATION
  ) {
    return { color: 'status', customColor: null }
  }
  return { color: 'default', customColor: null }
}

/**
 * Endpoint interfaces plus the OBJECT_STATUS source list.
 * @param {object} raw - raw API link
 * @returns {number[]}
 */
export function linkStatusObjectIds(raw) {
  const cfg = parseJsonSafe(raw.config)
  const ids = [raw.interface1, raw.interface2]
  if (Array.isArray(cfg.objectStatusList)) ids.push(...cfg.objectStatusList)
  return ids.filter((id) => typeof id === 'number' && id > 0)
}

/**
 * Object elements plus each link's status sources, deduplicated. Separate from
 * adaptApiNetworkMap because the ids are known before the objects they name resolve.
 *
 * @param {object} apiMap - raw response from GET /v1/objects/{mapId}
 * @returns {number[]}
 */
export function networkMapObjectIds(apiMap) {
  const elementIds = (apiMap?.elements ?? [])
    .filter((e) => e.type === 1) // MAP_ELEMENT_OBJECT only
    .map((e) => e.objectId)
    .filter((oid) => typeof oid === 'number' && oid > 0)
  const linkIds = (apiMap?.links ?? []).flatMap(linkStatusObjectIds)
  return [...new Set([...elementIds, ...linkIds])]
}

/**
 * Unresolvable ids are dropped so resolveLinkColor() can tell "no data" from "status unknown".
 * @param {number[]} interfaceIds
 * @param {number[]} objectIds
 * @param {Map<number, object>} objectsById
 */
function resolveLinkStatusSources(interfaceIds, objectIds, objectsById) {
  const pick = (id) => {
    const obj = objectsById?.get(id)
    if (!obj) return null
    return {
      id,
      name: obj.name ?? '',
      status: obj.status ?? null,
      utilization: obj.outboundUtilization ?? null,
    }
  }
  return {
    interfaces: interfaceIds.map(pick).filter(Boolean),
    objects: objectIds.map(pick).filter(Boolean),
  }
}

/**
 * Legacy flat [x1,y1,x2,y2,...], with 0x7FFFFFFF as an "unset" sentinel.
 * @param {number[] | undefined} flat
 * @returns {{ x: number, y: number }[]}
 */
function parseBendPoints(flat) {
  if (!Array.isArray(flat)) return []
  const points = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    if (flat[i] === 0x7fffffff || flat[i + 1] === 0x7fffffff) break
    points.push({ x: flat[i], y: flat[i + 1] })
  }
  return points
}

/**
 * [latitude, longitude] pairs, used instead of `bendPoints` on the geographical canvas.
 * @param {number[][] | undefined} pairs
 * @returns {{ lat: number, lng: number }[]}
 */
function parseGeoBendPoints(pairs) {
  if (!Array.isArray(pairs)) return []
  const points = []
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length < 2) continue
    if (!Number.isFinite(pair[0]) || !Number.isFinite(pair[1])) continue
    points.push({ lat: pair[0], lng: pair[1] })
  }
  return points
}

/**
 * GeoLocation type 0 is UNSET.
 * @param {{ type?: number, latitude?: number, longitude?: number } | null} geo
 * @returns {{ lat: number, lng: number } | null}
 */
function adaptGeoLocation(geo) {
  if (!geo || !geo.type) return null
  if (!Number.isFinite(geo.latitude) || !Number.isFinite(geo.longitude)) return null
  return { lat: geo.latitude, lng: geo.longitude }
}

/**
 * @param {{ x: number, y: number }[]} points
 * @returns {number[]}
 */
function bendPointsToFlat(points) {
  const flat = []
  if (!Array.isArray(points)) return flat
  for (const p of points) flat.push(Math.round(p.x), Math.round(p.y))
  return flat
}

/**
 * Dangling links (endpoint element missing) are kept with from/to = null so they survive a save.
 * @param {object} raw
 * @param {number} idx - stable synthetic id (the WebAPI does not expose link ids)
 * @param {Map<number, string>} elementIdMap - raw numeric element id -> internal string id
 * @param {Map<number, object>} [objectsById]
 * @returns {object}
 */
function adaptApiLink(raw, idx, elementIdMap, objectsById) {
  const from = elementIdMap.get(raw.element1) ?? null
  const to = elementIdMap.get(raw.element2) ?? null
  const cfg = parseJsonSafe(raw.config)
  const objectStatusList = Array.isArray(cfg.objectStatusList) ? [...cfg.objectStatusList] : []
  const statusSources = resolveLinkStatusSources(
    [raw.interface1, raw.interface2].filter((id) => typeof id === 'number' && id > 0),
    objectStatusList,
    objectsById,
  )

  // Legacy getConnectorName(): an empty connector name falls back to the interface name.
  const interfaceName = (id) => statusSources.interfaces.find((i) => i.id === id)?.name ?? ''

  return {
    id: `l-${idx}`,
    from,
    to,
    type: raw.type ?? 0,
    label: raw.name || null,
    connectorName1: raw.connectorName1 ?? '',
    connectorName2: raw.connectorName2 ?? '',
    // Render-only, so the interface-name fallback is never written back on save.
    connectorLabel1: raw.connectorName1 || interfaceName(raw.interface1),
    connectorLabel2: raw.connectorName2 || interfaceName(raw.interface2),
    interface1: raw.interface1 ?? 0,
    interface2: raw.interface2 ?? 0,
    colorSource: raw.colorSource ?? MAP_LINK_COLOR_SOURCES.DEFAULT,
    colorProvider: raw.colorProvider ?? '',
    ...deriveLinkColorFields(raw),
    excludeFromAutoUpdate: ((raw.flags ?? 0) & LINK_FLAG_EXCLUDE_FROM_AUTO_UPDATE) !== 0,
    routing: cfg.routing ?? 0, // 0 map default / 1 direct / 2 manhattan / 3 bend points
    style: cfg.style ?? 0, // 0 map default / 1 solid / 2 dash / 3 dot / 4 dashdot / 5 dashdotdot
    width: cfg.width ?? 0, // 0 = map default
    labelPosition: cfg.labelPosition ?? 50,
    useActiveThresholds: cfg.useActiveThresholds ?? false,
    useInterfaceUtilization: cfg.useInterfaceUtilization ?? false,
    objectStatusList,
    dciList: Array.isArray(cfg.dciList) ? cfg.dciList.map((d) => ({ ...d })) : [],
    bendPoints: parseBendPoints(cfg.bendPoints),
    geoBendPoints: parseGeoBendPoints(cfg.geoBendPoints),
    // Resolved here so resolveLinkColor() stays a pure function of the link.
    statusSources,
    dciData: null, // not in the map object; heatmap works for demo maps only
    raw,
  }
}

/**
 * Text boxes, DCI containers/images, generic elements and image decorations are preserved but
 * not rendered yet; dciData is always null.
 *
 * @param {object} apiMap - raw response from GET /v1/objects/{mapId}
 * @param {Map<number, object>} objectsById - adaptObject output, as `useObjectsByIds` resolves
 *   it: `ipAddress` stays the raw `{ address }` document. Missing ids degrade to defaults.
 * @returns {object} internal map format
 */
export function adaptApiNetworkMap(apiMap, objectsById) {
  const rawElements = apiMap.elements ?? []
  const rawLinks = apiMap.links ?? []

  const elements = rawElements.map(adaptApiElement)

  for (const elem of elements) {
    if (elem.type !== 'object') continue
    const obj = objectsById.get(elem.objectId)
    if (obj) {
      elem.objectName = obj.name ?? ''
      elem.objectClass = obj.class ?? 'Node'
      elem.objectStatus = obj.status ?? 5
      // The server omits `address` for AF_UNSPEC, and exposes no primary MAC for nodes, so only
      // interfaces get a MAC here.
      elem.objectIpAddress = obj.ipAddress?.address ?? null
      elem.objectMacAddress = obj.macAddress ?? null
      elem.objectCategory = obj.category ?? 0
      elem.objectMapImage = obj.mapImage ?? null
      elem.objectCapabilities = obj.capabilities ?? null
      elem.geolocation = adaptGeoLocation(obj.geoLocation)
    }
  }

  const elementIdMap = new Map(rawElements.map((e) => [e.id, `e-${e.id}`]))

  const links = rawLinks.map((l, i) => adaptApiLink(l, i, elementIdMap, objectsById))

  const bgColor = safeBgrIntToHex(apiMap.backgroundColor)
  // null lets getCanvasBackground() fall back to the theme's surface colour.
  const background = bgColor ? { type: 'color', color: bgColor } : null

  const rawContent = {}
  for (const key of MAP_CONTENT_SETTING_KEYS) {
    if (apiMap[key] !== undefined) rawContent[key] = apiMap[key]
  }

  return {
    id: apiMap.id,
    name: apiMap.name ?? '',
    mapType: apiMap.mapType ?? 0,
    // Read-side view; writes go through rawContent.flags.
    flags: parseMapFlags(apiMap.flags),
    background,
    elements,
    links,
    rawContent,
  }
}

function elementNumericId(el) {
  if (typeof el.raw?.id === 'number') return el.raw.id
  const match = /^e-(\d+)$/.exec(String(el.id))
  return match ? Number(match[1]) : 0
}

/**
 * Payload for PUT /v1/objects/{id}/map: `raw` merged with pending positions. `elements` and
 * `links` are always both present: the server clears links when elements come without them.
 *
 * @param {object} map - internal map format (from adaptApiNetworkMap)
 * @param {Map<string, {x: number, y: number}>} [positionOverrides] - by internal element id
 * @returns {object}
 */
export function serializeNetworkMapContent(map, positionOverrides) {
  const elements = (map.elements ?? []).map((el) => {
    const raw = el.raw ?? {}
    const pos = positionOverrides?.get(el.id)
    const out = {
      ...raw,
      id: elementNumericId(el),
      type: el.apiType ?? raw.type ?? 0,
      posX: Math.round(pos?.x ?? el.x ?? 0),
      posY: Math.round(pos?.y ?? el.y ?? 0),
    }
    // The PUT handler parses legacy config keys that differ from what GET emits; write both.
    if (out.type === 5 && out.config != null) out.TextBox = out.config
    if ((out.type === 3 || out.type === 4) && out.dciList != null) out.DCIList = out.dciList
    return out
  })

  const links = (map.links ?? []).map((l) => ({ ...l.raw }))

  const content = { ...map.rawContent, elements, links }
  // GET emits null for unset scripts, but PUT requires strings (empty stores as unset).
  if (content.filter === null) content.filter = ''
  if (content.linkScript === null) content.linkScript = ''
  return content
}

// New elements carry a fully-formed `raw`, and edits are merged into `raw` here, so the serializer
// stays a pure passthrough.

/**
 * max(existing numeric id) + 1, as legacy NetworkMapPage.createElementId does.
 * @param {object} map - internal map format
 * @returns {number}
 */
export function nextElementId(map) {
  let max = 0
  for (const el of map.elements ?? []) {
    const n = elementNumericId(el)
    if (n > max) max = n
  }
  return max + 1
}

/** objectName/class/status are display-only, re-resolved from the server after save. */
export function createObjectElement({
  id,
  objectId,
  objectName = '',
  objectClass = 'Node',
  objectStatus = 5,
  objectCategory = 0,
  x = 0,
  y = 0,
}) {
  const raw = {
    id,
    type: 1,
    posX: Math.round(x),
    posY: Math.round(y),
    flags: 0,
    objectId,
    width: 100,
    height: 100,
  }
  const el = adaptApiElement(raw)
  el.objectName = objectName ?? ''
  el.objectClass = objectClass ?? 'Node'
  el.objectStatus = objectStatus ?? 5
  el.objectCategory = objectCategory ?? 0
  return el
}

/** Legacy EditGroupBoxDialog defaults. */
export function createGroupBoxElement({ id, x = 0, y = 0 }) {
  const raw = {
    id,
    type: 2,
    posX: Math.round(x),
    posY: Math.round(y),
    flags: 0,
    decorationType: 0,
    color: GROUP_BOX_DEFAULT_COLOR_INT,
    title: '',
    width: 250,
    height: 100,
  }
  return adaptApiElement(raw)
}

export function createTextBoxElement({ id, x = 0, y = 0 }) {
  const raw = {
    id,
    type: 5,
    posX: Math.round(x),
    posY: Math.round(y),
    flags: 0,
    config: JSON.stringify(TEXT_BOX_DEFAULTS),
  }
  return adaptApiElement(raw)
}

export function createDciContainerElement({ id, x = 0, y = 0 }) {
  const raw = {
    id,
    type: 3,
    posX: Math.round(x),
    posY: Math.round(y),
    flags: 0,
    dciList: JSON.stringify({
      dciList: [],
      backgroundColor: DCI_CONTAINER_DEFAULTS.backgroundColor,
      textColor: DCI_CONTAINER_DEFAULTS.textColor,
      borderColor: DCI_CONTAINER_DEFAULTS.borderColor,
      borderRequired: DCI_CONTAINER_DEFAULTS.borderRequired,
    }),
  }
  return adaptApiElement(raw)
}

export function createDciImageElement({ id, x = 0, y = 0 }) {
  const raw = {
    id,
    type: 4,
    posX: Math.round(x),
    posY: Math.round(y),
    flags: 0,
    dciList: JSON.stringify({ dciRuleList: [], dci: null, defaultImage: null }),
  }
  return adaptApiElement(raw)
}

function mergeGeometry(next, patch) {
  if (patch.x !== undefined) {
    next.x = Math.round(patch.x)
    next.raw.posX = next.x
  }
  if (patch.y !== undefined) {
    next.y = Math.round(patch.y)
    next.raw.posY = next.y
  }
  if (patch.width !== undefined) {
    next.width = Math.round(patch.width)
    next.raw.width = next.width
  }
  if (patch.height !== undefined) {
    next.height = Math.round(patch.height)
    next.raw.height = next.height
  }
}

/** Only geometry is editable; size matters only in floor-plan display mode. */
export function mergeObjectEdit(el, patch) {
  const next = { ...el, raw: { ...el.raw } }
  mergeGeometry(next, patch)
  return next
}

/** Recognized keys: x, y, width, height, label, color (hex), imageGuid. */
export function mergeDecorationEdit(el, patch) {
  const next = { ...el, raw: { ...el.raw }, style: { ...el.style } }
  mergeGeometry(next, patch)
  if (patch.label !== undefined) {
    next.label = patch.label
    next.raw.title = patch.label
  }
  if (patch.color !== undefined) {
    next.style.color = patch.color
    next.raw.color = hexToBgrInt(patch.color)
  }
  if (patch.imageGuid !== undefined) {
    next.imageGuid = patch.imageGuid
    next.raw.title = patch.imageGuid
  }
  return next
}

export function mergeTextBoxEdit(el, patch) {
  const next = { ...el, raw: { ...el.raw } }
  mergeGeometry(next, patch)
  for (const f of [
    'text',
    'fontSize',
    'borderRequired',
    'drillDownObjectId',
    'backgroundColor',
    'textColor',
    'borderColor',
  ]) {
    if (patch[f] !== undefined) next[f] = patch[f]
  }
  next.raw.config = JSON.stringify({
    text: next.text ?? '',
    backgroundColor: hexToBgrInt(next.backgroundColor ?? '#ffffff'),
    textColor: hexToBgrInt(next.textColor ?? '#000000'),
    borderColor: hexToBgrInt(next.borderColor ?? '#000000'),
    fontSize: next.fontSize ?? TEXT_BOX_DEFAULTS.fontSize,
    drillDownObjectId: next.drillDownObjectId ?? 0,
    borderRequired: next.borderRequired ?? true,
  })
  return next
}

export function mergeDciContainerEdit(el, patch) {
  const next = { ...el, raw: { ...el.raw } }
  mergeGeometry(next, patch)
  if (patch.dciList !== undefined) next.dciList = patch.dciList.map((d) => ({ ...d }))
  for (const f of ['backgroundColor', 'textColor', 'borderColor', 'borderRequired']) {
    if (patch[f] !== undefined) next[f] = patch[f]
  }
  next.raw.dciList = JSON.stringify({
    dciList: (next.dciList ?? []).map((d) => ({ ...d })),
    backgroundColor: hexToBgrInt(next.backgroundColor ?? '#ffffff'),
    textColor: hexToBgrInt(next.textColor ?? '#202020'),
    borderColor: hexToBgrInt(next.borderColor ?? '#202020'),
    borderRequired: next.borderRequired ?? false,
  })
  return next
}

export function mergeDciImageEdit(el, patch) {
  const next = { ...el, raw: { ...el.raw } }
  mergeGeometry(next, patch)
  if (patch.dciRuleList !== undefined) next.dciRuleList = patch.dciRuleList.map((r) => ({ ...r }))
  if (patch.dci !== undefined) next.dci = patch.dci ? { ...patch.dci } : null
  if (patch.defaultImage !== undefined) next.defaultImage = patch.defaultImage
  next.raw.dciList = JSON.stringify({
    dciRuleList: (next.dciRuleList ?? []).map((r) => ({ ...r })),
    dci: next.dci ? { ...next.dci } : null,
    defaultImage: next.defaultImage ?? null,
  })
  return next
}

/**
 * As the legacy "Link selected objects" action: type NORMAL, default colour source, empty config.
 * @param {object} params
 * @param {string} params.id - session-local; the WebAPI has no link ids
 * @param {object} params.fromElement
 * @param {object} params.toElement
 * @returns {object} internal link
 */
export function createMapLink({ id, fromElement, toElement }) {
  const e1 = elementNumericId(fromElement)
  const e2 = elementNumericId(toElement)
  // Key order matches NetworkMapLink::toJson so new links diff cleanly against GET output.
  const raw = {
    element1: e1,
    element2: e2,
    interface1: 0,
    interface2: 0,
    type: 0,
    name: '',
    connectorName1: '',
    connectorName2: '',
    flags: 0,
    colorSource: MAP_LINK_COLOR_SOURCES.DEFAULT,
    color: 0,
    colorProvider: '',
    config: '',
  }
  const link = adaptApiLink(
    raw,
    0,
    new Map([
      [e1, fromElement.id],
      [e2, toElement.id],
    ]),
  )
  link.id = id
  return link
}

// Stored inside the raw.config JSON string (legacy LinkConfig)
const LINK_CONFIG_KEYS = [
  'routing',
  'style',
  'width',
  'labelPosition',
  'useActiveThresholds',
  'useInterfaceUtilization',
  'objectStatusList',
  'dciList',
]

/**
 * LinkConfig keys regenerate raw.config, preserving unmodeled config keys such as bendPoints.
 * @returns {object} internal link
 */
export function mergeLinkEdit(link, patch) {
  const next = { ...link, raw: { ...link.raw } }

  if (patch.label !== undefined) {
    next.label = patch.label || null
    next.raw.name = patch.label ?? ''
  }
  for (const f of ['connectorName1', 'connectorName2', 'colorProvider']) {
    if (patch[f] !== undefined) {
      next[f] = patch[f] ?? ''
      next.raw[f] = next[f]
    }
  }
  for (const f of ['interface1', 'interface2']) {
    if (patch[f] !== undefined) {
      next[f] = patch[f] ?? 0
      next.raw[f] = next[f]
    }
  }
  if (patch.colorSource !== undefined) {
    next.colorSource = patch.colorSource
    next.raw.colorSource = patch.colorSource
  }
  if (patch.customColor !== undefined) {
    next.raw.color = patch.customColor != null ? hexToBgrInt(patch.customColor) : 0
  }
  if (patch.excludeFromAutoUpdate !== undefined) {
    next.excludeFromAutoUpdate = !!patch.excludeFromAutoUpdate
    const flags = next.raw.flags ?? 0
    next.raw.flags = patch.excludeFromAutoUpdate
      ? flags | LINK_FLAG_EXCLUDE_FROM_AUTO_UPDATE
      : flags & ~LINK_FLAG_EXCLUDE_FROM_AUTO_UPDATE
  }

  const hasConfigEdit =
    LINK_CONFIG_KEYS.some((k) => patch[k] !== undefined) || patch.bendPoints !== undefined
  if (hasConfigEdit) {
    const cfg = parseJsonSafe(next.raw.config)
    for (const k of LINK_CONFIG_KEYS) {
      if (patch[k] === undefined) continue
      next[k] = patch[k]
      cfg[k] = patch[k]
    }
    if (patch.bendPoints !== undefined) {
      const pts = Array.isArray(patch.bendPoints) ? patch.bendPoints : []
      next.bendPoints = pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
      cfg.bendPoints = bendPointsToFlat(next.bendPoints)
    }
    next.raw.config = JSON.stringify(cfg)
  }

  Object.assign(next, deriveLinkColorFields(next.raw))
  return next
}

// Fields the server compares when it keeps its own ("system") traffic sources current, with the
// value an absent field means.
const LINK_DATA_SOURCE_COMPARED_FIELDS = {
  nodeId: 0,
  dciId: 0,
  instance: '',
  column: '',
  formatString: '',
  location: 'CENTER',
  direction: 'NONE',
}

/**
 * A server-managed source the user changes becomes the user's, as legacy DataSourceEditDlg does;
 * otherwise the server's next link update puts its own back.
 * @param {object} entry - MapLinkDataSource
 * @param {object} patch
 * @returns {object}
 */
export function editLinkDataSource(entry, patch) {
  const next = { ...entry, ...patch }
  const changed = Object.entries(LINK_DATA_SOURCE_COMPARED_FIELDS).some(
    ([key, absent]) => (next[key] ?? absent) !== (entry[key] ?? absent),
  )
  if (entry.system && changed) next.system = false
  return next
}
