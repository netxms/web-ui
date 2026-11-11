// Route location builders: a left click, a ctrl/middle click and a copied link all land on the
// same place. Pure: they return locations and never navigate.

/** Anything not listed routes to Infrastructure. */
const PERSPECTIVE_BY_CLASS = {
  Template: 'templates',
  TemplateGroup: 'templates',
  TemplateRoot: 'templates',
  Asset: 'assets',
  AssetGroup: 'assets',
  AssetRoot: 'assets',
  BusinessService: 'business-services',
  BusinessServicePrototype: 'business-services',
  BusinessServiceRoot: 'business-services',
  Dashboard: 'dashboards',
  DashboardGroup: 'dashboards',
  DashboardRoot: 'dashboards',
  NetworkMap: 'network-maps',
  NetworkMapGroup: 'network-maps',
  NetworkMapRoot: 'network-maps',
}

/** Perspectives whose route names their object param something other than `objectId`. */
const ID_PARAM_BY_PERSPECTIVE = {
  dashboards: 'dashboardId',
  'network-maps': 'mapId',
}

/**
 * @param {string} objectClass
 * @returns {string} route name
 */
export function perspectiveForClass(objectClass) {
  return PERSPECTIVE_BY_CLASS[objectClass] ?? 'infrastructure'
}

/**
 * Dashboards and network maps take a single id param, so `viewId` and `entityId` are ignored
 * for them.
 *
 * @param {{ id: number|string, class?: string }} object
 * @param {string} [viewId] - view tab id (e.g. 'status', 'alarms', 'tool:12')
 * @param {object} [options]
 * @param {string} [options.entityId] - third path segment (e.g. a poll type, a DCI id)
 * @param {object} [options.query]
 * @param {string} [options.perspective] - override the class-derived perspective
 * @returns {import('vue-router').RouteLocationRaw}
 */
export function objectTarget(object, viewId, { entityId, query, perspective } = {}) {
  const name = perspective ?? perspectiveForClass(object?.class)
  const idParam = ID_PARAM_BY_PERSPECTIVE[name]

  if (idParam) {
    return { name, params: { [idParam]: object?.id }, ...(query ? { query } : {}) }
  }

  return {
    name,
    params: {
      objectId: object?.id,
      ...(viewId ? { viewId } : {}),
      ...(entityId ? { entityId } : {}),
    },
    ...(query ? { query } : {}),
  }
}

/** Query flag the Floor Plan view takes as "start in edit mode", then drops from the URL. */
export const FLOOR_PLAN_EDIT_QUERY = 'edit'

/**
 * A room's floor plan opened in edit mode, where a new room goes to get its shape.
 *
 * @param {{ id: number|string, class?: string }} room
 * @param {object} [options]
 * @param {string} [options.perspective]
 */
export function floorPlanEditTarget(room, { perspective } = {}) {
  return objectTarget(room, 'floorPlan', { perspective, query: { [FLOOR_PLAN_EDIT_QUERY]: '1' } })
}

const OBJECT_PERSPECTIVES = new Set([
  'infrastructure',
  ...Object.values(PERSPECTIVE_BY_CLASS),
])

/**
 * The inverse of `objectTarget`. Only object perspectives count: an alarm or incident id is not
 * an object id.
 *
 * @param {import('vue-router').RouteLocationNormalizedLoaded} route
 * @returns {number|null}
 */
export function objectIdFromRoute(route) {
  if (!OBJECT_PERSPECTIVES.has(route?.name)) return null
  const id = Number(route.params?.[ID_PARAM_BY_PERSPECTIVE[route.name] ?? 'objectId'])
  return Number.isInteger(id) && id > 0 ? id : null
}

/**
 * The Data Collection tab is `dcis` in Infrastructure but `dataCollection` in Templates.
 *
 * @param {{ id: number|string, class?: string }} object - the DCI's owner
 * @param {number|string} dciId
 * @returns {import('vue-router').RouteLocationRaw}
 */
