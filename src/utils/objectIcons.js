/**
 * Icon resolution order, as in the legacy client:
 * - small: the category icon, otherwise the class icon.
 * - map: the object's map image, its category's map image, a built-in device icon from the
 *   node's capabilities, then the class icon. The category icon is not part of this chain.
 */
import { EthernetPort, Printer, Router } from 'lucide-vue-next'
import { getClassIconComponent } from '@/utils/objectUtils'

export const NULL_GUID = '00000000-0000-0000-0000-000000000000'

export const ICON_SURFACE = Object.freeze({
  /** 16 px rows, including the map's small-label figure. */
  SMALL: 'small',
  /** The map's icon and large-label figures. */
  MAP: 'map',
})

/**
 * @param {*} value
 * @returns {string|null} the guid, or null for empty / the all-zero guid
 */
export function validGuid(value) {
  return typeof value === 'string' && value !== '' && value !== NULL_GUID ? value : null
}

/**
 * Categories by id, with a previewed category's draft images laid over the stored ones.
 *
 * @param {Array<{ id: number, iconImageId?: string|null, mapImageId?: string|null }>} categories
 * @param {{ categoryId: number, iconImageId: string|null, mapImageId: string|null }|null} [override]
 * @returns {Map<number, object>}
 */
export function indexCategories(categories, override = null) {
  const byId = new Map()
  for (const category of categories ?? []) byId.set(category.id, category)
  if (override?.categoryId) {
    const stored = byId.get(override.categoryId) ?? { id: override.categoryId }
    byId.set(override.categoryId, {
      ...stored,
      iconImageId: override.iconImageId ?? null,
      mapImageId: override.mapImageId ?? null,
    })
  }
  return byId
}

/**
 * Map elements carry `objectCategory` / `objectMapImage`, plain objects `category` / `mapImage`.
 *
 * @param {object} object
 * @param {string} surface - an ICON_SURFACE value
 * @param {Map<number, object>} categoriesById
 * @returns {string|null}
 */
export function customImageGuid(object, surface, categoriesById) {
  if (!object) return null
  const categoryId = object.category ?? object.objectCategory ?? 0
  const category = categoryId ? categoriesById?.get(categoryId) : null
  if (surface === ICON_SURFACE.MAP) {
    const own = validGuid(object.mapImage ?? object.objectMapImage)
    return own ?? validGuid(category?.mapImageId)
  }
  return validGuid(category?.iconImageId)
}

/**
 * @param {object[]} objects
 * @param {string} surface
 * @param {Map<number, object>} categoriesById
 * @returns {string[]}
 */
export function customImageGuids(objects, surface, categoriesById) {
  const guids = new Set()
  for (const object of objects ?? []) {
    const guid = customImageGuid(object, surface, categoriesById)
    if (guid) guids.add(guid)
  }
  return [...guids]
}

/** Legacy precedence: a switch that also routes stays a switch. */
const DEVICE_ICONS = [
  { capability: 'isBridge', component: EthernetPort },
  { capability: 'isRouter', component: Router },
  { capability: 'isPrinter', component: Printer },
]

/**
 * Device icons only on the map surface, as in the legacy client.
 *
 * @param {object} object - with `class` (or `objectClass`) and, for nodes, `capabilities`
 * @param {string} [surface]
 * @returns {object} Lucide component
 */
export function builtinIconComponent(object, surface = ICON_SURFACE.SMALL) {
  const objectClass = object?.class ?? object?.objectClass
  if (surface === ICON_SURFACE.MAP && objectClass === 'Node') {
    const capabilities = object.capabilities ?? object.objectCapabilities
    const device = DEVICE_ICONS.find((d) => capabilities?.[d.capability])
    if (device) return device.component
  }
  return getClassIconComponent(objectClass)
}
