import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

// A partial mock is enough: other exports are only dereferenced inside queryFns not run here.
vi.mock('@/api/objectsApi', () => ({
  updateObjectPhysicalPlacement: vi.fn(),
}))

const objectsApi = await import('@/api/objectsApi')
const { useUpdateObjectPhysicalPlacement, objectKeys } = await import('../useObjectQueries')

let queryClient

function withMutation() {
  let api
  mount(
    defineComponent({
      setup() {
        api = useUpdateObjectPhysicalPlacement()
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  )
  return api
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.clearAllMocks()
})

afterEach(() => {
  queryClient.clear()
})

describe('useUpdateObjectPhysicalPlacement', () => {
  it('sends the group to the placement sub-resource of the placed object', async () => {
    objectsApi.updateObjectPhysicalPlacement.mockResolvedValue({ id: 27710 })
    const mutation = withMutation()

    await mutation.mutateAsync({ id: 27710, payload: { containerId: 326, position: 36 } })

    expect(objectsApi.updateObjectPhysicalPlacement).toHaveBeenCalledWith(27710, {
      containerId: 326,
      position: 36,
    })
  })

  it('invalidates every rack and chassis layout, not just one container', async () => {
    // The request names only the placed object, so the old rack's layout is dropped by prefix.
    objectsApi.updateObjectPhysicalPlacement.mockResolvedValue({ id: 27710 })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const mutation = withMutation()

    await mutation.mutateAsync({ id: 27710, payload: { containerId: 400 } })
    await nextTick()

    const keys = invalidate.mock.calls.map((call) => call[0].queryKey)
    expect(keys).toContainEqual(objectKeys.detail(27710))
    expect(keys).toContainEqual(['objects', 'subTree'])
    expect(keys).toContainEqual(objectKeys.rackLayouts())
    expect(keys).toContainEqual(objectKeys.chassisLayouts())
  })
})
