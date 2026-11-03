import { describe, it, expect, vi } from 'vitest'

vi.mock('@/router', () => ({
  default: {
    push: vi.fn(),
    resolve: (to) => ({ href: `/${to.name}/${Object.values(to.params ?? {}).join('/')}` }),
    currentRoute: { value: { params: {} } },
  },
}))

const objectActions = (await import('@/actions/objectActions')).default
const { resolveActions } = await import('@/composables/useActions')
const { OBJECT_ACCESS_RIGHTS } = await import('@/auth/objectAccessRights')

/** The top level must look the same for every object; new items go inside an existing slot. */
const SKELETON_ORDER = [
  'object.open',
  'object.create',
  'object.poll',
  'object.tools',
  'object.manage',
  'object.unmanage',
  'object.expectedState',
  'object.maintenance',
  'object.organize',
  'object.templates',
  'object.rename',
  'object.delete',
  'object.openDashboardProperties',
  'object.openNetworkMapProperties',
  'object.openNetworkMapContainerProperties',
  'object.properties',
]

function menuFor(object, viewContext = 'objectTree') {
  return resolveActions(objectActions, { object, viewContext })
}

function topLevelIds(menu) {
  return menu.filter((i) => !i.separator).map((i) => i.id)
}

const NODE = { id: 10, name: 'server-01', class: 'Node', status: 1 }
const CONTAINER = { id: 20, name: 'Servers', class: 'Container', status: 1 }
const TEMPLATE = { id: 30, name: 'Base', class: 'Template', status: 1 }
const NETWORK_MAP = { id: 40, name: 'Core', class: 'NetworkMap', status: 1 }
const INTERFACE = {
  id: 50,
  name: 'ether5',
  class: 'Interface',
  status: 0,
  expectedState: 0,
  peerInterfaceId: 0,
}

describe('object action skeleton', () => {
  it('never introduces a top-level id outside the skeleton', () => {
    for (const object of [NODE, CONTAINER, TEMPLATE, NETWORK_MAP, INTERFACE]) {
      for (const id of topLevelIds(menuFor(object))) {
        expect(SKELETON_ORDER, `unexpected top-level action for ${object.class}`).toContain(id)
      }
    }
  })

  it('keeps every class in the same relative order', () => {
    for (const object of [NODE, CONTAINER, TEMPLATE, NETWORK_MAP, INTERFACE]) {
      const ids = topLevelIds(menuFor(object))
      const expected = SKELETON_ORDER.filter((id) => ids.includes(id))
      expect(ids, `order differs for ${object.class}`).toEqual(expected)
    }
  })

  it('puts Delete last among destructive actions and Properties at the very end', () => {
    const ids = topLevelIds(menuFor(NODE))
    expect(ids.at(-1)).toBe('object.properties')
    expect(ids.indexOf('object.delete')).toBeGreaterThan(ids.indexOf('object.rename'))
  })

  it('marks Delete as danger', () => {
    const del = menuFor(NODE).find((i) => i.id === 'object.delete')
    expect(del.danger).toBe(true)
  })

  it('keeps the top level short for a Node', () => {
    // Legacy had several dozen entries here; anything approaching that is a regression.
    expect(topLevelIds(menuFor(NODE)).length).toBeLessThanOrEqual(12)
  })

  it('shows exactly one of Manage / Unmanage', () => {
    const managed = topLevelIds(menuFor({ ...NODE, status: 1 }))
    const unmanaged = topLevelIds(menuFor({ ...NODE, status: 6 }))
    expect(managed).toContain('object.unmanage')
    expect(managed).not.toContain('object.manage')
    expect(unmanaged).toContain('object.manage')
    expect(unmanaged).not.toContain('object.unmanage')
  })

  it('hides Manage entirely for template classes', () => {
    const ids = topLevelIds(menuFor(TEMPLATE))
    expect(ids).not.toContain('object.manage')
    expect(ids).not.toContain('object.unmanage')
  })
})