export function dciTarget(object, dciId) {
  const viewId = perspectiveForClass(object?.class) === 'templates' ? 'dataCollection' : 'dcis'
  return objectTarget(object, viewId, { entityId: String(dciId) })
}

/** @param {string} name - route name, e.g. 'infrastructure' */
export function perspectiveTarget(name) {
  return { name }
}

/** Omit the id for the perspective. */
export function mapTarget(id) {
  return { name: 'network-maps', params: id != null ? { mapId: id } : {} }
}

/** Omit the id for the perspective. */
export function dashboardTarget(id) {
  return { name: 'dashboards', params: id != null ? { dashboardId: id } : {} }
}

/**
 * Omit the tab for the default (the chat). An incident opens the chat bound to it, as legacy
 * "Discuss with AI" does.
 *
 * @param {'chat'|'observations'|'messages'} [tab]
 * @param {{ incidentId?: number|string }} [options]
 */
export function aiTarget(tab, { incidentId } = {}) {
  return {
    name: 'ai',
    params: tab ? { tab } : {},
    ...(incidentId != null ? { query: { incident: String(incidentId) } } : {}),
  }
}

/** Omit the id for the alarm list. */
export function alarmTarget(id) {
  return { name: 'alarms', params: id != null ? { alarmId: id } : {} }
}

/** Omit the id for the incident list. */
export function incidentTarget(id) {
  return { name: 'incidents', params: id != null ? { incidentId: id } : {} }
}

/**
 * Omit the name for the log catalog.
 *
 * @param {string} [logName] - as returned by `GET /v1/logs`
 * @param {object} [query] - serialized query model (see utils/logQueryModel)
 */
export function logTarget(logName, query) {
  return {
    name: logName ? 'log' : 'logs',
    ...(logName ? { params: { logName } } : {}),
    ...(query && Object.keys(query).length > 0 ? { query } : {}),
  }
}

export function preferencesTarget() {
  return { name: 'preferences' }
}

/**
 * Omit the id for the tool catalog.
 *
 * @param {string} [toolId] - id from views/tools/toolRegistry
 * @param {object} [query] - tool-specific state
 */
export function toolTarget(toolId, query) {
  return {
    name: toolId ? 'tool' : 'tools',
    ...(toolId ? { params: { toolId } } : {}),
    ...(query && Object.keys(query).length > 0 ? { query } : {}),
  }
}

/**
 * Omit the address for the empty search form.
 *
 * @param {string} [macAddress] - normalized address or prefix, as sent to the API
 */
export function macSearchTarget(macAddress) {
  return toolTarget('mac-search', macAddress ? { mac: macAddress } : undefined)
}

/**
 * Omit everything for the empty form; `text` alone runs a normal-mode search across every class.
 *
 * @param {object} [query] - serialized filter form (see utils/objectQueryModel)
 */
export function objectQueryTarget(query) {
  return toolTarget('object-query', query)
}

/**
 * @param {string} sectionId
 * @param {object} [options]
 * @param {string|number} [options.entityId]
 * @param {string} [options.tab] - carried as `?tab=`
 */
export function configTarget(sectionId, { entityId, tab } = {}) {
  return {
    name: 'configuration',
    params: { sectionId, ...(entityId != null ? { entityId } : {}) },
    ...(tab ? { query: { tab } } : {}),
  }
}

/**
 * Chain scope rides in the query so the section's `:entityId?` rule detail keeps working; the
 * main chain (id 0) is the bare section URL.
 *
 * @param {number} chainId - 0 for the main chain
 * @param {object} [options]
 * @param {string} [options.ruleGuid]
 */
export function eppChainTarget(chainId, { ruleGuid } = {}) {
  return {
    name: 'configuration',
    params: { sectionId: 'epp', ...(ruleGuid != null ? { entityId: ruleGuid } : {}) },
    ...(chainId ? { query: { chain: String(chainId) } } : {}),
  }
}
