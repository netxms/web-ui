import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/businessServicesApi', () => ({
  getBusinessServiceChecks: vi.fn(),
  createBusinessServiceCheck: vi.fn(),
  updateBusinessServiceCheck: vi.fn(),
  deleteBusinessServiceCheck: vi.fn(),
  getBusinessServiceAvailability: vi.fn(),
}))

const businessServicesApi = await import('@/api/businessServicesApi')
const {
  businessServiceKeys,
  useCreateBusinessServiceChecks,
  useUpdateBusinessServiceCheck,
  useDeleteBusinessServiceChecks,
} = await import('../useBusinessServiceQueries')

describe('business service check mutations', () => {
  let queryClient
  let wrapper

  function withMutation(composable) {
    let api
    wrapper = mount(
      defineComponent({
        setup() {
          api = composable()
          return () => h('div')
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    )
    return api
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    queryClient.clear()
  })

  it('refreshes every check list, since prototype changes reach other services', async () => {
    queryClient.setQueryData(businessServiceKeys.checks(10), [])
    queryClient.setQueryData(businessServiceKeys.checks(20), [])
    businessServicesApi.updateBusinessServiceCheck.mockResolvedValue({ id: 1 })

    const { mutateAsync } = withMutation(useUpdateBusinessServiceCheck)
    await mutateAsync({ objectId: 10, checkId: 1, data: { description: 'x' } })
    await flushPromises()

    expect(queryClient.getQueryState(businessServiceKeys.checks(10)).isInvalidated).toBe(true)
    expect(queryClient.getQueryState(businessServiceKeys.checks(20)).isInvalidated).toBe(true)
  })

  it('reports each bulk create on its own, so one failure does not hide the rest', async () => {
    businessServicesApi.createBusinessServiceCheck
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(Object.assign(new Error('bad'), { status: 400 }))

    const { mutateAsync } = withMutation(useCreateBusinessServiceChecks)
    const results = await mutateAsync({
      objectId: 10,
      items: [{ type: 'object', relatedObjectId: 7 }, { type: 'object' }],
    })

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected'])
    expect(businessServicesApi.createBusinessServiceCheck).toHaveBeenCalledTimes(2)
  })

  it('deletes every check it is given', async () => {
    businessServicesApi.deleteBusinessServiceCheck.mockResolvedValue(undefined)

    const { mutateAsync } = withMutation(useDeleteBusinessServiceChecks)
    await mutateAsync({ objectId: 10, checkIds: [1, 2] })

    expect(businessServicesApi.deleteBusinessServiceCheck).toHaveBeenCalledWith(10, 1)
    expect(businessServicesApi.deleteBusinessServiceCheck).toHaveBeenCalledWith(10, 2)
  })
})