describe('Open submenu', () => {
  it('is offered only inside the Infrastructure perspective', () => {
    expect(topLevelIds(menuFor(NODE, 'objectTree'))).toContain('object.open')
    expect(topLevelIds(menuFor(NODE, 'dashboardTree'))).not.toContain('object.open')
    expect(topLevelIds(menuFor(NODE, 'assetsTree'))).not.toContain('object.open')
  })

  it('lists views from the registry for the object class', () => {
    const open = menuFor(NODE).find((i) => i.id === 'object.open')
    const ids = open.items.filter((i) => !i.separator).map((i) => i.id)
    expect(ids).toContain('object.open.alarms')
    expect(ids).toContain('object.open.interfaces')
  })

  it('omits views that have their own top-level slot', () => {
    const open = menuFor(NODE).find((i) => i.id === 'object.open')
    const ids = open.items.map((i) => i.id)
    expect(ids).not.toContain('object.open.properties')
    expect(ids).not.toContain('object.open.polls')
    expect(ids).not.toContain('object.open.script')
  })

  it('drops class-specific views for other classes', () => {
    const open = menuFor(CONTAINER).find((i) => i.id === 'object.open')
    const ids = open.items.map((i) => i.id)
    expect(ids).not.toContain('object.open.interfaces')
    expect(ids).toContain('object.open.statusMap')
  })

  it('gates the OSPF topology map on the capability flag', () => {
    const withOspf = menuFor({ ...NODE, capabilities: { isOspf: true } })
    const without = menuFor(NODE)
    const typesOf = (menu) =>
      menu
        .find((i) => i.id === 'object.open')
        .items.find((i) => i.id === 'object.open.topology')
        .items.map((i) => i.id)
    expect(typesOf(withOspf)).toContain('object.open.topology.ospf')
    expect(typesOf(without)).not.toContain('object.open.topology.ospf')
  })
})

describe('operations slots', () => {
  it('offers poll types matching the class', () => {
    const nodePolls = menuFor(NODE)
      .find((i) => i.id === 'object.poll')
      .items.map((i) => i.id)
    expect(nodePolls).toContain('object.poll.status')
    expect(nodePolls).not.toContain('object.poll.automaticBinding')

    const containerPolls = menuFor(CONTAINER)
      .find((i) => i.id === 'object.poll')
      .items.map((i) => i.id)
    expect(containerPolls).toEqual(['object.poll.automaticBinding'])
  })

  it('keeps the Tools slot alive for injection even with no applicable static child', () => {
    const tools = menuFor(CONTAINER).find((i) => i.id === 'object.tools')
    expect(tools).toBeDefined()
    expect(tools.dynamic).toBe(true)
  })

  it('carries Execute script inside Tools rather than at the top level', () => {
    const tools = menuFor(NODE).find((i) => i.id === 'object.tools')
    expect(tools.items.map((i) => i.id)).toContain('object.tools.executeScript')
  })

  it('promotes exactly the slots meant for the header toolbar', () => {
    const promoted = menuFor(NODE)
      .filter((i) => i.primary)
      .map((i) => i.id)
    expect(promoted).toEqual(['object.poll', 'object.tools'])
  })
})

describe('Export data', () => {
  const RACK = { id: 50, name: 'Rack A1', class: 'Rack', status: 1 }
  const FACILITY = { id: 60, name: 'DC-1', class: 'Facility', status: 1 }

  function toolItems(object) {
    const tools = menuFor(object).find((i) => i.id === 'object.tools')
    return (tools?.items ?? []).filter((i) => !i.separator)
  }

  it('is offered on the legacy spatial classes and on containers', () => {
    for (const object of [CONTAINER, RACK, FACILITY]) {
      expect(toolItems(object).map((i) => i.id)).toContain('object.tools.exportData')
    }
  })

  it('is not offered on a node', () => {
    expect(toolItems(NODE).map((i) => i.id)).not.toContain('object.tools.exportData')
  })

  it('opens the tool on the object, as a real link', () => {
    const item = toolItems(RACK).find((i) => i.id === 'object.tools.exportData')
    expect(item.url).toBe('/tool/data-export')
    expect(typeof item.command).toBe('function')
  })

  it('brings no node tools along to a rack', () => {
    expect(toolItems(RACK).map((i) => i.id)).toEqual(['object.tools.exportData'])
  })
})

