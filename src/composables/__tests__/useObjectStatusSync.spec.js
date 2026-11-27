import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import * as alarmsApi from '@/api/alarmsApi'
import * as objectsApi from '@/api/objectsApi'
import { objectKeys } from '@/queries/useObjectQueries'
import { useObjectStatusSync, MAX_STATUS_READS } from '../useObjectStatusSync'

vi.mock('@/api/alarmsApi')
vi.mock('@/api/objectsApi')

const TREE_KEY = objectKeys.subTree(2, undefined)

// Infrastructure root 2 > container 10 > nodes 15 and 16.
const tree = () => [
  {
    id: 10,
    status: 0,
    children: [
      { id: 15, status: 0 },
      { id: 16, status: 0 },
    ],
  },
]

let queryClient
let wrapper

const settle = () => vi.advanceTimersByTimeAsync(0)

function alarm(id, source, severity, state = 0) {
  return { id, source, severity, state }
}

async function start(initialAlarms) {
  alarmsApi.getAlarms.mockResolvedValue(initialAlarms)
  const Host = defineComponent({
    setup() {
      useObjectStatusSync()
      return () => h('div')
    },
  })
  wrapper = mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } })
  await settle()
}

async function poll(alarms) {
  alarmsApi.getAlarms.mockResolvedValue(alarms)
  await queryClient.refetchQueries({ queryKey: ['alarms'] })
  await settle()
}

function readIds() {
  return objectsApi.getObject.mock.calls.map(([id]) => id).sort((a, b) => a - b)
}

beforeEach(() => {
  vi.useFakeTimers()
  // clearAllMocks leaves these automocked exports' calls in place.
  alarmsApi.getAlarms.mockReset()
  objectsApi.getObject.mockReset()
  queryClient = new QueryClient()
  objectsApi.getObject.mockImplementation((id) =>
    Promise.resolve({ id, name: `o${id}`, status: 4 }),
  )
})

afterEach(() => {
  wrapper?.unmount()
  queryClient.clear()
  vi.useRealTimers()
})

describe('useObjectStatusSync', () => {
  it('takes the first alarm list as a baseline', async () => {
    queryClient.setQueryData(TREE_KEY, tree())
    await start([alarm(1, 15, 4)])
    expect(objectsApi.getObject).not.toHaveBeenCalled()
  })

  it('rereads the source and its cached ancestors, and patches every cached copy', async () => {
    queryClient.setQueryData(TREE_KEY, tree())
    queryClient.setQueryData(objectKeys.detail('15'), { id: 15, name: 'o15', status: 0 })
    queryClient.setQueryData(objectKeys.detail(2), { id: 2, name: 'o2', status: 0 })
    await start([])
    const treeUpdatedAt = queryClient.getQueryState(TREE_KEY).dataUpdatedAt

    vi.advanceTimersByTime(1000)
    await poll([alarm(1, 15, 4)])

    expect(readIds()).toEqual([2, 10, 15])
    const patched = queryClient.getQueryData(TREE_KEY)
    expect(patched[0].status).toBe(4)
    expect(patched[0].children[0].status).toBe(4)
    expect(patched[0].children[1].status).toBe(0)
    expect(queryClient.getQueryState(TREE_KEY).dataUpdatedAt).toBe(treeUpdatedAt)
    expect(queryClient.getQueryData(objectKeys.detail('15')).status).toBe(4)
    expect(queryClient.getQueryData(objectKeys.detail(2)).status).toBe(4)
  })

  it('does nothing when an alarm is only acknowledged', async () => {
    queryClient.setQueryData(TREE_KEY, tree())
    await start([alarm(1, 15, 4, 0)])
    await poll([alarm(1, 15, 4, 1)])
    expect(objectsApi.getObject).not.toHaveBeenCalled()
  })

  it('reads nothing for a source that no cache holds', async () => {
    queryClient.setQueryData(TREE_KEY, tree())
    await start([])
    await poll([alarm(1, 99, 4)])
    expect(objectsApi.getObject).not.toHaveBeenCalled()
  })

  it('refetches instead of rereading when too many objects changed at once', async () => {
    const many = Array.from({ length: MAX_STATUS_READS + 1 }, (_, i) => ({
      id: 100 + i,
      status: 0,
    }))
    queryClient.setQueryData(TREE_KEY, many)
    await start([])
    await poll(many.map((node, i) => alarm(i + 1, node.id, 4)))

    expect(objectsApi.getObject).not.toHaveBeenCalled()
    expect(queryClient.getQueryState(TREE_KEY).isInvalidated).toBe(true)
  })

  it('leaves an entry alone that was refetched while the reads were out', async () => {
    queryClient.setQueryData(TREE_KEY, tree())
    const releases = []
    objectsApi.getObject.mockImplementation(
      (id) => new Promise((resolve) => releases.push(() => resolve({ id, status: 4 }))),
    )
    await start([])
    await poll([alarm(1, 16, 4)])

    vi.advanceTimersByTime(1000)
    const newer = [{ id: 10, status: 3, children: [{ id: 16, status: 3 }] }]
    queryClient.setQueryData(TREE_KEY, newer)
    releases.forEach((release) => release())
    await settle()

    expect(queryClient.getQueryData(TREE_KEY)).toEqual(newer)
  })

  it('rereads sources that changed during a refresh once it is done', async () => {
    queryClient.setQueryData(TREE_KEY, tree())
    const releases = []
    objectsApi.getObject.mockImplementation(
      (id) => new Promise((resolve) => releases.push(() => resolve({ id, status: 4 }))),
    )
    await start([])
    await poll([alarm(1, 15, 4)])
    expect(readIds()).toEqual([10, 15])

    await poll([alarm(1, 15, 4), alarm(2, 16, 3)])
    expect(objectsApi.getObject).toHaveBeenCalledTimes(2)

    releases.forEach((release) => release())
    await settle()
    expect(
      objectsApi.getObject.mock.calls
        .slice(2)
        .map(([id]) => id)
        .sort(),
    ).toEqual([10, 16])
  })
})
