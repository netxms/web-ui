import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Select from 'primevue/select'
import Tooltip from 'primevue/tooltip'
import EppRuleChainCalls from '@/components/epp/EppRuleChainCalls.vue'

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

const chains = [
  { id: 0, name: 'Default policy' },
  { id: 2, name: 'Escalation', description: 'Repeated conditions' },
  { id: 3, name: 'Backup handling' },
]

function mountCalls(props) {
  return mount(EppRuleChainCalls, {
    props: { modelValue: [], chains, currentChainId: 0, ...props },
    global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
  })
}

/** As PrimeVue does it: writes its own value, then emits `change`. */
async function pickChain(wrapper, id) {
  const select = wrapper.findComponent(Select)
  select.vm.updateModel(null, id)
  await nextTick()
  await nextTick()
  return select
}

describe('EppRuleChainCalls', () => {
  it('lists the called chains in call order', () => {
    const wrapper = mountCalls({ modelValue: [3, 2] })
    expect(wrapper.findAll('.call-name').map((n) => n.text())).toEqual([
      'Backup handling',
      'Escalation',
    ])
    expect(wrapper.findAll('.call-order').map((n) => n.text())).toEqual(['1', '2'])
  })

  it('explains what an empty list means rather than showing nothing', () => {
    expect(mountCalls().find('.empty-hint').text()).toContain('does not enter any chain')
  })

  it('removes a call', async () => {
    const wrapper = mountCalls({ modelValue: [2, 3] })
    await wrapper.find('[aria-label="Remove call to Escalation"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[[3]]])
  })

  it('reorders calls, since order is the order chains are entered', async () => {
    const wrapper = mountCalls({ modelValue: [2, 3] })
    await wrapper.find('[aria-label="Move Backup handling up"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[[3, 2]]])
  })

  it('cannot move the first call up or the last one down', () => {
    const wrapper = mountCalls({ modelValue: [2, 3] })
    expect(wrapper.find('[aria-label="Move Escalation up"]').attributes('disabled')).toBeDefined()
    expect(
      wrapper.find('[aria-label="Move Backup handling down"]').attributes('disabled'),
    ).toBeDefined()
  })

  describe('adding a call', () => {
    it('adds the picked chain straight away, with no second gesture', async () => {
      const wrapper = mountCalls({ modelValue: [3] })
      await pickChain(wrapper, 2)
      expect(wrapper.emitted('update:modelValue')).toEqual([[[3, 2]]])
    })

    it('has no separate add button left to miss', async () => {
      const wrapper = mountCalls()
      expect(wrapper.find('[aria-label="Add chain call"]').exists()).toBe(false)
    })

    it('clears the picker afterwards, so it still reads as "add another"', async () => {
      const wrapper = mountCalls()
      const select = await pickChain(wrapper, 2)
      // PrimeVue only re-reads the prop when it changes between renders.
      expect(select.vm.$filled).toBe(false)
      expect(wrapper.find('.p-select-label').text()).toBe('Add a chain to call…')
    })

    it('ignores a cleared picker', async () => {
      const wrapper = mountCalls({ modelValue: [2] })
      await pickChain(wrapper, null)
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
  })

  describe('the main chain is never a call target', () => {
    it('leaves the main chain out of the picker, from any chain', () => {
      const offered = (currentChainId) =>
        mountCalls({ currentChainId })
          .findComponent(Select)
          .props('options')
          .map((option) => option.value)

      expect(offered(2)).toEqual([3])
      expect(offered(3)).toEqual([2])
      expect(offered(0)).toEqual([3, 2])
    })

    it('says there is nothing to call when the only other chain is the main one', () => {
      const wrapper = mount(EppRuleChainCalls, {
        props: { modelValue: [], chains: [chains[0], chains[1]], currentChainId: 2 },
        global: { plugins: [PrimeVue], directives: { tooltip: Tooltip } },
      })
      expect(wrapper.findComponent(Select).props('emptyMessage')).toBe('No sub-chains to call')
    })

    it('still shows a call to the main chain a rule already has', () => {
      const wrapper = mountCalls({
        modelValue: [0],
        currentChainId: 2,
        // The main chain reaches this one, so the call loops.
        callGraph: new Map([[0, [2]]]),
      })
      expect(wrapper.find('.call-name').text()).toBe('Main')
      expect(wrapper.find('[aria-label="Remove call to Main"]').exists()).toBe(true)
      expect(wrapper.find('.call-warning').exists()).toBe(true)
    })
  })

  it('names a chain that no longer exists instead of dropping it silently', () => {
    const wrapper = mountCalls({ modelValue: [99] })
    expect(wrapper.find('.call-name').text()).toBe('Chain #99 (deleted)')
    expect(wrapper.find('.call-name').classes()).toContain('call-name--missing')
    expect(wrapper.text()).toContain('the server rejects a rule')
  })

  describe('loop warning', () => {
    it('warns when a called chain leads back to this one', () => {
      const wrapper = mountCalls({
        modelValue: [2],
        currentChainId: 0,
        callGraph: new Map([[2, [0]]]),
      })
      expect(wrapper.find('.call-warning').exists()).toBe(true)
      expect(wrapper.text()).toContain('SYS_EPP_CHAIN_LOOP')
    })

    it('warns on an indirect cycle', () => {
      const wrapper = mountCalls({
        modelValue: [2],
        currentChainId: 3,
        callGraph: new Map([
          [2, [4]],
          [4, [3]],
        ]),
      })
      expect(wrapper.find('.call-warning').exists()).toBe(true)
    })

    it('stays quiet for a diamond — two callers of one chain is not a loop', () => {
      const wrapper = mountCalls({
        modelValue: [2],
        currentChainId: 3,
        callGraph: new Map([
          [0, [2, 3]],
          [3, [2]],
        ]),
      })
      expect(wrapper.find('.call-warning').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('SYS_EPP_CHAIN_LOOP')
    })
  })
})
