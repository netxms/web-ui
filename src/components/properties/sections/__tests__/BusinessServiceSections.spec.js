import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ObjectAutoBindSection from '../ObjectAutoBindSection.vue'
import DciAutoBindSection from '../DciAutoBindSection.vue'
import BusinessServicePollingSection from '../BusinessServicePollingSection.vue'
import InstanceDiscoverySection from '../InstanceDiscoverySection.vue'

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

const SERVICE = {
  id: 896,
  class: 'BusinessService',
  flags: 0,
  autoBindFilters: [
    { autoBind: false, autoUnbind: false, source: 'return $object.name;' },
    { autoBind: true, autoUnbind: false, source: 'return $dci.name;' },
  ],
}

function mountSection(component, object, sectionId) {
  const draft = reactive(JSON.parse(JSON.stringify(object)))
  const wrapper = mount(component, {
    props: { draft, object, sectionId, sectionLabel: '' },
    global: { plugins: [PrimeVue], stubs: { NxslScriptEditor: true, ObjectPickerField: true } },
  })
  return { wrapper, draft }
}

const checkboxes = (wrapper) => wrapper.findAll('.flag-row input[type="checkbox"]')

describe('business service auto-bind pages', () => {
  it('edits the object filter in the first auto-bind slot', async () => {
    const { wrapper, draft } = mountSection(ObjectAutoBindSection, SERVICE, 'object-auto-bind')

    expect(wrapper.findComponent({ name: 'NxslScriptEditor' }).props('modelValue')).toBe(
      'return $object.name;',
    )
    await checkboxes(wrapper)[0].setValue(true)

    expect(draft.autoBindFilters[0].autoBind).toBe(true)
    expect(draft.autoBindFilters[1].autoBind).toBe(true)
  })

  it('edits the DCI filter in the second auto-bind slot', async () => {
    const { wrapper, draft } = mountSection(DciAutoBindSection, SERVICE, 'dci-auto-bind')

    expect(wrapper.findComponent({ name: 'NxslScriptEditor' }).props('modelValue')).toBe(
      'return $dci.name;',
    )
    await checkboxes(wrapper)[1].setValue(true)

    expect(draft.autoBindFilters[1].autoUnbind).toBe(true)
    expect(draft.autoBindFilters[0].autoUnbind).toBe(false)
  })

  it('keeps the status threshold disabled under construction', () => {
    const { wrapper } = mountSection(ObjectAutoBindSection, SERVICE, 'object-auto-bind')

    expect(wrapper.text()).toContain('Under construction')
    expect(wrapper.find('.p-select').classes()).toContain('p-disabled')
  })
})

describe('business service Polling page', () => {
  it.each([
    [1, [true, false]],
    [2, [false, true]],
  ])('shows the poll-disable flags %i read-only', (flags, expected) => {
    const { wrapper } = mountSection(
      BusinessServicePollingSection,
      { ...SERVICE, flags },
      'business-service-polling',
    )

    const inputs = checkboxes(wrapper)
    expect(inputs.map((input) => input.element.checked)).toEqual(expected)
    expect(inputs.every((input) => input.element.disabled)).toBe(true)
    expect(wrapper.text()).toContain('Under construction')
  })
})

describe('prototype Instance Discovery page', () => {
  const PROTOTYPE = {
    id: 902,
    class: 'BusinessServiceProto',
    instanceDiscovery: { method: null, source: 0, name: '', script: '' },
  }

  it('shows no method when the server sent none', () => {
    const { wrapper } = mountSection(InstanceDiscoverySection, PROTOTYPE, 'instance-discovery')

    expect(wrapper.find('#instance-discovery-method').text()).not.toContain('Agent List')
  })

  it('names the data field after the server method value', () => {
    const { wrapper } = mountSection(
      InstanceDiscoverySection,
      { ...PROTOTYPE, instanceDiscovery: { ...PROTOTYPE.instanceDiscovery, method: 5 } },
      'instance-discovery',
    )

    expect(wrapper.text()).toContain('Script name')
  })
})
