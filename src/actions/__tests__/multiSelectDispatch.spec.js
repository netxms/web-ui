import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Every action with `multiSelect: true` must act on the whole range: the range gate in
 * `useActions` only decides what is offered, so a command dispatching `ctx.object` alone would
 * silently act on the right-clicked row.
 */

vi.mock('@/router', () => ({
  default: {
    push: vi.fn(),
    resolve: (to) => ({ href: `/${to.name}/${Object.values(to.params ?? {}).join('/')}` }),
    currentRoute: { value: { params: {} } },
  },
}))

vi.mock('@/queries/config', async (importOriginal) => ({
  ...(await importOriginal()),
  queryClient: { invalidateQueries: vi.fn(), fetchQuery: vi.fn(() => Promise.resolve({})) },
}))

vi.mock('@/utils/notImplemented', () => ({ notifyNotImplemented: vi.fn() }))

vi.mock('@/api/objectsApi', async (importOriginal) => ({
  ...(await importOriginal()),
  setObjectManaged: vi.fn(() => Promise.resolve({})),
  setObjectMaintenance: vi.fn(() => Promise.resolve({})),
  wakeUpObject: vi.fn(() => Promise.resolve({})),
  updateObjectProperties: vi.fn(() => Promise.resolve({})),
}))

const objectActions = (await import('@/actions/objectActions')).default
const templateActions = (await import('@/actions/templateActions')).default
const { resolveActions } = await import('@/composables/useActions')
const objectsApi = await import('@/api/objectsApi')
const { notifyNotImplemented } = await import('@/utils/notImplemented')

const OBJECT_APIS = [
  'setObjectManaged',
  'setObjectMaintenance',
  'wakeUpObject',
  'updateObjectProperties',
]

/** Let sequential `await`ed API loops (Manage/Unmanage) run to completion. */
async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

function leafCommands(items) {
  const out = []
  for (const item of items) {
    if (item.separator) continue
    if (item.items?.length) out.push(...leafCommands(item.items))
    else if (item.command) out.push(item)
  }
  return out
}

/** Objects reached through the dispatched event or through API calls, whichever is larger. */
function reachCount(events, apiCalls) {
  const fromEvents = events.map((detail) => {
    if (Array.isArray(detail?.objects)) return detail.objects.length
    if (Array.isArray(detail?.selection)) return detail.selection.length
    // A lone `object` in a range is exactly the bug this guards against.
    if (detail?.object) return 1
    return 0
  })
  return Math.max(0, ...fromEvents, apiCalls)
}

function multiTargetActions(actions, selection, viewContext) {
  const ctx = { object: selection[0], viewContext, selection }
  return leafCommands(resolveActions(actions, ctx))
}

async function runAction(action) {
  const events = []
  const spy = vi.spyOn(document, 'dispatchEvent').mockImplementation((event) => {
    events.push(event.detail)
    return true
  })
  try {
    action.command({})
    await flush()
  } finally {
    spy.mockRestore()
  }
  const apiCalls = OBJECT_APIS.reduce(
    (total, name) => total + objectsApi[name].mock.calls.length,
    0,
  )
  return {
    reach: reachCount(events, apiCalls),
    notImplemented: notifyNotImplemented.mock.calls.length > 0,
  }
}

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
  isInMaintenanceMode: true,
}
// Expected state differs, so no Expected State item is disabled for the range.
const IFACE_A = { id: 40, name: 'ether1', class: 'Interface', status: 0, expectedState: 0 }
const IFACE_B = { id: 41, name: 'ether2', class: 'Interface', status: 6, expectedState: 2 }
const TEMPLATE_A = { id: 30, name: 'Base', class: 'Template', status: 1 }
const TEMPLATE_B = { id: 31, name: 'Extra', class: 'Template', status: 6 }

describe('multi-select actions act on the whole selection', () => {
  beforeEach(() => {
    for (const name of OBJECT_APIS) objectsApi[name].mockClear()
    notifyNotImplemented.mockClear()
  })

  const cases = [
    { name: 'object', actions: objectActions, selection: [NODE_A, NODE_B], view: 'objectTree' },
    {
      name: 'interface',
      actions: objectActions,
      selection: [IFACE_A, IFACE_B],
      view: 'interfaceTable',
    },
    {
      name: 'template',
      actions: templateActions,
      selection: [TEMPLATE_A, TEMPLATE_B],
      view: 'templateTree',
    },
  ]

  for (const { name, actions, selection, view } of cases) {
    it(`offers at least one ${name} action on a range`, () => {
      expect(multiTargetActions(actions, selection, view).length).toBeGreaterThan(0)
    })

    for (const action of multiTargetActions(actions, selection, view)) {
      it(`${action.id} reaches both selected objects`, async () => {
        const { reach, notImplemented } = await runAction(action)
        // A placeholder slot raises the "not available yet" notice and touches no object,
        // so there is no selection for it to drop yet.
        expect(reach).toBe(notImplemented ? 0 : selection.length)
      })
    }
  }
})
