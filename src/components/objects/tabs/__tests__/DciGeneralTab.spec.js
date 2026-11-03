import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'
import PrimeVue from 'primevue/config'
import DciGeneralTab from '../DciGeneralTab.vue'
import DciMetricPickerDialog from '../../DciMetricPickerDialog.vue'
import { notifyNotImplemented } from '@/utils/notImplemented'

// PrimeVue's Select binds a matchMedia listener on mount; jsdom does not provide one.
window.matchMedia =
  window.matchMedia ??
  (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }))

vi.mock('@/queries/useObjectQueries', () => ({
  useObject: () => ({ data: ref(null) }),
  useObjectSnmpConfig: () => ({ data: ref(null) }),
}))

vi.mock('@/queries/useMappingTableQueries', () => ({
  useMappingTables: () => ({ data: ref([]), isLoading: ref(false), error: ref(null) }),
  useMappingTable: () => ({ data: ref(null) }),
}))

vi.mock('@/utils/notImplemented', () => ({ notifyNotImplemented: vi.fn() }))

const stubs = {
  DciMetricPickerDialog: true,
  MibOidPickerDialog: true,
  ObjectPickerField: true,
}

function mountTab(formFields, dciType = 'item') {
  const form = reactive({
    origin: 'agent',
    name: '',
    description: '',
    dataType: 'int32',
    flags: 0,
    sourceNode: 0,
    pollingScheduleType: 'default',
    retentionType: 'default',
    mappingTableId: 0,
    snmpPort: 0,
    snmpVersion: 0,
    ...formFields,
  })
  const wrapper = mount(DciGeneralTab, {
    props: { form, dciType, objectId: 100, ownerObject: { id: 100, class: 'Node' } },
    global: { plugins: [PrimeVue], stubs },
  })
  return { form, wrapper }
}

const selectButton = (wrapper) =>
  wrapper.findAll('button').find((button) => button.text() === 'Select...')

describe('DciGeneralTab metric picker', () => {
  beforeEach(() => {
    notifyNotImplemented.mockClear()
  })

  it.each([
    ['agent', 'item', 'agentMetric'],
    ['agent', 'table', 'agentTable'],
    ['driver', 'item', 'driverMetric'],
    ['internal', 'item', 'internalMetric'],
    ['internal', 'table', 'internalTable'],
  ])('opens the %s list on a %s DCI', async (origin, dciType, kind) => {
    const { wrapper } = mountTab({ origin }, dciType)

    await selectButton(wrapper).trigger('click')

    const dialog = wrapper.findComponent(DciMetricPickerDialog)
    expect(dialog.props('kind')).toBe(kind)
    expect(dialog.props('visible')).toBe(true)
    expect(notifyNotImplemented).not.toHaveBeenCalled()
  })

  it('offers no list for a device driver table, which the server cannot collect', () => {
    const { wrapper } = mountTab({ origin: 'driver' }, 'table')

    expect(selectButton(wrapper)).toBeUndefined()
    expect(wrapper.findComponent(DciMetricPickerDialog).exists()).toBe(false)
  })

  it.each([
    ['trafficobserver', 'item', 'Traffic observer metric list'],
    ['trafficobserver', 'table', 'Traffic observer metric list'],
    ['winperf', 'item', 'Windows performance counter list'],
    ['smclp', 'item', 'SM-CLP target list'],
  ])('still has no route for the %s list on a %s DCI', async (origin, dciType, label) => {
    const { wrapper } = mountTab({ origin }, dciType)

    await selectButton(wrapper).trigger('click')

    expect(notifyNotImplemented).toHaveBeenCalledWith(label)
    expect(wrapper.findComponent(DciMetricPickerDialog).exists()).toBe(false)
  })

  it('reads the owner by default', () => {
    const { wrapper } = mountTab({ origin: 'agent' })

    expect(wrapper.findComponent(DciMetricPickerDialog).props('objectId')).toBe(100)
  })

  it('reads an overriding source node, even one whose object could not be loaded', () => {
    const { wrapper } = mountTab({ origin: 'agent', sourceNode: 200 })

    const dialog = wrapper.findComponent(DciMetricPickerDialog)
    expect(dialog.props('objectId')).toBe(200)
    expect(dialog.props('object')).toBeNull()
  })

  it('sets name, description and data type from a picked metric', () => {
    const { form, wrapper } = mountTab({ origin: 'agent' })

    wrapper.findComponent(DciMetricPickerDialog).vm.$emit('select', {
      name: 'System.CPU.Usage',
      description: 'CPU usage',
      dataType: 'float',
    })

    expect(form).toMatchObject({
      name: 'System.CPU.Usage',
      description: 'CPU usage',
      dataType: 'float',
    })
  })
})
