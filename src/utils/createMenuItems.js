import { getCreatableClasses, IMPLEMENTED_CLASSES } from '@/utils/objectCreationRules'
import { getClassIcon, getClassLabel } from '@/utils/objectUtils'

/** One dialog for the four, told the class in the event's `objectClass`. */
const DATA_CENTER_CREATE_CLASSES = ['Facility', 'Room', 'PowerDomain', 'CoolingZone'].map(
  (objectClass, index) => ({
    objectClass,
    eventName: 'dataCenterObject:create',
    priority: 15 + index,
  }),
)

/**
 * Classes with a dedicated creation dialog, keyed to the DOM event that dialog listens for. The
 * event's detail is `{ parent, objectClass }`.
 */
export const DEDICATED_CREATE_CLASSES = [
  { objectClass: 'Subnet', eventName: 'subnet:create', priority: 3 },
  { objectClass: 'Node', eventName: 'node:create', priority: 4 },
  { objectClass: 'Interface', eventName: 'interface:create', priority: 5 },
  { objectClass: 'NetworkService', eventName: 'networkService:create', priority: 6 },
  { objectClass: 'Asset', eventName: 'asset:create', priority: 7 },
  { objectClass: 'Rack', eventName: 'rack:create', priority: 8 },
  { objectClass: 'Chassis', eventName: 'chassis:create', priority: 9 },
  { objectClass: 'Sensor', eventName: 'sensor:create', priority: 10 },
  { objectClass: 'MobileDevice', eventName: 'mobileDevice:create', priority: 11 },
  { objectClass: 'CloudDomain', eventName: 'cloudDomain:create', priority: 12 },
  { objectClass: 'NetworkMap', eventName: 'networkMap:create', priority: 13 },
  { objectClass: 'BusinessServiceProto', eventName: 'businessServiceProto:create', priority: 14 },
  ...DATA_CENTER_CREATE_CLASSES,
]

/**
 * @param {{ id: number, class: string } | null} target - parent object
 * @param {string} objectClass
 * @returns {boolean} false when the class cannot be created there or has no dialog
 */
export function dispatchCreateObject(target, objectClass) {
  if (!target || !getCreatableClasses(target.class).includes(objectClass)) return false

  const dedicated = DEDICATED_CREATE_CLASSES.find((c) => c.objectClass === objectClass)
  if (dedicated) {
    document.dispatchEvent(
      new CustomEvent(dedicated.eventName, { detail: { parent: target, objectClass } }),
    )
    return true
  }

  if (IMPLEMENTED_CLASSES.has(objectClass)) {
    document.dispatchEvent(
      new CustomEvent('object:create', { detail: { parent: target, objectClass } }),
    )
    return true
  }

  return false
}

/**
 * @param {{ id: number, class: string } | null} target
 */
export function buildCreateMenuItems(target) {
  if (!target) return []
  const creatable = getCreatableClasses(target.class)
  const items = []

  for (const { objectClass } of DEDICATED_CREATE_CLASSES) {
    if (!creatable.includes(objectClass)) continue
    items.push({
      label: getClassLabel(objectClass),
      icon: getClassIcon(objectClass),
      command: () => dispatchCreateObject(target, objectClass),
    })
  }

  for (const objectClass of IMPLEMENTED_CLASSES) {
    if (!creatable.includes(objectClass)) continue
    items.push({
      label: getClassLabel(objectClass),
      icon: getClassIcon(objectClass),
      command: () => dispatchCreateObject(target, objectClass),
    })
  }

  return items
}
