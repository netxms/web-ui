/**
 * Object context menu actions: extended PrimeVue MenuItems whose extra properties (id, group,
 * priority, primary, danger, dynamic, objectClasses, requiredObjectRight, isApplicable,
 * isDisabled, shortcut) drive useActions. `requiredObjectRight` is the right the server handler
 * checks for the operation.
 *
 * The top level is a fixed skeleton; only submenu contents change, and slots that do not apply
 * are hidden:
 *
 *   Open >                     informational views, generated from the view registry
 *   Create >
 *   Poll > / Tools >           things you run against the object
 *   Manage | Expected State > (interfaces only) | Maintenance > | Organize >
 *   Rename | Delete
 *   Properties
 *
 * New items go inside an existing slot. Items that only edit a stored field belong in Properties.
 */
import router from '@/router'
import { objectTarget, toolTarget } from '@/utils/routeTargets'
import { SYSTEM_RIGHTS } from '@/auth/systemRights'
import { usePermissions } from '@/composables/usePermissions'
import { useSshTerminalStore } from '@/stores/sshTerminalStore'
import { hasUsablePrimaryIp } from '@/utils/sshTerminalProtocol'
import { resolveHref } from '@/utils/navigation'
import { setObjectMaintenance, wakeUpObject } from '@/api/objectsApi'
import { setInterfaceExpectedStateFor, setObjectManagedStateFor } from './objectStateCommands'
import { EXPECTED_STATE, EXPECTED_STATE_OPTIONS } from '@/utils/interfaceDisplay'
import { notify } from '@/utils/notify'
import { dispatchMaintenanceResult } from '@/utils/maintenanceResult'
import { isDemoDashboardId, deleteDemoDashboard } from '@/api/demoDashboardStorage'
import { queryClient } from '@/queries/config'
import { objectKeys } from '@/queries/useObjectQueries'
import { getCreatableClasses, IMPLEMENTED_CLASSES } from '@/utils/objectCreationRules'
import { getViewGroupsForObject, isViewCompatible } from '@/config/objectViews'
import { notifyNotImplemented } from '@/utils/notImplemented'
import { getClassIcon, getClassLabel, TEMPLATE_APPLICABLE_CLASSES } from '@/utils/objectUtils'
import { DEDICATED_CREATE_CLASSES } from '@/utils/createMenuItems'

// Server rejects set-managed for these classes (see H_ObjectSetManaged in objects.cpp)
const UNMANAGEABLE_CLASSES = ['Template', 'TemplateGroup', 'TemplateRoot']

// Built-in tree roots. The server rejects deletion of anything with id < 10
// (H_ObjectDelete / ClientSession::deleteObject), and these are those objects.
const UNDELETABLE_CLASSES = [
  'EntireNetwork',
  'ServiceRoot',
  'TemplateRoot',
  'DashboardRoot',
  'NetworkMapRoot',
  'BusinessServiceRoot',
  'AssetRoot',
  'ZoneRoot',
]

// Classes without a meaningful status-propagation calculation
export const NO_STATUS_EXPLANATION_CLASSES = [
  'Template',
  'TemplateGroup',
  'TemplateRoot',
  'Asset',
  'AssetGroup',
  'AssetRoot',
]

// Classes with no "infrastructure"-routed Properties view
const NO_INFRASTRUCTURE_PROPERTIES_CLASSES = [
  'Dashboard',
  'DashboardRoot',
  'DashboardGroup',
  'NetworkMap',
  'NetworkMapRoot',
  'NetworkMapGroup',
  'BusinessService',
  'BusinessServiceRoot',
  'Asset',
  'AssetRoot',
  'AssetGroup',
]

// Open routes into the Infrastructure perspective, so it is offered there and on surfaces that
// draw single objects (rack), as legacy does.
const INFRASTRUCTURE_CONTEXTS = ['objectTree', 'templateTargets', 'interfaceTable', 'rack']

