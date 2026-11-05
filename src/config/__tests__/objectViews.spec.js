import { describe, it, expect, vi, beforeEach } from 'vitest'

// The test build compiles no modules (vitest.config.js), so this fake is the only one.
const FAKE_MODULE = vi.hoisted(() => ({
  id: 'fake',
  label: 'Fake module',
  requiredComponent: 'FAKE',
  objectViews: [
    {
      group: 'monitoring',
      id: 'fakeView',
      label: 'Fake',
      icon: 'pi pi-box',
      objectClasses: ['Node'],
      // 'pending' stands in for a filter still waiting on data of its own.
      objectFilter: (obj) => {
        const attr = obj?.customAttributes?.find((a) => a.name === 'isFake')
        return attr?.value === 'pending' ? null : !!attr
      },
      component: () => Promise.resolve({}),
      defaultVisible: true,
    },
  ],
}))

vi.mock('@/modules', async () => {
  const actual = await vi.importActual('@/modules')
  return { ...actual, moduleRegistry: actual.createModuleRegistry([FAKE_MODULE]) }
})
import {
  OBJECT_VIEW_GROUPS,
  ALL_OBJECT_VIEWS,
  VIEW_COMPATIBILITY,
  getViewDefinition,
  getViewCompatibility,
  isViewCompatible,
  isViewConfirmedCompatible,
  getViewGroupsForObject,
  getContextViews,
  isAdHocViewId,
  parseContextViewId,
  getObjectViewGroups,
  validateModuleViews,
} from '@/config/objectViews'
import { moduleRegistry } from '@/modules'

beforeEach(() => {
  moduleRegistry.setServerComponents(null)
})

