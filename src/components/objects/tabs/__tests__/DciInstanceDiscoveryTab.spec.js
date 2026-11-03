import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import PrimeVue from 'primevue/config'
import DciInstanceDiscoveryTab from '../DciInstanceDiscoveryTab.vue'
import DciProcessingTab from '../DciProcessingTab.vue'

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

vi.mock('@/queries/useObjectQueries', async () => {
  const { computed } = await import('vue')
  return { useObjectsByIds: () => ({ objectsById: computed(() => new Map()) }) }
})

function dciForm(overrides = {}) {
  return reactive({
    type: 'item',
    flags: 0,
    instanceDiscoveryMethod: 'none',
    instanceDiscoveryData: '',
    instanceFilter: '',
    instanceName: '',
    instanceRetentionTime: -1,
    thresholds: [],
    ...overrides,
  })
}

const stubs = {
  NxslScriptEditor: true,
  DciMetricPickerDialog: true,
  OtlpAttributeKeysDialog: true,
  MibOidPickerDialog: true,
  EventSelectField: true,
  DciThresholdDialog: true,
}

function mountTab(form) {
  return mount(DciInstanceDiscoveryTab, {
    props: { form },
    global: { plugins: [PrimeVue], stubs },
  })
}

const labels = (wrapper) => wrapper.findAll('.form-field__label').map((l) => l.text())

describe('DciInstanceDiscoveryTab', () => {
  it('shows only the method while discovery is off', () => {
    const wrapper = mountTab(dciForm())

    expect(labels(wrapper)).toEqual(['Method'])
    expect(wrapper.text()).not.toContain('Instance Filter')
  })

  it('edits a table method as table and instance column', async () => {
    const form = dciForm({
      instanceDiscoveryMethod: 'internalTable',
      instanceDiscoveryData: 'Server.Queues:NAME',
    })
    const wrapper = mountTab(form)

    expect(labels(wrapper)).toEqual([
      'Method',
      'Table Name',
      'Instance Column',
      'Instance Retention',
      'Filter Script',
    ])
    const [table, column] = wrapper.findAll('input[type="text"]')
    expect(table.element.value).toBe('Server.Queues')
    await column.setValue('ID')
    expect(form.instanceDiscoveryData).toBe('Server.Queues:ID')
  })

  it('starts on the server default retention', () => {
    const wrapper = mountTab(dciForm({ instanceDiscoveryMethod: 'script' }))

    expect(wrapper.find('.p-inputnumber').exists()).toBe(false)
  })
})

describe('DciProcessingTab', () => {
  it('no longer carries instance discovery, but keeps the instance name', () => {
    const wrapper = mount(DciProcessingTab, {
      props: { form: dciForm(), objectId: 100 },
      global: { plugins: [PrimeVue], stubs },
    })

    expect(wrapper.text()).not.toContain('Instance Discovery')
    expect(labels(wrapper)).toContain('Instance Name')
  })
})