// Views with a top-level menu slot or submenu of their own.
const OPEN_EXCLUDED_VIEWS = ['properties', 'polls', 'script', 'topology']

const POLLABLE_CLASSES = ['Node', 'Container', 'Collector']

// Legacy offers "Export data..." on the spatial classes only; Container is added because this
// console cannot create those classes yet.
const DATA_EXPORT_ROOT_CLASSES = [
  'Container',
  'Facility',
  'PowerDomain',
  'CoolingZone',
  'Room',
  'Rack',
]

// The Tools slot shows wherever one of its static children can apply. Interfaces get it for
// their own children (interface DCIs, Wake-on-LAN) and for server object tools, which can
// target an interface (`TOOL_APPLICABLE_INTERFACE`).
const TOOLS_SLOT_CLASSES = [
  ...new Set([...POLLABLE_CLASSES, ...DATA_EXPORT_ROOT_CLASSES, 'Interface']),
]

/** @param {{ id: number }} object */
function dataExportTarget(object) {
  return toolTarget('data-export', { root: String(object.id) })
}

/** Nothing to invalidate: the server only reports that the magic packet was sent. */
async function sendWakeUpPacket(object) {
  try {
    await wakeUpObject(object.id)
    notify({ summary: 'Wake-on-LAN packet sent', detail: object.name })
  } catch (err) {
    // 403 already toasts from api/client.js; anything else needs saying here.
    if (err?.status === 403) return
    notify({
      severity: 'error',
      summary: 'Could not send Wake-on-LAN packet',
      detail: err?.message ?? object.name,
    })
  }
}

/** Settled one by one: a single rejection must not discard the objects that did change. */
async function setObjectMaintenanceState(objects, maintenance, comments) {
  const targets = Array.isArray(objects) ? objects : [objects]
  const results = await Promise.allSettled(
    targets.map((object) => setObjectMaintenance(object.id, { maintenance, comments })),
  )

  const changed = targets.filter((_, index) => results[index].status === 'fulfilled')
  for (const object of changed) {
    queryClient.invalidateQueries({ queryKey: objectKeys.detail(object.id) })
  }
  if (changed.length > 0) {
    queryClient.invalidateQueries({ queryKey: ['objects', 'subTree'] })
  }

  dispatchMaintenanceResult({ objects: targets, results, maintenance })
}

/** Route of a view of an object in the Infrastructure perspective. */
function objectViewTarget(object, viewId, { entityId, query } = {}) {
  return objectTarget(object, viewId, { entityId, query, perspective: 'infrastructure' })
}

function openObjectView(object, viewId, options = {}) {
  router.push(objectViewTarget(object, viewId, options))
}

function dispatchObjectEvent(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail }))
}

// Bind to / Unbind from container only applies to non-container objects.
// Containers and Collectors use "Bind object into" on the target container instead.
const BIND_TO_CONTAINER_CLASSES = [
  'Node',
  'Cluster',
  'Chassis',
  'Rack',
  'MobileDevice',
  'Sensor',
  'Condition',
]

// One "Create" item per class with a working creation dialog, filtered per context by the
// parent->child rules.
const createChildItems = Array.from(IMPLEMENTED_CLASSES).map((objectClass, index) => ({
  id: `object.create.${objectClass}`,
  label: getClassLabel(objectClass),
  icon: getClassIcon(objectClass),
  priority: 5 + index,
  isApplicable: (ctx) => getCreatableClasses(ctx.object.class).includes(objectClass),
  command: ({ actionContext }) => {
    dispatchObjectEvent('object:create', { parent: actionContext.object, objectClass })
  },
}))

