/**
 * Object view registry: maps object classes to their views.
 *
 * A view entry is:
 *   { id, label, icon, objectClasses?: string[], objectFilter?: (object) => boolean,
 *     leading?: boolean }
 *
 * `leading` marks a class's own view (Rack, Floor Plan): it heads that class's tab bar, ahead of
 * the user's tab order, as legacy ranks these views before the object overview.
 *
 * `objectClasses` absent means every class. `objectFilter` needs the full object document,
 * which the object tree does not carry, so compatibility is three-valued (see
 * `getViewCompatibility`). A filter that needs more than the document returns null until it
 * can decide, and must read that data reactively.
 */
import { DCI_TARGET_CLASSES, TEMPLATE_APPLICABLE_CLASSES } from '@/utils/objectUtils'
import { moduleRegistry, MODULE_STATE } from '@/modules'

const DCI_CAPABLE_CLASSES = [...DCI_TARGET_CLASSES].filter((c) => c !== 'Template')

export const OBJECT_VIEW_GROUPS = {
  overview: {
    label: 'Overview',
    views: [
      { id: 'status', label: 'Status', icon: 'pi pi-info-circle' },
      { id: 'properties', label: 'Properties', icon: 'pi pi-cog' },
      { id: 'comments', label: 'Comments', icon: 'pi pi-comments' },
      {
        id: 'statusMap',
        label: 'Status Map',
        icon: 'pi pi-map',
        // Mirrors legacy StatusMapView.isValidForContext, which rejects `Network` too.
        objectClasses: [
          'Container',
          'Collector',
          'ServiceRoot',
          'Cluster',
          'Rack',
          'Chassis',
          'WirelessDomain',
        ],
      },
      {
        id: 'rack',
        label: 'Rack',
        icon: 'pi pi-server',
        objectClasses: ['Rack'],
        leading: true,
      },
      {
        id: 'chassis',
        label: 'Chassis',
        icon: 'pi pi-server',
        objectClasses: ['Chassis'],
      },
      {
        id: 'overview',
        label: 'Overview',
        icon: 'pi pi-gauge',
        objectClasses: ['Facility'],
        leading: true,
      },
      {
        id: 'floorPlan',
        label: 'Floor Plan',
        icon: 'pi pi-th-large',
        objectClasses: ['Room'],
        leading: true,
      },
      {
        id: 'power',
        label: 'Power',
        icon: 'pi pi-bolt',
        objectClasses: ['Facility', 'PowerDomain'],
        leading: true,
      },
      {
        id: 'cooling',
        label: 'Cooling',
        icon: 'pi pi-cloud',
        objectClasses: ['Facility', 'CoolingZone'],
        leading: true,
      },
    ],
  },
  monitoring: {
    label: 'Monitoring',
    views: [
      { id: 'alarms', label: 'Alarms', icon: 'pi pi-bell' },
      {
        id: 'dcis',
        label: 'Data Collection',
        icon: 'pi pi-chart-bar',
        objectClasses: DCI_CAPABLE_CLASSES,
      },
      {
        id: 'thresholds',
        label: 'Thresholds',
        icon: 'pi pi-sliders-h',
        objectClasses: DCI_CAPABLE_CLASSES,
      },
      {
        id: 'performance',
        label: 'Performance',
        icon: 'pi pi-chart-line',
        objectClasses: DCI_CAPABLE_CLASSES,
      },
      {
        id: 'summaryTables',
        label: 'Summary Tables',
        icon: 'pi pi-table',
        objectClasses: ['Container', 'Collector'],
      },
      // One tab for every object-context log; which logs apply is settled inside the view.
      { id: 'logs', label: 'Logs', icon: 'pi pi-list' },
    ],
  },
  network: {
    label: 'Network',
    views: [
      { id: 'interfaces', label: 'Interfaces', icon: 'pi pi-sitemap', objectClasses: ['Node'] },
      // A controller-only node gets no Radios: the server keeps radios only for a node that is
      // itself an access point.
      {
        id: 'radios',
        label: 'Radios',
        icon: 'pi pi-wave-pulse',
        objectClasses: ['Node', 'AccessPoint', 'WirelessDomain'],
        objectFilter: (obj) => obj?.class !== 'Node' || !!obj?.capabilities?.isWifiAp,
      },
      {
        id: 'wirelessStations',
        label: 'Wireless Stations',
        icon: 'pi pi-wifi',
        objectClasses: ['Node', 'AccessPoint', 'WirelessDomain'],
        objectFilter: (obj) =>
          obj?.class !== 'Node' ||
          !!(obj?.capabilities?.isWifiAp || obj?.capabilities?.isWifiController),
      },
      {
        id: 'ports',
        label: 'Ports',
        icon: 'pi pi-th-large',
        objectClasses: ['Node'],
        objectFilter: (obj) => !!obj?.capabilities?.isBridge,
      },
      {
        id: 'topology',
        label: 'Topology Map',
        icon: 'pi pi-share-alt',
        objectClasses: ['Node'],
      },
      // Mirrors legacy isValidForContext: collected only from nodes the server can talk to.
      {
        id: 'arpCache',
        label: 'ARP Cache',
        icon: 'pi pi-address-book',
        objectClasses: ['Node'],
        objectFilter: (obj) =>
          !!(
            obj?.capabilities?.isNativeAgent ||
            obj?.capabilities?.isSnmp ||
            obj?.capabilities?.isLocalMgmt
          ),
      },
      {
        id: 'routingTable',
        label: 'Routing Table',
        icon: 'pi pi-directions',
        objectClasses: ['Node'],
        objectFilter: (obj) => !!(obj?.capabilities?.isNativeAgent || obj?.capabilities?.isSnmp),
      },
      {
        id: 'fdb',
        label: 'FDB',
        icon: 'pi pi-table',
        objectClasses: ['Node'],
        objectFilter: (obj) => !!obj?.capabilities?.isBridge,
      },
    ],
  },
  configuration: {
    label: 'Configuration',
    views: [
      {
        id: 'policies',
        label: 'Policies',
        icon: 'pi pi-file-edit',
        objectClasses: ['Template'],
      },
      {
        id: 'templates',
        label: 'Templates',
        icon: 'pi pi-copy',
        objectClasses: TEMPLATE_APPLICABLE_CLASSES,
      },
      // Legacy also checks the DEVBACKUP component; the server sets NC_REGISTERED_FOR_BACKUP only
      // after a backup provider validates the registration, so the flag alone suffices.
      {
        id: 'configBackup',
        label: 'Configuration Backup',
        icon: 'pi pi-history',
        objectClasses: ['Node'],
        objectFilter: (obj) => !!obj?.capabilities?.registeredForBackup,
      },
    ],
  },
  tools: {
    label: 'Tools',
    views: [
      { id: 'script', label: 'Execute Script', icon: 'pi pi-code' },
      {
        id: 'polls',
        label: 'Polls',
        icon: 'pi pi-sync',
        objectClasses: ['Node', 'Container', 'Collector'],
      },
    ],
  },
}

