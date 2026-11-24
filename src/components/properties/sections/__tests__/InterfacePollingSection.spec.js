import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import InterfacePollingSection from '../InterfacePollingSection.vue'
import { IF_FLAGS } from '@/utils/interfaceDisplay'

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

const USER_FLAGS = {
  excludeFromTopology: false,
  includeInIcmpPoll: false,
  disableAgentStatusPoll: false,
  disableSnmpStatusPoll: true,
  disableIcmpStatusPoll: false,
}

function mountSection(object) {
  const draft = reactive(JSON.parse(JSON.stringify(object)))
  const wrapper = mount(InterfacePollingSection, {
    props: { draft, object, sectionId: 'interface-polling', sectionLabel: 'Polling' },
    global: { plugins: [PrimeVue] },
  })
  return { wrapper, draft }
}

const flagInputs = (wrapper) => wrapper.findAll('.flag-row input[type="checkbox"]')

describe('InterfacePollingSection options', () => {
  it('edits the user flags in the draft', async () => {
    const { wrapper, draft } = mountSection({
      id: 7,
      class: 'Interface',
      expectedState: 0,
      requiredPollCount: 0,
      flags: IF_FLAGS.DISABLE_SNMP_STATUS_POLL,
      userFlags: { ...USER_FLAGS },
    })

    const inputs = flagInputs(wrapper)
    expect(inputs).toHaveLength(5)
    expect(inputs.every((input) => !input.element.disabled)).toBe(true)
    expect(wrapper.text()).not.toContain('Under construction')

    await inputs[0].setValue(true)

    expect(draft.userFlags.excludeFromTopology).toBe(true)
    expect(draft.userFlags.disableSnmpStatusPoll).toBe(true)
  })

  it('shows the flags read-only for a server that does not send them', () => {
    const { wrapper } = mountSection({
      id: 7,
      class: 'Interface',
      expectedState: 0,
      requiredPollCount: 0,
      flags: IF_FLAGS.DISABLE_SNMP_STATUS_POLL,
      userFlags: null,
    })

    const inputs = flagInputs(wrapper)
    expect(inputs.every((input) => input.element.disabled)).toBe(true)
    expect(inputs.map((input) => input.element.checked)).toEqual([
      false,
      false,
      false,
      true,
      false,
    ])
    expect(wrapper.text()).toContain('Changing these options needs a newer server.')
  })
})