const dedicatedCreateItems = DEDICATED_CREATE_CLASSES.map(
  ({ objectClass, eventName, priority }) => ({
    id: `object.create.${objectClass}`,
    label: getClassLabel(objectClass),
    icon: getClassIcon(objectClass),
    priority,
    isApplicable: (ctx) => getCreatableClasses(ctx.object.class).includes(objectClass),
    command: ({ actionContext }) => {
      dispatchObjectEvent(eventName, { parent: actionContext.object })
    },
  }),
)

// Open submenu: views (from the tab-bar registry) and inspection dialogs; nothing here mutates.

const TOPOLOGY_MAP_TYPES = [
  { id: 'l2', label: 'Layer 2' },
  { id: 'ip', label: 'IP' },
  { id: 'ospf', label: 'OSPF', isApplicable: (ctx) => !!ctx.object.capabilities?.isOspf },
  { id: 'internal', label: 'Internal' },
]

const openInspectionItems = [
  {
    id: 'object.open.topology',
    label: 'Topology Map',
    icon: 'pi pi-share-alt',
    group: 'network',
    // Sorts after the registry-generated network views, which are indexed from 0.
    priority: 90,
    isApplicable: (ctx) => isViewCompatible('topology', ctx.object.class, ctx.object),
    items: TOPOLOGY_MAP_TYPES.map(({ id, label, isApplicable }, index) => ({
      id: `object.open.topology.${id}`,
      label,
      priority: index,
      ...(isApplicable ? { isApplicable } : {}),
      command: ({ actionContext }) =>
        openObjectView(actionContext.object, 'topology', { query: { type: id } }),
    })),
  },
  {
    id: 'object.open.tracePath',
    label: 'Trace path',
    icon: 'pi pi-directions',
    group: 'network',
    priority: 91,
    objectClasses: ['Node'],
    items: [
      {
        id: 'object.open.tracePath.fromServer',
        label: 'Route from server',
        priority: 0,
        command: () => notifyNotImplemented('Route from server'),
      },
      {
        id: 'object.open.tracePath.to',
        label: 'Route to...',
        priority: 1,
        command: () => notifyNotImplemented('Route'),
      },
    ],
  },
  {
    id: 'object.open.logs',
    label: 'Logs',
    icon: 'pi pi-list',
    group: 'inspect',
    priority: 10,
    objectClasses: ['Node'],
    // Both open the object's Logs view with the log preselected; `?log=` is read by
    // ObjectLogsView. The names are the server's own (`s_logs[]` in core/logs.cpp), not
    // display labels.
    items: [
      {
        id: 'object.open.logs.syslog',
        label: 'Syslog',
        priority: 0,
        command: ({ actionContext }) =>
          openObjectView(actionContext.object, 'logs', { query: { log: 'syslog' } }),
      },
      {
        id: 'object.open.logs.snmpTraps',
        label: 'SNMP traps',
        priority: 1,
        command: ({ actionContext }) =>
          openObjectView(actionContext.object, 'logs', { query: { log: 'SnmpTrapLog' } }),
      },
    ],
  },
  {
    id: 'object.open.explainStatus',
    label: 'Explain Status',
    icon: 'pi pi-question-circle',
    group: 'inspect',
    priority: 20,
    isApplicable: (ctx) => !NO_STATUS_EXPLANATION_CLASSES.includes(ctx.object.class),
    command: ({ actionContext }) => {
      dispatchObjectEvent('object:explainStatus', { object: actionContext.object })
    },
  },
  {
    // Legacy offers this on every object, next to Explain status. App.vue owns the dialog.
    id: 'object.open.effectiveRights',
    label: 'Effective Rights',
    icon: 'pi pi-shield',
    group: 'inspect',
    priority: 30,
    command: ({ actionContext }) => {
      dispatchObjectEvent('object:effectiveRights', { object: actionContext.object })
    },
  },
]

const EXPECTED_STATE_ICONS = {
  [EXPECTED_STATE.UP]: 'pi pi-arrow-up',
  [EXPECTED_STATE.DOWN]: 'pi pi-arrow-down',
  [EXPECTED_STATE.IGNORE]: 'pi pi-eye-slash',
}

