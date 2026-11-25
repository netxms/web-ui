import { hasObjectRight } from '@/auth/objectAccessRights'

/**
 * Forced poll types, keyed by their WebAPI name (`POST /v1/objects/{id}/poll/{type}`). The full
 * configuration poll needs MODIFY, every other one only READ (`ValidateForcedPoll`).
 */
export const POLL_TYPES = {
  status: { label: 'Status', icon: 'pi pi-info-circle' },
  configuration: { label: 'Configuration', icon: 'pi pi-cog' },
  'configuration-full': {
    label: 'Configuration (with reset)',
    icon: 'pi pi-replay',
    requiredObjectRight: 'MODIFY',
  },
  'instance-discovery': { label: 'Instance Discovery', icon: 'pi pi-search' },
  'interface-names': { label: 'Interface Names', icon: 'pi pi-tags' },
  discovery: { label: 'Network Discovery', icon: 'pi pi-globe' },
  topology: { label: 'Topology', icon: 'pi pi-share-alt' },
  autobind: { label: 'Automatic Binding', icon: 'pi pi-link' },
  'map-update': { label: 'Map Update', icon: 'pi pi-refresh' },
}

// The legacy client's poll menu (ObjectMenuFactory.createPollMenu), for the classes this console
// has a poll surface for. The server accepts a few more (routing table on nodes, instance
// discovery and binding on clusters) that legacy does not offer either.
const POLLS_BY_CLASS = {
  Node: [
    'status',
    'configuration',
    'configuration-full',
    'instance-discovery',
    'interface-names',
    'discovery',
    'topology',
  ],
  Cluster: ['status', 'configuration'],
  CloudDomain: ['status', 'configuration'],
  WirelessDomain: ['status', 'configuration'],
  TrafficObserver: ['status', 'configuration'],
  Sensor: ['status', 'configuration', 'instance-discovery'],
  AccessPoint: ['configuration', 'instance-discovery'],
  Resource: ['status', 'instance-discovery'],
  ObservationPoint: ['status'],
  Rack: ['instance-discovery'],
  Collector: ['instance-discovery', 'autobind'],
  Facility: ['instance-discovery', 'autobind'],
  Room: ['instance-discovery', 'autobind'],
  CoolingZone: ['instance-discovery', 'autobind'],
  PowerDomain: ['instance-discovery', 'autobind'],
  Circuit: ['instance-discovery', 'autobind'],
  Container: ['autobind'],
  Template: ['autobind'],
  Dashboard: ['autobind'],
  DashboardTemplate: ['autobind'],
  NetworkMap: ['autobind', 'map-update'],
  BusinessService: ['status', 'configuration'],
  BusinessServiceProto: ['instance-discovery'],
}

/** Classes whose Poll menu opens the Infrastructure Polls view. */
export const INFRASTRUCTURE_POLLABLE_CLASSES = [
  'Node',
  'Cluster',
  'CloudDomain',
  'WirelessDomain',
  'TrafficObserver',
  'Sensor',
  'AccessPoint',
  'Resource',
  'ObservationPoint',
  'Rack',
  'Collector',
  'Facility',
  'Room',
  'CoolingZone',
  'PowerDomain',
  'Circuit',
  'Container',
]

/** Classes whose Poll menu opens the Business Services Polls view. */
export const BUSINESS_SERVICE_POLLABLE_CLASSES = ['BusinessService', 'BusinessServiceProto']

/**
 * @param {string} objectClass
 * @returns {Array<{ id: string, label: string, icon: string, requiredObjectRight?: string }>}
 */
export function pollTypesForClass(objectClass) {
  return (POLLS_BY_CLASS[objectClass] ?? []).map((id) => ({ id, ...POLL_TYPES[id] }))
}

/**
 * The poll types this account may start on the object.
 * @param {{ class: string, effectiveRights?: unknown }} object
 */
export function pollTypesForObject(object) {
  return pollTypesForClass(object?.class).filter(
    (poll) => !poll.requiredObjectRight || hasObjectRight(object, poll.requiredObjectRight),
  )
}
