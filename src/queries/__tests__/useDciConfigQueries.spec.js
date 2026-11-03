import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/dciConfigApi', () => ({
  getAvailableMetrics: vi.fn(),
}))

const { useAvailableMetrics, dciConfigKeys } = await import('../useDciConfigQueries')
const { getAvailableMetrics } = await import('@/api/dciConfigApi')

function mountQuery(objectId, source, enabled) {
  let result
  const queryClient = new QueryClient()
  mount(
    defineComponent({
      setup() {
        result = useAvailableMetrics(objectId, source, enabled)
        return () => h('div')
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  )
  return { result, queryClient }
}

describe('useAvailableMetrics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads nothing until the dialog opens', async () => {
    getAvailableMetrics.mockResolvedValue({ metrics: [] })
    const visible = ref(false)
    mountQuery(12, 'agent', visible)
    await flushPromises()
    expect(getAvailableMetrics).not.toHaveBeenCalled()

    visible.value = true
    await flushPromises()
    expect(getAvailableMetrics).toHaveBeenCalledWith(12, 'agent')
  })

  it.each([
    ['object', null, 'agent'],
    ['source', 12, undefined],
  ])('reads nothing without a %s', async (_missing, objectId, source) => {
    mountQuery(objectId, source, true)
    await flushPromises()
    expect(getAvailableMetrics).not.toHaveBeenCalled()
  })

  it('gives up at once on a 400, which means the object class has no lists', async () => {
    getAvailableMetrics.mockRejectedValue({ status: 400 })
    const { result } = mountQuery(12, 'agent', true)
    await flushPromises()
    expect(getAvailableMetrics).toHaveBeenCalledTimes(1)
    expect(result.error.value).toEqual({ status: 400 })
  })

  it('keeps the usual retries for other failures', async () => {
    getAvailableMetrics.mockResolvedValue({ metrics: [] })
    const { queryClient } = mountQuery(12, 'agent', true)
    await flushPromises()
    const { retry } = queryClient
      .getQueryCache()
      .find({ queryKey: dciConfigKeys.availableMetrics(12, 'agent') }).options

    expect(retry(0, { status: 500 })).toBe(true)
    expect(retry(2, { status: 500 })).toBe(false)
    expect(retry(0, { status: 403 })).toBe(false)
    expect(retry(0, { status: 404 })).toBe(false)
  })
})
