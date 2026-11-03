import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/router', () => ({
  default: {
    push: vi.fn(),
    resolve: (to) => ({ href: `/${to.name}/${Object.values(to.params ?? {}).join('/')}` }),
    currentRoute: { value: { params: {} } },
  },
}))

vi.mock('@/queries/config', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}))

vi.mock('@/api/objectsApi', async (importOriginal) => ({
  ...(await importOriginal()),
  setObjectMaintenance: vi.fn(),
}))

const objectActions = (await import('@/actions/objectActions')).default
const { resolveActions } = await import('@/composables/useActions')
const { queryClient } = await import('@/queries/config')
const objectsApi = await import('@/api/objectsApi')

const NODE_OK = {
  id: 10,
  name: 'server-01',
  class: 'Node',
  status: 1,
  isMaintenanceApplicable: true,
  isInMaintenanceMode: true,
}
const NODE_FAILS = {
  id: 11,
  name: 'server-02',
  class: 'Node',
  status: 1,
  isMaintenanceApplicable: true,
  isInMaintenanceMode: true,
}

function findAction(id, selection) {
  const context = { object: selection[0], selection, viewContext: 'objectTree' }
  const menu = resolveActions(objectActions, context)
  const walk = (items) =>
    items.flatMap((item) => (item.items?.length ? walk(item.items) : [item])).filter(Boolean)
  const action = walk(menu).find((item) => item.id === id)
  return { action, context }
}

describe('maintenance over a partly failing selection', () => {
  let events
  let onMaintenanceChanged

  beforeEach(() => {
    queryClient.invalidateQueries.mockClear()
    events = []
    onMaintenanceChanged = (event) => events.push(event.detail)
    window.addEventListener('app:objectMaintenanceChanged', onMaintenanceChanged)

    objectsApi.setObjectMaintenance.mockImplementation((id) =>
      id === NODE_FAILS.id
        ? Promise.reject(Object.assign(new Error('Internal error'), { status: 500 }))
        : Promise.resolve({}),
    )
  })

  afterEach(() => {
    window.removeEventListener('app:objectMaintenanceChanged', onMaintenanceChanged)
  })

  async function runEndMaintenance() {
    const { action, context } = findAction('object.maintenance.end', [NODE_OK, NODE_FAILS])
    expect(action).toBeDefined()
    await action.command({ actionContext: context, item: action })
  }

  it('invalidates the object that changed and not the one that failed', async () => {
    await runEndMaintenance()

    const keys = queryClient.invalidateQueries.mock.calls.map(([arg]) => arg.queryKey)
    expect(keys).toContainEqual(['objects', 'detail', NODE_OK.id])
    expect(keys).not.toContainEqual(['objects', 'detail', NODE_FAILS.id])
    expect(keys.some((key) => key[0] === 'objects' && key[1] === 'subTree')).toBe(true)
  })

  it('reports succeeded and failed objects separately', async () => {
    await runEndMaintenance()

    expect(events).toHaveLength(1)
    const [detail] = events
    expect(detail.maintenance).toBe(false)
    expect(detail.succeeded).toEqual([{ id: NODE_OK.id, name: NODE_OK.name }])
    expect(detail.failed).toEqual([
      { id: NODE_FAILS.id, name: NODE_FAILS.name, status: 500, message: 'Internal error' },
    ])
  })

  it('leaves the subtree alone when every request failed', async () => {
    objectsApi.setObjectMaintenance.mockImplementation(() =>
      Promise.reject(Object.assign(new Error('Access denied'), { status: 403 })),
    )

    await runEndMaintenance()

    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
    expect(events[0].succeeded).toEqual([])
    expect(events[0].failed).toHaveLength(2)
  })
})
