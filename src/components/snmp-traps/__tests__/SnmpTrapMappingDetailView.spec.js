import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'

const updateMutate = vi.fn()
const createMutate = vi.fn()

vi.mock('@/queries/useSnmpTrapMappingQueries', () => ({
  useCreateSnmpTrapMapping: () => ({
    mutate: createMutate,
    isPending: ref(false),
    error: ref(null),
  }),
  useUpdateSnmpTrapMapping: () => ({
    mutate: updateMutate,
    isPending: ref(false),
    error: ref(null),
  }),
}))
vi.mock('@/composables/useUnsavedChangesGuard', () => ({ useUnsavedChangesGuard: () => {} }))
vi.mock('primevue/usetoast', () => ({ useToast: () => ({ add: vi.fn() }) }))

const { default: SnmpTrapMappingDetailView } = await import('../SnmpTrapMappingDetailView.vue')

const mapping = {
  id: 12,
  guid: 'g-12',
  oid: '1.3.6.1.6.3.1.1.5.3',
  eventCode: 500,
  eventTag: '',
  description: 'linkDown',
  transformationScript: '',
  parameters: [
    { oid: '1.3.6.1.2.1.2.2.1.1', position: 0, description: 'ifIndex', flags: 0 },
    { oid: '', position: 3, description: 'third', flags: 1 },
  ],
}

function mountEditor(props) {
  return mount(SnmpTrapMappingDetailView, {
    props,
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      stubs: {
        EntityDetailHeader: { template: '<div><slot name="actions" /></div>' },
        NxslScriptEditor: true,
        EventSelectField: true,
        MibOidPickerDialog: true,
        SnmpTrapParameterDialog: true,
      },
    },
  })
}

const button = (wrapper, label) =>
  wrapper.findAll('button').find((b) => b.attributes('aria-label') === label || b.text() === label)

beforeEach(() => vi.clearAllMocks())

describe('SnmpTrapMappingDetailView save', () => {
  it('sends the reordered parameters, each by OID or by position', async () => {
    const wrapper = mountEditor({ mapping })

    // First row's "Move down": the positional mapping becomes event parameter 2.
    await wrapper.findAll('button[aria-label="Move down"]')[0].trigger('click')
    await button(wrapper, 'Save').trigger('click')

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const [{ id, data }] = updateMutate.mock.calls[0]
    expect(id).toBe(12)
    expect(data.parameters).toEqual([
      { position: 3, description: 'third', flags: 1 },
      { oid: '1.3.6.1.2.1.2.2.1.1', description: 'ifIndex', flags: 0 },
    ])
  })

  it('keeps Save disabled until something changes', () => {
    const wrapper = mountEditor({ mapping })
    expect(button(wrapper, 'Save').attributes('disabled')).toBeDefined()
  })

  it('creates with a normalized OID and the unmatched-trap event by default', async () => {
    const wrapper = mountEditor({ mapping: null })

    await wrapper
      .find('input[placeholder^="e.g. 1.3.6.1.6"]')
      .setValue(' .1.3.6.1.4.1.9.9.41.2.0.1 ')
    await button(wrapper, 'Save').trigger('click')

    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0][0]).toEqual({
      oid: '1.3.6.1.4.1.9.9.41.2.0.1',
      eventCode: 500,
      eventTag: '',
      description: '',
      transformationScript: '',
      parameters: [],
    })
  })

  it('refuses an OID with an empty element', async () => {
    const wrapper = mountEditor({ mapping: null })

    await wrapper.find('input[placeholder^="e.g. 1.3.6.1.6"]').setValue('1.3..6')

    expect(button(wrapper, 'Save').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('OID must be numbers separated by dots')
  })
})