describe('Take screenshot', () => {
  const WINDOWS_AGENT_NODE = {
    ...NODE,
    capabilities: { isNativeAgent: true },
    platformName: 'windows-x64',
  }

  function toolIds(object) {
    const tools = menuFor(object).find((i) => i.id === 'object.tools')
    return (tools?.items ?? []).filter((i) => !i.separator).map((i) => i.id)
  }

  it('is offered on a Windows node running the agent', () => {
    expect(toolIds(WINDOWS_AGENT_NODE)).toContain('object.tools.screenshot')
  })

  // The capture goes to the agent's session agent, which is Windows-only; offering it
  // anywhere else produces a request that can only fail.
  it('is hidden on a non-Windows platform', () => {
    expect(toolIds({ ...WINDOWS_AGENT_NODE, platformName: 'linux-x86_64' })).not.toContain(
      'object.tools.screenshot',
    )
  })

  it('is hidden when the node has no native agent', () => {
    expect(
      toolIds({ ...WINDOWS_AGENT_NODE, capabilities: { isNativeAgent: false, isSnmp: true } }),
    ).not.toContain('object.tools.screenshot')
  })

  it('is hidden when capabilities have not loaded yet', () => {
    expect(toolIds(NODE)).not.toContain('object.tools.screenshot')
  })

  it('needs the screenshot right, not read or control', () => {
    const rights = (...keys) =>
      Object.fromEntries(OBJECT_ACCESS_RIGHTS.map((r) => [r.api, keys.includes(r.key)]))
    expect(
      toolIds({ ...WINDOWS_AGENT_NODE, effectiveRights: rights('READ', 'CONTROL') }),
    ).not.toContain('object.tools.screenshot')
    expect(
      toolIds({ ...WINDOWS_AGENT_NODE, effectiveRights: rights('READ', 'SCREENSHOT') }),
    ).toContain('object.tools.screenshot')
  })
})

describe('Organize submenu', () => {
  it('offers bind/unbind for a bindable object', () => {
    const organize = menuFor(NODE).find((i) => i.id === 'object.organize')
    const ids = organize.items.map((i) => i.id)
    expect(ids).toContain('object.organize.bindToContainer')
    expect(ids).toContain('object.organize.unbindFromContainer')
  })

  it('offers container-side binding for a container', () => {
    const organize = menuFor(CONTAINER).find((i) => i.id === 'object.organize')
    const ids = organize.items.map((i) => i.id)
    expect(ids).toContain('object.organize.bindObjectInto')
    expect(ids).not.toContain('object.organize.bindToContainer')
  })

  it('disappears when nothing inside it applies', () => {
    expect(topLevelIds(menuFor(TEMPLATE))).not.toContain('object.organize')
  })
})

describe('Maintenance submenu', () => {
  const target = { ...NODE, isMaintenanceApplicable: true }

  it('offers Start when the object is not in maintenance', () => {
    const items = menuFor({ ...target, isInMaintenanceMode: false }).find(
      (i) => i.id === 'object.maintenance',
    ).items
    expect(items.map((i) => i.id)).toEqual(['object.maintenance.start'])
  })

  it('offers End when the object is in maintenance', () => {
    const items = menuFor({ ...target, isInMaintenanceMode: true }).find(
      (i) => i.id === 'object.maintenance',
    ).items
    expect(items.map((i) => i.id)).toEqual(['object.maintenance.end'])
  })

  it('is hidden when maintenance does not apply to the object', () => {
    expect(topLevelIds(menuFor(NODE))).not.toContain('object.maintenance')
  })
})

describe('Properties slot', () => {
  it('routes a plain object to the infrastructure properties view', () => {
    expect(topLevelIds(menuFor(NODE))).toContain('object.properties')
  })

  it('uses the network map variant for a network map', () => {
    const ids = topLevelIds(menuFor(NETWORK_MAP))
    expect(ids).toContain('object.openNetworkMapProperties')
    expect(ids).not.toContain('object.properties')
  })
})

describe('Open submenu links', () => {
  it('gives every view entry a url so it can be opened in a new tab', () => {
    const openItems = menuFor(NODE)
      .find((i) => i.id === 'object.open')
      .items.filter((i) => i.id?.startsWith('object.open.') && !i.items)

    const viewEntries = openItems.filter((i) => i.url)
    expect(viewEntries.length).toBeGreaterThan(0)
    for (const item of viewEntries) {
      expect(item.url).toContain('/infrastructure/10')
    }
  })

  it('gives poll entries a url that re-runs the poll', () => {
    const pollItems = menuFor(NODE).find((i) => i.id === 'object.poll').items
    for (const item of pollItems) {
      expect(item.url).toContain('/infrastructure/10/polls/')
    }
  })
})