/**
 * Rejects an unknown group or a reused core view id. Also run by every module's manifest spec.
 *
 * @param {Array<{ id: string, group: string, moduleId: string }>} views
 */
export function validateModuleViews(views) {
  const coreIds = new Set(
    Object.values(OBJECT_VIEW_GROUPS).flatMap((g) =>
      g.views.filter((v) => !v.moduleId).map((v) => v.id),
    ),
  )
  for (const view of views) {
    if (!OBJECT_VIEW_GROUPS[view.group]) {
      throw new Error(
        `Module "${view.moduleId}" view "${view.id}" names unknown group "${view.group}"`,
      )
    }
    if (coreIds.has(view.id)) {
      throw new Error(`Module "${view.moduleId}" view "${view.id}" reuses a core view id`)
    }
  }
}

validateModuleViews(moduleRegistry.objectViews)
for (const { group, ...view } of moduleRegistry.objectViews) {
  OBJECT_VIEW_GROUPS[group].views.push(view)
}

export const ALL_OBJECT_VIEWS = Object.values(OBJECT_VIEW_GROUPS).flatMap((g) => g.views)

/**
 * Ad-hoc views are opened on demand, per invocation (a tool run, a chart of selected DCIs).
 * Context views (`dashboard:<id>`, `map:<id>`) are per object. Neither is in the registry, the
 * visible-views preference, or the stored per-class active view.
 */
const AD_HOC_VIEW_PREFIXES = ['tool:', 'dashboard:', 'map:', 'ssh:']
const AD_HOC_VIEW_IDS = ['chart']

/**
 * @param {string} viewId
 * @param {string} viewId
 */
export function isAdHocViewId(viewId) {
  if (!viewId) return false
  return AD_HOC_VIEW_IDS.includes(viewId) || AD_HOC_VIEW_PREFIXES.some((p) => viewId.startsWith(p))
}

/** Legacy ObjectsPerspective.updateContextDashboardsAndMaps. */
export const CONTEXT_VIEW_CLASSES = new Set([
  'Node',
  'Cluster',
  'MobileDevice',
  'Sensor',
  'AccessPoint',
  'Chassis',
  'Circuit',
  'CloudDomain',
  'Collector',
  'Rack',
  'Container',
  'Network',
  'ServiceRoot',
  'Subnet',
  'Zone',
  'Condition',
])

const CONTEXT_VIEW_KINDS = {
  Dashboard: { prefix: 'dashboard:', kind: 'dashboard', icon: 'pi pi-th-large' },
  NetworkMap: { prefix: 'map:', kind: 'map', icon: 'pi pi-map' },
}

/** @returns {{ kind: 'dashboard'|'map', id: number } | null} */
export function parseContextViewId(viewId) {
  for (const { prefix, kind } of Object.values(CONTEXT_VIEW_KINDS)) {
    if (viewId?.startsWith(prefix)) {
      const id = Number(viewId.slice(prefix.length))
      return Number.isInteger(id) && id > 0 ? { kind, id } : null
    }
  }
  return null
}

