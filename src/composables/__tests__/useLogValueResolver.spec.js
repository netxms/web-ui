import { describe, it, expect, vi } from 'vitest'
import { effectScope, ref, toValue } from 'vue'

/** Ids handed to useObjectsByIds, i.e. the per-object requests that would be fired. */
let requestedObjectIds
let fetchedObjects
let userList

vi.mock('@/queries/useObjectQueries', () => ({
  useObjectsByIds: (ids) => {
    requestedObjectIds = ids
    return {
      objectsById: ref(new Map(Object.entries(fetchedObjects).map(([id, o]) => [Number(id), o]))),
    }
  },
  useZoneNames: () => ref(new Map([[7, 'DMZ']])),
}))
vi.mock('@/queries/useUserQueries', () => ({ useUsers: () => ({ data: ref(userList) }) }))
vi.mock('@/queries/useEventTemplateQueries', () => ({
  useEventTemplates: () => ({ data: ref([{ code: 4, name: 'SYS_NODE_DOWN' }]) }),
}))

const { useLogValueResolver } = await import('../useLogValueResolver')

const columns = [
  { name: 'source_object_id', type: 'objectId' },
  { name: 'ack_by', type: 'userId' },
]

function resolve(records, resolvedPages) {
  requestedObjectIds = null
  fetchedObjects = fetchedObjects ?? {}
  userList = userList ?? []
  const scope = effectScope()
  const resolver = scope.run(() => useLogValueResolver(records, columns, resolvedPages))
  return { resolver, dispose: () => scope.stop() }
}

function serverPage(objects = {}, users = {}) {
  return { objects, users }
}

describe('useLogValueResolver', () => {
  it('uses the server lookup and fires no per-object request', () => {
    fetchedObjects = {}
    userList = []
    const records = [{ source_object_id: 10 }, { source_object_id: 10 }, { source_object_id: 11 }]
    const pages = [
      serverPage(
        {
          10: { id: 10, class: 'Node', name: 'web-01' },
          11: { id: 11, class: 'Node', name: 'db-01' },
        },
        { 3: 'jdoe' },
      ),
    ]

    const { resolver, dispose } = resolve(records, pages)

    expect(toValue(requestedObjectIds)).toEqual([])
    expect(resolver.value.objectsById.get(10).name).toBe('web-01')
    expect(resolver.value.usersById.get(3)).toBe('jdoe')
    dispose()
  })

  it('merges the lookups of every loaded page', () => {
    fetchedObjects = {}
    userList = []
    const pages = [
      serverPage({ 10: { id: 10, class: 'Node', name: 'web-01' } }, { 3: 'jdoe' }),
      serverPage({ 11: { id: 11, class: 'Node', name: 'db-01' } }, { 4: 'asmith' }),
    ]

    const { resolver, dispose } = resolve(
      [{ source_object_id: 10 }, { source_object_id: 11 }],
      pages,
    )

    expect([...resolver.value.objectsById.keys()]).toEqual([10, 11])
    expect(resolver.value.usersById.get(4)).toBe('asmith')
    dispose()
  })

  it('resolves user names the privileged user list does not carry', () => {
    // GET /v1/users needs MANAGE_USERS; server-side resolution does not.
    fetchedObjects = {}
    userList = []

    const { resolver, dispose } = resolve([{ ack_by: 3 }], [serverPage({}, { 3: 'jdoe' })])

    expect(resolver.value.usersById.get(3)).toBe('jdoe')
    dispose()
  })

  it('falls back to fetching ids an older server did not resolve', () => {
    fetchedObjects = { 11: { id: 11, class: 'Node', name: 'db-01' } }
    userList = [{ id: 3, name: 'jdoe' }]

    const { resolver, dispose } = resolve([{ source_object_id: 11, ack_by: 3 }], [])

    expect(toValue(requestedObjectIds)).toEqual([11])
    expect(resolver.value.objectsById.get(11).name).toBe('db-01')
    expect(resolver.value.usersById.get(3)).toBe('jdoe')
    dispose()
  })

  it('fetches only the ids missing from a partial server lookup', () => {
    // Objects the caller cannot read are omitted server side and must not be re-requested.
    fetchedObjects = {}
    userList = []
    const records = [{ source_object_id: 10 }, { source_object_id: 12 }]

    const { dispose } = resolve(records, [
      serverPage({ 10: { id: 10, class: 'Node', name: 'web-01' } }),
    ])

    expect(toValue(requestedObjectIds)).toEqual([12])
    dispose()
  })

  it('lets the server name win over the user list', () => {
    fetchedObjects = {}
    userList = [{ id: 3, name: 'stale' }]

    const { resolver, dispose } = resolve([{ ack_by: 3 }], [serverPage({}, { 3: 'jdoe' })])

    expect(resolver.value.usersById.get(3)).toBe('jdoe')
    dispose()
  })
})
