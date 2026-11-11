import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import PrimeVue from 'primevue/config'
import { getDemoFacilityTrees } from '@/api/dataCenterApi'
import { adaptBaseObject } from '@/api/objectAdapters'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/router', () => ({ default: { resolve: () => ({ href: '#' }) } }))
// The demo facility stands in for the Infrastructure tree the rack sits in.
vi.mock('@/queries/useObjectQueries', async (importOriginal) => ({
  ...(await importOriginal()),
  useObjects: () => ({ data: ref([{ id: 2, class: 'ServiceRoot' }]) }),
  useObjectTree: () => ({ data: ref(getDemoFacilityTrees().map(adaptBaseObject)) }),
}))

const RackDataCenterStrip = (await import('../RackDataCenterStrip.vue')).default
const A05 = 2090000105
const A09 = 2090000109

function mountStrip(rackId) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mount(RackDataCenterStrip, {
    props: { rackId },
    global: { plugins: [[VueQueryPlugin, { queryClient }], PrimeVue] },
  })
}

describe('RackDataCenterStrip', () => {
  it('shows the environment, the feeds and the power path of each feed', async () => {
    const wrapper = mountStrip(A05)
    await flushPromises()

    const text = wrapper.text().replace(/\s+/g, ' ')
    expect(text).toContain('Inlet 30.8 °C Outlet 46.8 °C')
    expect(text).toContain('Feed A 4.6 kW Feed B 4.3 kW')
    const paths = wrapper
      .findAll('.rack-dc-strip__path')
      .map((p) => [p.find('.rack-dc-strip__feed').text(), ...p.findAll('a').map((a) => a.text())])
    expect(paths).toEqual([
      ['A', 'PDU-A1', 'UPS-A', 'Utility Feed'],
      ['B', 'PDU-B1', 'UPS-B', 'Utility Feed'],
    ])
  })

  it('stays out of the way for a rack with no metrics and no power domain', async () => {
    const wrapper = mountStrip(A09)
    await flushPromises()

    expect(wrapper.find('.rack-dc-strip').exists()).toBe(false)
  })
})