/**
 * Sorted by display priority (0 = automatic, last), then name.
 *
 *
 * @param {object|null} object - full object document (needs `class` and `dashboards`)
 * @param {Array<object>} associated - adapted documents for the ids in `object.dashboards`
 */
export function getContextViews(object, associated) {
  if (!object || !CONTEXT_VIEW_CLASSES.has(object.class)) return []
  const ids = new Set((object.dashboards ?? []).map(Number))
  return (associated ?? [])
    .filter((a) => a && ids.has(Number(a.id)) && CONTEXT_VIEW_KINDS[a.class] && a.showAsObjectView)
    .sort(
      (a, b) => priorityRank(a) - priorityRank(b) || String(a.name).localeCompare(String(b.name)),
    )
    .map((a) => {
      const { prefix, kind, icon } = CONTEXT_VIEW_KINDS[a.class]
      return { id: `${prefix}${a.id}`, label: a.name, icon, kind, targetId: a.id, closable: false }
    })
}

function priorityRank(entry) {
  return entry.displayPriority > 0 ? entry.displayPriority : Number.MAX_SAFE_INTEGER
}

/**
 * @param {string} viewId
 * @param {string} viewId
 */
export function getViewDefinition(viewId) {
  return ALL_OBJECT_VIEWS.find((v) => v.id === viewId)
}

export const VIEW_COMPATIBILITY = { YES: 'yes', NO: 'no', UNKNOWN: 'unknown' }

/**
 * UNKNOWN: the view has a capability filter and no matching object document was supplied
 * (the object tree's nodes carry neither `capabilities` nor `customAttributes`), the module
 * state is not known yet, or the filter returned null.
 *
 * @param {string} viewId
 * @param {string} objectClass - Class name, e.g. 'Node'
 * @param {object} [objectDetails]
 * @returns {'yes'|'no'|'unknown'}
 */
export function getViewCompatibility(viewId, objectClass, objectDetails = null) {
  const view = getViewDefinition(viewId)
  if (!view) return VIEW_COMPATIBILITY.NO
  const moduleState = view.moduleId
    ? moduleRegistry.getModuleState(view.moduleId)
    : MODULE_STATE.ACTIVE
  if (moduleState === MODULE_STATE.INACTIVE) return VIEW_COMPATIBILITY.NO
  if (view.objectClasses && !view.objectClasses.includes(objectClass)) {
    return VIEW_COMPATIBILITY.NO
  }
  if (moduleState === MODULE_STATE.UNKNOWN) return VIEW_COMPATIBILITY.UNKNOWN
  if (!view.objectFilter) return VIEW_COMPATIBILITY.YES
  if (objectDetails?.class !== objectClass) return VIEW_COMPATIBILITY.UNKNOWN
  const verdict = view.objectFilter(objectDetails)
  if (verdict == null) return VIEW_COMPATIBILITY.UNKNOWN
  return verdict ? VIEW_COMPATIBILITY.YES : VIEW_COMPATIBILITY.NO
}

/**
 * Optimistic: UNKNOWN counts as compatible, so a pending detail fetch never redirects routing.
 *
 *
 * @param {string} viewId
 * @param {string} objectClass
 * @param {object} [objectDetails]
 */
export function isViewCompatible(viewId, objectClass, objectDetails = null) {
  return getViewCompatibility(viewId, objectClass, objectDetails) !== VIEW_COMPATIBILITY.NO
}

/**
 * Pessimistic: UNKNOWN counts as incompatible, so tab bar tabs only appear, never vanish.
 *
 *
 * @param {string} viewId
 * @param {string} objectClass
 * @param {object} [objectDetails]
 */
export function isViewConfirmedCompatible(viewId, objectClass, objectDetails = null) {
  return getViewCompatibility(viewId, objectClass, objectDetails) === VIEW_COMPATIBILITY.YES
}

/**
 * Without the views of modules not active on this server, and without empty groups. Reactive
 * through the module registry, so call it inside a `computed`.
 *
 *
 * @returns {Record<string, { label: string, views: Array }>}
 */
export function getObjectViewGroups() {
  const groups = {}
  for (const [groupId, group] of Object.entries(OBJECT_VIEW_GROUPS)) {
    const views = group.views.filter(
      (view) =>
        !view.moduleId || moduleRegistry.getModuleState(view.moduleId) === MODULE_STATE.ACTIVE,
    )
    if (views.length > 0) groups[groupId] = { ...group, views }
  }
  return groups
}

/**
 * Groups that end up empty are omitted.
 *
 *
 * @param {object} object - Object document (needs at least `class`)
 * @param {object} [options]
 * @param {string[]} [options.exclude]
 * @returns {Array<{ id: string, label: string, views: Array }>}
 */
export function getViewGroupsForObject(object, options = {}) {
  const { exclude = [] } = options
  if (!object?.class) return []

  const groups = []
  for (const [groupId, group] of Object.entries(getObjectViewGroups())) {
    const views = group.views.filter(
      (view) => !exclude.includes(view.id) && isViewCompatible(view.id, object.class, object),
    )
    if (views.length > 0) groups.push({ id: groupId, label: group.label, views })
  }
  return groups
}