/**
 * Object-level gating on `effectiveRights`. Objects without the document (older server, summary)
 * are not gated.
 */
describe('effective rights gating', () => {
  /** A full effective-rights document with the named rights granted and the rest denied. */
  const rights = (...keys) =>
    Object.fromEntries(OBJECT_ACCESS_RIGHTS.map((r) => [r.api, keys.includes(r.key)]))

  const withRights = (granted) => ({ ...NODE, effectiveRights: granted })

  function toolIds(object) {
    const tools = menuFor(object).find((i) => i.id === 'object.tools')
    return (tools?.items ?? []).filter((i) => !i.separator).map((i) => i.id)
  }

  it('offers everything when the server sent no rights', () => {
    const ids = topLevelIds(menuFor(NODE))
    expect(ids).toContain('object.delete')
    expect(ids).toContain('object.rename')
    expect(ids).toContain('object.unmanage')
    expect(toolIds(NODE)).toContain('object.tools.executeScript')
  })

  it('offers everything when the rights document is explicitly null', () => {
    expect(topLevelIds(menuFor(withRights(null)))).toContain('object.delete')
  })

  it('hides modifying actions for a read-only user', () => {
    const readOnly = withRights(rights('READ'))
    const ids = topLevelIds(menuFor(readOnly))
    expect(ids).not.toContain('object.delete')
    expect(ids).not.toContain('object.rename')
    expect(ids).not.toContain('object.unmanage')
    expect(ids).not.toContain('object.create')
    expect(ids).not.toContain('object.organize')
    expect(toolIds(readOnly)).not.toContain('object.tools.executeScript')
  })

  it('keeps read-only navigation intact', () => {
    const ids = topLevelIds(menuFor(withRights(rights('READ'))))
    expect(ids).toContain('object.open')
    expect(ids).toContain('object.properties')
  })

  it('shows exactly the granted action and nothing more', () => {
    const ids = topLevelIds(menuFor(withRights(rights('READ', 'DELETE'))))
    expect(ids).toContain('object.delete')
    expect(ids).not.toContain('object.rename')
  })

  it('gates Create on the right of the parent that was right-clicked', () => {
    const container = { ...CONTAINER, effectiveRights: rights('READ') }
    expect(topLevelIds(menuFor(container))).not.toContain('object.create')
    expect(
      topLevelIds(menuFor({ ...container, effectiveRights: rights('READ', 'CREATE') })),
    ).toContain('object.create')
  })

  it('gates maintenance on its own right, not on modify', () => {
    const base = { ...NODE, isMaintenanceApplicable: true, isInMaintenanceMode: false }
    expect(
      topLevelIds(menuFor({ ...base, effectiveRights: rights('READ', 'MODIFY') })),
    ).not.toContain('object.maintenance')
    expect(
      topLevelIds(menuFor({ ...base, effectiveRights: rights('READ', 'MAINTENANCE') })),
    ).toContain('object.maintenance')
  })

  it('gates script execution on its own right, not on modify', () => {
    expect(toolIds(withRights(rights('READ', 'EXECUTE_SCRIPT')))).toContain(
      'object.tools.executeScript',
    )
    expect(toolIds(withRights(rights('READ', 'MODIFY')))).not.toContain(
      'object.tools.executeScript',
    )
  })

  it('gates only the full configuration poll', () => {
    const pollIds = (granted) =>
      menuFor(withRights(granted))
        .find((i) => i.id === 'object.poll')
        .items.filter((i) => !i.separator)
        .map((i) => i.id)

    expect(pollIds(rights('READ'))).toContain('object.poll.status')
    expect(pollIds(rights('READ'))).not.toContain('object.poll.configuration')
    expect(pollIds(rights('READ', 'MODIFY'))).toContain('object.poll.configuration')
  })

  it('keeps the Tools slot alive after gating out a child', () => {
    // The slot is `dynamic` - server-defined object tools are injected into it at render
    // time - so it must survive losing a static child rather than collapsing.
    const readOnly = withRights(rights('READ'))
    expect(topLevelIds(menuFor(readOnly))).toContain('object.tools')
    expect(toolIds(readOnly)).not.toContain('object.tools.executeScript')
  })
})