describe('objectViews registry', () => {
  it('exposes every group view in the flat list', () => {
    const fromGroups = Object.values(OBJECT_VIEW_GROUPS).flatMap((g) => g.views)
    expect(ALL_OBJECT_VIEWS).toHaveLength(fromGroups.length)
  })

  it('has unique view ids', () => {
    const ids = ALL_OBJECT_VIEWS.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('resolves a view definition by id', () => {
    expect(getViewDefinition('status')).toMatchObject({ id: 'status', label: 'Status' })
    expect(getViewDefinition('nope')).toBeUndefined()
  })
})

describe('isViewCompatible', () => {
  it('accepts unrestricted views for any class', () => {
    expect(isViewCompatible('status', 'Node')).toBe(true)
    expect(isViewCompatible('status', 'Dashboard')).toBe(true)
  })

  it('rejects a view whose class list excludes the class', () => {
    expect(isViewCompatible('interfaces', 'Node')).toBe(true)
    expect(isViewCompatible('interfaces', 'Container')).toBe(false)
  })

  it('rejects unknown view ids', () => {
    expect(isViewCompatible('nope', 'Node')).toBe(false)
  })

  it('applies capability filters when the object document is supplied', () => {
    const bridge = { class: 'Node', capabilities: { isBridge: true } }
    const plain = { class: 'Node', capabilities: { isBridge: false } }
    expect(isViewCompatible('ports', 'Node', bridge)).toBe(true)
    expect(isViewCompatible('ports', 'Node', plain)).toBe(false)
  })

  it('is optimistic when no object document is available', () => {
    // Details not loaded yet must not hide a tab that may well apply.
    expect(isViewCompatible('ports', 'Node')).toBe(true)
  })

  it('ignores a capability filter when the document is for a different class', () => {
    expect(isViewCompatible('ports', 'Node', { class: 'Container' })).toBe(true)
  })
})

describe('getViewCompatibility', () => {
  const bridge = { class: 'Node', capabilities: { isBridge: true } }
  const plain = { class: 'Node', capabilities: { isBridge: false } }

  it('reports UNKNOWN while a capability filter has nothing to run against', () => {
    expect(getViewCompatibility('ports', 'Node')).toBe(VIEW_COMPATIBILITY.UNKNOWN)
  })

  it('resolves a capability filter once the object document is supplied', () => {
    expect(getViewCompatibility('ports', 'Node', bridge)).toBe(VIEW_COMPATIBILITY.YES)
    expect(getViewCompatibility('ports', 'Node', plain)).toBe(VIEW_COMPATIBILITY.NO)
  })

  it('answers class-only views without any document', () => {
    expect(getViewCompatibility('status', 'Node')).toBe(VIEW_COMPATIBILITY.YES)
    expect(getViewCompatibility('interfaces', 'Container')).toBe(VIEW_COMPATIBILITY.NO)
    expect(getViewCompatibility('nope', 'Node')).toBe(VIEW_COMPATIBILITY.NO)
  })

  it('rules a capability view out on class alone, before details matter', () => {
    expect(getViewCompatibility('ports', 'Container')).toBe(VIEW_COMPATIBILITY.NO)
  })

  it('reads UNKNOWN pessimistically for the tab bar', () => {
    // The inversion the tab bar relies on: hidden until confirmed, so tabs only appear.
    expect(isViewConfirmedCompatible('ports', 'Node')).toBe(false)
    expect(isViewCompatible('ports', 'Node')).toBe(true)

    expect(isViewConfirmedCompatible('ports', 'Node', bridge)).toBe(true)
    expect(isViewConfirmedCompatible('ports', 'Node', plain)).toBe(false)
    expect(isViewConfirmedCompatible('status', 'Node')).toBe(true)
  })
})

describe('wireless views', () => {
  const ap = { class: 'Node', capabilities: { isWifiAp: true } }
  const controller = { class: 'Node', capabilities: { isWifiController: true } }
  const plain = { class: 'Node', capabilities: { isBridge: true } }
  const accessPoint = { class: 'AccessPoint', capabilities: {} }
  const domain = { class: 'WirelessDomain' }

  it('gives Radios to access point nodes, access points and wireless domains', () => {
    expect(isViewConfirmedCompatible('radios', 'Node', ap)).toBe(true)
    expect(isViewConfirmedCompatible('radios', 'AccessPoint', accessPoint)).toBe(true)
    expect(isViewConfirmedCompatible('radios', 'WirelessDomain', domain)).toBe(true)
  })

  it('keeps Radios off a controller-only node, whose radios the server does not keep', () => {
    expect(isViewConfirmedCompatible('radios', 'Node', controller)).toBe(false)
    expect(isViewConfirmedCompatible('radios', 'Node', plain)).toBe(false)
  })

  it('gives Wireless Stations to controllers as well as access points', () => {
    expect(isViewConfirmedCompatible('wirelessStations', 'Node', ap)).toBe(true)
    expect(isViewConfirmedCompatible('wirelessStations', 'Node', controller)).toBe(true)
    expect(isViewConfirmedCompatible('wirelessStations', 'AccessPoint', accessPoint)).toBe(true)
    expect(isViewConfirmedCompatible('wirelessStations', 'WirelessDomain', domain)).toBe(true)
    expect(isViewConfirmedCompatible('wirelessStations', 'Node', plain)).toBe(false)
  })

  it('rules both out for other classes on class alone', () => {
    expect(getViewCompatibility('radios', 'Container')).toBe(VIEW_COMPATIBILITY.NO)
    expect(getViewCompatibility('wirelessStations', 'Subnet')).toBe(VIEW_COMPATIBILITY.NO)
  })
})

describe('getViewGroupsForObject', () => {
  it('returns nothing for an object with no class', () => {
    expect(getViewGroupsForObject(null)).toEqual([])
    expect(getViewGroupsForObject({})).toEqual([])
  })

  it('omits groups that end up empty', () => {
    const groups = getViewGroupsForObject({ class: 'Dashboard' })
    const ids = groups.map((g) => g.id)
    expect(ids).not.toContain('network')
    expect(ids).toContain('overview')
  })

  it('gives a Node its network views', () => {
    const groups = getViewGroupsForObject({ class: 'Node' })
    const network = groups.find((g) => g.id === 'network')
    expect(network.views.map((v) => v.id)).toContain('interfaces')
  })

  it('excludes requested view ids', () => {
    const groups = getViewGroupsForObject({ class: 'Node' }, { exclude: ['properties', 'status'] })
    const allIds = groups.flatMap((g) => g.views.map((v) => v.id))
    expect(allIds).not.toContain('properties')
    expect(allIds).not.toContain('status')
    expect(allIds).toContain('alarms')
  })

  it('keeps group labels for display', () => {
    const groups = getViewGroupsForObject({ class: 'Node' })
    expect(groups.find((g) => g.id === 'monitoring').label).toBe('Monitoring')
  })
})

describe('context views', () => {
  const node = { id: 1, class: 'Node', dashboards: [10, 11, 12, 20, 21] }
  const dashboard = (id, name, extra = {}) => ({
    id,
    class: 'Dashboard',
    name,
    showAsObjectView: true,
    displayPriority: 0,
    ...extra,
  })
  const map = (id, name, extra = {}) => ({ ...dashboard(id, name, extra), class: 'NetworkMap' })

  it('round-trips view ids through parseContextViewId', () => {
    const [view] = getContextViews(node, [dashboard(10, 'Ops')])
    expect(view.id).toBe('dashboard:10')
    expect(parseContextViewId(view.id)).toEqual({ kind: 'dashboard', id: 10 })
    expect(parseContextViewId('map:21')).toEqual({ kind: 'map', id: 21 })
  })

  it('rejects junk ids', () => {
    expect(parseContextViewId('dashboard:')).toBeNull()
    expect(parseContextViewId('dashboard:abc')).toBeNull()
    expect(parseContextViewId('map:-3')).toBeNull()
    expect(parseContextViewId('status')).toBeNull()
    expect(parseContextViewId(null)).toBeNull()
  })

  it('gives ineligible classes no tabs', () => {
    const associated = [dashboard(10, 'Ops')]
    expect(getContextViews({ ...node, class: 'Interface' }, associated)).toEqual([])
    expect(getContextViews({ ...node, class: 'Template' }, associated)).toEqual([])
  })

  it('drops unflagged and unassociated entries', () => {
    const views = getContextViews(node, [
      dashboard(10, 'Flagged'),
      dashboard(11, 'Unflagged', { showAsObjectView: false }),
      dashboard(99, 'Not associated'),
    ])
    expect(views.map((v) => v.label)).toEqual(['Flagged'])
  })

  it('sorts by display priority, automatic (0) last, then by name', () => {
    const views = getContextViews(node, [
      dashboard(10, 'Auto'),
      map(20, 'Five', { displayPriority: 5 }),
      dashboard(11, 'Two', { displayPriority: 2 }),
      map(21, 'Beta'),
      dashboard(12, 'Alpha'),
    ])
    expect(views.map((v) => v.label)).toEqual(['Two', 'Five', 'Alpha', 'Auto', 'Beta'])
  })

  it('makes context tabs non-closable and marks their kind', () => {
    const [view] = getContextViews(node, [map(20, 'Topology')])
    expect(view).toMatchObject({ id: 'map:20', kind: 'map', targetId: 20, closable: false })
  })

  it('treats context view ids as ad-hoc', () => {
    expect(isAdHocViewId('dashboard:5')).toBe(true)
    expect(isAdHocViewId('map:5')).toBe(true)
    expect(isAdHocViewId('ssh:1')).toBe(true)
  })
})

describe('module views', () => {
  const fakeNode = { class: 'Node', customAttributes: [{ name: 'isFake', value: '1' }] }
  const plainNode = { class: 'Node', customAttributes: [] }

  it('joins its group and carries its module id', () => {
    const view = getViewDefinition('fakeView')
    expect(view).toMatchObject({ moduleId: 'fake', defaultVisible: true })
    expect(view).not.toHaveProperty('group')
    expect(OBJECT_VIEW_GROUPS.monitoring.views).toContain(view)
  })

  it('is UNKNOWN while the server has not answered, even with the object loaded', () => {
    expect(getViewCompatibility('fakeView', 'Node', fakeNode)).toBe(VIEW_COMPATIBILITY.UNKNOWN)
    // Routing waits instead of redirecting a deep link; the tab bar keeps the tab hidden.
    expect(isViewCompatible('fakeView', 'Node', fakeNode)).toBe(true)
    expect(isViewConfirmedCompatible('fakeView', 'Node', fakeNode)).toBe(false)
  })

  it('is ruled out on class alone while the server has not answered', () => {
    expect(getViewCompatibility('fakeView', 'Container')).toBe(VIEW_COMPATIBILITY.NO)
  })

  it('is NO when the server lacks the component', () => {
    moduleRegistry.setServerComponents(['CORE'])
    expect(getViewCompatibility('fakeView', 'Node', fakeNode)).toBe(VIEW_COMPATIBILITY.NO)
    expect(isViewCompatible('fakeView', 'Node', fakeNode)).toBe(false)
  })

  it('falls through to class and filter checks when the module is active', () => {
    moduleRegistry.setServerComponents(['CORE', 'FAKE'])
    expect(getViewCompatibility('fakeView', 'Node', fakeNode)).toBe(VIEW_COMPATIBILITY.YES)
    expect(getViewCompatibility('fakeView', 'Node', plainNode)).toBe(VIEW_COMPATIBILITY.NO)
    expect(getViewCompatibility('fakeView', 'Node')).toBe(VIEW_COMPATIBILITY.UNKNOWN)
  })

  it('is UNKNOWN while its filter cannot decide yet', () => {
    moduleRegistry.setServerComponents(['CORE', 'FAKE'])
    const pendingNode = { class: 'Node', customAttributes: [{ name: 'isFake', value: 'pending' }] }
    expect(getViewCompatibility('fakeView', 'Node', pendingNode)).toBe(VIEW_COMPATIBILITY.UNKNOWN)
    expect(isViewCompatible('fakeView', 'Node', pendingNode)).toBe(true)
    expect(isViewConfirmedCompatible('fakeView', 'Node', pendingNode)).toBe(false)
  })

  it('stays out of the Manage views groups until the module is active', () => {
    const ids = () => getObjectViewGroups().monitoring.views.map((v) => v.id)
    expect(ids()).not.toContain('fakeView')
    moduleRegistry.setServerComponents([])
    expect(ids()).not.toContain('fakeView')
    moduleRegistry.setServerComponents(['FAKE'])
    expect(ids()).toContain('fakeView')
    expect(ids()).toContain('alarms')
  })

  it('stays out of the Open submenu until the module is active', () => {
    const ids = () => getViewGroupsForObject(fakeNode).flatMap((g) => g.views.map((v) => v.id))
    expect(ids()).not.toContain('fakeView')
    moduleRegistry.setServerComponents(['FAKE'])
    expect(ids()).toContain('fakeView')
  })

  it('treats a view of a module this build does not contain as absent', () => {
    // A previous build included another module; its view id can remain in stored preferences.
    const otherNode = { class: 'Node', customAttributes: [{ name: 'isOther', value: 'true' }] }
    moduleRegistry.setServerComponents(['OTHER'])
    expect(getViewDefinition('otherView')).toBeUndefined()
    expect(getViewCompatibility('otherView', 'Node', otherNode)).toBe(VIEW_COMPATIBILITY.NO)
    expect(isViewCompatible('otherView', 'Node', otherNode)).toBe(false)
  })
})

describe('validateModuleViews', () => {
  it('rejects a view that names a group the registry does not have', () => {
    expect(() => validateModuleViews([{ moduleId: 'x', group: 'nope', id: 'v' }])).toThrow(
      /unknown group "nope"/,
    )
  })

  it('rejects a view that reuses a core view id', () => {
    expect(() => validateModuleViews([{ moduleId: 'x', group: 'overview', id: 'status' }])).toThrow(
      /reuses a core view id/,
    )
  })

  it('accepts a module view that is already merged', () => {
    const merged = { ...getViewDefinition('fakeView'), group: 'monitoring' }
    expect(() => validateModuleViews([merged])).not.toThrow()
  })
})
