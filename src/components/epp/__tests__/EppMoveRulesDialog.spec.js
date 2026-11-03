import { afterEach, describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import EppMoveRulesDialog from '@/components/epp/EppMoveRulesDialog.vue'

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
  { id: 2, name: 'Escalation' },
  { id: 3, name: 'Backup handling' },
]

async function mountDialog(props) {
  const wrapper = mount(EppMoveRulesDialog, {
    props: {
      visible: true,
      rules: [{ guid: 'a', comments: 'Backup failure alert' }],
      chains,
      sourceChainId: 0,
      ...props,
    },
    attachTo: document.body,
    global: {
      plugins: [PrimeVue],
      directives: { tooltip: Tooltip },
      mocks: { $plural: (n, s) => `${n} ${n === 1 ? s : s + 's'}` },
    },
  })
  // PrimeVue's Dialog mounts its teleported content a tick after the wrapper exists.
  await wrapper.vm.$nextTick()
  return wrapper
}

/** PrimeVue's Dialog teleports to body, so assertions read the document, not the wrapper. */
function text() {
  return document.body.textContent
}

function findButton(label) {
  return [...document.querySelectorAll('button')].find((b) => b.textContent.includes(label))
}

describe('EppMoveRulesDialog', () => {
  // Teleported dialog content outlives the wrapper.
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('names the source chain and the rules being moved', async () => {
    await mountDialog()
    expect(text()).toContain('out of Main')
    expect(text()).not.toContain('Default policy')
    expect(text()).toContain('Backup failure alert')
  })

  it('previews only the first few rules when many are selected', async () => {
    await mountDialog({
      rules: Array.from({ length: 9 }, (_, i) => ({ guid: `r${i}`, comments: `Rule ${i}` })),
    })
    expect(text()).toContain('Rule 5')
    expect(text()).not.toContain('Rule 6')
    expect(text()).toContain('and 3 more')
  })

  it('cannot move rules into the chain they are already in', async () => {
    const wrapper = await mountDialog({ sourceChainId: 2 })
    expect(wrapper.vm.targetOptions.map((o) => o.value)).toEqual([0, 3])
  })

  it('emits the chosen target on confirm', async () => {
    const wrapper = await mountDialog()
    wrapper.vm.targetChainId = 3
    await wrapper.vm.$nextTick()
    findButton('Move').click()
    expect(wrapper.emitted('confirm')).toEqual([[3]])
  })

  it('warns when a moved rule already calls the chain it is landing in', async () => {
    const wrapper = await mountDialog({
      rules: [{ guid: 'a', comments: 'Backup failure alert', chainCalls: [3] }],
    })
    expect(text()).not.toContain('becomes a call to their own chain')

    wrapper.vm.targetChainId = 3
    await wrapper.vm.$nextTick()
    expect(text()).toContain('becomes a call to their own chain')
  })

  it('stays quiet when the moved rule calls some other chain', async () => {
    const wrapper = await mountDialog({
      rules: [{ guid: 'a', comments: 'Backup failure alert', chainCalls: [2] }],
    })
    wrapper.vm.targetChainId = 3
    await wrapper.vm.$nextTick()
    expect(text()).not.toContain('becomes a call to their own chain')
  })
})
