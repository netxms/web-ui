import { describe, it, expect } from 'vitest'
import { Circle, EthernetPort, Printer, Router, Server } from 'lucide-vue-next'
import {
  ICON_SURFACE,
  NULL_GUID,
  builtinIconComponent,
  customImageGuid,
  customImageGuids,
  indexCategories,
  validGuid,
} from '@/utils/objectIcons'

const CATEGORIES = [
  { id: 1, name: 'Routers', iconImageId: 'icon-1', mapImageId: 'map-1' },
  { id: 2, name: 'Icon only', iconImageId: 'icon-2', mapImageId: NULL_GUID },
  { id: 3, name: 'Nothing', iconImageId: null, mapImageId: null },
]
const byId = indexCategories(CATEGORIES)

describe('validGuid', () => {
  it('drops empty values and the all-zero guid the server sends for "unset"', () => {
    expect(validGuid('abc')).toBe('abc')
    expect(validGuid(NULL_GUID)).toBeNull()
    expect(validGuid('')).toBeNull()
    expect(validGuid(null)).toBeNull()
    expect(validGuid(undefined)).toBeNull()
  })
})

describe('customImageGuid', () => {
  it('uses the category icon in rows', () => {
    expect(customImageGuid({ class: 'Node', category: 1 }, ICON_SURFACE.SMALL, byId)).toBe('icon-1')
  })

  it('ignores the per-object map image in rows, as the legacy tree does', () => {
    const object = { class: 'Node', category: 0, mapImage: 'own-map' }
    expect(customImageGuid(object, ICON_SURFACE.SMALL, byId)).toBeNull()
  })

  it("prefers the object's own map image on maps, then the category's", () => {
    expect(customImageGuid({ category: 1, mapImage: 'own' }, ICON_SURFACE.MAP, byId)).toBe('own')
    expect(customImageGuid({ category: 1, mapImage: null }, ICON_SURFACE.MAP, byId)).toBe('map-1')
  })

  it('does not fall back to the category icon on maps', () => {
    expect(customImageGuid({ category: 2 }, ICON_SURFACE.MAP, byId)).toBeNull()
  })

  it('reads map elements, which carry the fields with an object prefix', () => {
    const element = { objectClass: 'Node', objectCategory: 1, objectMapImage: 'own' }
    expect(customImageGuid(element, ICON_SURFACE.SMALL, byId)).toBe('icon-1')
    expect(customImageGuid(element, ICON_SURFACE.MAP, byId)).toBe('own')
  })

  it('returns null for no category, an unknown one, or one without images', () => {
    expect(customImageGuid({ category: 0 }, ICON_SURFACE.SMALL, byId)).toBeNull()
    expect(customImageGuid({ category: 99 }, ICON_SURFACE.SMALL, byId)).toBeNull()
    expect(customImageGuid({ category: 3 }, ICON_SURFACE.MAP, byId)).toBeNull()
    expect(customImageGuid(null, ICON_SURFACE.SMALL, byId)).toBeNull()
  })
})

describe('customImageGuids', () => {
  it('lists each image once', () => {
    const objects = [{ category: 1 }, { category: 1, mapImage: 'own' }, { category: 2 }]
    expect(customImageGuids(objects, ICON_SURFACE.MAP, byId).sort()).toEqual(['map-1', 'own'])
  })
})

describe('indexCategories', () => {
  it("lays a previewed category's draft images over the stored ones", () => {
    const preview = { categoryId: 1, iconImageId: 'draft-icon', mapImageId: null }
    const merged = indexCategories(CATEGORIES, preview)
    expect(merged.get(1)).toMatchObject({ name: 'Routers', iconImageId: 'draft-icon' })
    expect(merged.get(1).mapImageId).toBeNull()
    expect(merged.get(2).iconImageId).toBe('icon-2')
  })
})

describe('builtinIconComponent', () => {
  it('shows the device type of a node on maps, switch before router', () => {
    const node = (capabilities) => ({ class: 'Node', capabilities })
    expect(builtinIconComponent(node({ isBridge: true, isRouter: true }), ICON_SURFACE.MAP)).toBe(
      EthernetPort,
    )
    expect(builtinIconComponent(node({ isRouter: true }), ICON_SURFACE.MAP)).toBe(Router)
    expect(builtinIconComponent(node({ isPrinter: true }), ICON_SURFACE.MAP)).toBe(Printer)
    expect(builtinIconComponent(node({}), ICON_SURFACE.MAP)).toBe(Server)
  })

  it('reads map element capabilities', () => {
    const element = { objectClass: 'Node', objectCapabilities: { isRouter: true } }
    expect(builtinIconComponent(element, ICON_SURFACE.MAP)).toBe(Router)
  })

  it('keeps the class icon in rows, as the legacy tree does', () => {
    const router = { class: 'Node', capabilities: { isRouter: true } }
    expect(builtinIconComponent(router, ICON_SURFACE.SMALL)).toBe(Server)
  })

  it('falls back to a neutral icon for an unknown class', () => {
    expect(builtinIconComponent({ class: 'Whatever' })).toBe(Circle)
  })
})
