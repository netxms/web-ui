import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import PrimeVue from 'primevue/config'

const OBJECT = { id: 292, name: 'SNMP Nodes', class: 'Container', inheritAccessRights: true }
let current = OBJECT

const updateProperties = vi.fn()
const updateGroup = vi.fn()
const confirmRequire = vi.fn()

const SectionStub = { name: 'SectionStub', props: ['draft'], render: () => null }

vi.mock('@/queries/useObjectQueries', () => {
  const mutation = () => ({ mutateAsync: vi.fn() })
  return {
    useObject: () => ({
      data: ref(current),
      isError: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    }),
    useObjectAgentConfig: () => ({ data: ref(null) }),
    useObjectSnmpConfig: () => ({ data: ref(null) }),
    useUpdateObjectProperties: () => ({ mutateAsync: updateProperties }),
    useUpdateObjectLocation: mutation,
    useUpdateObjectStatusCalculation: mutation,
    useUpdateObjectCustomAttribute: mutation,
    useDeleteObjectCustomAttribute: mutation,
    useUpdateObjectResponsibleUser: mutation,
    useDeleteObjectResponsibleUser: mutation,
    useUpdateObjectDashboards: mutation,
    useUpdateObjectTrustedObjects: mutation,
    useUpdateObjectAccessRights: mutation,
    useUpdateObjectPolling: mutation,
    useUpdateObjectAutoBind: mutation,
    useUpdateObjectAgentConfig: mutation,
    useUpdateObjectSnmpConfig: mutation,
    useUpdateObjectPhysicalPlacement: mutation,
    useCreateObjectUrl: mutation,
    useUpdateObjectUrl: mutation,
    useDeleteObjectUrl: mutation,
  }
})
vi.mock('@/queries/useDataCenterQueries', () => ({
  useUpdateDataCenterGroup: () => ({ mutateAsync: updateGroup }),
}))
vi.mock('@/queries/useDashboardQueries', () => ({
  useDashboard: () => ({ data: ref(null) }),
  useSaveDashboard: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/api/demoDashboardStorage', () => ({ isDemoDashboardId: () => false }))
vi.mock('@/config/propertySections', () => ({
  getSectionsForClass: () => [
    { id: 'general', label: 'General', component: () => Promise.resolve(SectionStub) },
  ],
}))
vi.mock('@/composables/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: () => {} }))
vi.mock('primevue/useconfirm', () => ({ useConfirm: () => ({ require: confirmRequire }) }))

const PropertiesView = (await import('../PropertiesView.vue')).default

async function mountView(props = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  })
  router.push('/infrastructure/292/properties')
  await router.isReady()
  const wrapper = mount(PropertiesView, {
    props: { object: current, ...props },
    global: {
      plugins: [PrimeVue, router],
      stubs: { PropertiesSectionNav: true, QueryErrorState: true },
    },
  })
  await flushPromises()
  return wrapper
}

const footerLabels = (wrapper) =>
  wrapper.findAll('.footer-actions button').map((button) => button.text())

const button = (wrapper, label) =>
  wrapper.findAll('.footer-actions button').find((b) => b.text() === label)

async function edit(wrapper, changes) {
  Object.assign(wrapper.findComponent(SectionStub).props('draft'), changes)
  await flushPromises()
}

beforeEach(() => {
  current = OBJECT
  updateProperties.mockReset()
  updateGroup.mockReset()
  confirmRequire.mockReset()
})

describe('PropertiesView footer', () => {
  it('offers Discard and Save where the host cannot close it', async () => {
    const wrapper = await mountView()
    expect(footerLabels(wrapper)).toEqual(['Discard', 'Save'])
  })

  it('offers Discard, Apply and Save & Close where the host can close it', async () => {
    const wrapper = await mountView({ closable: true })
    expect(footerLabels(wrapper)).toEqual(['Discard', 'Apply', 'Save & Close'])
  })

  it('Apply saves and stays open', async () => {
    const wrapper = await mountView({ closable: true })
    await edit(wrapper, { alias: 'test' })

    await button(wrapper, 'Apply').trigger('click')
    await flushPromises()

    expect(updateProperties).toHaveBeenCalledOnce()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('Save & Close closes once the save succeeds', async () => {
    const wrapper = await mountView({ closable: true })
    await edit(wrapper, { alias: 'test' })

    await button(wrapper, 'Save & Close').trigger('click')
    await flushPromises()

    expect(updateProperties).toHaveBeenCalledWith({
      id: 292,
      payload: expect.objectContaining({ alias: 'test' }),
    })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('Save & Close stays open with the error when the save fails', async () => {
    updateProperties.mockRejectedValue(new Error('Access denied'))
    const wrapper = await mountView({ closable: true })
    await edit(wrapper, { alias: 'test' })

    await button(wrapper, 'Save & Close').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('.save-error').text()).toBe('Access denied')
  })

  it('Save & Close stays open when the empty access list warning is declined', async () => {
    confirmRequire.mockImplementation((options) => options.reject())
    const wrapper = await mountView({ closable: true })
    await edit(wrapper, { inheritAccessRights: false, accessList: [] })

    await button(wrapper, 'Save & Close').trigger('click')
    await flushPromises()

    expect(confirmRequire).toHaveBeenCalledOnce()
    expect(updateProperties).not.toHaveBeenCalled()
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})

describe('PropertiesView data center groups', () => {
  it('sends a changed property group through its own PATCH, changed fields only', async () => {
    current = {
      id: 2090000001,
      name: 'DC-Alpha Site',
      class: 'Facility',
      inheritAccessRights: true,
      facility: { settlementLag: 5, providerId: 'eed' },
    }
    const wrapper = await mountView()
    const draft = wrapper.findComponent(SectionStub).props('draft')
    draft.facility.providerId = '  '
    await flushPromises()

    await button(wrapper, 'Save').trigger('click')
    await flushPromises()

    expect(updateGroup).toHaveBeenCalledWith({
      id: 2090000001,
      group: 'facility',
      payload: { providerId: null },
    })
  })

  it('puts a rack cabinet change on the object PATCH', async () => {
    current = { id: 2090000101, name: 'A01', class: 'Rack', width: 600, depth: 1200 }
    const wrapper = await mountView()
    await edit(wrapper, { depth: 1070 })

    await button(wrapper, 'Save').trigger('click')
    await flushPromises()

    const { payload } = updateProperties.mock.calls[0][0]
    expect(payload.depth).toBe(1070)
    expect(payload).not.toHaveProperty('width')
    expect(updateGroup).not.toHaveBeenCalled()
  })
})