describe('multi-selection menu shape', () => {
  // The Maintenance children gate on isMaintenanceApplicable, so a range without it has no
  // Maintenance slot.
  const NODE_A = {
    id: 10,
    name: 'server-01',
    class: 'Node',
    status: 1,
    isMaintenanceApplicable: true,
    isInMaintenanceMode: false,
  }
  const NODE_B = {
    id: 11,
    name: 'server-02',
    class: 'Node',
    status: 6,
    isMaintenanceApplicable: true,
    isInMaintenanceMode: false,
  }
  const CONTAINER_A = { id: 20, name: 'Servers', class: 'Container', status: 0 }
  const CONTAINER_B = { id: 21, name: 'Routers', class: 'Container', status: 0 }

  function multiMenuFor(objects, viewContext = 'objectTree') {
    return topLevelIds(
      resolveActions(objectActions, { object: objects[0], viewContext, selection: objects }),
    )
  }

  it('drops the single-object slots from a range', () => {
    const ids = multiMenuFor([NODE_A, NODE_B])
    expect(ids).not.toContain('object.open')
    expect(ids).not.toContain('object.create')
    expect(ids).not.toContain('object.poll')
    expect(ids).not.toContain('object.rename')
    expect(ids).not.toContain('object.properties')
  })

  it('keeps the bulk-capable slots on a range', () => {
    const ids = multiMenuFor([NODE_A, NODE_B])
    expect(ids).toContain('object.manage')
    expect(ids).toContain('object.unmanage')
    expect(ids).toContain('object.maintenance')
    expect(ids).toContain('object.organize')
    expect(ids).toContain('object.delete')
  })

  it('offers both Manage and Unmanage on a mixed-status range', () => {
    // One managed (status 1), one unmanaged (status 6): the legacy client shows both.
    const ids = multiMenuFor([NODE_A, NODE_B])
    expect(ids).toContain('object.manage')
    expect(ids).toContain('object.unmanage')
  })

  function organizeChildIds(objects) {
    const organize = resolveActions(objectActions, {
      object: objects[0],
      viewContext: 'objectTree',
      selection: objects,
    }).find((i) => i.id === 'object.organize')
    // Organize hides itself once nothing inside it survives the range gate.
    return (organize?.items ?? []).filter((i) => !i.separator).map((i) => i.id)
  }

  it('keeps only the multi-capable children inside Organize', () => {
    const childIds = organizeChildIds([NODE_A, NODE_B])
    expect(childIds).toContain('object.organize.bindToContainer')
    // Single-only, per legacy: `if (singleObject) add(actionUnbindFrom)`.
    expect(childIds).not.toContain('object.organize.unbindFromContainer')
    expect(childIds).not.toContain('object.organize.changeZone')
    expect(childIds).not.toContain('object.organize.linkAsset')
  })

  it('hides "bind object into" on a range of containers', () => {
    // Single-only, per legacy `if (singleObject) add(actionBind)`: the picked objects are
    // bound INTO the container, so a range gives the bind no defined target.
    const childIds = organizeChildIds([CONTAINER_A, CONTAINER_B])
    expect(childIds).not.toContain('object.organize.bindObjectInto')
    expect(childIds).not.toContain('object.organize.unbindChildrenFromContainer')
  })

  it('hides Delete when the range includes an undeletable root', () => {
    const root = { id: 2, name: 'Infrastructure', class: 'ServiceRoot', status: 0 }
    expect(multiMenuFor([NODE_A, root])).not.toContain('object.delete')
  })
})

describe('template management slot', () => {
  const NODE = { id: 10, name: 'server-01', class: 'Node', status: 1 }
  const CONTAINER_OBJ = { id: 3, name: 'Servers', class: 'Container', status: 0 }

  it('offers the Templates slot on a data collection target', () => {
    expect(topLevelIds(menuFor(NODE))).toContain('object.templates')
  })

  it('hides the Templates slot on an object that cannot own DCIs', () => {
    expect(topLevelIds(menuFor(CONTAINER_OBJ))).not.toContain('object.templates')
  })

  it('survives a multi-selection of data collection targets', () => {
    const ids = topLevelIds(
      resolveActions(objectActions, {
        object: NODE,
        viewContext: 'objectTree',
        selection: [NODE, { id: 11, name: 'server-02', class: 'Node', status: 1 }],
      }),
    )
    expect(ids).toContain('object.templates')
  })

  it('keeps the Node top level under the skeleton cap', () => {
    expect(topLevelIds(menuFor(NODE)).length).toBeLessThanOrEqual(12)
  })
})

