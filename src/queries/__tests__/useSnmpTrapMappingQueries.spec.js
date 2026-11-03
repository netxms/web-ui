import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/api/snmpTrapMappingsApi', () => ({
  getSnmpTrapMappings: vi.fn(),
  getSnmpTrapMapping: vi.fn(),
  createSnmpTrapMapping: vi.fn(),
  updateSnmpTrapMapping: vi.fn(),
  deleteSnmpTrapMapping: vi.fn(),
}))

const snmpTrapMappingsApi = await import('@/api/snmpTrapMappingsApi')
const {
  snmpTrapMappingKeys,
  useCreateSnmpTrapMapping,
  useUpdateSnmpTrapMapping,
  useDeleteSnmpTrapMapping,
} = await import('../useSnmpTrapMappingQueries')

const mapping = (id, parameters = []) => ({
  id,
  guid: `guid-${id}`,
  oid: `1.3.6.1.4.1.${id}`,
  eventCode: 500,
  eventTag: '',
  description: '',
  transformationScript: '',
  parameters,
})

/** The editor reloads from the detail cache after a save, so it must hold the stored mapping. */
describe('SNMP trap mapping mutation caching', () => {
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

  it('seeds the detail cache with the mapping a create returns', async () => {
    const created = mapping(7)
    snmpTrapMappingsApi.createSnmpTrapMapping.mockResolvedValue(created)

    const { mutate } = withMutation(useCreateSnmpTrapMapping)
    mutate({ oid: '1.3.6.1.4.1.7' })
    await flushPromises()

    expect(queryClient.getQueryData(snmpTrapMappingKeys.detail(7))).toEqual(created)
  })

  it('replaces the detail cache with the mapping as stored after an update', async () => {
    queryClient.setQueryData(snmpTrapMappingKeys.detail(3), mapping(3))
    const stored = mapping(3, [{ oid: '', position: 2, description: '', flags: 0 }])
    snmpTrapMappingsApi.updateSnmpTrapMapping.mockResolvedValue(stored)

    const { mutate } = withMutation(useUpdateSnmpTrapMapping)
    mutate({ id: 3, data: { parameters: [{ position: 2, description: '', flags: 0 }] } })
    await flushPromises()

    expect(queryClient.getQueryData(snmpTrapMappingKeys.detail(3))).toEqual(stored)
  })

  it('drops the detail cache of a deleted mapping', async () => {
    queryClient.setQueryData(snmpTrapMappingKeys.detail(3), mapping(3))
    snmpTrapMappingsApi.deleteSnmpTrapMapping.mockResolvedValue(undefined)

    const { mutate } = withMutation(useDeleteSnmpTrapMapping)
    mutate(3)
    await flushPromises()

    expect(queryClient.getQueryData(snmpTrapMappingKeys.detail(3))).toBeUndefined()
  })
})