/**
 * Up / Down / Ignore, applied to the whole selection with no dialog. The state every target
 * already has is disabled; tree rows carry no expected state, so there nothing is.
 */
function buildExpectedStateItems(ctx) {
  const targets = ctx.selection ?? [ctx.object]
  return EXPECTED_STATE_OPTIONS.map(({ value, label }, index) => ({
    id: `object.expectedState.${label.toLowerCase()}`,
    multiSelect: true,
    label,
    icon: EXPECTED_STATE_ICONS[value],
    priority: index,
    disabled: targets.every((iface) => iface.expectedState === value),
    command: ({ actionContext }) =>
      setInterfaceExpectedStateFor(actionContext.selection ?? [actionContext.object], value, label),
  }))
}

/**
 * Every view available for the object, grouped as in the tab bar, then the inspection items.
 * useActions inserts the group separators from `group`.
 */
function buildOpenItems(ctx) {
  const items = []
  for (const group of getViewGroupsForObject(ctx.object, { exclude: OPEN_EXCLUDED_VIEWS })) {
    group.views.forEach((view, index) => {
      items.push({
        id: `object.open.${view.id}`,
        label: view.label,
        icon: view.icon,
        group: group.id,
        priority: index,
        // `url` makes the entry a real link, so ctrl/cmd and middle clicks open the view
        // in a new browser tab instead of switching this one.
        url: resolveHref(objectViewTarget(ctx.object, view.id)),
        command: ({ actionContext }) => openObjectView(actionContext.object, view.id),
      })
    })
  }
  return [...items, ...openInspectionItems]
}

// Forced polling needs only READ (which the object would not be visible without), except
// the full configuration poll - POLL_CONFIGURATION_WITH_RESET - which needs MODIFY. See
// ClientSession::forcedObjectPoll.
const POLL_TYPES = [
  { id: 'status', label: 'Status', objectClasses: ['Node'] },
  {
    id: 'configuration',
    label: 'Configuration (full)',
    objectClasses: ['Node'],
    requiredObjectRight: 'MODIFY',
  },
  { id: 'topology', label: 'Topology', objectClasses: ['Node'] },
  { id: 'instanceDiscovery', label: 'Instance Discovery', objectClasses: ['Node'] },
  {
    id: 'automaticBinding',
    label: 'Automatic Binding',
    objectClasses: ['Container', 'Collector'],
  },
]

function buildPollItems(ctx) {
  return POLL_TYPES.map(({ id, label, objectClasses, requiredObjectRight }, index) => ({
    id: `object.poll.${id}`,
    label,
    priority: index,
    objectClasses,
    ...(requiredObjectRight ? { requiredObjectRight } : {}),
    url: resolveHref(
      objectViewTarget(ctx.object, 'polls', { entityId: id, query: { autorun: '1' } }),
    ),
    command: ({ actionContext }) =>
      openObjectView(actionContext.object, 'polls', { entityId: id, query: { autorun: '1' } }),
  }))
}