describe('interface actions', () => {
  const PEERED = { ...INTERFACE, peerInterfaceId: 51 }
  const IFACE_B = { ...INTERFACE, id: 52, name: 'ether6', expectedState: 2 }

  function itemsOf(menu, slotId) {
    return (menu.find((i) => i.id === slotId)?.items ?? []).filter((i) => !i.separator)
  }

  it('gives interfaces, and only interfaces, the Expected State slot', () => {
    expect(topLevelIds(menuFor(INTERFACE))).toContain('object.expectedState')
    expect(topLevelIds(menuFor(NODE))).not.toContain('object.expectedState')
  })

  it('offers Up, Down and Ignore, never Auto', () => {
    const labels = itemsOf(menuFor(INTERFACE), 'object.expectedState').map((i) => i.label)
    expect(labels).toEqual(['Up', 'Down', 'Ignore'])
  })

  it('disables the state the whole selection already has', () => {
    const single = itemsOf(menuFor(INTERFACE), 'object.expectedState')
    expect(single.find((i) => i.label === 'Up').disabled).toBe(true)
    expect(single.find((i) => i.label === 'Ignore').disabled).toBe(false)

    const mixed = itemsOf(
      resolveActions(objectActions, {
        object: INTERFACE,
        viewContext: 'interfaceTable',
        selection: [INTERFACE, IFACE_B],
      }),
      'object.expectedState',
    )
    expect(mixed.every((i) => !i.disabled)).toBe(true)
  })

  it('leaves nothing disabled for a tree row, which carries no expected state', () => {
    const row = { id: 50, name: 'ether5', class: 'Interface', status: 0 }
    const items = itemsOf(menuFor(row), 'object.expectedState')
    expect(items.every((i) => !i.disabled)).toBe(true)
  })

  it('needs modify for Expected State', () => {
    const readOnly = {
      ...INTERFACE,
      effectiveRights: Object.fromEntries(
        OBJECT_ACCESS_RIGHTS.map((r) => [r.api, r.key === 'READ']),
      ),
    }
    expect(topLevelIds(menuFor(readOnly))).not.toContain('object.expectedState')
  })

  it('puts Set peer in Organize, and Clear peer only where a peer may exist', () => {
    const plain = itemsOf(menuFor(INTERFACE), 'object.organize').map((i) => i.id)
    expect(plain).toContain('object.organize.setPeer')
    expect(plain).not.toContain('object.organize.clearPeer')

    const peered = itemsOf(menuFor(PEERED), 'object.organize').map((i) => i.id)
    expect(peered).toContain('object.organize.clearPeer')

    // A tree row does not say whether there is a peer, so the item stays offered.
    const row = { id: 50, name: 'ether5', class: 'Interface', status: 0 }
    expect(itemsOf(menuFor(row), 'object.organize').map((i) => i.id)).toContain(
      'object.organize.clearPeer',
    )
  })

  it('keeps peer editing single-interface', () => {
    const range = resolveActions(objectActions, {
      object: PEERED,
      viewContext: 'interfaceTable',
      selection: [PEERED, IFACE_B],
    })
    const ids = itemsOf(range, 'object.organize').map((i) => i.id)
    expect(ids).not.toContain('object.organize.setPeer')
    expect(ids).not.toContain('object.organize.clearPeer')
  })

  it('carries interface DCIs and Wake on LAN in Tools', () => {
    const ids = itemsOf(menuFor(INTERFACE), 'object.tools').map((i) => i.id)
    expect(ids).toContain('object.tools.createInterfaceDcis')
    expect(ids).toContain('object.tools.wakeUp')
    expect(ids).not.toContain('object.tools.executeScript')
  })

  it('offers the Open submenu in the Interfaces table', () => {
    expect(topLevelIds(menuFor(INTERFACE, 'interfaceTable'))).toContain('object.open')
  })

  it('offers effective rights in Open for every object', () => {
    for (const object of [NODE, CONTAINER, INTERFACE]) {
      const ids = itemsOf(menuFor(object), 'object.open').map((i) => i.id)
      expect(ids).toContain('object.open.effectiveRights')
    }
  })
})