const objectActions = [
  {
    id: 'object.open',
    label: 'Open',
    icon: 'pi pi-external-link',
    group: 'open',
    priority: 10,
    isApplicable: (ctx) => INFRASTRUCTURE_CONTEXTS.includes(ctx.viewContext),
    items: buildOpenItems,
  },

  {
    id: 'object.create',
    label: 'Create',
    icon: 'pi pi-plus',
    group: 'create',
    priority: 10,
    // "Create child objects" is checked on the parent - the object right-clicked here.
    requiredObjectRight: 'CREATE',
    isApplicable: (ctx) => getCreatableClasses(ctx.object.class).length > 0,
    items: [...dedicatedCreateItems, ...createChildItems],
  },

  {
    id: 'object.poll',
    label: 'Poll',
    icon: 'pi pi-sync',
    group: 'operations',
    priority: 10,
    primary: true,
    objectClasses: POLLABLE_CLASSES,
    items: buildPollItems,
  },
  {
    // Server-defined object tools are appended to these static children at render time
    // by ObjectsView (injectToolsIntoMenu). `dynamic` keeps the slot alive for classes
    // where no static child applies.
    id: 'object.tools',
    multiSelect: true,
    label: 'Tools',
    icon: 'pi pi-wrench',
    group: 'operations',
    priority: 20,
    primary: true,
    dynamic: true,
    objectClasses: TOOLS_SLOT_CLASSES,
    items: (ctx) => [
      {
        id: 'object.tools.executeScript',
        label: 'Execute script',
        icon: 'pi pi-code',
        priority: 0,
        objectClasses: POLLABLE_CLASSES,
        // Ad-hoc script execution has its own right, not MODIFY.
        requiredObjectRight: 'EXECUTE_SCRIPT',
        command: ({ actionContext }) => openObjectView(actionContext.object, 'script'),
      },
      {
        id: 'object.tools.sshTerminal',
        label: 'SSH terminal',
        icon: 'pi pi-desktop',
        priority: 0,
        objectClasses: ['Node'],
        requiredObjectRight: 'CONTROL',
        isApplicable: (ctx) =>
          usePermissions().hasRight(SYSTEM_RIGHTS.SETUP_TCP_PROXY) &&
          hasUsablePrimaryIp(ctx.object),
        // `url` makes ctrl/middle click open it in a new tab, which lands on the connect form.
        url: resolveHref(objectViewTarget(ctx.object, 'ssh:1')),
        command: ({ actionContext }) => {
          const viewId = useSshTerminalStore().openFromMenu(actionContext.object)
          openObjectView(actionContext.object, viewId)
        },
      },
      {
        id: 'object.tools.deployPackage',
        multiSelect: true,
        label: 'Deploy package',
        icon: 'pi pi-box',
        priority: 1,
        objectClasses: ['Node'],
        command: () => notifyNotImplemented('Deploy package'),
      },
      {
        id: 'object.tools.wakeUp',
        multiSelect: true,
        label: 'Wake on LAN',
        icon: 'pi pi-bolt',
        priority: 2,
        // On an interface the packet goes to that interface's subnet broadcast, with its MAC.
        objectClasses: ['Node', 'Interface'],
        requiredObjectRight: 'CONTROL',
        command: ({ actionContext }) => {
          for (const object of actionContext.selection ?? [actionContext.object]) {
            sendWakeUpPacket(object)
          }
        },
      },
      {
        id: 'object.tools.screenshot',
        label: 'Take screenshot',
        icon: 'pi pi-camera',
        priority: 3,
        objectClasses: ['Node'],
        // H_TakeScreenshot checks OBJECT_ACCESS_SCREENSHOT, not read - the spec's 403 text
        // says otherwise and is wrong.
        requiredObjectRight: 'SCREENSHOT',
        // Same condition as the legacy context menu: it goes to the agent's session agent,
        // which only exists on Windows.
        isApplicable: (ctx) =>
          !!ctx.object?.capabilities?.isNativeAgent &&
          String(ctx.object?.platformName ?? '').startsWith('windows-'),
        command: ({ actionContext }) =>
          dispatchObjectEvent('object:screenshot', { object: actionContext.object }),
      },
      {
        id: 'object.tools.exportData',
        label: 'Export data...',
        icon: 'pi pi-file-export',
        priority: 4,
        objectClasses: DATA_EXPORT_ROOT_CLASSES,
        // `url` makes ctrl/middle click open it in a new tab.
        url: resolveHref(dataExportTarget(ctx.object)),
        command: ({ actionContext }) => router.push(dataExportTarget(actionContext.object)),
      },
      {
        // Under Tools, not Create (Create holds child objects). The server checks MODIFY on the
        // interface's node; interfaces inherit their node's rights.
        id: 'object.tools.createInterfaceDcis',
        multiSelect: true,
        label: 'Create interface DCIs...',
        icon: 'pi pi-chart-line',
        priority: 5,
        objectClasses: ['Interface'],
        requiredObjectRight: 'MODIFY',
        command: ({ actionContext }) => {
          dispatchObjectEvent('interface:createDcis', {
            objects: actionContext.selection ?? [actionContext.object],
          })
        },
      },
    ],
  },

  {
    id: 'object.manage',
    multiSelect: true,
    label: 'Manage',
    icon: 'pi pi-check-circle',
    group: 'state',
    priority: 10,
    // H_ObjectSetManaged
    requiredObjectRight: 'MODIFY',
    // Legacy `isManagedMenuAllowed` checks classes only and offers both Manage and
    // Unmanage on a range, so a mixed-status selection must show both.
    isApplicable: (ctx) => {
      const objects = ctx.selection ?? [ctx.object]
      return (
        objects.every((object) => !UNMANAGEABLE_CLASSES.includes(object.class)) &&
        objects.some((object) => object.status === 6)
      )
    },
    command: ({ actionContext }) =>
      setObjectManagedStateFor(actionContext.selection ?? [actionContext.object], true),
  },
  {
    id: 'object.unmanage',
    multiSelect: true,
    label: 'Unmanage',
    icon: 'pi pi-ban',
    group: 'state',
    priority: 10,
    requiredObjectRight: 'MODIFY',
    isApplicable: (ctx) => {
      const objects = ctx.selection ?? [ctx.object]
      return (
        objects.every((object) => !UNMANAGEABLE_CLASSES.includes(object.class)) &&
        objects.some((object) => object.status !== 6)
      )
    },
    command: ({ actionContext }) =>
      setObjectManagedStateFor(actionContext.selection ?? [actionContext.object], false),
  },
  {
    // The only class-specific top-level slot: the interface counterpart of Manage/Unmanage.
    id: 'object.expectedState',
    multiSelect: true,
    label: 'Expected State',
    icon: 'pi pi-flag',
    group: 'state',
    priority: 15,
    objectClasses: ['Interface'],
    // PATCH /v1/objects/{id} (H_ObjectPropertiesUpdate)
    requiredObjectRight: 'MODIFY',
    items: buildExpectedStateItems,
  },
  {
    id: 'object.maintenance',
    multiSelect: true,
    label: 'Maintenance',
    icon: 'pi pi-wrench',
    group: 'state',
    priority: 20,
    // H_ObjectSetMaintenance - its own right, not MODIFY
    requiredObjectRight: 'MAINTENANCE',
    items: [
      {
        id: 'object.maintenance.start',
        multiSelect: true,
        label: 'Start Maintenance...',
        icon: 'pi pi-play',
        priority: 0,
        isApplicable: (ctx) =>
          (ctx.selection ?? [ctx.object]).some(
            (o) => o.isMaintenanceApplicable && !o.isInMaintenanceMode,
          ),
        command: ({ actionContext }) => {
          dispatchObjectEvent('object:startMaintenance', {
            objects: actionContext.selection ?? [actionContext.object],
          })
        },
      },
      {
        id: 'object.maintenance.end',
        multiSelect: true,
        label: 'End Maintenance',
        icon: 'pi pi-stop',
        priority: 1,
        isApplicable: (ctx) =>
          (ctx.selection ?? [ctx.object]).some(
            (o) => o.isMaintenanceApplicable && o.isInMaintenanceMode,
          ),
        command: ({ actionContext }) =>
          setObjectMaintenanceState(actionContext.selection ?? [actionContext.object], false),
      },
    ],
  },
  {
    id: 'object.organize',
    multiSelect: true,
    label: 'Organize',
    icon: 'pi pi-sitemap',
    group: 'state',
    priority: 30,
    // Binding, unbinding and zone changes are all object modifications.
    requiredObjectRight: 'MODIFY',
    items: [
      {
        id: 'object.organize.bindToContainer',
        multiSelect: true,
        label: 'Bind to container...',
        icon: 'pi pi-arrow-up-right',
        priority: 0,
        objectClasses: BIND_TO_CONTAINER_CLASSES,
        command: ({ actionContext }) => {
          dispatchObjectEvent('object:bindToContainer', {
            objects: actionContext.selection ?? [actionContext.object],
          })
        },
      },
      {
        id: 'object.organize.unbindFromContainer',
        label: 'Unbind from container',
        icon: 'pi pi-arrow-down-left',
        priority: 1,
        objectClasses: BIND_TO_CONTAINER_CLASSES,
        command: ({ actionContext }) => {
          dispatchObjectEvent('object:unbindFromContainer', { object: actionContext.object })
        },
      },
      {
        // Single-object only, per legacy `if (singleObject) add(actionBind)`: the picked
        // objects are bound INTO this one, so a range has no single defined target.
        id: 'object.organize.bindObjectInto',
        label: 'Bind object into...',
        icon: 'pi pi-arrow-down',
        priority: 2,
        objectClasses: ['Container', 'Collector'],
        command: ({ actionContext }) => {
          dispatchObjectEvent('object:bindObjectInto', { object: actionContext.object })
        },
      },
      {
        id: 'object.organize.unbindChildrenFromContainer',
        label: 'Unbind objects from...',
        icon: 'pi pi-arrow-down-left',
        priority: 3,
        objectClasses: ['Container', 'Collector'],
        command: ({ actionContext }) => {
          dispatchObjectEvent('object:unbindChildrenFromContainer', {
            object: actionContext.object,
          })
        },
      },
      {
        id: 'object.organize.linkAsset',
        label: 'Link to asset...',
        icon: 'pi pi-link',
        priority: 4,
        objectClasses: ['Node'],
        command: () => notifyNotImplemented('Link asset'),
      },
      {
        // Placement, not a scalar field: PATCH /objects/{id} has no zoneUIN, and the
        // WebAPI exposes no zone-change endpoint, so this cannot live in Properties yet.
        id: 'object.organize.changeZone',
        label: 'Change zone...',
        icon: 'pi pi-map',
        priority: 5,
        objectClasses: ['Node'],
        command: () => notifyNotImplemented('Change zone'),
      },
      {
        // A manual peer link (topology placement). Single interface only, as in legacy: the
        // picked interface is the one other end.
        id: 'object.organize.setPeer',
        label: 'Set peer...',
        icon: 'pi pi-link',
        priority: 6,
        objectClasses: ['Interface'],
        command: ({ actionContext }) => {
          dispatchObjectEvent('interface:setPeer', { object: actionContext.object })
        },
      },
      {
        // Tree rows carry no peer fields (undefined), so only a known "no peer" hides it.
        id: 'object.organize.clearPeer',
        label: 'Clear peer',
        icon: 'pi pi-times-circle',
        priority: 7,
        objectClasses: ['Interface'],
        isApplicable: (ctx) => ctx.object.peerInterfaceId !== 0,
        command: ({ actionContext }) => {
          dispatchObjectEvent('interface:clearPeer', { object: actionContext.object })
        },
      },
    ],
  },

  {
    // Applying a template is a parent/child bind, so it sits in the `state` group (legacy puts
    // Apply/Remove at the top level).
    id: 'object.templates',
    multiSelect: true,
    label: 'Templates',
    icon: 'pi pi-file-import',
    group: 'state',
    priority: 40,
    // Legacy `isTemplateManagementAllowed`: every selected object must be a data
    // collection target. No emptiness check - legacy offers Remove unconditionally too,
    // and the dialog reports when nothing is applied.
    objectClasses: TEMPLATE_APPLICABLE_CLASSES,
    requiredObjectRight: 'MODIFY',
    items: [
      {
        id: 'object.templates.apply',
        multiSelect: true,
        label: 'Apply template...',
        icon: 'pi pi-arrow-right',
        priority: 0,
        command: ({ actionContext }) => {
          dispatchObjectEvent('object:applyTemplate', {
            objects: actionContext.selection ?? [actionContext.object],
          })
        },
      },
      {
        id: 'object.templates.remove',
        multiSelect: true,
        label: 'Remove template...',
        icon: 'pi pi-arrow-left',
        priority: 1,
        command: ({ actionContext }) => {
          dispatchObjectEvent('object:removeTemplate', {
            objects: actionContext.selection ?? [actionContext.object],
          })
        },
      },
    ],
  },

  {
    id: 'object.rename',
    label: 'Rename',
    icon: 'pi pi-pencil',
    group: 'edit',
    priority: 10,
    shortcut: 'F2',
    // Renaming goes through PATCH /v1/objects/{id} (H_ObjectPropertiesUpdate).
    requiredObjectRight: 'MODIFY',
    command: ({ actionContext }) => {
      dispatchObjectEvent('object:rename', { object: actionContext.object })
    },
  },
  {
    id: 'object.delete',
    multiSelect: true,
    label: 'Delete',
    icon: 'pi pi-trash',
    group: 'edit',
    priority: 20,
    shortcut: 'Del',
    danger: true,
    requiredObjectRight: 'DELETE',
    // The server refuses to delete any object with id < 10 (the built-in roots).
    isApplicable: (ctx) =>
      !UNDELETABLE_CLASSES.includes(ctx.object.class) &&
      !(ctx.selection ?? []).some((object) => UNDELETABLE_CLASSES.includes(object.class)),
    command: ({ actionContext }) => {
      const object = actionContext.object
      // Demo dashboards live in localStorage and can actually be deleted
      if (object?.class === 'Dashboard' && isDemoDashboardId(object.id)) {
        deleteDemoDashboard(object.id)
        queryClient.invalidateQueries({ queryKey: ['dashboards'] })
        if (String(router.currentRoute.value.params?.dashboardId) === String(object.id)) {
          router.push({ name: 'dashboards', params: { dashboardId: undefined } })
        }
        return
      }
      dispatchObjectEvent('object:delete', { object, selection: actionContext.selection })
    },
  },

  {
    id: 'object.openDashboardProperties',
    label: 'Properties',
    icon: 'pi pi-cog',
    group: 'properties',
    priority: 10,
    objectClasses: ['Dashboard'],
    command: ({ actionContext }) => {
      dispatchObjectEvent('object:showDashboardProperties', { object: actionContext.object })
    },
  },
  {
    id: 'object.openNetworkMapProperties',
    label: 'Properties',
    icon: 'pi pi-cog',
    group: 'properties',
    priority: 10,
    objectClasses: ['NetworkMap'],
    command: ({ actionContext }) => {
      dispatchObjectEvent('networkMap:showProperties', { object: actionContext.object })
    },
  },
  {
    id: 'object.openNetworkMapContainerProperties',
    label: 'Properties',
    icon: 'pi pi-cog',
    group: 'properties',
    priority: 10,
    objectClasses: ['NetworkMapGroup', 'NetworkMapRoot'],
    command: ({ actionContext }) => {
      dispatchObjectEvent('networkMap:showObjectProperties', { object: actionContext.object })
    },
  },
  {
    id: 'object.properties',
    label: 'Properties',
    icon: 'pi pi-cog',
    group: 'properties',
    priority: 20,
    shortcut: 'Enter',
    isApplicable: (ctx) => !NO_INFRASTRUCTURE_PROPERTIES_CLASSES.includes(ctx.object.class),
    command: ({ actionContext }) => openObjectView(actionContext.object, 'properties'),
  },
]

export default objectActions
